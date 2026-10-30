"""CLI delgada del PreCheck (contracts/cli.md): traduce argumentos, salida y códigos de salida."""
import argparse
import contextlib
import dataclasses
import hashlib
import json
import os
import pathlib
import re
import shutil
import sqlite3
import sys
import tempfile
from typing import Any

from precheck import Encabezado, abrir
from precheck.auditoria.sello import DestinoArchivo, Sello
from precheck.errores import ErrorPreCheck, IntegridadComprometida
from precheck.expediente.servicio import PENDIENTE, etiqueta_estado
from precheck.informe.huella import CAMPOS_ENCABEZADO
from precheck.informe.huella import codigo as codigo_huella

OK, USO, NEGOCIO, INTEGRIDAD, DISCREPANCIAS, NO_REPRODUCIBLE, OPERACION, SIN_ARCHIVOS = 0, 1, 2, 3, 4, 5, 6, 7


class _Parser(argparse.ArgumentParser):
    def error(self, message):
        self.print_usage(sys.stderr)
        print(f"{self.prog}: error: {message}", file=sys.stderr)
        sys.exit(USO)


def _plano(x):
    if dataclasses.is_dataclass(x):
        return {k: _plano(v) for k, v in dataclasses.asdict(x).items()}
    if isinstance(x, (list, tuple)):
        return [_plano(v) for v in x]
    if isinstance(x, dict):
        return {str(k): _plano(v) for k, v in x.items()}
    return x


def _json(x):
    return json.dumps(_plano(x), ensure_ascii=False, indent=2, default=str)


def _leer_json(ruta):
    with open(ruta, encoding="utf-8") as f:
        return json.load(f)


class _ErrorUso(ValueError):
    """Argumentos válidos para argparse pero inutilizables (salida 1)."""


@dataclasses.dataclass(frozen=True)
class _Salida:
    """Resultado ya presentado: texto para la terminal y datos para --json."""
    texto: str
    datos: Any


# --- informe: entradas y archivos -------------------------------------------------------------

def _encabezado(ruta):
    """--encabezado: objeto JSON con los campos del encabezado, todos opcionales y de texto."""
    if ruta is None:
        return None
    datos = _leer_json(ruta)
    if not isinstance(datos, dict) or set(datos) - set(CAMPOS_ENCABEZADO) or any(
            v is not None and not isinstance(v, str) for v in datos.values()):
        raise _ErrorUso(f"el encabezado debe ser un objeto JSON con textos en {', '.join(CAMPOS_ENCABEZADO)}")
    return Encabezado(**datos)


_NOMBRE_SEGURO = re.compile(r"[A-Za-z0-9._-]+")


_MAX_NOMBRE = 100          # bytes UTF-8 del componente del id en el nombre de archivo (N2)
_SUFIJO_TEMPORAL = ".xxxxxxxx.tmp"  # lo que `mkstemp` agrega al nombre (ver `_escribir_atomico`)


def nombre_de_archivo(expediente_id):
    """El id del expediente tal cual si solo tiene [A-Za-z0-9._-] y cabe en 100 bytes; si no, saneado de
    forma determinista (cada otro carácter pasa a «_»), acotado a 100 bytes y con 8 caracteres de su
    SHA-256 para que dos ids no choquen (re-revisión N2)."""
    if _NOMBRE_SEGURO.fullmatch(expediente_id) and len(expediente_id.encode("utf-8")) <= _MAX_NOMBRE:
        return expediente_id
    saneado = re.sub(r"[^A-Za-z0-9._-]", "_", expediente_id)[:_MAX_NOMBRE]   # ASCII: 1 byte por carácter
    return f"{saneado}-{hashlib.sha256(expediente_id.encode('utf-8')).hexdigest()[:8]}"


