"""Modelo del informe PreCheck: proyección pura de la bitácora (ADR-0001). Dominio puro, sin E/S.

`proyectar` arma el modelo a partir de los eventos del expediente y del estado de las reglas que
recibe. Para regenerar una emisión el servicio le pasa los eventos hasta el `seq` de la emisión y el
estado de reglas a esa fecha (corte temporal): el modelo solo depende de sus argumentos.
"""
import re
from dataclasses import asdict, dataclass, fields
from typing import Optional

from precheck.auditoria.canonico import canonico
from precheck.errores import ErrorExpediente
from precheck.expediente.observaciones import INDICACION, admite_indicacion, necesita_decision
from precheck.expediente.servicio import NORMA_PREFIJO, SIN_CEUS, etiqueta_estado
from precheck.expediente.servicio import PENDIENTE as ESTADO_PENDIENTE
from precheck.expediente.servicio import REVISADO as ESTADO_REVISADO
from precheck.motor.evaluador import NO_APLICA, REVISION
from precheck.reglas.gobierno import NORMAS, norma_de

FORMATO_INFORME = "1.2.0"
# Formatos que esta versión regenera igual que cuando se emitieron (1.2.0: etiquetas legibles).
FORMATOS_REGENERABLES = ("1.1.0", "1.2.0")
NO_CONSTA = "no consta"
PENDIENTE = etiqueta_estado(ESTADO_PENDIENTE)       # «pendiente de revisión humana», el mismo término de la CLI
REVISADO = etiqueta_estado(ESTADO_REVISADO)
OFICIAL, NO_OFICIAL = "oficial", "no oficial"

NOTA_PRELIMINAR = (
    "Este informe es una verificación preliminar automatizada con revisión humana. No constituye registro de "
    "plano, autorización ni permiso, y no sustituye el análisis técnico de la Ventanilla Única de la DOYC "
    "conforme al Acuerdo Municipal N°110 de 2025.",
    "Este informe no es la lista de observaciones del dictamen técnico de la DOYC; el dictamen puede incluir "
    "otras.",
    "La vigencia de este informe se verifica con la DOYC.",
)
SIN_CEUS_TEXTO = "zona tomada del Documento Gráfico sin certificación de uso de suelo"
ROTULO_NORMA = "norma sin reglas cargadas: decisión del revisor"
UBICACION_NO_CONSTA = "ubicación no consta en los datos declarados"
DECLARACION_ALCANCE = (
    "Este informe no declara que el proyecto cumpla en forma global, aunque no tenga observaciones: solo "
    "presenta lo verificado con reglas aprobadas y lo resuelto por el Revisor DOYC, dentro de este alcance.")
USO_INTERNO = "Versión del revisor, de uso interno. No es un informe emitido ni puede entregarse al profesional."


@dataclass(frozen=True)
class Encabezado:
    """Datos del expediente que entrega el revisor al generar o emitir; nunca se guardan (ADR-0005)."""
    tramite: Optional[str] = None
    proyecto: Optional[str] = None
    finca: Optional[str] = None
    profesional: Optional[str] = None
    idoneidad: Optional[str] = None


def _encabezado(enc):
    """Los datos no entregados salen «no consta»; nunca se inventan (AC-11)."""
    enc = enc or Encabezado()
    res = {}
    for f in fields(Encabezado):
        dato = getattr(enc, f.name)
        res[f.name] = dato if dato and dato.strip() else NO_CONSTA
    return res


class _Expediente:
    """Vista de los eventos del expediente recibidos, relativa a una evaluación."""

    def __init__(self, eventos, evaluacion_seq):
        self.eventos = list(eventos)
        self.evaluaciones = [e for e in self.eventos if e.tipo == "evaluacion"]
        self.ev = next((e for e in self.evaluaciones if e.seq == evaluacion_seq), None)
        if self.ev is None:
            raise ErrorExpediente("expediente.evaluacion_inexistente", evaluacion=evaluacion_seq)
        self.p = self.ev.payload

    def de_la_evaluacion(self, tipo, seq=None):
        seq = self.ev.seq if seq is None else seq
        return [e for e in self.eventos if e.tipo == tipo and e.payload.get("evaluacion_seq") == seq]

    def decisiones(self):
        """clave -> decisiones sobre esta evaluación, en orden; rige la última."""
        res = {}
        for d in self.de_la_evaluacion("decision"):
            res.setdefault(d.payload["regla_id"], []).append(d)
        return res

    def visto_bueno(self):
        vbs = self.de_la_evaluacion("visto_bueno")
        return vbs[-1] if vbs else None

    def vigente(self):
        return self.evaluaciones[-1].seq


