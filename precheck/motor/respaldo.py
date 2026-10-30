"""Decisión de respaldo del motor para cada regla que queda en REQUIERE_REVISION (ADR-0016). Dominio puro.

REQUIERE_REVISION no es un estado final: la IA decide esas reglas en el paso 2. Si no hay IA o no terminó, el informe
usa esta decisión, de modo que ninguna regla vigente queda sin decidir. Se decide con lo que dice el plano:

- dato dudoso que está en el plano: se usa y la decisión lleva el supuesto («se leyó X = v con confianza c»);
- dato que falta en el plano: OBSERVACION «falta en el plano: …» (no es INFORMACION_REQUERIDA);
- dato que decide si la regla aplica y que el plano no indica: si la regla es bloqueante, OBSERVACION «el plano no
  indica …; si existe, aplica …»; si no lo es, NO_APLICA con el supuesto «el plano no indica …»;
- dato externo (lista cerrada `EXTERNOS`: certificado del Registro, aprobación de una entidad, CEUS, unidad
  territorial), falte o esté leído con duda: INFORMACION_REQUERIDA;
- regla de criterio: OBSERVACION «la decide el revisor»;
- valor en el borde de la tolerancia: el resultado de la comparación, con el supuesto «en el borde».

La decisión de respaldo nunca reemplaza la del motor en `resultado` ni la de la IA: va aparte, en `decision_motor`.
"""
from __future__ import annotations

import re

from precheck.motor.evaluador import CUMPLE, NO_APLICA, NO_CUMPLE, REVISION

OBSERVACION = "OBSERVACION"
INFORMACION_REQUERIDA = "INFORMACION_REQUERIDA"
FINALES = (CUMPLE, NO_CUMPLE, NO_APLICA, OBSERVACION, INFORMACION_REQUERIDA)

#: Datos que no pueden salir del plano ni de un supuesto razonable: los da un documento o una entidad externa.
EXTERNOS = re.compile(
    r"^(registro_publico\.|profesional\.|"
    r"lote\.(codigo_zona|norma_aplicable|sf_sector|sf_unidad_territorial)$|"
    r"expediente\.[a-z0-9_]+\.(adjunto|presente|aprobacion|aprobado|vigente)$|"
    r"expediente\.(no_objecion|bcbrp|certificado|memorial|paz_y_salvo|aprobacion)[a-z0-9_.]*$)")
#: Campos que ubican el lote en la norma: sin zona de trabajo, lo que dependa de ellos espera la CEUS.
CAMPOS_UBICACION = ("lote.codigo_zona", "lote.norma_aplicable", "lote.sf_sector", "lote.sf_unidad_territorial")


def es_externo(campo: str) -> bool:
    return bool(EXTERNOS.match(campo or ""))


def _decision(resultado: str, motivo: str, supuestos: list[dict] | None = None) -> dict:
    return {"resultado": resultado, "motivo": motivo, "supuestos": supuestos or []}


def _valor(hechos: dict, ruta: str) -> dict:
    nodo = hechos
    for p in ruta.split("."):
        if not isinstance(nodo, dict) or p not in nodo:
            return {}
        nodo = nodo[p]
    return nodo if isinstance(nodo, dict) and "valor" in nodo else {"valor": nodo}


def decision_motor(regla: dict, res: dict, hechos: dict, falta_zona: str = "la CEUS") -> dict | None:
    """Decisión final de respaldo para un resultado REQUIERE_REVISION; None si el resultado ya es final.

    Devuelve {resultado, motivo, supuestos}: `supuestos` son los supuestos de datos en que se apoya (cada uno
    {tipo, campo, valor, confianza, fuente}); el supuesto de la zona de trabajo lo agrega quien la eligió."""
    if res.get("resultado") != REVISION:
        return None
    titulo = regla.get("titulo") or regla.get("id")
    bloqueante = regla.get("severidad") == "bloqueante"
    if res.get("grupo") == "zona_por_confirmar":
        return _decision(INFORMACION_REQUERIDA, f"depende de la zona del lote: falta {falta_zona}")
    if res.get("permiso"):
        return _decision(OBSERVACION, f"{res.get('motivo')}: la decide el revisor con la cita del permiso")
    causa = res.get("causa") or {}
    tipo = causa.get("tipo")
    if tipo == "criterio":
        return _decision(OBSERVACION, "regla de criterio: la decide el revisor")
    if tipo == "borde":
        return _decision(causa["resultado"], f"{res.get('motivo')}; se decide con el valor leído",
                         [{"tipo": "borde", "regla": regla.get("id")}])
    if tipo == "dudoso":
        campos = causa.get("campos") or {}
        ubicacion = [c for c in campos if c in CAMPOS_UBICACION]
        if ubicacion:
            return _decision(INFORMACION_REQUERIDA, f"depende de la ubicación del lote ({', '.join(ubicacion)}): falta {falta_zona}")
        # Un dato externo leído con duda (p. ej. la idoneidad «vigente» deducida del sello, 0.5–0.6 en Casco Antiguo) no se
        # usa como supuesto: lo da el documento o la entidad, igual que cuando falta (ADR-0018).
        externos = [c for c in campos if es_externo(c)]
        if externos:
            return _decision(INFORMACION_REQUERIDA, f"falta un documento o dato externo al plano: {', '.join(externos)} "
                                                    "(el plano no lo prueba)")
        supuestos = []
        for campo, confianza in campos.items():
            nodo = _valor(hechos, campo)
            supuestos.append({"tipo": "dato_dudoso", "campo": campo, "valor": nodo.get("valor"), "confianza": confianza,
                              "fuente": nodo.get("fuente")})
        leido = ", ".join(f"{s['campo']} = {s['valor']!r}" for s in supuestos)
        return _decision(causa["resultado"], f"se decide con lo que dice el plano ({leido}), leído con confianza baja",
                         supuestos)
    if tipo == "faltante":
        campo = causa.get("campo") or ""
        if campo in CAMPOS_UBICACION:
            return _decision(INFORMACION_REQUERIDA, f"depende de la ubicación del lote ({campo}): falta {falta_zona}")
        if es_externo(campo):
            return _decision(INFORMACION_REQUERIDA, f"falta un documento o dato externo al plano: {campo}")
        if causa.get("en") == "aplica_si":
            if bloqueante:
                return _decision(OBSERVACION, f"el plano no indica {campo}; si existe, aplica: {titulo}")
            return _decision(NO_APLICA, f"el plano no indica {campo}: se supone que no aplica",
                             [{"tipo": "no_indicado", "campo": campo}])
        return _decision(OBSERVACION, f"falta en el plano: {campo}")
    # error al evaluar u otra causa: no se afirma nada sobre el proyecto
    return _decision(OBSERVACION, f"la regla no se pudo evaluar ({res.get('motivo')}): la decide el revisor")
