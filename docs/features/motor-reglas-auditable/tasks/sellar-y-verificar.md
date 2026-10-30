---
id: T14
title: "Implementar sellar y verificar contra el anclaje externo"
layer: "app"
deps: ["T6"]
blocks: ["T15"]
acs: ["AC-19", "AC-19b"]
files_hint: ["precheck/auditoria/sello.py"]
owner: "<TBD lead>"
estimate: "M"
context_budget: "M"
status: "done"
---

<!-- Regla de este archivo: se incluye el fragmento que la tarea necesita, se dice de dónde viene y el enlace queda como respaldo. Cada fragmento lleva su firma de procedencia. Para quien ejecuta: trabaja con lo incluido aquí; si es insuficiente o contradice el código, abre el archivo nombrado y síguelo. No inventes. -->

# T14 — Implementar sellar y verificar contra el anclaje externo

## Place in the sequence

- **Blocked by:** T6 — Implementar RepositorioSQLite detrás del puerto de bitácora · **Blocks:** T15 — Exponer la fachada PreCheck y la CLI python3 -m precheck · **Wave:** 3 (empieza cuando terminan sus dependencias).
- **Lane:** carril propio.

## Why (user story)

> **As a** Revisor DOYC
> **I want** comprobar que la bitácora de un expediente no fue alterada
> **So that** el registro tenga valor probatorio
>
> — `spec.md §4, US-08, verbatim` · full text: [spec.md](../spec.md)

Implementar sellar y verificar contra el anclaje externo: aporta la parte de US-08 que cubren AC-19, AC-19b.

## Inlined context

> ```mermaid
> sequenceDiagram
>     actor Revisor as Revisor DOYC
>     participant client as <client>
>     participant service as <service>
>     participant store as <data-store>
>     participant ancla as <external-system>
>     Note over client,ancla: sello diario (programado)
>     client->>service: sellar
>     service->>store: lee las cabezas de todas las cadenas
>     service->>service: calcula el hash conjunto de las cabezas
>     Note over service,store: persiste evento «sello» en la cadena de reglas
>     service->>ancla: exporta el sello
>     Note over Revisor,ancla: verificación a pedido
>     Revisor->>client: verifica la bitácora de un expediente
>     client->>service: verificar
>     service->>store: lee la cadena del expediente
>     service->>service: recalcula los hashes encadenados
>     alt se rompe la cadena
>         service-->>client: alterada, con el evento donde se rompe
>     else cadena coherente
>         service->>ancla: lee el último sello
>         service->>service: compara las cabezas selladas con la cadena actual
>         alt no coincide con el sello
>             service-->>client: no coincide con el anclaje, no confiable desde el último sello
>         else coincide
>             service-->>client: íntegra hasta el último sello
>         end
>     end
>     client-->>Revisor: resultado
> ```
>
> **Cobertura: historias y AC por flujo**
>
> | Historia | Flujos | AC |
> |---|---|---|
> | US-01 | 1, 3 | AC-01, AC-02, AC-03, AC-05 (flujo 1); AC-04 (flujo 3) |
> | US-02 | 1 | AC-06 |
> | US-03 | 4 | AC-07, AC-08 |
> | US-04 | 2, 5 | AC-09, AC-10, AC-11 (flujo 2); AC-12 (flujo 5) |
> | US-05 | 7 | AC-13, AC-14 |
> | US-06 | 8 | AC-15, AC-16 |
> | US-07 | 9 | AC-17, AC-18 |
> | US-08 | 10 | AC-19, AC-19b |
> | US-09 | 5, 6 | AC-20b (flujo 5); AC-20 (flujo 6) |
> | US-10 | 1 | AC-21 |
>
> **Señalado para design/data-model:** los flujos 3 y 6 necesitan leer la CEUS del lote y buscar evaluaciones por versión de regla; `data-model` debe indexar los eventos por `(regla_id, version)` y por expediente. El flujo 10 usa `<external-system>` para el destino de anclaje, que ya está declarado en §3.
>
> — `sad.md §6, Flujo 10, verbatim` · full text: [sad.md](../sad.md)

