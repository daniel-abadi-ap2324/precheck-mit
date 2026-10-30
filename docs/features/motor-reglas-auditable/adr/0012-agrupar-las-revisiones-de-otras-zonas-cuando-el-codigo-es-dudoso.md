---
status: Accepted
owner: "desconocido@correo.invalid"
reviewers: ["Tech Lead", "DOYC"]
updated_at: "2026-09-30"
feature_size: "S"
ticket: "motor-reglas-auditable"
supersedes: []
amends: ["0011"]
---

# 0012 — Agrupar, sin cambiar su resultado, las revisiones de otras zonas cuando el código de zona es dudoso

- **Status:** Accepted
- **Date:** 2026-09-30
- **Deciders:** Tech Lead + responsable del proyecto (revisión de 7 anteproyectos)

## Context

ADR-0011 manda a REQUIERE_REVISION toda regla cuyo `aplica_si` usa un dato con confianza baja. Casi siempre ese dato es `lote.codigo_zona`, porque sin CEUS solo lo declara el plano (≤ 0.7). Entonces cada regla de **las demás zonas** de la norma sale «no se puede determinar si aplica». En un anteproyecto de Tocumen fueron 126 de 141 revisiones, y en uno de Ancón, 401 de 404. Estas revisiones tapan las de la zona declarada.

Además, el motor no avisaba cuando el código del lote no aparece en ningún `aplica_si` de la norma, como `R3` en el Área del Canal. Con confianza baja, ese caso se diluía entre las cientos de revisiones. Con confianza alta, daba NO_APLICA sin decir nada.

## Decision drivers

- Principio 2: ante la duda, REQUIERE_REVISION. Ninguna regla puede dejar de estar en revisión por esta mejora.
- El revisor debe ver primero lo que corresponde a la zona declarada.
- `resultado.json` lo lee la web: se agregan campos y no se quita ninguno.
- El evaluador sigue siendo puro.

## Considered options

1. **Clasificar sin cambiar el resultado.** Cada regla conserva su `resultado` y su `motivo`. Las de otra zona se marcan con un grupo y se muestran en una sola línea con el conteo. Las de la zona declarada se listan primero, con un resultado provisional.
2. Evaluar con el código declarado como si estuviera confirmado. Así desaparecerían las reglas de otras zonas, pero se viola el principio 2.
3. Dejarlo como está y pedir CEUS siempre. Así el informe no sirve mientras no haya CEUS.

## Decision outcome

**Chosen:** opción 1, en `precheck/motor/zona.py` (puro) y `precheck/planos/revisar.py`.

- **Campos de zona.** Son `lote.codigo_zona`, `lote.sf_sector` y `lote.sf_unidad_territorial`. Una regla los usa como «dudosos» cuando su confianza está bajo el umbral efectivo de la regla.
- **Regla de otra zona** (`grupo` = `motivo_tipo` = `zona_por_confirmar`, `zona_regla`). Se cumplen dos condiciones:
  - Con los campos dudosos confirmados tal como se declararon, la regla sería NO_APLICA.
  - Su `aplica_si` pide, para algún campo dudoso, valores distintos del declarado, incluso al comparar grafías. La grafía comparable ignora mayúsculas, guiones y el prefijo de clase de suelo. Así, una regla que podría ser la del lote por grafía nunca se esconde.
- **Mismo sector, otro código.** También es de otra zona la regla que excluye por sí solo el código dudoso: su `aplica_si` tiene, como condición unida con `and` en la raíz, una comparación literal de `lote.codigo_zona` sin ningún valor igual al declarado en grafía comparable. Con el código confirmado no aplicaría, falte el dato que falte. Es el caso de San Francisco sin unidad territorial: el evaluador se detiene en la unidad territorial que falta y no llega a leer el código, pero una regla de ZM5 no es la de un lote declarado 1ZM7, aunque su sector coincida. Las reglas del código declarado, en cualquier unidad territorial del sector, siguen en detalle. Si el código aparece dentro de un `or` o con otra forma, la regla no se agrupa.
- **Regla de la zona declarada** (`si_se_confirma_zona`). Lleva el resultado que daría si se confirma lo declarado. Es indicativo y el resultado sigue siendo REQUIERE_REVISION.
- **Salida.** `resumen` sigue contando todas las reglas. El campo nuevo `agrupadas.zona_por_confirmar` da el total, el motivo, lo declarado y los valores que piden las reglas. `resumen.md` y la web muestran en detalle las demás reglas, primero las de la zona declarada, y agrupan las de otras zonas en una línea.
- **Código inexistente.** Si `lote.codigo_zona` no aparece literalmente en ningún `aplica_si` de la norma, se agrega un aviso en `avisos`, con cualquier confianza: «el código de zona X no existe en la norma Y; se necesita la CEUS». Si hay grafías comparables, el aviso las sugiere.

## Consequences

**Positive**
- Tocumen pasa de 141 filas de detalle a 15 filas y una línea agrupada con 126 reglas. Ancón pasa de 405 a 4 filas y una línea con 401 reglas, más el aviso de que `R3` no existe en la norma del Área del Canal.
- El revisor ve qué resultado daría cada regla de la zona declarada si se confirma el código.
- En un anteproyecto de San Francisco (sector San Francisco Centro con confianza 0.75, sin unidad territorial y código 1ZM7 con confianza 0.7), el detalle pasa de 114 a 47 filas: se agrupan también las 67 reglas del mismo sector con otro código (ZM4, ZM5 y ZM6 de las UT1, UT2, UT4 y UT5). Quedan las reglas de ZM7 de las UT3, UT5, UT6 y UT7, las mixtas ZM6/ZM7 de la UT5 y las que no dependen del código.

**Negative**
- Si el código declarado es el equivocado, la regla que de verdad aplica queda dentro de la línea agrupada. Se mitiga de tres formas: la regla sigue en REQUIERE_REVISION, la línea dice que se resuelve con la CEUS y `resultado.json` conserva cada regla.
- La clasificación lee las comparaciones literales de `aplica_si` (`campo == 'X'` y `campo in [...]`). Una regla con otra forma de condición no se agrupa, y eso es lo conservador.
- Sin unidad territorial (falta el dato), las reglas del mismo sector y del código declarado no se agrupan: solo la unidad territorial decide entre ellas. Las del mismo sector con otro código sí se agrupan cuando el código es dudoso.

## Links

- Enmienda: [[0011-no-aplica-de-una-regla-no-aprobada-no-es-oficial.md]]
- Código: `precheck/motor/zona.py`, `precheck/planos/revisar.py`, `web/src/server/expedientes/traductor.ts`, `web/src/lib/agrupar-zona.ts`
- Pruebas: `tests/test_motor_zona.py`, `tests/test_planos_revisar.py`