def _comprobar_nombres(directorio, *nombres):
    """Cada archivo final y su temporal deben caber en PC_NAME_MAX del directorio; se comprueba antes de
    llamar al servicio, para no registrar una emisión que no se puede escribir (N2, salida 1)."""
    try:
        limite = os.pathconf(directorio, "PC_NAME_MAX")
    except (OSError, ValueError, AttributeError):   # AttributeError: Windows no tiene os.pathconf
        limite = 255
    for nombre in nombres:
        largo = len(f".{nombre}{_SUFIJO_TEMPORAL}".encode("utf-8"))
        if largo > limite:
            raise _ErrorUso(f"el nombre de archivo {nombre} no cabe en el directorio de salida "
                            f"({largo} bytes con el temporal; máximo {limite})")


def _directorio(ruta):
    """--salida: debe existir y admitir escritura; se comprueba antes de llamar al servicio."""
    directorio = pathlib.Path(ruta)
    if not directorio.is_dir():
        raise _ErrorUso(f"el directorio de salida no existe: {ruta}")
    try:
        with tempfile.NamedTemporaryFile(dir=directorio, prefix=".precheck-prueba-"):
            pass
    except OSError as e:
        raise _ErrorUso(f"no se puede escribir en el directorio de salida {ruta}: {e}") from e
    return directorio


