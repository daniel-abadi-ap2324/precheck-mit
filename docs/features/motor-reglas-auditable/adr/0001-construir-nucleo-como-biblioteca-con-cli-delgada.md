---
status: Accepted
owner: "desconocido@correo.invalid"
reviewers: ["Tech Lead"]
updated_at: "2026-09-27"
feature_size: "M"
ticket: "motor-reglas-auditable"
---

# 0001 — Construir el núcleo como biblioteca con CLI delgada

- **Status:** Accepted
- **Date:** 2026-09-27
- **Deciders:** Tech Lead + responsable del proyecto (pasada socrática de design)

## Context

Hoy cada capacidad es un script CLI autónomo que se comunica por JSON y las pruebas lo invocan por subproceso (`tests/test_precheck.py:26`). Esta funcionalidad agrega evaluar, decidir, gobernar reglas, reproducir y verificar, y la cola de revisión y la API llegarán después.

## Decision drivers

- Reproducibilidad (§1 QG-1): el núcleo debe ser determinista y sin E/S oculta.
- La cola y la API futuras (spec §3) deben reutilizar la lógica sin reescribirla.
- Tiempo ≤ 10 s por expediente (spec §6).

## Considered options

1. **CLI + biblioteca**: núcleo importable sin E/S de consola, más una CLI delgada.
2. **Solo CLI**: seguir con scripts autónomos que se comunican por JSON.
3. **Servicio backend ya**: API con autenticación desde la v1.

## Decision outcome

**Chosen:** CLI + biblioteca. Da un núcleo que se prueba en proceso y se reutiliza, sin la infraestructura de un servicio que la spec no pide.

## Consequences

**Positive**
- La API y la cola futuras llaman a las mismas funciones.
- Las pruebas unitarias no necesitan subprocesos.

**Negative**
- Hay que extraer `evaluar_regla` y compañía de `motor.py` sin romper su CLI.

**Neutral**
- `motor.py` y `verificar_cadena.py` quedan como envoltorios de compatibilidad.

## Links

- Spec: [[../spec.md]]
- SAD: [[../sad.md]] §4, §5
