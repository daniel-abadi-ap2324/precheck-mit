"""Servicios de expediente: evaluar, decidir, visto bueno, estado y reproducir (spec US-01…US-07).

Evaluar elige la versión de cada regla por la fecha de presentación y toma su estado actual. Solo
una versión aprobada emite resultado oficial; las demás dan REQUIERE_REVISION con su indicativo.
Una regla no aprobada cuyo `aplica_si` es falso queda NO_APLICA (no oficial): esas reglas solo
filtran por norma y zona, y mandarlas a revisión inundaría al revisor con reglas de otras zonas.
"""
import copy
import datetime as dt
from dataclasses import asdict, dataclass
from typing import Mapping, Optional, Tuple

from precheck.errores import CadenaAvanzada, ErrorDecision, ErrorExpediente, ErrorPreCheck, IntegridadComprometida
from precheck.expediente.observaciones import (
    INDICACION,
    admite_indicacion,
    necesita_decision,
    payload_indicacion,
    texto_indicacion,
)
from precheck.motor.evaluador import NO_APLICA, REVISION, DatoFaltante, evaluar_regla, obtener_hecho
from precheck.motor.seleccion import seleccionar
from precheck.motor.version import VERSION_MOTOR, commit
from precheck.personas.registro import exigir_rol, registro_de_personas
from precheck.reglas.gobierno import NORMAS, estado_de_reglas

SIN_CEUS = "sin CEUS"
DISCREPANCIA = "discrepancia CEUS/Documento Gráfico"


@dataclass(frozen=True)
class ResultadoRegla:
    regla_id: str
    version: int
    hash_contenido: str
    estado_regla: str
    resultado: str
    indicativo: Optional[str]
    motivo: str
    severidad: Optional[str]
    cita_textual: str
    fuente_norma: str
    articulo: str
    valores_usados: Mapping
    advertencias: Tuple[str, ...] = ()


@dataclass(frozen=True)
class Cobertura:
    normas_evaluadas: Mapping
    normas_sin_reglas: Tuple[str, ...]
    reglas_sin_aprobar: int
    temas_evaluados: Optional[Mapping] = None          # norma -> temas evaluados (último segmento del id, review M9)


@dataclass(frozen=True)
class Evaluacion:
    expediente_id: str
    seq: int
    hash: str
    fecha_presentacion: str
    norma_aplicable: Optional[str]
    zona: Mapping
    umbral: float
    version_motor: str
    resultados: Tuple[ResultadoRegla, ...]
    cobertura: Cobertura


def cadena_de(expediente_id):
    return f"expediente:{expediente_id}"


def _valor(hechos, ruta):
    try:
        return obtener_hecho(hechos, ruta)["valor"]
    except DatoFaltante:
        return None


def _zona(hechos):
    """La CEUS prevalece sobre el código leído del Documento Gráfico (principio 5, AC-04)."""
    ceus, dg = _valor(hechos, "lote.ceus"), _valor(hechos, "lote.codigo_zona")
    usados = copy.deepcopy(hechos)
    if ceus is not None:
        hecho = obtener_hecho(hechos, "lote.ceus")      # conserva su confianza y su fuente (review M8)
        usados["lote"]["codigo_zona"] = {"valor": ceus, "confianza": hecho.get("confianza", 1.0),
                                         "fuente": hecho.get("fuente") or {"metodo": "ceus"}}
    return usados, {"ceus": ceus, "documento_grafico": dg, "usada": ceus if ceus is not None else dg}


def _oficializar(sel, bruto):
    """Solo una versión aprobada emite resultado oficial (ADR-0005, AC-06)."""
    if bruto["resultado"] == NO_APLICA:
        return NO_APLICA, None, bruto["motivo"] + ("" if sel.modo == "oficial" else "; regla no aprobada")
    if sel.modo == "oficial":
        return bruto["resultado"], None, bruto["motivo"]
    if sel.modo == "indicativo":
        return REVISION, bruto["resultado"], f"regla en {sel.estado}: resultado no oficial ({bruto['motivo']})"
    return REVISION, None, f"versión {sel.estado}: sin versión oficial vigente"


