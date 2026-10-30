---
id: T8
title: "Renderizar el documento autocontenido y extraer su modelo"
layer: "domain"
deps: ["T2", "T4"]
blocks: ["T9"]
acs: ["AC-11"]
files_hint: ["precheck/informe/html.py", "tests/test_informe_html.py"]
owner: "<TBD lead>"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Regla de este archivo: se incluye el fragmento que la tarea necesita, se dice de dónde viene y el enlace queda como respaldo. Cada fragmento lleva su firma de procedencia. Para quien ejecuta: trabaja con lo incluido aquí; si es insuficiente o contradice el código, abre el archivo nombrado y síguelo. No inventes. -->

# T8 — Renderizar el documento autocontenido y extraer su modelo

## Place in the sequence

- **Blocked by:** T2 — Calcular la huella del modelo y el código impreso en bloques, T4 — Proyectar el modelo de la versión del revisor con corte temporal · **Blocks:** T9 — Generar la versión del revisor y emitir la del profesional · **Wave:** 2 (necesita el código de huella y la forma del modelo).
- **Lane:** carril propio (`precheck/informe/html.py`); corre en paralelo con T3 y T5.

## Why (user story)

> **As a** Profesional idóneo
> **I want** que el informe declare de forma visible que es una verificación preliminar y qué normas consultó
> **So that** no lo confunda con un registro de plano, una autorización o un permiso
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

Esta tarea convierte el modelo en el documento imprimible (y en la forma estructurada) y permite recuperar el modelo desde el documento para verificarlo.

## Inlined context

> | Salida HTML | Documento autocontenido, sin scripts ejecutables ni recursos externos; estilos de impresión carta y legal; todo texto escapado; el modelo va en un bloque de datos no ejecutable; estados siempre en texto | ADR-0002, spec §6 |
> | Código impreso | Huella hex completa en bloques de 4 caracteres + id del expediente, en el pie de cada página; la búsqueda por código acepta ≥ 16 caracteres iniciales dentro del expediente | aquí (spec AC-12) |
>
> — `sad.md §8, filas «Salida HTML» y «Código impreso», verbatim` · full text: [sad.md](../sad.md)

> - **Documento:** el HTML incluye el modelo en un bloque de datos no ejecutable.
> - **Verificación por archivo:**
>   1. extrae el modelo y recalcula la huella;
>   2. renderiza el modelo con la misma versión y compara el resultado con el texto visible del archivo, sin tener en cuenta el bloque de trazabilidad;
>
> Volver a renderizar exige que el render sea determinista y que esté versionado junto con `FORMATO_INFORME`.
>
> — `adr/0002-calcular-la-huella-sobre-el-json-canonico-del-modelo-embebido-en-el-documento.md, Decision outcome + Consequences, abridged` · full text: [ADR-0002](../adr/0002-calcular-la-huella-sobre-el-json-canonico-del-modelo-embebido-en-el-documento.md)

> | Autocontenido | 0 referencias a recursos externos en el documento; se abre y se imprime sin red | prueba automática sobre el documento generado |
> | Accesibilidad | 100 % de estados (CUMPLE, NO_CUMPLE, REQUIERE_REVISION, no oficial) expresados en texto, no solo con color; impresión en carta y legal sin cortar tablas | revisión automática del documento + revisión manual de impresión |
>
> — `spec.md §6, NFR «Autocontenido» y «Accesibilidad», verbatim` · full text: [spec.md](../spec.md)

> **Hard rule:** Texto libre del revisor con contenido activo o datos que no deben salir: […] todo texto se muestra como texto plano, sin ejecutar nada. Versión del revisor reenviada al profesional: cada página dice «uso interno» y que no es un informe emitido
>
> — `spec.md §6.1, Abuse cases, abridged` · full text: [spec.md](../spec.md)

