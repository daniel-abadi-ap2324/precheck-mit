---
id: T6
title: "Proyectar la versión del profesional con observaciones, alcance y primera página"
layer: "domain"
deps: ["T4", "T5"]
blocks: ["T9"]
acs: ["AC-08", "AC-09", "AC-10", "AC-11", "AC-19", "AC-23"]
files_hint: ["precheck/informe/modelo.py", "tests/test_informe_modelo_profesional.py"]
owner: "<TBD lead>"
estimate: "L"
context_budget: "M"
status: "todo"
---

<!-- Regla de este archivo: se incluye el fragmento que la tarea necesita, se dice de dónde viene y el enlace queda como respaldo. Cada fragmento lleva su firma de procedencia. Para quien ejecuta: trabaja con lo incluido aquí; si es insuficiente o contradice el código, abre el archivo nombrado y síguelo. No inventes. -->

# T6 — Proyectar la versión del profesional con observaciones, alcance y primera página

## Place in the sequence

- **Blocked by:** T4 — Proyectar el modelo de la versión del revisor con corte temporal, T5 — Derivar la indicación vigente y su traslado entre evaluaciones · **Blocks:** T9 — Generar la versión del revisor y emitir la del profesional · **Wave:** 3 (necesita el modelo base y la indicación vigente).
- **Lane:** comparte `precheck/informe/modelo.py` con T4 y T5; serializado.

## Why (user story)

> **As a** Profesional idóneo
> **I want** recibir cada observación con qué falla, dónde, por qué según la norma y qué hacer
> **So that** pueda corregir el proyecto en una sola ronda de subsanación
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

> **As a** Profesional idóneo
> **I want** que el informe declare de forma visible que es una verificación preliminar y qué normas consultó
> **So that** no lo confunda con un registro de plano, una autorización o un permiso
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

Esta tarea arma, en forma pura, el contenido completo de la versión del profesional (y la primera página común a las dos versiones).

## Inlined context

> ```mermaid
> sequenceDiagram
>     service->>service: descarta indicativos, NO_APLICA, motivos de decisión y resultados sin respaldo oficial o humano
>     loop cada NO_CUMPLE confirmado, veredicto desfavorable o NO_CUMPLE no bloqueante oficial
>         service->>service: observación: qué (valor y límite, «falta el dato» o requisito de criterio), dónde (hoja o «no consta»), por qué (cita literal), qué hacer (indicación vigente)
>         opt el resultado depende de la zona sin CEUS
>             service->>service: agrega «zona tomada del Documento Gráfico sin certificación de uso de suelo»
>         end
>     end
>     loop cada norma sin reglas decidida en forma desfavorable
>         service->>service: observación rotulada «norma sin reglas cargadas: decisión del revisor», sin cita
>     end
>     service->>service: ordena bloqueantes y después no bloqueantes, por severidad de la regla
>     service->>service: conteo de cumplimientos por norma y tema
>     service->>service: sección de alcance (reglas aprobadas, no evaluadas, normas a mano, sin CEUS, criterio del revisor), siempre
>     service->>service: primera página: nota preliminar del Art. 3, encabezado entregado («no consta» si falta), normas con vigencia, versión del motor, código de huella y aviso de verificar la vigencia
>     Note over service: Postcondición: modelo sin ningún «cumple» global
> ```
>
> — `sad.md §6, Flujo 4, abridged` · full text: [sad.md](../sad.md)

> - **Vigencia de las normas consultadas:** sale del contenido de cada versión de regla usada, direccionado por su hash (`repo.contenido`) e inmutable; la instantánea no la guarda.
>
> — `adr/0001-construir-el-informe-como-proyeccion-pura-de-la-bitacora.md, Decision outcome, verbatim` · full text: [ADR-0001](../adr/0001-construir-el-informe-como-proyeccion-pura-de-la-bitacora.md)