# --- indicación vigente y traslado entre evaluaciones (ADR-0003, AC-24) ----------------------

@dataclass(frozen=True)
class IndicacionVigente:
    texto: str
    autor: str
    ocurrido_en: str
    trasladada: bool
    evaluacion_seq: int                # evaluación sobre la que se escribió


def _indicaciones_de(eventos, evaluacion_seq, clave):
    return [e for e in eventos if e.tipo == INDICACION and e.payload.get("evaluacion_seq") == evaluacion_seq
            and e.payload.get("regla_id") == clave]


def _firma(ev, eventos, clave):
    """Lo que debe coincidir para trasladar: versión, resultado y valores usados (en forma canónica); para
    una norma sin reglas, que siga sin reglas y con el mismo veredicto. None si la observación no existe."""
    if clave.startswith(NORMA_PREFIJO):
        if clave[len(NORMA_PREFIJO):] not in ev.payload["cobertura"]["normas_sin_reglas"]:
            return None
        decs = [e for e in eventos if e.tipo == "decision" and e.payload.get("evaluacion_seq") == ev.seq
                and e.payload.get("regla_id") == clave]
        return ("norma", decs[-1].payload.get("veredicto") if decs else None)
    r = next((x for x in ev.payload["resultados"] if x["regla_id"] == clave), None)
    return None if r is None else (r["version"], r["resultado"], canonico(r["valores_usados"]))


def indicacion_vigente(eventos, evaluacion_seq, clave):
    """La última indicación sobre esa evaluación; si no hay, la vigente de la evaluación anterior mientras
    nada haya cambiado (traslado recursivo, marcado). None si no hay ninguna que rija."""
    eventos = list(eventos)
    if not any(e.tipo == INDICACION and e.payload.get("regla_id") == clave for e in eventos):
        return None                    # atajo: sin ninguna indicación sobre esa clave no hay traslado posible
    evaluaciones = [e for e in eventos if e.tipo == "evaluacion"]
    actual = next((e for e in evaluaciones if e.seq == evaluacion_seq), None)
    trasladada = False
    while actual is not None:
        propias = _indicaciones_de(eventos, actual.seq, clave)
        if propias:
            i = propias[-1]
            return IndicacionVigente(i.payload["texto"], i.actor, i.ocurrido_en, trasladada, actual.seq)
        previas = [e for e in evaluaciones if e.seq < actual.seq]
        firma = _firma(actual, eventos, clave)
        if not previas or firma is None or firma != _firma(previas[-1], eventos, clave):
            return None
        actual, trasladada = previas[-1], True
    return None


def historial_indicaciones(eventos, evaluacion_seq, clave):
    """Todas las indicaciones de la evaluación de la que sale la vigente, en orden, con autor y fecha."""
    eventos = list(eventos)
    vigente = indicacion_vigente(eventos, evaluacion_seq, clave)
    origen = vigente.evaluacion_seq if vigente else evaluacion_seq
    return [{"seq": i.seq, "evaluacion_seq": origen, "texto": i.payload["texto"], "autor": i.actor,
             "ocurrido_en": i.ocurrido_en} for i in _indicaciones_de(eventos, origen, clave)]


def _ultima(decisiones, clave):
    decs = decisiones.get(clave)
    return decs[-1] if decs else None


def _payload(evento):
    return evento.payload if evento is not None else None


def _claves_observaciones(x, decisiones, cubiertas=None):
    """Claves que admiten indicación (observaciones), con la regla compartida de `observaciones`."""
    claves = [r["regla_id"] for r in x.p["resultados"]
              if admite_indicacion(r, _payload(_ultima(decisiones, r["regla_id"])), cubiertas)]
    claves += [NORMA_PREFIJO + n for n in x.p["cobertura"]["normas_sin_reglas"]
               if admite_indicacion(None, _payload(_ultima(decisiones, NORMA_PREFIJO + n)))]
    return claves


def _estado(x, decisiones):
    """Misma regla que `expediente.servicio.estado`, sobre la evaluación pedida (AC-02)."""
    faltan_dec = sorted(r["regla_id"] for r in x.p["resultados"]
                        if necesita_decision(r) and r["regla_id"] not in decisiones)
    faltan_normas = [NORMA_PREFIJO + n for n in x.p["cobertura"]["normas_sin_reglas"]
                     if NORMA_PREFIJO + n not in decisiones]
    falta_vb = x.visto_bueno() is None
    faltan_ind = [c for c in _claves_observaciones(x, decisiones)
                  if indicacion_vigente(x.eventos, x.ev.seq, c) is None]
    pendiente = bool(faltan_dec or faltan_normas or falta_vb)
    return {"estado": PENDIENTE if pendiente else REVISADO,
            "faltantes": {"decisiones": faltan_dec, "normas_sin_reglas": faltan_normas, "visto_bueno": falta_vb,
                          "indicaciones": faltan_ind}}


