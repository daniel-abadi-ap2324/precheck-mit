# Tracker — motor-reglas-auditable

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| # | Task | Layer | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|
| T1 | Promover las migraciones de la bitácora y crear su aplicador | migration | <TBD lead> | S | — | done |
| T2 | Implementar el canónico JSON y la cadena de eventos del dominio | domain | <TBD lead> | S | — | done |
| T3 | Extraer el evaluador puro de motor.py y fijar VERSION_MOTOR | domain | <TBD lead> | S | — | done |
| T4 | Derivar el estado de las reglas y seleccionar la versión aplicable | domain | <TBD lead> | M | T2 | done |
| T5 | Crear ErrorPreCheck y el registro de personas derivado de eventos | domain | <TBD lead> | S | T2 | done |
| T6 | Implementar RepositorioSQLite detrás del puerto de bitácora | infra | <TBD lead> | M | T1, T2 | done |
| T7 | Implementar proponer versiones con verificación de cita | app | <TBD lead> | M | T4, T5, T6 | done |
| T8 | Implementar aprobar, rechazar y retirar versiones con cuatro ojos | app | <TBD lead> | M | T7 | done |
| T9 | Implementar inicializar, vincular cuenta, designar y confirmar propuestas | app | <TBD lead> | M | T5, T6 | done |
| T10 | Implementar evaluar expediente con degradación, CEUS, cobertura e instantánea | app | <TBD lead> | L | T3, T4, T6, T9 | done |
| T11 | Implementar decidir, visto bueno y estado del expediente | app | <TBD lead> | M | T10 | done |
| T12 | Implementar reproducir una evaluación registrada | app | <TBD lead> | S | T10 | done |
| T13 | Implementar suspender y levantar normas con cuatro ojos | app | <TBD lead> | M | T8, T9, T10 | done |
| T14 | Implementar sellar y verificar contra el anclaje externo | app | <TBD lead> | M | T6 | done |
| T15 | Exponer la fachada PreCheck y la CLI python3 -m precheck | ports | <TBD lead> | M | T8, T11, T12, T13, T14 | done |
| T16 | Agregar la prueba de extremo a extremo y las de NFR | tests | <TBD lead> | S | T15 | done |

**Total:** 16 tasks, ~13 person-days.
