## Summary

Informe PreCheck en dos versiones. La del revisor es interna y completa. La del profesional solo se emite con el expediente revisado y desde la evaluación vigente sin resultados afectados. Lleva observaciones con su indicación al profesional, sección de alcance y nota preliminar. Su emisión queda registrada con una huella del contenido, verificable por archivo o por el código impreso. Spec: `docs/features/informe-precheck/spec.md`.

## Acceptance criteria

AC-01…AC-24 trazados de punta a punta (`_review/review-2026-09-27.md`). Verificados en ejecución real por la CLI (ver Verification): AC-01, AC-04, AC-05, AC-09, AC-11, AC-12, AC-13, AC-14, AC-17 y AC-20.

## Design

- Spec: `docs/features/informe-precheck/spec.md`
- Arquitectura: `docs/features/informe-precheck/sad.md` (flujos 1–9)
- Decisiones: `docs/features/informe-precheck/adr/0001…0005`
- Modelo de datos: sin cambio de esquema; son eventos nuevos en la tabla existente
- API: `docs/features/informe-precheck/contracts/{cli.md,public-api.md}` (0.3.0); el núcleo pasa a 0.2.0

## Tasks (SDD-Task trailers)

- f571646 feat(informe-precheck): Agregar anexar_lote y cadenas al puerto de bitácora y los códigos informe.*
- e0587c1 feat(informe-precheck): Calcular la huella del modelo y el código impreso en bloques
- 8581a14 feat(informe-precheck): Proyectar el modelo de la versión del revisor con corte temporal
- ea67d25 feat(informe-precheck): Derivar la vigencia de las emisiones y los resultados afectados
- 694bf61 feat(informe-precheck): Derivar la indicación vigente y su traslado entre evaluaciones
- 19faa27 feat(informe-precheck): Renderizar el documento autocontenido y extraer su modelo
- 3497e5e feat(informe-precheck): Proyectar la versión del profesional con observaciones, alcance y primera página
- 3df7c9f feat(informe-precheck): Registrar la indicación al profesional y decidir con indicación
- 35d23f6 feat(informe-precheck): Generar la versión del revisor y emitir la del profesional
- 136e19a feat(informe-precheck): Verificar informes por archivo y por código y listar emitidos
- 697cddf feat(informe-precheck): Exponer los métodos del informe en la fachada y la CLI
- d9b5a99 docs(informe-precheck): Documentar el módulo informe y registrar el cambio
- 40469db test(informe-precheck): Agregar la prueba de extremo a extremo y las de NFR del informe

Arreglos de revisión: F1–F5, N1–N5, N4-bis, N6 y N7 (ver el registro de revisión).

## Verification

- Unitarias, integración (SQLite real y descartable), contrato, punta a punta y NFR: ver el resultado de la suite completa en el mensaje de cierre.
- Lint y tipos: ruff y mypy limpios.
- Ejecución real por `python3 -m precheck` sobre una bitácora nueva (evaluación de 196 resultados):
  - AC-05: al emitir con el expediente pendiente, la salida es 2 y lista lo que falta.
  - AC-01: la versión del revisor se genera como «uso interno».
  - AC-17: `decidir --indicacion` registra la decisión y la indicación juntas.
  - AC-04: emitir registra `informe_emitido` e imprime el código.
  - AC-12: la verificación por archivo y por un código de 16 caracteres dice «coincide · vigente».
  - AC-13: un documento con CSS inyectado da `no_coincide` (salida 3).
  - AC-09: la versión del profesional no lleva indicativos ni motivos.
  - AC-14: tras retirar la regla, `emitidos` muestra «afectada: retiro PLOT-ZM6-LOTE-FRENTE v1».
  - AC-20: volver a emitir se rechaza con la salida 2, y el mensaje nombra la regla retirada.
  - AC-11: la primera página del documento lleva la nota preliminar, «no consta» en el encabezado y las normas consultadas.

## Operational notes

- Migración: ninguna.
- Contratos: cambian `decidir --indicacion`, el puerto (`anexar_lote`, `cadenas`, `anexar(..., cabezas)`), la salida 7 y los códigos `informe.*` nuevos y `expediente.evaluacion_concurrente`.
- Pendiente: la validación legal del texto de la nota preliminar (spec §8).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