def _decision(d):
    p = d.payload
    return {"seq": d.seq, "accion": p["accion"], "veredicto": p.get("veredicto"), "motivo": p["motivo"],
            "actor": d.actor, "ocurrido_en": d.ocurrido_en}


def _indicativo(r):
    return f"{r['indicativo']} ({NO_OFICIAL})" if r.get("indicativo") else None


def _seguimiento(x, decisiones, clave, con_indicacion):
    """Decisiones con su motivo, indicación vigente (con la marca de traslado) e historial.

    Sin ninguna indicación sobre la clave no hay vigente ni historial: se responde sin recorrer la bitácora, que con
    un resultado por regla hacía cuadrática la versión del revisor (más de 2 s con 2194 resultados, spec §6)."""
    if clave in con_indicacion:
        vigente = indicacion_vigente(x.eventos, x.ev.seq, clave)
        historial = historial_indicaciones(x.eventos, x.ev.seq, clave)
    else:
        vigente, historial = None, []
    return {"decisiones": [_decision(d) for d in decisiones.get(clave, [])],
            "indicacion": asdict(vigente) if vigente else None,
            "historial_indicaciones": historial}


def _resultados_revisor(x, decisiones):
    con_indicacion = {e.payload.get("regla_id") for e in x.eventos if e.tipo == INDICACION}
    res = []
    for r in x.p["resultados"]:
        res.append({**r, "oficial": OFICIAL if r["estado_regla"] == "aprobada" else NO_OFICIAL,
                    "indicativo": _indicativo(r), **_seguimiento(x, decisiones, r["regla_id"], con_indicacion)})
    for n in x.p["cobertura"]["normas_sin_reglas"]:
        clave = NORMA_PREFIJO + n
        res.append({"regla_id": clave, "resultado": "SIN_REGLAS", "oficial": NO_OFICIAL,
                    **_seguimiento(x, decisiones, clave, con_indicacion)})
    return res


# --- versión del profesional: observaciones, cumplimientos, alcance y primera página (flujo 4) ----

def _norma(est, r):
    v = est.versiones.get((r["regla_id"], r["version"])) or {}
    return v.get("norma") or norma_de(r["regla_id"])


_LIMITE = re.compile(r"^\s*[A-Za-z_][\w.]*\s*(>=|<=|==|>|<)\s*(-?\d+(?:\.\d+)?)\s*$")
_OPERADORES = {">=": "mínimo", "<=": "máximo", ">": "mayor que", "<": "menor que", "==": "igual a"}
_SUFIJOS_UNIDAD = {"m", "m2", "cm", "pct", "pers", "ha"}


def _dato(ruta):
    """Nombre llano de un dato: último segmento sin sufijos de unidad (`lote.frente_m` → «frente»)."""
    partes = ruta.rsplit(".", 1)[-1].split("_")
    while len(partes) > 1 and partes[-1] in _SUFIJOS_UNIDAD:
        partes.pop()
    return " ".join(partes)


def _limite(r, contenido, unidad):
    """El límite en lenguaje llano si la condición es `<dato> <op> <número>`; si no, la cita literal.
    El profesional nunca ve nombres internos de datos ni expresiones de la regla."""
    m = _LIMITE.match(contenido.get("condicion") or "")
    if m is None:
        return f"según la norma: «{r['cita_textual']}»"
    return f"límite de la norma: {_OPERADORES[m.group(1)]} {m.group(2)}{unidad}"


def _que(r, contenido):
    """Valor declarado y límite; «falta el dato» si no se declaró; el requisito citado si es de criterio."""
    valores = r["valores_usados"]
    entradas = contenido.get("entradas") or list(valores)
    faltan = [e for e in entradas if (valores.get(e) or {}).get("valor") is None]
    if faltan:
        return "; ".join(f"falta el dato {_dato(e)}" for e in faltan)
    if contenido.get("tipo") == "criterio" or not contenido.get("condicion"):
        return f"no cumple el requisito citado: «{r['cita_textual']}»"
    unidad = f" {contenido['unidad']}" if contenido.get("unidad") else ""
    if len(entradas) == 1:
        declarados = f"{valores[entradas[0]]['valor']}{unidad}"
    else:
        declarados = "; ".join(f"{_dato(e)} {valores[e]['valor']}{unidad}" for e in entradas)
    return f"valor declarado: {declarados}; {_limite(r, contenido, unidad)}"


