# Tracker — informe-precheck

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| # | Task | Layer | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|
| T1 | Agregar anexar_lote y cadenas al puerto de bitácora y los códigos informe.* | infra | <TBD lead> | S | — | done |
| T2 | Calcular la huella del modelo y el código impreso en bloques | domain | <TBD lead> | S | — | done |
| T3 | Registrar la indicación al profesional y decidir con indicación | app | <TBD lead> | M | T1 | done |
| T4 | Proyectar el modelo de la versión del revisor con corte temporal | domain | <TBD lead> | M | — | done |
| T5 | Derivar la indicación vigente y su traslado entre evaluaciones | domain | <TBD lead> | S | T4 | done |
| T6 | Proyectar la versión del profesional con observaciones, alcance y primera página | domain | <TBD lead> | L | T4, T5 | done |
| T7 | Derivar la vigencia de las emisiones y los resultados afectados | domain | <TBD lead> | M | — | done |
| T8 | Renderizar el documento autocontenido y extraer su modelo | domain | <TBD lead> | M | T2, T4 | done |
| T9 | Generar la versión del revisor y emitir la del profesional | app | <TBD lead> | M | T1, T3, T6, T7, T8 | done |
| T10 | Verificar informes por archivo y por código y listar emitidos | app | <TBD lead> | M | T9 | done |
| T11 | Exponer los métodos del informe en la fachada y la CLI | ports | <TBD lead> | M | T3, T9, T10 | done |
| T12 | Agregar la prueba de extremo a extremo y las de NFR del informe | tests | <TBD lead> | M | T11 | done |
| T13 | Documentar el módulo informe y registrar el cambio | docs | <TBD lead> | S | T11 | done |

**Total:** 13 tasks, ~11 person-days.