> Este informe es una verificación preliminar automatizada con revisión humana. No constituye registro de plano, autorización ni permiso, y no sustituye el análisis técnico de la Ventanilla Única de la DOYC conforme al Acuerdo Municipal N°110 de 2025.
>
> — `skill mupa-informe-precheck, SKILL.md §Principio, verbatim` (texto por defecto de `spec.md §8`: «el texto del skill `mupa-informe-precheck` más esa aclaración» del dictamen; pregunta abierta de asesoría legal)

> **Hard rule:** Informe tomado por permiso o por verificación completa: nota preliminar reforzada, sección de alcance obligatoria y nunca un «cumple» global. […] el motivo de la decisión nunca sale del sistema
>
> — `spec.md §6.1, Abuse cases, abridged` · full text: [spec.md](../spec.md)

**Fallback:** si algo es insuficiente o el código lo contradice, lee el archivo nombrado completo
([spec.md](../spec.md) · [sad.md](../sad.md) · [public-api.md](../contracts/public-api.md) · [adr/](../adr/)) y síguelo. No inventes.

## Data delta

No DB changes.

## API contract

Internal — no API surface. Claves del modelo según `contracts/public-api.md` (Tipos, `Informe.modelo`): la versión del profesional no lleva `resultados`.

## Acceptance criteria

### AC-08 — happy

> **Given** un expediente revisado con NO_CUMPLE bloqueantes confirmados, REQUIERE_REVISION resueltos con veredicto humano desfavorable y NO_CUMPLE no bloqueantes oficiales cubiertos por el visto bueno
> **When** el Revisor DOYC emite la versión del profesional
> **Then** cada observación dice qué no cumple (el valor declarado y el límite de la norma; «falta el dato <nombre>» si el profesional no lo declaró; el requisito citado, sin límite numérico, si la regla es de criterio), dónde (la hoja o página si el dato la declara, o «ubicación no consta en los datos declarados»), por qué (la cita literal con su norma y artículo) y qué hacer (la indicación al profesional); las bloqueantes aparecen primero, después las no bloqueantes (un veredicto humano toma la severidad que declara su regla), y ningún motivo de decisión aparece en el informe
>
> — `spec.md §5, AC-08, verbatim` · full text: [spec.md](../spec.md)

### AC-09 — domain invariant

> **Given** un expediente revisado con resultados de reglas no aprobadas
> **When** el Revisor DOYC emite la versión del profesional
> **Then** el informe no contiene ningún indicativo, ningún NO_APLICA ni ningún resultado sin respaldo de una regla aprobada o de un veredicto humano; los cumplimientos (oficiales y por veredicto humano) aparecen solo como conteo por norma y tema, sin detalle por regla
>
> — `spec.md §5, AC-09, verbatim` · full text: [spec.md](../spec.md)

### AC-10 — cross-context

> **Given** un expediente revisado cuyo visto bueno se dio confirmando resultados que dependen de la zona sin CEUS
> **When** el Revisor DOYC emite la versión del profesional
> **Then** cada observación que depende de la zona dice que la zona se tomó del Documento Gráfico sin certificación de uso de suelo
>
> — `spec.md §5, AC-10, verbatim` · full text: [spec.md](../spec.md)

### AC-11 — happy

> **Given** cualquier informe, de cualquiera de las dos versiones
> **When** se abre o se imprime
> **Then** la primera página muestra la nota de carácter preliminar del Art. 3 del Acuerdo 110 (que además dice que el informe no es la lista de observaciones del dictamen de la DOYC y que el dictamen puede incluir otras), el encabezado con los datos del expediente que el revisor entregó al generarlo (con «no consta» en los que no entregó, nunca inventados), las normas consultadas con su vigencia, la versión del motor, el código de huella junto al expediente en cada página y el aviso de que la vigencia del informe se verifica con la DOYC; el informe nunca presenta el expediente como aprobado
>
> — `spec.md §5, AC-11, verbatim` · full text: [spec.md](../spec.md)

### AC-19 — domain invariant

