---
status: Draft
owner: "desconocido@correo.invalid"
reviewers: ["implementing engineer", "Tech Lead"]
updated_at: "2026-09-27"
feature_size: "M"
---

# Test plan — motor-reglas-auditable

El PreCheck evalúa expedientes con la versión de regla vigente a la fecha de presentación. Solo las reglas aprobadas con cuatro ojos emiten resultado oficial, y cada evaluación, aprobación y decisión queda en una bitácora encadenada, sellada y reproducible.

## Levels

| Level | Scope | Strategy (generic — no tool names) |
|---|---|---|
| Unit | Reglas puras: evaluador, selección de versión, estado de reglas, registro de personas, cadena y canónico, cobertura. | En memoria, sin E/S. |
| Integration | Servicios del núcleo contra la bitácora real (SQLite con las migraciones aplicadas). | Dependencia real y descartable: un archivo SQLite nuevo en un directorio temporal por prueba; nunca un almacén simulado. |
| Contract | La CLI frente a `contracts/cli.md`: subcomandos, códigos de salida, formato de error y esquema `--json`. | Se invoca la CLI por subproceso y se valida contra el contrato. |
| E2E | Flujos completos por la entrada real (`python3 -m precheck`), del registro de personas al sello. | Subproceso sobre una bitácora descartable. |
| Load | NFR «≤ 10 s por expediente con el catálogo completo». | La herramienta de medición que ya use el repo, o p. ej. k6 o Locust. Aquí basta cronometrar evaluaciones seguidas desde la suite. |
| Component | <!-- N/A: no UI surface (target_surfaces: [cli, library-sdk]) --> | — |
| Visual-regression | <!-- N/A: no UI surface --> | — |
| E2E-through-UI | <!-- N/A: no UI surface --> | — |

## AC coverage

| AC (spec.md §5) | Test name (intent-based) | Level | Expected outcome |
|---|---|---|---|
| AC-01 happy | evaluación completa muestra resultado, cita, versión y fuente, y queda registrada | integration + e2e | cada regla muestra resultado oficial, cita, versión y valores con fuente; hay un evento de evaluación atribuido al revisor |
| AC-02 domain invariant | se aplica la versión vigente a la fecha de presentación, no la de hoy | unit | se elige la versión cuya vigencia cubre la fecha de presentación |
| AC-03 error | expediente sin fecha de presentación no se evalúa | unit + contract | no hay evaluación ni evento; el revisor lee que falta la fecha de presentación |
| AC-04 cross-context | la CEUS prevalece sobre el código del Documento Gráfico | unit | la norma sale de la CEUS; la discrepancia se muestra y se registran ambos códigos |
| AC-05 error | dato faltante o con confianza baja va a revisión sin rellenarse | unit | REQUIERE_REVISION con motivo en lenguaje llano; el dato no aparece inventado |
| AC-06 domain invariant | regla en borrador da revisión con indicativo visible | unit + integration | resultado oficial REQUIERE_REVISION, indicativo NO_CUMPLE marcado como no oficial, ambos en la instantánea |
| AC-07 happy | proponer una versión con cita verificada la registra como borrador | integration | versión nueva en borrador; las anteriores intactas |
| AC-08 error | proponer una versión con cita inexistente se rechaza | unit + contract | no se registra; el redactor lee que la cita no está en el texto fuente |
| AC-09 happy | aprobar una versión ajena la vuelve oficial | integration | evento de aprobación con nombre y fecha; la siguiente evaluación da resultado oficial |
| AC-10 authorization | nadie aprueba una versión que redactó, aunque use otra cuenta | unit + integration | se impide; se explica que no puede aprobar lo que redactó |
| AC-11 authorization | una persona sin designación no puede aprobar | unit + integration | se impide; se explica que solo un aprobador designado puede |
| AC-12 domain invariant | una versión registrada no se edita | unit + integration | se impide; se indica que el cambio exige una versión nueva; el contenido no cambia |
| AC-13 happy | confirmar o descartar un NO_CUMPLE bloqueante queda enlazado al resultado | integration | evento de decisión con motivo y nombre, enlazado; el resultado original no cambia |
| AC-14 error | descartar sin motivo se rechaza | unit + contract | no se registra; el revisor lee que el motivo es obligatorio |
| AC-15 happy | el visto bueno cubre CUMPLE y observaciones mostrando sus datos | integration | la lista muestra los datos de que depende cada resultado; queda el evento de visto bueno |
| AC-16 domain invariant | expediente con pendientes nunca se presenta como revisado ni aprobado | unit + contract | «pendiente» mientras falte algo; «revisado» solo cuando está todo; la palabra «aprobado» nunca aparece |
| AC-17 happy | reproducir sin cambios coincide | integration + e2e | se informa que coincide y queda registrado |
| AC-18 error | reproducir con discrepancias las señala sin tocar el original | integration | discrepancias por regla con valor original y nuevo; el evento original intacto |
| AC-19 domain invariant | alterar, insertar o eliminar un evento se detecta | unit + integration | se indica que la bitácora fue alterada y en qué evento; la base además rechaza modificar y borrar |
| AC-19b cross-context | una reescritura completa recalculada no coincide con el sello | integration + e2e | se indica que no coincide con el anclaje y desde qué punto no es confiable |
| AC-20 cross-context | suspender una norma en bloque marca afectados sin reescribirlos | integration + e2e | tras la confirmación de otra persona, esas versiones dan REQUIERE_REVISION y se listan los expedientes afectados, sin cambiar sus resultados |
| AC-20b happy | retirar una versión conserva la historia y lista los dependientes | integration | la versión retirada ya no se aplica (da REQUIERE_REVISION); se listan los resultados que dependían de ella |
| AC-21 happy | la cobertura declara lo evaluado, lo sin reglas y lo sin aprobar | unit + integration | aparecen las normas evaluadas, MIVIOT sin reglas y la cantidad sin aprobar; nunca un «cumple» global |

