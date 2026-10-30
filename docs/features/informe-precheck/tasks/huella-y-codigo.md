---
id: T2
title: "Calcular la huella del modelo y el código impreso en bloques"
layer: "domain"
deps: []
blocks: ["T8"]
acs: ["AC-12", "AC-16"]
files_hint: ["precheck/informe/huella.py", "tests/test_informe_huella.py"]
owner: "<TBD lead>"
estimate: "S"
context_budget: "M"
status: "todo"
---

<!-- Regla de este archivo: se incluye el fragmento que la tarea necesita, se dice de dónde viene y el enlace queda como respaldo. Cada fragmento lleva su firma de procedencia. Para quien ejecuta: trabaja con lo incluido aquí; si es insuficiente o contradice el código, abre el archivo nombrado y síguelo. No inventes. -->

# T2 — Calcular la huella del modelo y el código impreso en bloques

## Place in the sequence

- **Blocked by:** — · **Blocks:** T8 — Renderizar el documento autocontenido y extraer su modelo · **Wave:** 1 (dominio puro; en paralelo con T1, T4 y T7).
- **Lane:** carril propio. No crear `precheck/informe/__init__.py` (lo crea T4); mientras tanto el directorio se importa como paquete de espacio de nombres.

## Why (user story)

> **As a** Revisor DOYC
> **I want** comprobar si un archivo de informe que me presentan coincide con uno emitido
> **So that** pueda detectar un informe alterado o que el sistema nunca emitió
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

Esta tarea da la función de huella reproducible y el código impreso sobre los que se apoyan la emisión (AC-16) y la verificación por archivo y por código (AC-12).

## Inlined context

> **Chosen:** opción 1.
>
> - **Cálculo:** `huella = SHA-256(canonico(normalizar_NFC(modelo)))`, con la serialización de `auditoria/canonico.py`.
> - **Versión:** el modelo lleva `formato_informe`.
>
> — `adr/0002-calcular-la-huella-sobre-el-json-canonico-del-modelo-embebido-en-el-documento.md, Decision outcome, abridged` · full text: [ADR-0002](../adr/0002-calcular-la-huella-sobre-el-json-canonico-del-modelo-embebido-en-el-documento.md)

> - **Emisión:** `informe_emitido` guarda `huella_encabezado`, no los datos.
> - **Normalización:** se recortan espacios y el texto se normaliza a NFC antes de calcular la huella.
>
> — `adr/0005-mantener-el-encabezado-fuera-de-la-bitacora-y-guardar-solo-su-huella.md, Decision outcome, abridged` · full text: [ADR-0005](../adr/0005-mantener-el-encabezado-fuera-de-la-bitacora-y-guardar-solo-su-huella.md)

> | Contenido con huella | Modelo del informe → normalización NFC de todo texto, recorte de espacios en los datos de encabezado → `canonico()` → SHA-256. Fuera de la huella: bloque de trazabilidad (quién emitió, cuándo) y la huella misma | ADR-0002 |
> | Código impreso | Huella hex completa en bloques de 4 caracteres + id del expediente, en el pie de cada página; la búsqueda por código acepta ≥ 16 caracteres iniciales dentro del expediente | aquí (spec AC-12) |
>
> — `sad.md §8, filas «Contenido con huella» y «Código impreso», verbatim` · full text: [sad.md](../sad.md)

> | Reproducibilidad de la huella | 100 % de regeneraciones de la misma evaluación con las mismas decisiones, indicaciones y datos de encabezado producen la misma huella | prueba automática que regenera y compara |
>
> — `spec.md §6, NFR «Reproducibilidad de la huella», verbatim` · full text: [spec.md](../spec.md)

**Fallback:** si algo es insuficiente o el código lo contradice, lee el archivo nombrado completo
([spec.md](../spec.md) · [sad.md](../sad.md) · [public-api.md](../contracts/public-api.md) ·
[cli.md](../contracts/cli.md) · [adr/](../adr/)) y síguelo. No inventes.

## Data delta

No DB changes.

## API contract

> - `--codigo`: huella completa o sus primeros ≥ 16 caracteres (se ignoran espacios y guiones); con `--salida` escribe el contenido regenerado (`regenerado-<ID>-<seq>.html`).
>
> — `contracts/cli.md, subcomando verificar-informe, abridged` · full text: [cli.md](../contracts/cli.md)