> **Given** cualquier expediente revisado, tenga o no reglas no aprobadas, normas sin reglas decididas a mano, zona sin CEUS o puntos resueltos por criterio del revisor
> **When** el Revisor DOYC emite la versión del profesional
> **Then** el informe incluye una sección de alcance que declara qué normas se evaluaron con reglas aprobadas, cuántas reglas no se evaluaron (reglas sin aprobar que el sistema no pudo aplicar oficialmente), qué normas se decidieron a mano, si la zona se tomó sin CEUS y qué puntos se resolvieron por criterio del revisor (veredictos humanos y NO_CUMPLE descartados, con o sin dato declarado); la sección sale siempre, también cuando no hay limitaciones; el informe nunca declara que el proyecto cumple en forma global, aunque no tenga observaciones
>
> — `spec.md §5, AC-19, verbatim` · full text: [spec.md](../spec.md)

### AC-23 — domain invariant

> **Given** un expediente revisado con una norma sin reglas decidida a mano en forma desfavorable
> **When** el Revisor DOYC emite la versión del profesional
> **Then** esa decisión aparece como observación rotulada «norma sin reglas cargadas: decisión del revisor»; el «por qué» nombra la norma y dice que el sistema no tiene su texto, sin inventar ninguna cita; su indicación al profesional es obligatoria como en cualquier observación
>
> — `spec.md §5, AC-23, verbatim` · full text: [spec.md](../spec.md)

Esta tarea arma el modelo; el código de huella en cada página es del render (T8) y la emisión (AC-04, AC-18) es de T9. Aquí `proyectar` devuelve además la lista de observaciones sin indicación para que T9 rechace.

## Checklist

- [ ] `proyectar(..., version="profesional")`: solo NO_CUMPLE bloqueantes confirmados, veredictos `NO_CUMPLE`, NO_CUMPLE `observacion` oficiales cubiertos por el visto bueno y `norma:X` desfavorables — `precheck/informe/modelo.py`
- [ ] Observación: `que` (valor y límite; «falta el dato <nombre>»; requisito de criterio sin límite), `donde` (hoja/página o «ubicación no consta en los datos declarados»), `por_que` (cita literal, norma, artículo), `que_hacer` (indicación vigente de T5), marca «sin CEUS» cuando corresponda
- [ ] `norma:X`: rótulo «norma sin reglas cargadas: decisión del revisor», `por_que` sin cita
- [ ] Orden: bloqueantes y después no bloqueantes, por la severidad que declara la regla
- [ ] `cumplimientos`: conteo por norma y tema (oficiales + veredictos `CUMPLE`), sin detalle
- [ ] `alcance` siempre presente; nunca una clave o texto de «cumple» global
- [ ] Primera página (ambas versiones): `nota_preliminar` (texto por defecto + aclaración del dictamen), `encabezado` con «no consta», `normas_consultadas` con vigencia tomada del contenido por hash (el servicio pasa esos contenidos; agregar el parámetro a `proyectar` con valor por defecto si la firma de sad §5 no alcanza), `version_motor`, aviso de verificar la vigencia con la DOYC
- [ ] Pruebas — `tests/test_informe_modelo_profesional.py`

## Edge cases

| Case | Behaviour |
|---|---|
| Revisado sin ninguna observación | alcance + conteo de cumplimientos; ningún «cumple» global |
| NO_CUMPLE descartado | no es observación; figura en alcance como criterio del revisor |
| Veredicto humano desfavorable sobre una regla bloqueante | severidad bloqueante, primero en la lista |
| Regla no aprobada con indicativo NO_CUMPLE | no aparece; cuenta en «reglas no evaluadas» del alcance |
| Motivo de decisión con texto sensible | no aparece en ninguna parte del modelo |
| Observación sin indicación vigente | se reporta en la lista de faltantes que devuelve `proyectar` |

## Definition of Done

- [ ] `tests/test_informe_modelo_profesional.py` cubre AC-08, AC-09, AC-10, AC-11 (contenido de la primera página), AC-19 y AC-23 y pasa
- [ ] Prueba que busca en el JSON del modelo cualquier motivo, `NO_APLICA` o indicativo y no encuentra ninguno
- [ ] every Hard Rule inlined above still holds
- [ ] `python3 -m unittest discover -s tests -v` en verde; `ruff` y `mypy` limpios