def _advertencias(zona, resultado, valores):
    if resultado == NO_APLICA or "lote.codigo_zona" not in valores:
        return ()
    if zona["ceus"] is None:
        return (SIN_CEUS,)
    if zona["documento_grafico"] is not None and zona["ceus"] != zona["documento_grafico"]:
        return (DISCREPANCIA,)
    return ()


def evaluar_con(repo, est, hechos, fecha, umbral):
    """Evaluación pura sobre un estado de reglas dado (la reutiliza reproducir)."""
    hechos_eval, zona = _zona(hechos)
    resultados = []
    for regla_id in est.reglas():
        sel = seleccionar(regla_id, est, fecha)
        if sel is None:
            continue
        try:
            contenido = repo.contenido(sel.hash)
        except IntegridadComprometida as e:      # review M2: nunca se evalúa con contenido alterado
            resultados.append(ResultadoRegla(regla_id, sel.version, sel.hash, sel.estado, REVISION, None,
                                             f"contenido de la regla alterado: {e}", None, "", "", "", {}, ()))
            continue
        bruto = evaluar_regla(contenido, hechos_eval, umbral)
        resultado, indicativo, motivo = _oficializar(sel, bruto)
        fuente = contenido.get("fuente") or {}
        advert = _advertencias(zona, resultado, bruto["valores_usados"])
        if sel.borrador_version:
            advert += (f"hay un borrador v{sel.borrador_version} más nuevo",)
        resultados.append(ResultadoRegla(
            regla_id, sel.version, sel.hash, sel.estado, resultado, indicativo, motivo, contenido.get("severidad"),
            fuente.get("cita_textual", ""), fuente.get("norma", ""), str(fuente.get("articulo", "")),
            bruto["valores_usados"], advert))
    return resultados, zona


def _cobertura(est, resultados, norma_aplicable):
    normas, temas = {}, {}
    sin_aprobar = 0
    for r in resultados:
        if r.resultado == NO_APLICA:
            continue
        n = est.versiones[(r.regla_id, r.version)]["norma"]
        normas[n] = normas.get(n, 0) + 1
        temas.setdefault(n, set()).add(r.regla_id.rsplit("-", 1)[-1])
        sin_aprobar += r.estado_regla != "aprobada"
    con_reglas = {v["norma"] for v in est.versiones.values()}
    sin_reglas = tuple(n for n in [norma_aplicable] if n and (n not in con_reglas or not NORMAS.get(n, {}).get("prefijos")))
    return Cobertura(normas, sin_reglas, sin_aprobar, {n: tuple(sorted(t)) for n, t in temas.items()})


def _fecha_presentacion(hechos, expediente_id, umbral):
    """AAAA-MM-DD con confianza suficiente; si no, no hay norma aplicable confiable (review M6)."""
    try:
        hecho = obtener_hecho(hechos, "expediente.fecha_presentacion")
    except DatoFaltante:
        hecho = {"valor": None}
    if not hecho.get("valor"):
        raise ErrorExpediente("expediente.sin_fecha_presentacion", expediente=expediente_id)
    fecha = str(hecho["valor"])
    try:
        valida = len(fecha) == 10 and dt.date.fromisoformat(fecha).isoformat() == fecha
    except ValueError:
        valida = False
    if not valida or float(hecho.get("confianza", 1.0)) < umbral:
        raise ErrorExpediente("expediente.fecha_invalida", expediente=expediente_id, fecha=fecha,
                              confianza=hecho.get("confianza"))
    return fecha


