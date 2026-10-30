"""Vigencia de las emisiones del informe y resultados afectados (ADR-0004). Dominio puro, sin E/S.

La vigencia se deriva al consultar, desde la cadena del expediente y la cadena de reglas; no se
escriben marcas ni se leen las `afectado_suspension` del núcleo. Lo que ya estaba en la instantánea
de la evaluación (el `estado_regla` de cada resultado) no la afecta: un retiro afecta un resultado que
no estaba ya `retirada`; una suspensión, uno que no estaba ya `suspendida`. Así una evaluación hecha
después de un retiro o durante una suspensión no queda afectada y reevaluar desbloquea la emisión
(AC-20), aunque todo ocurra en el mismo segundo (el reloj tiene resolución de segundos).
"""
from dataclasses import dataclass, replace
from typing import Literal, Optional

from precheck.reglas.gobierno import linaje, norma_de, recorrer

Vigencia = Literal["vigente", "reemplazado", "sustituida"]

_CAMBIOS = ("retiro", "suspension_confirmada", "levantamiento_confirmado")


@dataclass(frozen=True)
class Afectacion:
    tipo: Literal["retiro", "suspension"]
    referencia: str                      # "<regla_id> v<version>" o la norma
    desde: str                           # ISO 8601 UTC
    hasta: Optional[str]                 # levantamiento, si lo hubo


@dataclass(frozen=True)
class EstadoEmision:
    expediente_id: str
    evaluacion: int
    seq: int                             # evento informe_emitido
    huella: str
    formato_informe: str
    emitido_por: str                     # persona_id
    emitido_en: str
    vigencia: Vigencia
    sustituida_por: Optional[int]        # seq de la emisión posterior (vigencia "sustituida")
    reemplazado_por: Optional[int]       # seq de la evaluación posterior (vigencia "reemplazado")
    afectaciones: tuple[Afectacion, ...]


def _que_cuentan(evaluacion):
    """(regla_id, version) -> estado_regla en la instantánea, de los resultados que no son NO_APLICA."""
    return {(r["regla_id"], r["version"]): r.get("estado_regla") for r in evaluacion.payload.get("resultados", ())
            if r.get("resultado") != "NO_APLICA"}


def _norma(est, regla_id, version):
    return norma_de(regla_id) or (est.versiones.get((regla_id, version)) or {}).get("norma")


def _suspension_afecta(tocados, posterior):
    """¿Una suspensión nueva afecta resultados con esos `estado_regla` en la instantánea? Un resultado
    `aprobada` no estaba suspendido: afecta; uno `suspendida` ya lo estaba: no. Una regla en borrador no
    muestra la suspensión: afecta si la confirmación es de un segundo posterior, o del mismo segundo si
    ningún resultado tocado muestra que la norma ya estaba suspendida."""
    if "aprobada" in tocados:
        return True
    otros = tocados - {"suspendida"}
    return bool(otros) and (posterior or "suspendida" not in tocados)


