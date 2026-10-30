"""Eventos del expediente armados en memoria para probar la proyección pura del informe.

Mismo sobre que `EventoRegistrado`; los hashes son ficticios (la proyección no verifica la cadena).
Datos ficticios: EXP-TEST-*, P-000*.
"""
import datetime as dt

from precheck.auditoria.cadena import EventoRegistrado
from precheck.reglas.gobierno import EstadoReglas, norma_de

EXP = "EXP-TEST-0500"
REVISOR = "P-0004"
_INICIO = dt.datetime(2026, 9, 1, 12, 0, tzinfo=dt.timezone.utc)


def valor(v, confianza=0.95, **fuente):
    return {"valor": v, "confianza": confianza, "fuente": fuente or {"metodo": "declarado", "documento": "formulario"}}


def resultado(regla_id, resultado="CUMPLE", *, version=1, estado="aprobada", indicativo=None, severidad="bloqueante",
              valores=None, advertencias=(), cita=None, norma="PLOT, Acuerdo 61 de 2021", articulo="10",
              motivo="condición evaluada"):
    return {"regla_id": regla_id, "version": version, "hash_contenido": f"h-{regla_id}-v{version}",
            "estado_regla": estado, "resultado": resultado, "indicativo": indicativo, "motivo": motivo,
            "severidad": severidad, "cita_textual": cita if cita is not None else f"cita literal de {regla_id}",
            "fuente_norma": norma, "articulo": articulo,
            "valores_usados": valores if valores is not None else {"lote.frente_m": valor(15.2)},
            "advertencias": list(advertencias)}


def cobertura(resultados, normas_sin_reglas=()):
    normas, temas = {}, {}
    for r in resultados:
        if r["resultado"] == "NO_APLICA":
            continue
        n = norma_de(r["regla_id"])
        normas[n] = normas.get(n, 0) + 1
        temas.setdefault(n, set()).add(r["regla_id"].rsplit("-", 1)[-1])
    return {"normas_evaluadas": normas, "normas_sin_reglas": list(normas_sin_reglas),
            "reglas_sin_aprobar": sum(r["resultado"] != "NO_APLICA" and r["estado_regla"] != "aprobada"
                                      for r in resultados),
            "temas_evaluados": {n: sorted(t) for n, t in temas.items()}}


def estado_reglas(*resultados_por_eval):
    """Estado de reglas mínimo: la norma y la vigencia de cada versión usada."""
    est = EstadoReglas()
    for resultados in resultados_por_eval:
        for r in resultados:
            est.versiones[(r["regla_id"], r["version"])] = {
                "hash": r["hash_contenido"], "vigencia": {"desde": "2021-09-15", "hasta": None},
                "norma": norma_de(r["regla_id"]), "redactor": "P-0003", "estado": r["estado_regla"]}
    return est


class Bitacora:
    """Cadena `expediente:<id>` en memoria."""

    def __init__(self, expediente=EXP):
        self.expediente = expediente
        self.eventos = []

    def agregar(self, tipo, payload, actor=REVISOR, rol="revisor_doyc"):
        seq = len(self.eventos) + 1
        cuando = (_INICIO + dt.timedelta(minutes=seq)).isoformat().replace("+00:00", "Z")
        previo = self.eventos[-1].hash if self.eventos else ""
        ev = EventoRegistrado(f"expediente:{self.expediente}", seq, tipo, actor, rol, cuando, payload, previo,
                              f"hash-{self.expediente}-{seq}")
        self.eventos.append(ev)
        return ev

    def evaluacion(self, seq):
        return next(e for e in self.eventos if e.seq == seq)

    def evaluar(self, resultados, normas_sin_reglas=(), ceus=None, dg="1ZM6", version_motor="1.0.0"):
        zona = {"ceus": ceus, "documento_grafico": dg, "usada": ceus if ceus is not None else dg}
        return self.agregar("evaluacion", {
            "expediente_id": self.expediente, "fecha_presentacion": "2025-06-01",
            "norma_aplicable": "PLOT-A61-2021", "zona": zona, "umbral": 0.85, "version_motor": version_motor,
            "commit": "0000000", "hechos": {}, "resultados": resultados,
            "cobertura": cobertura(resultados, normas_sin_reglas)}).seq

    def decidir(self, ev_seq, regla_id, accion, motivo="motivo interno de auditoría", veredicto=None, actor=REVISOR):
        ev = self.evaluacion(ev_seq)
        if regla_id.startswith("norma:"):
            version, original = None, "SIN_REGLAS"
        else:
            r = next(x for x in ev.payload["resultados"] if x["regla_id"] == regla_id)
            version, original = r["version"], r["resultado"]
        return self.agregar("decision", {
            "evaluacion_seq": ev_seq, "hash_evaluacion": ev.hash, "regla_id": regla_id, "version": version,
            "resultado_original": original, "accion": accion, "veredicto": veredicto, "motivo": motivo}, actor)

    def visto_bueno(self, ev_seq, confirmar_sin_ceus=True):
        ev = self.evaluacion(ev_seq)
        reglas = [r["regla_id"] for r in ev.payload["resultados"]
                  if r["resultado"] == "CUMPLE" or (r["resultado"] == "NO_CUMPLE" and r["severidad"] == "observacion")]
        return self.agregar("visto_bueno", {"evaluacion_seq": ev_seq, "hash_evaluacion": ev.hash,
                                            "confirmar_sin_ceus": confirmar_sin_ceus, "reglas": reglas})

    def indicar(self, ev_seq, regla_id, texto, actor=REVISOR):
        ev = self.evaluacion(ev_seq)
        return self.agregar("indicacion", {"evaluacion_seq": ev_seq, "hash_evaluacion": ev.hash,
                                           "regla_id": regla_id, "texto": texto}, actor)