def evaluar(ctx, expediente_id, hechos, umbral=0.85):
    """Evalúa y registra la evaluación con la instantánea del estado de las reglas.

    Toma la cabeza de la cadena de reglas antes de leer su estado y la exige al anexar, en la misma
    transacción exclusiva: si cualquier evento entró en esa cadena mientras se calculaba (gobierno de reglas,
    personas o sello; no solo retiros o suspensiones), la instantánea podría no ser la del instante registrado
    y la evaluación no se registra (expediente.evaluacion_concurrente; re-revisión N1, N7, ADR-0004)."""
    eventos_reglas = ctx.eventos_reglas()
    cabeza_reglas = eventos_reglas[-1].seq if eventos_reglas else 0
    reg = registro_de_personas(eventos_reglas)
    yo = ctx.persona(reg)
    exigir_rol(reg, yo, "revisor_doyc")
    fecha = _fecha_presentacion(hechos, expediente_id, umbral)
    est = estado_de_reglas(eventos_reglas)
    resultados, zona = evaluar_con(ctx.repo, est, hechos, fecha, umbral)
    norma = _valor(hechos, "lote.norma_aplicable")
    cobertura = _cobertura(est, resultados, norma)
    payload = {"expediente_id": expediente_id, "fecha_presentacion": fecha, "norma_aplicable": norma,
               "zona": zona, "umbral": umbral, "version_motor": VERSION_MOTOR, "commit": commit(),
               "hechos": hechos, "resultados": [asdict(r) for r in resultados], "cobertura": asdict(cobertura)}
    try:
        ev = ctx.anexar(cadena_de(expediente_id), "evaluacion", yo, "revisor_doyc", payload,
                        usos=[(r.regla_id, r.version) for r in resultados if r.resultado != NO_APLICA],
                        cabezas={"reglas": cabeza_reglas})
    except CadenaAvanzada as e:
        raise ErrorExpediente("expediente.evaluacion_concurrente", expediente=expediente_id) from e
    return Evaluacion(expediente_id, ev.seq, ev.hash, fecha, norma, zona, umbral, VERSION_MOTOR,
                      tuple(resultados), cobertura)


# --- decisiones humanas (US-05, US-06) -------------------------------------------------------

VISTO_BUENO = "visto bueno"
NORMA_PREFIJO = "norma:"


PENDIENTE, REVISADO = "pendiente", "revisado"
ETIQUETAS_ESTADO = {PENDIENTE: "pendiente de revisión humana", REVISADO: "revisado"}


def etiqueta_estado(estado):
    """Cómo se muestra el estado del expediente (CLI e informe): un solo término, «pendiente de revisión
    humana»; el valor interno sigue siendo `pendiente` (AC-02, review B4)."""
    return ETIQUETAS_ESTADO.get(estado, estado)


@dataclass(frozen=True)
class EstadoExpediente:
    expediente_id: str
    evaluacion: int
    estado: str                        # pendiente | revisado (nunca «aprobado»: el dictamen es de la DOYC)
    pendientes: Tuple[str, ...]


def exigir_revisor(ctx):
    """La persona de la cuenta, si tiene el rol de Revisor DOYC (AC-07)."""
    reg = ctx.registro()
    yo = ctx.persona(reg)
    exigir_rol(reg, yo, "revisor_doyc")
    return yo


def _evaluaciones(ctx, expediente_id):
    return [e for e in ctx.repo.leer(cadena_de(expediente_id)) if e.tipo == "evaluacion"]


def _evaluacion_vigente(ctx, expediente_id, seq):
    evals = _evaluaciones(ctx, expediente_id)
    ev = next((e for e in evals if e.seq == seq), None)
    if ev is None:
        raise ErrorExpediente("expediente.evaluacion_inexistente", expediente=expediente_id, evaluacion=seq)
    if ev.seq != evals[-1].seq:
        raise ErrorExpediente("expediente.evaluacion_no_vigente", expediente=expediente_id, vigente=evals[-1].seq)
    return ev


def _para_visto_bueno(r):
    return r["resultado"] == "CUMPLE" or (r["resultado"] == "NO_CUMPLE" and r.get("severidad") == "observacion")