def afectaciones(evaluacion, eventos_reglas) -> tuple[Afectacion, ...]:
    """Retiros y suspensiones que tocan algún resultado que cuenta y que su instantánea no reflejaba, con
    el período de cada suspensión (`hasta` al levantarse).

    Recorre la cadena de reglas una sola vez, aplicando cada evento como `estado_de_reglas` (así no cuenta
    lo que el gobierno ignora, cuatro ojos). Un retiro afecta si la versión no estaba ya `retirada` en la
    instantánea. Una suspensión afecta los resultados de su norma o de una norma derivada que no estaban
    ya `suspendida`; las confirmadas en un segundo anterior al de la evaluación ya están en la instantánea
    y no se cuentan (ver `_suspension_afecta` para las reglas en borrador, que no muestran la suspensión),
    salvo que la instantánea diga `aprobada` para un resultado que tocan y sigan abiertas al evaluar: una
    regla aprobada de una norma suspendida se registra `suspendida`, así que esa instantánea se calculó
    antes de la confirmación (carrera con `evaluar`, re-revisión N1)."""
    cuentan = _que_cuentan(evaluacion)
    res: list[Afectacion] = []
    descartadas: set[int] = set()        # abiertas antes de la evaluación y levantadas antes de ella
    abiertas: dict[str, int] = {}          # norma -> índice de su afectación abierta en `res`
    retiradas: set = set()
    suspendidas: set = set()
    for ev, est in recorrer(eventos_reglas):
        if ev.tipo not in _CAMBIOS:
            continue
        if ev.tipo == "retiro":
            clave = (ev.payload.get("regla_id"), ev.payload.get("version"))
            if clave in cuentan and clave not in retiradas and est.estado(*clave) == "retirada":
                retiradas.add(clave)
                if cuentan[clave] != "retirada":
                    res.append(Afectacion("retiro", f"{clave[0]} v{clave[1]}", ev.ocurrido_en, None))
            continue
        antes, suspendidas = suspendidas, set(est.suspendidas)
        anterior = ev.ocurrido_en < evaluacion.ocurrido_en
        for norma in sorted(suspendidas - antes):
            tocados = {estado for (regla_id, version), estado in cuentan.items()
                       if norma in linaje(_norma(est, regla_id, version))}
            if (anterior and "aprobada" in tocados) or \
                    (not anterior and _suspension_afecta(tocados, ev.ocurrido_en > evaluacion.ocurrido_en)):
                abiertas[norma] = len(res)
                res.append(Afectacion("suspension", norma, ev.ocurrido_en, None))
        for norma in sorted(antes - suspendidas):
            if norma in abiertas:
                j = abiertas.pop(norma)
                if ev.ocurrido_en < evaluacion.ocurrido_en:
                    descartadas.add(j)           # ya no estaba abierta al evaluar: no afectó
                else:
                    res[j] = replace(res[j], hasta=ev.ocurrido_en)
    return tuple(a for i, a in enumerate(res) if i not in descartadas)


def cerrada_antes(afectacion, instante) -> bool:
    """¿El período terminó antes de `instante`? Con el mismo segundo, solo si empezó antes: una emisión no
    ocurre con una afectación abierta (AC-20), así que su levantamiento fue anterior."""
    hasta = afectacion.hasta
    return hasta is not None and (hasta < instante or (hasta == instante and afectacion.desde < instante))


def afectados_vigentes(evaluacion, eventos_reglas) -> tuple[Afectacion, ...]:
    """Afectaciones que siguen en pie (sin levantamiento): bloquean la emisión (AC-20)."""
    return tuple(a for a in afectaciones(evaluacion, eventos_reglas) if a.hasta is None)


def estados(eventos_expediente, eventos_reglas, expediente_id) -> tuple[EstadoEmision, ...]:
    """Estado de cada emisión: reemplazada por una evaluación posterior (prevalece), sustituida por una
    emisión posterior de la misma evaluación con otra huella, o vigente; la misma huella es otra
    entrega del mismo documento y no marca nada (AC-15, AC-16). Sus afectaciones omiten los períodos
    cerrados antes de la emisión (B3)."""
    eventos = list(eventos_expediente)
    eventos_reglas = list(eventos_reglas)
    evaluaciones = {e.seq: e for e in eventos if e.tipo == "evaluacion"}
    emisiones = [e for e in eventos if e.tipo == "informe_emitido"]
    por_evaluacion: dict[int, tuple[Afectacion, ...]] = {}
    res = []
    for em in emisiones:
        p = em.payload
        origen = p["evaluacion_seq"]
        reemplazo = next((s for s in sorted(evaluaciones) if s > origen), None)
        sustituta = next((o.seq for o in emisiones if o.seq > em.seq and o.payload["evaluacion_seq"] == origen
                          and o.payload["huella"] != p["huella"]), None)
        vigencia: Vigencia
        if reemplazo is not None:
            vigencia, sustituta = "reemplazado", None
        else:
            vigencia = "sustituida" if sustituta is not None else "vigente"
        evaluacion = evaluaciones.get(origen)
        if evaluacion is not None and origen not in por_evaluacion:
            por_evaluacion[origen] = afectaciones(evaluacion, eventos_reglas)
        afect = tuple(a for a in por_evaluacion.get(origen, ()) if not cerrada_antes(a, em.ocurrido_en))
        res.append(EstadoEmision(expediente_id, origen, em.seq, p["huella"], p["formato_informe"], em.actor,
                                 em.ocurrido_en, vigencia, sustituta, reemplazo, afect))
    return tuple(res)
