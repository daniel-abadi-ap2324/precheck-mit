---
id: T13
title: "Documentar el módulo informe y registrar el cambio"
layer: "docs"
deps: ["T11"]
blocks: []
acs: []
files_hint: ["README.md", "CHANGELOG.md", "docs/architecture-map.md", "CLAUDE.md"]
owner: "<TBD lead>"
estimate: "S"
context_budget: "S"
status: "todo"
---

<!-- Regla de este archivo: se incluye el fragmento que la tarea necesita, se dice de dónde viene y el enlace queda como respaldo. Cada fragmento lleva su firma de procedencia. Para quien ejecuta: trabaja con lo incluido aquí; si es insuficiente o contradice el código, abre el archivo nombrado y síguelo. No inventes. -->

# T13 — Documentar el módulo informe y registrar el cambio

## Place in the sequence

- **Blocked by:** T11 — Exponer los métodos del informe en la fachada y la CLI · **Blocks:** — · **Wave:** 7 (en paralelo con T12).
- **Lane:** carril propio (solo documentación).

## Why (user story)

> **As a** Revisor DOYC
> **I want** emitir la versión del profesional cuando el expediente esté revisado
> **So that** entregue al profesional idóneo un informe que quede registrado y que no pueda contener nada sin respaldo
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

Esta tarea deja documentado cómo usar el informe y dónde vive el módulo; no satisface ningún AC por sí sola.

## Inlined context

> ```
> precheck/informe/
> ├── modelo.py       dominio: Informe, Encabezado, Observacion, Alcance, ResumenCumplimiento; …
> ├── huella.py       dominio: normalización NFC + canónico → huella(modelo), huella_encabezado(enc), código en bloques
> ├── vigencia.py     dominio: estado de cada emisión (vigente / reemplazado / sustituida / afectado + períodos)
> ├── html.py         dominio: render(modelo, trazabilidad) → documento autocontenido; extraer(documento) → modelo
> └── servicio.py     aplicación: generar, indicar, emitir, verificar_archivo, verificar_codigo, emitidos;
> ```
>
> — `sad.md §5, descomposición interna, abridged` · full text: [sad.md](../sad.md)

> - No hay API, interfaz, OCR ni generador de informe; las skills `mupa-ocr-planos` y `mupa-informe-precheck` no tienen código.
>
> — `docs/architecture-map.md, línea 132, verbatim` (la frase que esta tarea corrige) · full text: [architecture-map.md](../../../architecture-map.md)

> **Hard rule:** `CLAUDE.md` (principios 1–5, español en documentos, mensajes y commits)
>
> — `sad.md §2, Conventions, abridged` · full text: [sad.md](../sad.md)

**Fallback:** si algo es insuficiente o el código lo contradice, lee el archivo nombrado completo
([spec.md](../spec.md) · [sad.md](../sad.md) · [cli.md](../contracts/cli.md) · [adr/](../adr/)) y síguelo. No inventes.

## Data delta

No DB changes.

## API contract

Internal — no API surface. Documenta los subcomandos de `contracts/cli.md` (0.2.0) sin cambiarlos.

## Acceptance criteria

Sin AC propios (`acs: []`). Criterio verificable: cada subcomando nuevo de `contracts/cli.md` aparece en el README con un ejemplo, y ningún documento sigue diciendo que no hay generador de informe.

— `contracts/cli.md, Subcomandos nuevos, abridged` · full text: [cli.md](../contracts/cli.md)

## Checklist

- [ ] Uso de `informe`, `emitir`, `indicar`, `verificar-informe`, `emitidos` y `decidir --indicacion`, con los ejemplos del contrato — `README.md`
- [ ] Entrada en `[Unreleased]` (Added: módulo informe y subcomandos; Changed: `decidir --indicacion`, puerto con `anexar_lote` y `cadenas`) — `CHANGELOG.md`
- [ ] Módulo `precheck/informe/` y eventos `indicacion` e `informe_emitido`; corregir la línea 132 — `docs/architecture-map.md`
- [ ] Estructura del repositorio con `precheck/informe/` — `CLAUDE.md`

## Edge cases

| Case | Behaviour |
|---|---|
| Nota preliminar todavía con el texto por defecto (spec §8 abierta) | el README lo dice y remite a la pregunta abierta de asesoría legal |
| Ejemplos con datos personales | solo datos de prueba (`EXP-TEST-0001`), nunca reales |

## Definition of Done

- [ ] `README.md`, `CHANGELOG.md`, `docs/architecture-map.md` y `CLAUDE.md` actualizados y en español
- [ ] Los ejemplos del README corren contra una bitácora de prueba con las salidas documentadas
- [ ] every Hard Rule inlined above still holds