def decidir(ctx, expediente_id, evaluacion, regla_id, accion, motivo, veredicto=None, indicacion=None):
    """AC-13/AC-14: confirmar o descartar un NO_CUMPLE bloqueante, o fijar un veredicto humano sobre
    un REQUIERE_REVISION; siempre con motivo, enlazado al resultado y sin modificarlo.

    Con `indicacion` (AC-17 del informe, ADR-0003) anexa además el evento `indicacion` en la misma
    transacción; solo con `confirmar` o con veredicto NO_CUMPLE. Devuelve el evento de la decisión."""
    yo = exigir_revisor(ctx)
    if not (motivo or "").strip():
        raise ErrorDecision("decision.motivo_obligatorio")
    ev = _evaluacion_vigente(ctx, expediente_id, evaluacion)
    if regla_id.startswith(NORMA_PREFIJO):
        payload = _decision_norma(ev, regla_id, accion, motivo, veredicto)
    else:
        payload = _decision_regla(ev, regla_id, accion, motivo, veredicto)
    if indicacion is None:
        return ctx.anexar(cadena_de(expediente_id), "decision", yo, "revisor_doyc", payload)
    texto = texto_indicacion(indicacion)
    resultado = None if regla_id.startswith(NORMA_PREFIJO) else \
        next(r for r in ev.payload["resultados"] if r["regla_id"] == regla_id)
    if not admite_indicacion(resultado, payload):
        raise ErrorPreCheck("informe.indicacion_no_aplicable", regla=regla_id, accion=accion)
    decision, _ = ctx.anexar_lote(cadena_de(expediente_id), [
        ("decision", yo, "revisor_doyc", payload),
        (INDICACION, yo, "revisor_doyc", payload_indicacion(ev, regla_id, texto))])
    return decision


def _decision_regla(ev, regla_id, accion, motivo, veredicto):
    r = next((x for x in ev.payload["resultados"] if x["regla_id"] == regla_id), None)
    aplica = r is not None and necesita_decision(r) and (
        (r["resultado"] == "NO_CUMPLE" and accion in ("confirmar", "descartar"))
        or (r["resultado"] == REVISION and accion == "veredicto" and veredicto in ("CUMPLE", "NO_CUMPLE")))
    if not aplica:
        raise ErrorDecision("decision.accion_no_aplicable", regla=regla_id, accion=accion)
    return {"evaluacion_seq": ev.seq, "hash_evaluacion": ev.hash, "regla_id": regla_id, "version": r["version"],
            "resultado_original": r["resultado"], "accion": accion, "veredicto": veredicto, "motivo": motivo.strip()}


def _decision_norma(ev, clave, accion, motivo, veredicto):
    """Una norma sin reglas cargadas (p. ej. MIVIOT) exige un veredicto humano (review A4, AC-21)."""
    norma = clave[len(NORMA_PREFIJO):]
    if norma not in ev.payload["cobertura"]["normas_sin_reglas"] or accion != "veredicto" \
            or veredicto not in ("CUMPLE", "NO_CUMPLE"):
        raise ErrorDecision("decision.accion_no_aplicable", regla=clave, accion=accion)
    return {"evaluacion_seq": ev.seq, "hash_evaluacion": ev.hash, "regla_id": clave, "version": None,
            "resultado_original": "SIN_REGLAS", "accion": accion, "veredicto": veredicto, "motivo": motivo.strip()}


def listar_visto_bueno(ctx, expediente_id, evaluacion):
    exigir_revisor(ctx)
    ev = _evaluacion_vigente(ctx, expediente_id, evaluacion)
    return [ResultadoRegla(**{**r, "advertencias": tuple(r["advertencias"])})
            for r in ev.payload["resultados"] if _para_visto_bueno(r)]


def dar_visto_bueno(ctx, expediente_id, evaluacion, confirmar_sin_ceus=False):
    """Si algún resultado depende de la zona sin CEUS, el visto bueno exige confirmarlo de forma
    explícita (spec §8, default adoptado; review M7)."""
    yo = exigir_revisor(ctx)
    ev = _evaluacion_vigente(ctx, expediente_id, evaluacion)
    resultados = [r for r in ev.payload["resultados"] if _para_visto_bueno(r)]
    if any(SIN_CEUS in r["advertencias"] for r in resultados) and not confirmar_sin_ceus:
        raise ErrorDecision("decision.confirmacion_sin_ceus", expediente=expediente_id)
    return ctx.anexar(cadena_de(expediente_id), "visto_bueno", yo, "revisor_doyc",
                      {"evaluacion_seq": ev.seq, "hash_evaluacion": ev.hash, "confirmar_sin_ceus": confirmar_sin_ceus,
                       "reglas": [r["regla_id"] for r in resultados]})


