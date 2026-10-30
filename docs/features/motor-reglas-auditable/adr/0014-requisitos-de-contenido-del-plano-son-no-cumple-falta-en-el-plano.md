---
status: Accepted
owner: "desconocido@correo.invalid"
reviewers: ["Tech Lead", "DOYC"]
updated_at: "2026-10-19"
feature_size: "S"
ticket: "motor-reglas-auditable"
supersedes: []
amends: []
---

# 0014 — Los requisitos de contenido del plano son «No cumple · falta en el plano», no observaciones

- **Status:** Accepted
- **Date:** 2026-10-19
- **Deciders:** responsable del proyecto (Daniel)

## Context

El 16-oct (commit `3f39c30`) se cambió la severidad de unas 400 reglas de «bloqueante» a «observacion». La web muestra como «Observación» todo NO_CUMPLE de una regla con esa severidad. Fueron dos grupos:

- **79 reglas documentales** de los Anexos III y IV del Acuerdo 110: cuadro de zona, escalas, pie descriptivo, colindantes, elevaciones, secciones, drenaje y estacionamientos para personas con discapacidad, entre otras. El argumento fue que «si falta algo, se pide completar el plano; no es un incumplimiento de la obra».
- **322 reglas de área y frente mínimos de lote.** Casi siempre se trata de un lote ya inscrito que el proyecto no puede cambiar.

El 19-oct, Daniel comparó en «Comparar modelos» Fable r43 (16 no cumple, 16 observaciones) con Opus r77 (4 no cumple, 29 observaciones) y Sonnet r59 (2 no cumple, 31 observaciones). Parecía que la IA había empeorado, pero la lectura del plano era la misma. En Tocumen, Fable r43 tenía 14 NO_CUMPLE bloqueantes del motor, y Opus r59 y r77 tienen 1 bloqueante más unos 15 de severidad observación. Lo que cambió fue el catálogo.

Lo que dice la norma:
- Art. 21, num. 3: el anteproyecto debe presentarse con planos que cumplan «con los requisitos básicos señalados en el Anexo III y IV».
- Art. 53, num. 2: lo mismo para el plano constructivo, con los Anexos IV y V.
- Art. 22: el anteproyecto se acepta y registra, o queda «con pendiente con condiciones a subsanar».

Un requisito de contenido que falta impide registrar el plano tal como está. No es opcional.

## Considered options

1. **Dejarlo como observación.** Le dice al arquitecto que es opcional, y además mezcla en la misma columna requisitos obligatorios con decisiones de la DOYC (lote mínimo).
2. **Volver a «bloqueante» sin más.** Mezcla «hay que cambiar el proyecto» (un retiro) con «hay que completar el plano» (falta la escala).
3. **Volver a «bloqueante» y separar en la web por el tipo de la regla.** Tres niveles:
   - «No cumple», que exige cambiar el proyecto;
   - «No cumple · falta en el plano», que se subsana completándolo;
   - «Observación», que decide la DOYC.

## Decision outcome

**Chosen:** opción 3.

- **Catálogo.** Las 79 reglas documentales cambiadas el 16-oct vuelven a severidad «bloqueante».
  - Cada una sube de versión y lleva la nota «Versión N (2026-10-19)» con las citas de los Arts. 21, 22 y 53.
  - Archivos: `reglas_a110_anexos_iii_iv_borrador.json` (72), `reglas_a110_borrador.json` (2) y `reglas_definitivo_nuevas_borrador.json` (5).
  - Las 322 de tamaño de lote **siguen** en «observacion»: ninguna norma del repositorio exime a un lote inscrito, así que decide la DOYC.
  - Las citas no cambian.
- **Motor.** `precheck/planos/revisar.py` agrega `tipo` (documental, cuantitativa, criterio) a cada fila de `resultado.json`.
- **Web.**
  - `traductor.ts` marca `faltaEnPlano` en un NO_CUMPLE de tipo documental. La etiqueta pasa a ser «No cumple · falta en el plano», con el mismo tono rojo, porque también bloquea el registro (`metaDeResultado`, `ComplianceBadge`).
  - La tarjeta de «Comparar modelos» dice «N no cumple (M falta en el plano)».
  - El glosario de Ayuda explica los tres niveles.
  - **Consistencia motor–IA (`segunRegla`).** Un NO_CUMPLE decidido por la IA sigue la misma severidad que el del motor. Antes, si la IA decía NO_CUMPLE en una regla de severidad observación (por ejemplo, el lote mínimo), la web lo mostraba como «No cumple», mientras que el mismo resultado del motor salía como «Observación».

## Consequences

**Positive**
- Los requisitos obligatorios del plano vuelven a contar como «no cumple», y se distingue que se arreglan completando el plano.
- La columna «Observación» queda para lo que de verdad decide la DOYC.

**Negative**
- **Comparación entre rondas.** Las rondas evaluadas entre el 16 y el 19-oct guardan en su `resultado.json` la severidad de entonces, «observacion». Eso incluye la ronda 77, que se lanzó antes de este cambio. Para compararlas con las nuevas hay que contar las decisiones crudas o volver a correr el motor sobre su carpeta.
- **Resultados sin `tipo`.** Los de antes del 19-oct no traen el campo y se muestran como «No cumple» a secas.
- **Ausencias falsas.** Volver a «bloqueante» reabre el riesgo que motivó el cambio del 16-oct: que la IA dé por ausente lo que no encontró. Lo mitiga el contrato de revisión (ADR-0013, sección de ausencia): para escribir que algo no existe con confianza alta, la IA debe haber ampliado la lámina; si no, usa 0.6 y el motor deja la regla en revisión.
- **Prueba que ya fallaba.** `tests/test_decisiones.py::test_confirmar_no_cumple_bloqueante_queda_enlazado` falla desde el 16-oct, porque espera que `PLOT-ZM6-LOTE-FRENTE` sea bloqueante y es de tamaño de lote. No la causa este cambio.

## Links

- Revierte en parte: commit `3f39c30` (16-oct)
- Relacionado: [[0013-revision-con-ia-en-dos-pasos-con-contrato-comun.md]]
- Código: `precheck/planos/revisar.py`, `web/src/server/expedientes/traductor.ts` (`segunRegla`), `web/src/lib/status.ts` (`metaDeResultado`), `web/src/components/status/status-badge.tsx`, `web/src/features/compare/lib/comparacion.ts` (`contarFaltasEnPlano`)
- Pruebas: `web/src/server/expedientes/traductor.test.ts` («severidad y tipo de la regla»), `web/src/features/compare/lib/comparacion.test.ts` (`contarFaltasEnPlano`)