def _donde(r):
    lugares = []
    for v in r["valores_usados"].values():
        fuente = v.get("fuente") or {}
        for campo, rotulo in (("hoja", "hoja"), ("pagina", "página")):
            if fuente.get(campo) is not None and f"{rotulo} {fuente[campo]}" not in lugares:
                lugares.append(f"{rotulo} {fuente[campo]}")
    return ", ".join(lugares) or UBICACION_NO_CONSTA


def _observacion(x, est, contenidos, clave):
    vigente = indicacion_vigente(x.eventos, x.ev.seq, clave)
    base = {"clave": clave, "que_hacer": vigente.texto if vigente else None}
    if clave.startswith(NORMA_PREFIJO):
        n = clave[len(NORMA_PREFIJO):]
        nombre = (NORMAS.get(n) or {}).get("nombre", n)
        return {**base, "rotulo": ROTULO_NORMA, "severidad": "bloqueante", "norma": n,
                "que": f"no cumple la norma {nombre}, según la decisión del Revisor DOYC",
                "donde": UBICACION_NO_CONSTA,
                "por_que": {"cita": None, "norma": nombre, "articulo": None,
                            "texto": f"Norma {n} ({nombre}): el sistema no tiene su texto; no hay cita literal."},
                "zona_sin_ceus": None}
    r = next(res for res in x.p["resultados"] if res["regla_id"] == clave)
    return {**base, "rotulo": None, "severidad": r.get("severidad"), "norma": _norma(est, r),
            "que": _que(r, contenidos.get(r["hash_contenido"]) or {}), "donde": _donde(r),
            "por_que": {"cita": r["cita_textual"], "norma": r["fuente_norma"], "articulo": r["articulo"]},
            "zona_sin_ceus": SIN_CEUS_TEXTO if SIN_CEUS in r["advertencias"] else None}


def _observaciones(x, decisiones, est, contenidos):
    """Bloqueantes primero, después las no bloqueantes, por la severidad que declara la regla (AC-08)."""
    vb = x.visto_bueno()
    cubiertas = set(vb.payload.get("reglas") or []) if vb else set()
    obs = [_observacion(x, est, contenidos, c) for c in _claves_observaciones(x, decisiones, cubiertas)]
    return sorted(obs, key=lambda o: o["severidad"] != "bloqueante")


def _veredicto(ultima):
    return ultima.payload.get("veredicto") if ultima is not None and ultima.payload["accion"] == "veredicto" \
        else None


def _cumplimientos(x, decisiones, est):
    """Solo el conteo por norma y tema: oficiales y por veredicto humano, sin detalle por regla (AC-09)."""
    conteo = {}
    for r in x.p["resultados"]:
        if r["resultado"] == "CUMPLE" or (r["resultado"] == REVISION
                                          and _veredicto(_ultima(decisiones, r["regla_id"])) == "CUMPLE"):
            k = (_norma(est, r) or NO_CONSTA, _tema(r))
            conteo[k] = conteo.get(k, 0) + 1
    return [{"norma": n, "tema": t, "cantidad": c} for (n, t), c in sorted(conteo.items())]


def _dato_declarado(r):
    return any(v.get("valor") is not None for v in r["valores_usados"].values())


def _tema(r):
    return r["regla_id"].rsplit("-", 1)[-1]