def estado(ctx, expediente_id):
    """AC-16: pendiente mientras falte una decisión o el visto bueno; revisado cuando está todo."""
    exigir_revisor(ctx)
    eventos = list(ctx.repo.leer(cadena_de(expediente_id)))
    evals = [e for e in eventos if e.tipo == "evaluacion"]
    if not evals:
        raise ErrorExpediente("expediente.evaluacion_inexistente", expediente=expediente_id)
    ev = evals[-1]
    decididas = {e.payload["regla_id"] for e in eventos
                 if e.tipo == "decision" and e.payload.get("evaluacion_seq") == ev.seq}
    con_vb = any(e.tipo == "visto_bueno" and e.payload.get("evaluacion_seq") == ev.seq for e in eventos)
    pendientes = [r["regla_id"] for r in ev.payload["resultados"]
                  if necesita_decision(r) and r["regla_id"] not in decididas]
    pendientes += [NORMA_PREFIJO + n for n in ev.payload["cobertura"]["normas_sin_reglas"]
                   if NORMA_PREFIJO + n not in decididas]
    if not con_vb:        # siempre: aun sin resultados aplicables, alguien firma (review A4)
        pendientes.append(VISTO_BUENO)
    return EstadoExpediente(expediente_id, ev.seq, PENDIENTE if pendientes else REVISADO, tuple(pendientes))


# --- reproducción (US-07) ----------------------------------------------------------------------

@dataclass(frozen=True)
class Reproduccion:
    resultado: str                     # coincide | discrepancias | no_reproducible_version
    discrepancias: Tuple[Tuple[str, str, str], ...]
    evento: object


_MODO = {"aprobada": "oficial", "borrador": "indicativo"}


class _Sel:
    """Selección reconstruida desde la instantánea: estado de entonces, no el actual (ADR-0004)."""

    def __init__(self, r):
        self.estado, self.modo = r["estado_regla"], _MODO.get(r["estado_regla"], "sin_oficial")


def reproducir(ctx, expediente_id, evaluacion):
    """AC-17/AC-18: vuelve a evaluar con la instantánea y registra si coincide, sin tocar el original."""
    yo = exigir_revisor(ctx)
    ev = next((e for e in _evaluaciones(ctx, expediente_id) if e.seq == evaluacion), None)
    if ev is None:
        raise ErrorExpediente("expediente.evaluacion_inexistente", expediente=expediente_id, evaluacion=evaluacion)
    p = ev.payload
    base = {"evaluacion_seq": ev.seq, "hash_evaluacion": ev.hash, "version_registrada": p["version_motor"],
            "version_actual": VERSION_MOTOR}
    if p["version_motor"] != VERSION_MOTOR:
        registro = ctx.anexar(cadena_de(expediente_id), "reproduccion", yo, "revisor_doyc",
                              {**base, "resultado": "no_reproducible_version", "discrepancias": []})
        return Reproduccion("no_reproducible_version", (), registro)
    hechos_eval, _ = _zona(p["hechos"])
    discrepancias = []
    for r in p["resultados"]:
        try:
            contenido = ctx.repo.contenido(r["hash_contenido"])
        except IntegridadComprometida:
            discrepancias.append((r["regla_id"], r["resultado"], REVISION, "contenido de la regla alterado"))
            continue
        resultado, indicativo, _ = _oficializar(_Sel(r), evaluar_regla(contenido, hechos_eval, p["umbral"]))
        if (resultado, indicativo) != (r["resultado"], r["indicativo"]):
            discrepancias.append((r["regla_id"], r["resultado"], resultado, "resultado distinto"))
    tipo = "discrepancias" if discrepancias else "coincide"
    registro = ctx.anexar(cadena_de(expediente_id), "reproduccion", yo, "revisor_doyc", {
        **base, "resultado": tipo,
        "discrepancias": [{"regla_id": d[0], "original": d[1], "nuevo": d[2], "motivo": d[3]} for d in discrepancias]})
    return Reproduccion(tipo, tuple(d[:3] for d in discrepancias), registro)