> ```python
>     codigo: str                          # huella en bloques de 4 para imprimir
> ```
>
> — `contracts/public-api.md, Tipos, Emision.codigo, verbatim` · full text: [public-api.md](../contracts/public-api.md)

Funciones internas del dominio (sin superficie propia): `normalizar(modelo)`, `huella(modelo)`, `huella_encabezado(encabezado)`, `codigo(huella)`, `normalizar_codigo(texto)` y `coincide_prefijo(huella, codigo)`.

## Acceptance criteria

### AC-12 — happy

> **Given** una versión del profesional emitida por el sistema, como archivo original (documento o forma estructurada) sin cambios de contenido, o como copia impresa o convertida con su código de huella (la huella completa, impresa en bloques junto al expediente)
> **When** el Revisor DOYC la verifica con el archivo, o con el expediente y el código impreso (completo o con al menos sus primeros 16 caracteres)
> **Then** el sistema busca entre todas las emisiones registradas, confirma que coincide con una o más, lista para cada una el expediente al que pertenece, la evaluación de origen, quién la emitió y cuándo, y dice si sigue vigente, si fue afectada por un retiro o una suspensión, si fue reemplazada por una evaluación posterior o si fue sustituida por una emisión posterior de la misma evaluación, e indica cuál es la emisión vigente; con el archivo, además compara el bloque de trazabilidad (quién emitió y cuándo, que queda fuera de la huella) con el registro de la emisión y avisa si no coincide; con el código impreso, el sistema además regenera el contenido emitido (sin los datos de encabezado, que no guarda) para que el revisor lo compare con la copia, y aclara que el código prueba que la emisión existe, no que la copia esté íntegra
>
> — `spec.md §5, AC-12, verbatim` · full text: [spec.md](../spec.md)

### AC-16 — domain invariant

> **Given** la misma evaluación con las mismas decisiones, las mismas indicaciones al profesional y los mismos datos de encabezado (dos escrituras que solo difieren en tildes compuestas o en espacios cuentan como el mismo dato)
> **When** se emite la versión del profesional más de una vez, por la misma o por otra persona
> **Then** todas las emisiones producen el mismo contenido y la misma huella (quién emite y cuándo quedan en el registro de cada emisión, fuera del contenido con huella), y cada emisión queda registrada como una entrega distinta; si después se agrega una indicación, la emisión siguiente tiene otra huella
>
> — `spec.md §5, AC-16, verbatim` · full text: [spec.md](../spec.md)

Esta tarea cubre de AC-12 el código en bloques y la coincidencia por prefijo ≥ 16, y de AC-16 la parte «mismo contenido → misma huella» con tildes compuestas y espacios. La búsqueda y el registro son de T9 y T10.

## Checklist

- [ ] `normalizar(obj)`: NFC recursivo en toda cadena del modelo (claves y valores); en el bloque `encabezado`, además, recorte de espacios al inicio y al final y colapso de espacios internos repetidos — `precheck/informe/huella.py`
- [ ] `huella(modelo)` = SHA-256 hex de `canonico(normalizar(modelo))`, reutilizando `precheck/auditoria/canonico.py`
- [ ] `huella_encabezado(encabezado)` con la misma normalización (campos ausentes = `None`)
- [ ] `codigo(huella)` → bloques de 4 caracteres separados por espacio; `normalizar_codigo(texto)` quita espacios y guiones y pasa a minúsculas
- [ ] `coincide_prefijo(huella, codigo)`: `informe.codigo_corto` si el código normalizado tiene < 16 caracteres
- [ ] Pruebas — `tests/test_informe_huella.py`

## Edge cases

| Case | Behaviour |
|---|---|
| «Pérez» con tilde compuesta (NFD) vs precompuesta (NFC) | misma huella |
| «  Juan   Pérez » vs «Juan Pérez» en el encabezado | misma huella |
| Mismo modelo con claves en otro orden | misma huella (canónico) |
| Un carácter distinto en cualquier texto del modelo | huella distinta |
| Código de 15 caracteres, o con guiones y espacios | `ErrorPreCheck("informe.codigo_corto")`; guiones y espacios no cuentan |
| Código en mayúsculas | se compara en minúsculas |

## Definition of Done

- [ ] `tests/test_informe_huella.py` pasa: NFC, espacios del encabezado, orden de claves, alteración de un carácter, código en bloques y prefijo ≥ 16
- [ ] El módulo no hace E/S
- [ ] every Hard Rule inlined above still holds
- [ ] `python3 -m unittest discover -s tests -v` en verde; `ruff` y `mypy` limpios