def _alcance(x, decisiones, est):
    """Sale siempre, también sin limitaciones; nunca declara un cumplimiento global (AC-19). Lo resuelto
    por criterio del revisor: los veredictos favorables solo como conteo por norma y tema (AC-09), los
    NO_CUMPLE descartados uno por uno; en ambos, si había dato declarado."""
    aplicables = [r for r in x.p["resultados"] if r["resultado"] != NO_APLICA]
    favorables, descartados = {}, []
    for r in aplicables:
        ultima = _ultima(decisiones, r["regla_id"])
        if _veredicto(ultima) == "CUMPLE":
            k = (_norma(est, r) or NO_CONSTA, _tema(r))
            cantidad, sin_dato = favorables.get(k, (0, 0))
            favorables[k] = (cantidad + 1, sin_dato + (not _dato_declarado(r)))
        elif ultima is not None and ultima.payload["accion"] == "descartar":
            descartados.append({"clave": r["regla_id"], "norma": _norma(est, r) or NO_CONSTA,
                                "dato_declarado": _dato_declarado(r)})
    return {
        "normas_con_reglas_aprobadas": sorted({_norma(est, r) or NO_CONSTA for r in aplicables
                                               if r["estado_regla"] == "aprobada"}),
        "reglas_no_evaluadas": sum(r["estado_regla"] != "aprobada" for r in aplicables),
        "normas_decididas_a_mano": [n for n in x.p["cobertura"]["normas_sin_reglas"]
                                    if NORMA_PREFIJO + n in decisiones],
        "zona_sin_ceus": any(SIN_CEUS in r["advertencias"] for r in aplicables),
        "veredictos_favorables": [{"norma": n, "tema": t, "cantidad": c, "sin_dato_declarado": sd}
                                  for (n, t), (c, sd) in sorted(favorables.items())],
        "descartados": sorted(descartados, key=lambda d: d["clave"]),
        "declaracion": DECLARACION_ALCANCE,
    }


def _vigencia(vigencias):
    desdes = [str(v["desde"]) for v in vigencias if v.get("desde")]
    if not desdes:
        return NO_CONSTA
    hastas = [v.get("hasta") for v in vigencias]
    return {"desde": min(desdes), "hasta": None if None in hastas else max(str(h) for h in hastas)}


def _normas_consultadas(x, est, contenidos):
    """Normas con su vigencia, tomada del contenido de cada versión de regla usada (ADR-0001)."""
    grupos = {}
    for r in x.p["resultados"]:
        if r["resultado"] == NO_APLICA:
            continue
        contenido = contenidos.get(r["hash_contenido"]) or {}
        vigencia = contenido.get("vigencia") or (est.versiones.get((r["regla_id"], r["version"])) or {}).get(
            "vigencia") or {}
        grupos.setdefault((_norma(est, r) or NO_CONSTA, r["fuente_norma"] or NO_CONSTA), []).append(vigencia)
    res = [{"codigo": c, "norma": n, "vigencia": _vigencia(v)} for (c, n), v in grupos.items()]
    res += [{"codigo": n, "norma": (NORMAS.get(n) or {}).get("nombre", n), "vigencia": NO_CONSTA}
            for n in x.p["cobertura"]["normas_sin_reglas"]]
    return sorted(res, key=lambda d: (d["codigo"], d["norma"]))


def _aviso_no_vigente(x):
    vigente = x.vigente()
    if vigente == x.ev.seq:
        return None
    return {"vigente": vigente,
            "texto": f"No es la evaluación vigente: la evaluación vigente del expediente es la {vigente}."}


def proyectar(eventos_expediente, estado_reglas, evaluacion_seq, version, encabezado=None, contenidos=None):
    """Modelo del informe de `evaluacion_seq` en la `version` pedida ("revisor" o "profesional").

    `contenidos` (hash_contenido -> contenido de la versión de regla) da el límite, el tipo y la vigencia.
    La versión del profesional no lleva `resultados` (ni indicativos, ni NO_APLICA, ni motivos); las
    observaciones sin indicación vigente quedan en `estado.faltantes.indicaciones` (AC-18)."""
    x = _Expediente(eventos_expediente, evaluacion_seq)
    decisiones, contenidos = x.decisiones(), contenidos or {}
    nota = list(NOTA_PRELIMINAR)
    if version == "revisor":
        nota.insert(0, USO_INTERNO)
    modelo = {
        "version": version,
        "formato_informe": FORMATO_INFORME,
        "expediente": x.p["expediente_id"],
        "evaluacion": {"seq": x.ev.seq, "hash": x.ev.hash, "fecha_presentacion": x.p["fecha_presentacion"],
                       "norma_aplicable": x.p.get("norma_aplicable"), "zona": x.p["zona"]},
        "encabezado": _encabezado(encabezado),
        "estado": _estado(x, decisiones),
        "aviso_no_vigente": _aviso_no_vigente(x),
        "observaciones": _observaciones(x, decisiones, estado_reglas, contenidos),
        "cumplimientos": _cumplimientos(x, decisiones, estado_reglas),
        "alcance": _alcance(x, decisiones, estado_reglas),
        "cobertura": x.p["cobertura"],
        "normas_consultadas": _normas_consultadas(x, estado_reglas, contenidos),
        "version_motor": x.p["version_motor"],
        "nota_preliminar": nota,
    }
    if version == "revisor":
        modelo["resultados"] = _resultados_revisor(x, decisiones)
    return modelo