> **Chosen:** Sello diario vía puerto. Cumple el AC con lo mínimo y deja cambiar el destino sin tocar el dominio.
>
> — `adr/0007-anclar-cabezas-con-un-sello-diario-via-puerto.md, Decision outcome, verbatim` · full text: [0007-anclar-cabezas-con-un-sello-diario-via-puerto.md](../adr/0007-anclar-cabezas-con-un-sello-diario-via-puerto.md)

> | Detección de alteración | 100 % de alteraciones, inserciones o eliminaciones de eventos anteriores al último anclaje externo; la ventana hasta el siguiente anclaje es un riesgo aceptado | prueba automática de manipulación de la bitácora y de reescritura completa contra el anclaje |
>
> — `spec.md §6, NFR, verbatim` · full text: [spec.md](../spec.md)

**Fallback:** si algo es insuficiente o el código lo contradice, lee el archivo nombrado completo
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[cli.md](../contracts/cli.md) · [public-api.md](../contracts/public-api.md) · [adr/](../adr/)) y síguelo. No inventes.

## Data delta

No se modifica el esquema. Anexa un evento `sello` en la cadena `reglas`.

## API contract

> #### `verificar`
> ```
> verificar (--expediente ID | --reglas | --todo) [--sello ARCHIVO]
> ```
> - Recalcula las cadenas. Con `--sello`, compara las cabezas con el sello (AC-19b); sin él, usa el último sello registrado.
> - Salida 3 si la cadena se rompe (indica el evento) o no coincide con el sello. Cualquier rol puede verificar.
>
> — `contracts/cli.md, subcomando `verificar`, verbatim` · full text: [cli.md](../contracts/cli.md)

> #### `sellar`
> ```
> sellar --destino DIRECTORIO
> ```
> - Calcula el hash conjunto de las cabezas, lo registra en la cadena de reglas y escribe `sello-<fecha>.json` en el destino (adaptador de archivo de `DestinoAnclaje`, ADR-0007). El actor es `sistema:precheck@<version>`.
>
> — `contracts/cli.md, subcomando `sellar`, verbatim` · full text: [cli.md](../contracts/cli.md)

## Acceptance criteria

### AC-19 — domain invariant

> **Given** una bitácora de expediente en la que se alteró, insertó o eliminó un evento
> **When** el Revisor DOYC verifica su integridad
> **Then** el sistema indica que la bitácora fue alterada y en qué evento se rompe la cadena
>
> — `spec.md §5, AC-19, verbatim` · full text: [spec.md](../spec.md)

### AC-19b — cross-context

> **Given** una bitácora reescrita por completo con una cadena recalculada que es coherente consigo misma
> **When** el Revisor DOYC la verifica contra el último anclaje externo
> **Then** el sistema indica que la bitácora no coincide con el anclaje y desde qué punto dejó de ser confiable
>
> — `spec.md §5, AC-19b, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `sello.py`: `sellar(repo, destino)` hash conjunto de `cabezas()`; `DestinoArchivo(directorio)` escribe `sello-<fecha>.json` y lee el último
- [ ] `verificar(cadena_id|None, sello|None)`: recalcula (T2) y compara con el sello
- [ ] Pruebas en `tests/test_sello.py`: alterar, insertar, eliminar, reescritura completa recalculada

## Edge cases

| Case | Behaviour |
|---|---|
| Sin ningún sello aún | verifica solo la cadena; `coincide_sello = None` |
| Cadena que creció después del sello | coincide si el prefijo sellado coincide |

## Definition of Done

- [ ] `tests/test_sello.py` cubre AC-19 y AC-19b y pasa
- [ ] every Hard Rule inlined above still holds
- [ ] `python3 -m unittest discover -s tests -v` en verde