> Default now: aparece su identificador de persona y su nombre en la sección de trazabilidad, que se imprime pero queda fuera del contenido con huella. […] Default now: no; lleva el título «Informe PreCheck — verificación preliminar» sin marca institucional hasta que la DOYC lo autorice. […] Default now: carta, con estilos que también imprimen en legal.
>
> — `spec.md §8, preguntas abiertas (nombre del revisor, membrete, papel), abridged` · full text: [spec.md](../spec.md)

**Fallback:** si algo es insuficiente o el código lo contradice, lee el archivo nombrado completo
([spec.md](../spec.md) · [sad.md](../sad.md) · [public-api.md](../contracts/public-api.md) · [adr/](../adr/)) y síguelo. No inventes.

## Data delta

No DB changes.

## API contract

> ```python
>     documento: str                       # HTML autocontenido con el modelo embebido
>     estructurada: str                    # JSON del modelo (misma huella)
> ```
>
> — `contracts/public-api.md, Tipos, Informe, abridged` · full text: [public-api.md](../contracts/public-api.md)

Funciones internas: `render(modelo, huella, trazabilidad=None) -> str`, `estructurada(modelo) -> str`, `extraer(contenido: str | bytes) -> (modelo, trazabilidad) | None`, `texto_visible(documento) -> str`.

## Acceptance criteria

### AC-11 — happy

> **Given** cualquier informe, de cualquiera de las dos versiones
> **When** se abre o se imprime
> **Then** la primera página muestra la nota de carácter preliminar del Art. 3 del Acuerdo 110 (que además dice que el informe no es la lista de observaciones del dictamen de la DOYC y que el dictamen puede incluir otras), el encabezado con los datos del expediente que el revisor entregó al generarlo (con «no consta» en los que no entregó, nunca inventados), las normas consultadas con su vigencia, la versión del motor, el código de huella junto al expediente en cada página y el aviso de que la vigencia del informe se verifica con la DOYC; el informe nunca presenta el expediente como aprobado
>
> — `spec.md §5, AC-11, verbatim` · full text: [spec.md](../spec.md)

Esta tarea cubre de AC-11 la presentación (primera página, código + expediente en cada página); el contenido lo arma T6.

## Checklist

- [ ] `render`: HTML determinista (mismo modelo → mismos bytes), título «Informe PreCheck — verificación preliminar», primera página, «uso interno» en cada página de la versión del revisor, pie con código (bloques de 4) + expediente en cada página vía CSS de impresión (`@page` carta; tablas que no se cortan en legal) — `precheck/informe/html.py`
- [ ] Estados siempre en texto (CUMPLE, NO_CUMPLE, REQUIERE_REVISION, «no oficial»); `html.escape` en todo texto
- [ ] Modelo embebido en `<script type="application/json">` con `<`, `>` y `&` escapados como `<`…; ningún `<script>` ejecutable, ningún `src`/`href` externo
- [ ] Bloque de trazabilidad (persona, nombre, fecha) en un contenedor marcado, excluido de `texto_visible` y de la huella
- [ ] `estructurada(modelo)`: JSON del modelo (canónico) con la trazabilidad aparte
- [ ] `extraer`: acepta documento o forma estructurada; `None` si no es un original del sistema
- [ ] Pruebas — `tests/test_informe_html.py`

## Edge cases

| Case | Behaviour |
|---|---|
| Indicación con `<script>alert(1)</script>` o `</script>` | se ve como texto; el bloque de datos no se cierra antes de tiempo |
| Documento sin bloque de datos, o HTML de otra fuente | `extraer` devuelve `None` |
| Mismo modelo con otra trazabilidad | `texto_visible` igual |
| Versión del profesional | sin «uso interno» |
| Documento generado | 0 `src=`/`href=` con esquema externo, 0 scripts ejecutables |

## Definition of Done

- [ ] `tests/test_informe_html.py` pasa: determinismo, autocontenido, escape, estados en texto, «uso interno», pie con código y expediente, ida y vuelta `extraer(render(m)) == m` para documento y forma estructurada
- [ ] every Hard Rule inlined above still holds
- [ ] `python3 -m unittest discover -s tests -v` en verde; `ruff` y `mypy` limpios
