---
status: Accepted
owner: "desconocido@correo.invalid"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-09-27"
feature_size: "M"
ticket: "informe-precheck"
---

# 0002 — Calcular la huella sobre el JSON canónico del modelo embebido en el documento

- **Status:** Accepted
- **Date:** 2026-09-27
- **Deciders:** Tech Lead + Security Lead (pasada socrática de design)

## Context

La spec pide una huella sobre el contenido y no sobre los bytes del archivo (AC-12, AC-16). Cuando la verificación es por archivo, debe detectar el 100 % de las alteraciones de contenido. Además, el documento y la forma estructurada deben compartir la misma huella, y el bloque de trazabilidad queda fuera de ella.

## Decision drivers

- Reproducible: cambios de plantilla visual no deben cambiar la huella.
- La misma huella para el documento y para la forma estructurada.
- Detectar ediciones del texto visible.

## Considered options

1. **JSON canónico del modelo, embebido en el documento**, con una nueva renderización al verificar.
2. **Huella del texto visible del HTML normalizado.**
3. **Huella del HTML canónico** (el documento serializado de forma determinista, con una plantilla fija). Protege todo lo visible, pero cualquier cambio de plantilla cambia la huella y la forma estructurada tendría otra.

## Decision outcome

**Chosen:** opción 1.

- **Cálculo:** `huella = SHA-256(canonico(normalizar_NFC(modelo)))`, con la serialización de `auditoria/canonico.py`.
- **Documento:** el HTML incluye el modelo en un bloque de datos no ejecutable.
- **Verificación por archivo** (enmienda de la revisión 2026-09-27, hallazgos A1 y M5):
  1. extrae el modelo y la trazabilidad; el sobre JSON debe tener exactamente `tipo`, `modelo` y `trazabilidad`, sin claves repetidas;
  2. recalcula la huella y la busca entre las emisiones registradas: si ninguna la tiene, «no coincide», sea cual sea el formato; si solo la tienen emisiones de otro `formato_informe`, «no verificable con esta versión»;
  3. renderiza el modelo con su huella y su trazabilidad y compara el **documento completo** con el archivo (solo se toleran un BOM UTF-8 inicial —U+FEFF, uno solo; también en la forma estructurada—, CRLF → LF y el salto de línea final; el BOM, por la re-revisión N3): cualquier cambio de estilos, atributos, scripts, recursos o de texto entre celdas es una alteración;
  4. compara la trazabilidad embebida con el evento de emisión.
- **Versión:** el modelo lleva `formato_informe`.

## Consequences

**Positive**
- Documento y forma estructurada son verificables con una sola huella.
- Cualquier edición del HTML que no toque el JSON (texto, estilos, atributos, scripts) se detecta al volver a renderizar.

**Negative**
- Volver a renderizar exige que el render sea determinista y que esté versionado junto con `FORMATO_INFORME`. Si la huella corresponde a una emisión registrada de otro `formato_informe`, el documento no se compara: la verificación responde «no verificable con esta versión» (salida 5), nunca «alterado». Si ninguna emisión tiene esa huella, responde «no coincide» (salida 3).

**Neutral**
- Las copias impresas o convertidas se verifican por código (AC-12), no por archivo.

## Links

- Spec: [[../spec.md]] AC-12, AC-13, AC-16, §6
- SAD: [[../sad.md]] §8, §10 QG-2