## Edge cases / error paths

- Confirmar la propia propuesta de suspensión, designación o vínculo → se impide; hace falta otra persona.
- Cuenta del sistema sin vínculo a una persona → se impide cualquier acción; se indica que la cuenta no está vinculada.
- Persona sin rol de revisor intenta evaluar o decidir → se impide; se indica que no tiene el rol (default de spec §8, pendiente del AC).
- Sin CEUS → se usa la zona del GIS y cada resultado dependiente lleva «sin CEUS».
- Borrador nuevo sobre una versión aprobada vigente → rige la aprobada; el borrador solo agrega su indicativo.
- Dos versiones aprobadas con vigencias solapadas → la segunda aprobación se impide.
- Versión rechazada → no se evalúa ni da indicativo.
- Suspensión solo propuesta → no rige.
- Levantar una suspensión confirmada → las versiones vuelven a dar resultado oficial.
- Decidir sobre una evaluación ya superada por otra más reciente → se impide; se indica que hay una evaluación más reciente.
- Reproducir con otra versión del motor → «no reproducible con esta versión», sin comparar, y queda registrado.
- Verificar sin ningún sello previo → se verifica solo la cadena y se informa que no hay anclaje.
- Catálogo con una regla de cita inválida → las demás se registran; esa informa su motivo.
- Expresión maliciosa en una condición → REQUIERE_REVISION, nunca se ejecuta.
- Falla a mitad de registrar una evaluación → no queda ni el evento ni sus usos.

## Test data

- Seed strategy: fábricas en `tests/` según `data-model.md` §Test fixtures: `bitacora_en_memoria()`, `persona(...)` con correos `user-NNNN@example.test` y nombre `Test User`, `regla(...)` con citas que existen en `normativa/`, y `expediente(...)` a partir de `tests/casos/*.json`. Un resolutor de identidad falso asigna la cuenta de cada persona de prueba.
- Integration dependency: SQLite real con las migraciones aplicadas, en un archivo temporal o `:memory:`; nunca un almacén simulado.
- Cleanup boundary: por prueba. Cada prueba crea su propia bitácora en un directorio temporal que se borra al terminar; nada se comparte entre pruebas.

## NFR validation (load)

- «≤ 10 s por expediente con el catálogo completo (~650 reglas)» → escenario: con los 648 contenidos registrados y una parte aprobada, evaluar 20 expedientes seguidos (los 3 de `tests/casos/` rotando) y exigir que ninguno supere 10 s ni el promedio pase de 5 s.
- «100 % de resultados reproducidos coinciden» y «100 % de alteraciones … detectadas» son de corrección, no de carga: se validan en la suite e2e (reproducir todas las evaluaciones del escenario; manipular y reescribir la bitácora).
- «0 falsos CUMPLE en el lote de expedientes ya dictaminados» → pendiente del lote real (spec §8). Mientras no exista, se reporta «no medible» y no se inventa.

## CI placement

- En cada PR: unit + contract + integration (rápidas; SQLite no necesita contenedores).
- Programado o antes de liberar: e2e + escenario de carga.