def _temporal(ruta, texto):
    """Escribe `texto` en un temporal junto a `ruta` y devuelve su ruta; si falla, no deja el temporal."""
    fd, temporal = tempfile.mkstemp(dir=ruta.parent, prefix=f".{ruta.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as f:
            f.write(texto)
    except BaseException:
        with contextlib.suppress(OSError):
            os.unlink(temporal)
        raise
    return temporal


class _ArchivosNoEscritos(OSError):
    """No se pudieron escribir los archivos. `restaurado` dice si el directorio quedó exactamente como estaba;
    `previos` son los destinos que ya existían y `quedan` los que existen tras deshacer (N4, N4-bis)."""

    def __init__(self, causa, restaurado, previos, quedan):
        self.causa, self.restaurado, self.previos, self.quedan = causa, restaurado, previos, quedan
        if not restaurado:
            detalle = (f"no se pudo restaurar el estado previo; quedaron (pueden no formar un par): "
                       f"{', '.join(quedan) or 'ningún archivo'}")
        elif previos:
            detalle = f"no se escribió nada; se conservan sin cambios los archivos previos: {', '.join(previos)}"
        else:
            detalle = "no quedó ningún archivo"
        super().__init__(f"{causa}; {detalle}")


def _respaldo(ruta):
    """Enlace duro (o copia, si el sistema de archivos no los admite) del destino que ya existía, con un nombre
    oculto del mismo largo que el temporal (cabe en PC_NAME_MAX; ver `_comprobar_nombres`)."""
    while True:
        respaldo = ruta.with_name(f".{ruta.name}.{os.urandom(4).hex()}.bak")
        try:
            os.link(ruta, respaldo)
            return respaldo
        except FileExistsError:
            continue
        except OSError:
            if respaldo.exists():
                continue
            shutil.copy2(ruta, respaldo)
            return respaldo


def _escribir_atomico(*destinos):
    """Todos los archivos o ninguno: escribe cada (ruta, texto) en un temporal del mismo directorio, respalda
    los destinos que ya existían y recién después renombra con os.replace. Si algo falla, borra los temporales
    y los archivos que esta escritura creó y devuelve cada respaldo a su lugar, de modo que el directorio queda
    exactamente como estaba (el par previo intacto, o ningún archivo); nunca un par mezclado (N4, N4-bis).
    Si todo sale bien, borra los respaldos."""
    temporales, respaldos, renombrados = [], {}, []
    try:
        for ruta, texto in destinos:
            temporales.append((_temporal(ruta, texto), ruta))
        for ruta, _ in destinos:
            if ruta.exists():
                respaldos[ruta] = _respaldo(ruta)
        for temporal, ruta in temporales:
            os.replace(temporal, ruta)
            renombrados.append(ruta)
    except BaseException as e:
        restaurado = _deshacer(temporales, respaldos, renombrados)
        if isinstance(e, OSError):
            raise _ArchivosNoEscritos(e, restaurado, [str(r) for r in respaldos],
                                      [str(r) for r, _ in destinos if r.exists()]) from e
        raise
    for respaldo in respaldos.values():
        with contextlib.suppress(OSError):
            os.unlink(respaldo)


def _deshacer(temporales, respaldos, renombrados):
    """Deja el directorio como antes de `_escribir_atomico`; devuelve False si algo no se pudo restaurar."""
    restaurado = True
    for temporal, ruta in temporales:
        if ruta not in renombrados:
            with contextlib.suppress(OSError):
                os.unlink(temporal)
    for ruta in renombrados:
        try:
            if ruta in respaldos:
                os.replace(respaldos.pop(ruta), ruta)
            else:
                os.unlink(ruta)
        except OSError:
            restaurado = False
    for respaldo in respaldos.values():   # destinos que no llegaron a reemplazarse: el original sigue intacto
        with contextlib.suppress(OSError):
            os.unlink(respaldo)
    return restaurado


def _escribir(directorio, nombre, informe):
    html_, json_ = directorio / f"{nombre}.html", directorio / f"{nombre}.json"
    _escribir_atomico((html_, informe.documento), (json_, informe.estructurada))
    return [str(html_), str(json_)]


class _EmisionSinArchivos(Exception):
    """La emisión quedó registrada, pero sus archivos no se pudieron escribir (salida 7)."""

    def __init__(self, emision, causa):
        self.emision, self.causa = emision, causa
        super().__init__(f"la emisión {emision.evento.seq} quedó registrada, pero no se pudieron escribir sus "
                         f"archivos ({causa}); vuelva a emitir con el mismo encabezado: se obtiene la misma huella "
                         f"({emision.codigo}) y queda registrada como otra entrega del mismo documento")


def _datos_informe(informe, archivos):
    return {"version": informe.version, "expediente_id": informe.expediente_id, "evaluacion": informe.evaluacion,
            "huella": informe.huella, "codigo": codigo_huella(informe.huella),
            "formato_informe": informe.formato_informe, "archivos": archivos}


def _vigencia(e):
    if e.vigencia == "reemplazado":
        return f"reemplazado por la evaluación {e.reemplazado_por}"
    if e.vigencia == "sustituida":
        return f"sustituida por la emisión {e.sustituida_por}"
    return e.vigencia


def _afectaciones(e):
    """Una afectación abierta se rotula «afectada»; una levantada, «estuvo afectada» con su levantamiento."""
    return [f"    estuvo afectada (levantada {a.hasta}): {a.tipo} {a.referencia} desde {a.desde}" if a.hasta
            else f"    afectada: {a.tipo} {a.referencia} desde {a.desde}" for a in e.afectaciones]


def _texto_emitidos(estados):
    lineas = []
    for e in estados:
        lineas.append(f"emisión {e.seq} · evaluación {e.evaluacion} · huella {codigo_huella(e.huella)} · "
                      f"{e.emitido_por} · {e.emitido_en} · {_vigencia(e)}")
        lineas += _afectaciones(e)
    return "\n".join(lineas) or "(sin emisiones)"


def _texto_verificacion(v, regenerado):
    lineas = [f"{v.resultado} · emisión {e.seq} · evaluación {e.evaluacion} · {e.emitido_por} · {e.emitido_en} · "
              f"{_vigencia(e)} · expediente {e.expediente_id}" for e in v.emisiones] or [v.resultado]
    lineas += [a for e in v.emisiones for a in _afectaciones(e)]
    if v.trazabilidad_coincide is False:
        lineas.append("Aviso: la trazabilidad no coincide con el registro de la emisión (quién emitió o cuándo).")
    if v.aviso:
        lineas.append(f"Aviso: {v.aviso}")
    if regenerado:
        lineas.append(f"Contenido regenerado: {regenerado}")
    return "\n".join(lineas)


def _informe(pc, a):
    directorio, encabezado = _directorio(a.salida), _encabezado(a.encabezado)
    nombre = f"informe-revisor-{nombre_de_archivo(a.expediente)}-{a.evaluacion}"
    _comprobar_nombres(directorio, f"{nombre}.html", f"{nombre}.json")
    inf = pc.informe_revisor(a.expediente, a.evaluacion, encabezado)
    archivos = _escribir(directorio, nombre, inf)
    texto = (f"Versión del revisor (uso interno) · expediente {a.expediente} · evaluación {a.evaluacion}\n"
             f"Archivos: {', '.join(pathlib.Path(x).name for x in archivos)}\nCódigo: {codigo_huella(inf.huella)}")
    return _Salida(texto, _datos_informe(inf, archivos)), OK


def _emitir(pc, a):
    directorio, encabezado = _directorio(a.salida), _encabezado(a.encabezado)
    nombre = f"informe-profesional-{nombre_de_archivo(a.expediente)}-{a.evaluacion}"
    _comprobar_nombres(directorio, *(f"{nombre}-{'0' * 8}{ext}" for ext in (".html", ".json")))
    em = pc.emitir(a.expediente, a.evaluacion, encabezado)
    try:
        archivos = _escribir(directorio, f"{nombre}-{em.informe.huella[:8]}", em.informe)
    except OSError as e:
        raise _EmisionSinArchivos(em, e) from e
    texto = f"Emitido: evento {em.evento.seq} · {pathlib.Path(archivos[0]).name}\nCódigo: {em.codigo}"
    return _Salida(texto, {"evento": _plano(em.evento), **_datos_informe(em.informe, archivos)}), OK


def _verificar_informe(pc, a):
    if bool(a.archivo) == bool(a.codigo) or (a.codigo and not a.expediente) or (a.archivo and a.expediente):
        raise _ErrorUso("use --archivo RUTA, o --expediente ID con --codigo CODIGO")
    directorio = _directorio(a.salida) if a.salida else None
    if a.archivo:
        v = pc.verificar_informe(pathlib.Path(a.archivo).read_bytes())
    else:
        v = pc.verificar_codigo(a.expediente, a.codigo)
    regenerado = None
    if v.regenerado is not None and directorio is not None:
        regenerado = directorio / f"regenerado-{nombre_de_archivo(a.expediente)}-{v.emisiones[-1].seq}.html"
        _comprobar_nombres(directorio, regenerado.name)
        _escribir_atomico((regenerado, v.regenerado.documento))
    datos = {"resultado": v.resultado, "emisiones": _plano(v.emisiones),
             "trazabilidad_coincide": v.trazabilidad_coincide, "aviso": v.aviso,
             "regenerado": None if v.regenerado is None else {
                 "huella": v.regenerado.huella, "archivo": str(regenerado) if regenerado else None}}
    if v.resultado == "no_verificable_version":
        salida = NO_REPRODUCIBLE
    elif v.resultado == "no_coincide" or v.trazabilidad_coincide is False:
        salida = INTEGRIDAD
    else:
        salida = OK
    return _Salida(_texto_verificacion(v, regenerado), datos), salida


# --- presentación en texto --------------------------------------------------------------------

def _texto_evaluacion(ev):
    lineas = [f"Expediente {ev.expediente_id} · presentado {ev.fecha_presentacion} · evaluación #{ev.seq} · "
              f"{etiqueta_estado(PENDIENTE)}"]
    for r in ev.resultados:
        if r.resultado == "NO_APLICA":
            continue
        extra = f"  (indicativo: {r.indicativo}; regla en {r.estado_regla})" if r.indicativo else ""
        lineas.append(f"  {r.resultado:<18} {r.regla_id} v{r.version}{extra}")
        valores = ", ".join(f"{k} = {v.get('valor')} ({(v.get('fuente') or {}).get('metodo', 's/f')}, "
                            f"confianza {v.get('confianza')})" for k, v in r.valores_usados.items())
        lineas.append(f"      «{r.cita_textual}» · {valores}")
        lineas.append(f"      {r.motivo}" + (f" · {'; '.join(r.advertencias)}" if r.advertencias else ""))
    cob = ev.cobertura
    evaluadas = ", ".join(f"{n} ({c} reglas)" for n, c in cob.normas_evaluadas.items()) or "—"
    lineas.append(f"Cobertura: {evaluadas} · sin reglas: {', '.join(cob.normas_sin_reglas) or '—'} · "
                  f"reglas sin aprobar: {cob.reglas_sin_aprobar}")
    for n, t in (cob.temas_evaluados or {}).items():
        lineas.append(f"  Temas {n}: {', '.join(t)}")
    lineas.append(f"Zona usada: {ev.zona['usada']} (CEUS: {ev.zona['ceus'] or '—'}; Documento Gráfico: "
                  f"{ev.zona['documento_grafico'] or '—'})")
    lineas.append(f"Registrado: evento {ev.seq} · hash {ev.hash[:12]}…")
    return "\n".join(lineas)


def _texto_evento(ev):
    return f"Registrado: {ev.tipo} · {ev.cadena_id} · evento {ev.seq} · hash {ev.hash[:12]}…"


def _texto_item(r):
    if type(r).__name__ == "ResultadoPropuesta":
        return f"  {r.regla_id} v{r.version}: {r.estado}" + (f" · {r.codigo}: {r.mensaje}" if r.codigo else "")
    valores = ", ".join(f"{k} = {v.get('valor')}" for k, v in r.valores_usados.items())
    return f"  {r.resultado:<10} {r.regla_id} v{r.version} · {valores}"


def _texto(resultado):
    nombre = type(resultado).__name__
    if nombre == "Evaluacion":
        return _texto_evaluacion(resultado)
    if nombre == "EventoRegistrado":
        return _texto_evento(resultado)
    if nombre == "EstadoExpediente":
        pend = f" · pendiente: {', '.join(resultado.pendientes)}" if resultado.pendientes else ""
        return (f"Expediente {resultado.expediente_id} · evaluación #{resultado.evaluacion} · "
                f"{etiqueta_estado(resultado.estado)}{pend}")
    if nombre == "Reproduccion":
        filas = [f"Reproducción: {resultado.resultado}"]
        filas += [f"  {r}: original {o} · nuevo {n}" for r, o, n in resultado.discrepancias]
        return "\n".join(filas + [_texto_evento(resultado.evento)])
    if nombre == "Verificacion":
        if resultado.contenido_alterado:
            return "Bitácora ALTERADA: contenido de reglas que no coincide con su hash: " + \
                ", ".join(f"{r} v{v}" for r, v in resultado.contenido_alterado)
        if not resultado.integra:
            return f"Bitácora ALTERADA: la cadena {resultado.rota_en[0]} se rompe en el evento {resultado.rota_en[1]}"
        if resultado.coincide_sello is False:
            return f"Bitácora íntegra en sí misma, pero NO coincide con el sello del {resultado.sello_fecha}: " \
                   f"no es confiable desde ese sello ({', '.join(resultado.cadenas_sin_coincidir)})"
        if resultado.coincide_sello is None:
            return "Bitácora íntegra (sin sello contra el cual comparar)"
        return f"Bitácora íntegra y coincide con el sello del {resultado.sello_fecha}"
    if nombre == "Sello":
        return f"Sello {resultado.fecha} · {len(resultado.cabezas)} cadenas · hash {resultado.hash[:12]}…"
    if nombre == "Retiro":
        return "\n".join([_texto_evento(resultado.evento),
                          f"Resultados que usaron la versión: {len(resultado.usos)}"]
                         + [f"  {c} evento {s}" for c, s in resultado.usos])
    if nombre == "Confirmacion":
        extra = [f"Expedientes afectados: {len(resultado.afectados)}"] + [
            f"  {a['expediente']}: " + "; ".join(f"evaluación {s} ({', '.join(r)})" for s, r in a["evaluaciones"].items())
            for a in resultado.afectados] if resultado.afectados else []
        return "\n".join([_texto_evento(resultado.evento)] + extra)
    if isinstance(resultado, list):
        return "\n".join(_texto_item(r) for r in resultado) or "(sin elementos)"
    return str(resultado)


# --- subcomandos -----------------------------------------------------------------------------

def _parser():
    p = _Parser(prog="python3 -m precheck", description="PreCheck MUPA — motor de reglas auditable")
    p.add_argument("--bitacora", default=os.environ.get("PRECHECK_BITACORA", "bitacora.sqlite3"))
    p.add_argument("--json", action="store_true", help="salida JSON estable")
    sub = p.add_subparsers(dest="cmd", required=True, parser_class=_Parser)

    s = sub.add_parser("evaluar")
    s.add_argument("--expediente", required=True)
    s.add_argument("--hechos", required=True)
    s.add_argument("--umbral-confianza", type=float, default=0.85)

    s = sub.add_parser("decidir")
    s.add_argument("--expediente", required=True)
    s.add_argument("--evaluacion", type=int, required=True)
    s.add_argument("--regla", required=True)
    g = s.add_mutually_exclusive_group(required=True)
    g.add_argument("--confirmar", action="store_true")
    g.add_argument("--descartar", action="store_true")
    g.add_argument("--veredicto", choices=["CUMPLE", "NO_CUMPLE"])
    s.add_argument("--motivo", default="", help="obligatorio: sin él, la acción se rechaza con un error de negocio")
    s.add_argument("--indicacion", help="indicación al profesional, en la misma transacción que la decisión")

    s = sub.add_parser("visto-bueno")
    s.add_argument("--expediente", required=True)
    s.add_argument("--evaluacion", type=int, required=True)
    g = s.add_mutually_exclusive_group(required=True)
    g.add_argument("--listar", action="store_true")
    g.add_argument("--dar", action="store_true")
    s.add_argument("--confirmar-sin-ceus", action="store_true",
                   help="confirma explícitamente resultados que dependen de la zona sin CEUS")

    for nombre in ("estado",):
        s = sub.add_parser(nombre)
        s.add_argument("--expediente", required=True)

    s = sub.add_parser("reproducir")
    s.add_argument("--expediente", required=True)
    s.add_argument("--evaluacion", type=int, required=True)

    s = sub.add_parser("verificar")
    g = s.add_mutually_exclusive_group(required=True)
    g.add_argument("--expediente")
    g.add_argument("--reglas", action="store_true")
    g.add_argument("--todo", action="store_true")
    s.add_argument("--sello", help="archivo de sello exportado")
    s.add_argument("--destino", help="directorio de sellos (usa el último)")

    s = sub.add_parser("sellar")
    s.add_argument("--destino", required=True)

    s = sub.add_parser("proponer")
    s.add_argument("--catalogo", required=True)
    s.add_argument("--normativa", action="append")

    s = sub.add_parser("aprobar")
    s.add_argument("--regla", required=True)
    s.add_argument("--version", type=int, required=True)
    for nombre in ("rechazar", "retirar"):
        s = sub.add_parser(nombre)
        s.add_argument("--regla", required=True)
        s.add_argument("--version", type=int, required=True)
        s.add_argument("--motivo", default="", help="obligatorio: sin él, la acción se rechaza con un error de negocio")

    for nombre in ("suspender", "levantar"):
        s = sub.add_parser(nombre)
        s.add_argument("--norma", required=True)
        s.add_argument("--motivo", default="", help="obligatorio: sin él, la acción se rechaza con un error de negocio")
    s = sub.add_parser("confirmar")
    s.add_argument("--propuesta", type=int, required=True)

    for nombre in ("informe", "emitir"):
        s = sub.add_parser(nombre)
        s.add_argument("--expediente", required=True)
        s.add_argument("--evaluacion", type=int, required=True)
        s.add_argument("--salida", required=True, help="directorio existente donde se escriben .html y .json")
        s.add_argument("--encabezado", help="JSON con tramite, proyecto, finca, profesional e idoneidad")
    s = sub.add_parser("indicar")
    s.add_argument("--expediente", required=True)
    s.add_argument("--evaluacion", type=int, required=True)
    s.add_argument("--regla", required=True, help="ID de la regla o norma:NORMA")
    s.add_argument("--texto", required=True)
    s = sub.add_parser("verificar-informe")
    s.add_argument("--archivo", help="documento o forma estructurada originales")
    s.add_argument("--expediente")
    s.add_argument("--codigo", help="huella completa o sus primeros 16 caracteres o más")
    s.add_argument("--salida", help="con --codigo: directorio donde escribir el contenido regenerado")
    s = sub.add_parser("emitidos")
    s.add_argument("--expediente", required=True)

    s = sub.add_parser("inicializar")
    s.add_argument("--persona", required=True)
    s.add_argument("--nombre", required=True)
    s.add_argument("--segunda-persona", required=True)
    s.add_argument("--segundo-nombre", required=True)
    s.add_argument("--segunda-cuenta", required=True)
    s = sub.add_parser("vincular-cuenta")
    s.add_argument("--persona", required=True)
    s.add_argument("--nombre", required=True)
    s.add_argument("--cuenta", required=True)
    s = sub.add_parser("designar")
    s.add_argument("--persona", required=True)
    s.add_argument("--rol", required=True, choices=["redactor", "revisor_doyc", "aprobador"])
    s.add_argument("--motivo", default="", help="obligatorio: sin él, la acción se rechaza con un error de negocio")
    return p


def _ejecutar(pc, a):
    c = a.cmd
    if c == "evaluar":
        return pc.evaluar(a.expediente, _leer_json(a.hechos), a.umbral_confianza), OK
    if c == "decidir":
        accion = "confirmar" if a.confirmar else "descartar" if a.descartar else "veredicto"
        return pc.decidir(a.expediente, a.evaluacion, a.regla, accion, a.motivo, a.veredicto, a.indicacion), OK
    if c == "visto-bueno":
        if a.listar:
            return pc.listar_visto_bueno(a.expediente, a.evaluacion), OK
        return pc.dar_visto_bueno(a.expediente, a.evaluacion, a.confirmar_sin_ceus), OK
    if c == "estado":
        return pc.estado(a.expediente), OK
    if c == "reproducir":
        r = pc.reproducir(a.expediente, a.evaluacion)
        return r, {"coincide": OK, "discrepancias": DISCREPANCIAS}.get(r.resultado, NO_REPRODUCIBLE)
    if c == "verificar":
        destino = a.destino or os.environ.get("PRECHECK_ANCLAJE")
        if destino:
            pc.ctx.destino_anclaje = DestinoArchivo(destino, crear=False)   # verificar nunca crea el destino
        sello = Sello(**_leer_json(a.sello)) if a.sello else (
            pc.ctx.destino_anclaje.ultimo() if pc.ctx.destino_anclaje else None)
        if sello is None and any(e.tipo == "sello" for e in pc.ctx.repo.leer("reglas")):
            print("Hay sellos registrados pero no se encontró ninguno en el destino de anclaje indicado "
                  "(--sello, --destino o PRECHECK_ANCLAJE): no se puede comparar contra el anclaje externo.",
                  file=sys.stderr)
            return None, INTEGRIDAD
        cadena = f"expediente:{a.expediente}" if a.expediente else ("reglas" if a.reglas else None)
        v = pc.verificar(cadena, sello)
        return v, OK if v.integra and v.coincide_sello is not False else INTEGRIDAD
    if c == "sellar":
        pc.ctx.destino_anclaje = DestinoArchivo(a.destino)
        return pc.sellar(), OK
    if c == "proponer":
        if a.normativa:
            pc.ctx.normativa = a.normativa
        return pc.proponer(_leer_json(a.catalogo)), OK
    if c == "aprobar":
        return pc.aprobar(a.regla, a.version), OK
    if c == "rechazar":
        return pc.rechazar(a.regla, a.version, a.motivo), OK
    if c == "retirar":
        return pc.retirar(a.regla, a.version, a.motivo), OK
    if c == "suspender":
        return pc.proponer_suspension(a.norma, a.motivo), OK
    if c == "levantar":
        return pc.proponer_levantamiento(a.norma, a.motivo), OK
    if c == "confirmar":
        return pc.confirmar(a.propuesta), OK
    if c == "informe":
        return _informe(pc, a)
    if c == "emitir":
        return _emitir(pc, a)
    if c == "indicar":
        return pc.indicar(a.expediente, a.evaluacion, a.regla, a.texto), OK
    if c == "verificar-informe":
        return _verificar_informe(pc, a)
    if c == "emitidos":
        estados = pc.emitidos(a.expediente)
        return _Salida(_texto_emitidos(estados), _plano(estados)), OK
    if c == "inicializar":
        return pc.inicializar(a.persona, a.nombre, a.segunda_persona, a.segundo_nombre, a.segunda_cuenta), OK
    if c == "vincular-cuenta":
        return pc.vincular_cuenta(a.persona, a.nombre, a.cuenta), OK
    if c == "designar":
        return pc.designar(a.persona, a.rol, a.motivo), OK
    raise AssertionError(c)


def _error_operacion(a, e):
    mensaje = f"La bitácora no está disponible ({e}); reintente."
    if a.json:
        print(json.dumps({"codigo": "operacion.bitacora_no_disponible", "mensaje": mensaje, "detalles": {}},
                         ensure_ascii=False), file=sys.stderr)
    else:
        print(f"ERROR operación: {mensaje}", file=sys.stderr)
    return OPERACION


def main(argv=None):
    a = _parser().parse_args(argv)
    try:
        pc = abrir(a.bitacora)
    except sqlite3.OperationalError as e:
        return _error_operacion(a, e)
    except OSError as e:
        print(f"ERROR: no se pudo abrir la bitácora: {e}", file=sys.stderr)
        return USO
    try:
        resultado, codigo = _ejecutar(pc, a)
    except ErrorPreCheck as e:
        if a.json:
            print(json.dumps({"codigo": e.codigo, "mensaje": e.mensaje, "detalles": _plano(e.detalles)},
                             ensure_ascii=False, default=str), file=sys.stderr)
        else:
            print(f"ERROR {e.codigo}: {e.mensaje}", file=sys.stderr)
        return NEGOCIO
    except _EmisionSinArchivos as e:
        if a.json:
            print(json.dumps({"codigo": "informe.emision_sin_archivos", "mensaje": str(e),
                              "detalles": {"evento": e.emision.evento.seq, "huella": e.emision.informe.huella}},
                             ensure_ascii=False), file=sys.stderr)
        else:
            print(f"ERROR archivos: {e}", file=sys.stderr)
        return SIN_ARCHIVOS
    except IntegridadComprometida as e:
        print(f"ERROR integridad: {e}", file=sys.stderr)
        return INTEGRIDAD
    except sqlite3.OperationalError as e:
        return _error_operacion(a, e)
    except sqlite3.Error as e:
        print(f"ERROR bitácora: la base rechazó la operación ({e}); revise la integridad del archivo.",
              file=sys.stderr)
        return INTEGRIDAD
    except (OSError, ValueError) as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return USO
    finally:
        pc.cerrar()
    if isinstance(resultado, _Salida):
        print(_json(resultado.datos) if a.json else resultado.texto)
    elif resultado is not None:
        print(_json(resultado) if a.json else _texto(resultado))
    return codigo
