---
status: Accepted
owner: "desconocido@correo.invalid"
reviewers: ["Tech Lead", "DOYC"]
updated_at: "2026-10-19"
feature_size: "L"
ticket: "motor-reglas-auditable"
supersedes: []
amends: ["0014"]
---

# 0017 — Severidad firme: todo requisito bloquea, cada regla dice cómo se corrige y por qué

- **Status:** Accepted
- **Date:** 2026-10-19
- **Deciders:** responsable del proyecto (Daniel)

## Context

La severidad del catálogo cambió tres veces en dos semanas:
- **8-oct:** propuesta de política (`docs/revision-catalogo/politica-severidad-propuesta.md`), que nunca se adoptó.
- **16-oct** (`3f39c30`): 79 reglas de contenido del plano y 322 de tamaño de lote pasaron a «observacion».
- **19-oct** (ADR-0014): las 79 de contenido volvieron a «bloqueante». Las de lote siguieron en «observacion».

Ninguna regla dice por qué tiene su severidad, y no hay una lista de valores permitidos: la web toma como bloqueante cualquier valor distinto de «observacion». Por eso cada cambio de criterio se hizo a mano y movió las cifras de las rondas sin que se notara en la regla.

Lo que dice la norma (`docs/revision-catalogo/adr0017/clausulas.json`, citas comprobadas):
- **Acuerdo 110, Art. 22:** el anteproyecto «podrá ser aceptado y registrado o con pendiente con condiciones a subsanar». No hay una tercera salida.
- **Anexo II:** «Pendiente» es cuando «el proyecto no cumple con uno o varios de los requisitos establecidos o bien a Norma de Desarrollo Urbano».
- **Art. 21, num. 3:** el contenido de los Anexos III y IV es requisito del anteproyecto.
- **PLOT, Art. 3:** el PLOT y sus anexos «son de obligatoria aplicación».
- Ningún texto cargado tiene tolerancias generales ni exime al lote ya inscrito. La autoridad decide solo en cláusulas puntuales: Art. 23 («a juicio de la DOYC»), Art. 25, autorizaciones de la DPUOT, PLOT Art. 9 (la interpretación corresponde al MUPA), Art. 60 (zona inundable), excepciones de acera y de topografía, Acuerdo 270 Art. 9 (uso programado).

## Considered options

1. **Seguir con dos niveles y decidir caso por caso.** Es lo que causó los tres vaivenes.
2. **Agregar un tercer valor a `severidad`.** Más de diez consumidores leen `severidad` (motor, expediente, informe, web, contrato de la IA) y tratan cualquier valor raro como bloqueante.
3. **Dejar `severidad` con dos valores definidos por la norma y agregar dos campos:** `subsanacion` (cómo se corrige) y `fundamento` (por qué, con cita literal comprobada).

## Decision outcome

**Chosen:** opción 3.

### `severidad`: qué bloquea

- **`bloqueante`**: todo requisito que la norma impone. Si no se cumple, el plano queda «pendiente» (Art. 22). Criterios:
  - **B1. Límite de zonificación:** mínimo, máximo o valor de ficha (lote, retiros, altura, densidad, ocupación, áreas libres, estacionamientos, acera, área social).
  - **B2. Prohibición o restricción:** «no se permitirá», «se prohíbe», «sólo podrán», usos permitidos o prohibidos.
  - **B3. Obligación imperativa verificable:** «deberá», «debe», «tendrán», «requieren».
  - **B4. Contenido obligatorio del plano o del trámite:** ítems de los Anexos III, IV y V (incluido el rotulado de la lámina: escala, fecha, número de hoja, franja de sellos) y documentos o aprobaciones exigidos.
  - **B5. Remisión obligatoria a una norma no cargada:** «debe regirse por…».
- **`observacion`**: solo lo que **no es un requisito**:
  - **O1. Texto facultativo o de recomendación:** «podrá» sin restricción, «de preferencia», «se recomienda».
  - **O2. Definición o regla de cómputo:** «se entenderá por», «se computarán».
  - **O3. Guía, disposición transitoria o exención:** qué norma rige, validez de actos previos, «0 por vivienda», directrices de la Ley 21.
  - **O4. Tolerancia que depende de otra autoridad:** «se permitirá una tolerancia… previa aprobación».
- El criterio O5 de la propuesta del 8-oct («forma de la lámina») **desaparece**: el rotulado es contenido obligatorio del Anexo III y pasa a B4.

### `subsanacion`: cómo se corrige

| Valor | Qué significa | Etiqueta en la web (fase 5) |
|---|---|---|
| `proyecto` | Hay que cambiar el diseño. | «No cumple» |
| `plano` | Hay que completar o corregir la lámina. | «No cumple · falta en el plano» |
| `documento` | Falta una aprobación, no objeción, CEUS o autorización de otra entidad. | «No cumple · requiere documento» |
| `autoridad` | Lo decide la DOYC, la DPUOT o el MUPA, o pueden conceder una excepción. | «No cumple · decide la DOYC» |
| `informativa` | No es un requisito. | «Observación» |

**Tabla de asignación** (la usa el script de preclasificación; los casos que no encajan van a revisión):

| Criterio | Subsanación por defecto | Excepciones |
|---|---|---|
| B1 | `proyecto` | Área, frente o fondo mínimos del lote (`-LOTE-AREA`, `-LOTE-FRENTE`, `-LOTE-FONDO`): `autoridad`. El lote casi siempre ya está inscrito y no lo cambia el proyecto; ninguna norma lo exime, y la interpretación corresponde al MUPA (PLOT Art. 9). |
| B2 | `proyecto` | — |
| B3 | `proyecto` | Si la regla es de tipo documental: `plano`. |
| B4 | `plano` | Documentos o aprobaciones de otra entidad (MOP, Metro, SINAPROC, DNPH, ACP, BCBRP, MiAmbiente, DPUOT, CEUS): `documento`. |
| B5 | `autoridad` | El revisor de la DOYC comprueba a mano la norma remitida. |
| O1–O4 | `informativa` | — |

### `fundamento`: por qué

```json
"fundamento": {
  "criterio": "B1",
  "cita": "fragmento literal de la norma que impone el requisito",
  "archivo": "normativa/...",
  "cita_subsanacion": "opcional: cláusula literal que da la decisión a una autoridad o exige el documento"
}
```

- `cita` debe aparecer literal en `archivo` (misma comparación que `verificar_citas.py`). Suele ser una parte de `cita_textual`; puede ser otra frase del mismo artículo cuando la cita de la regla es solo un valor («1,500m2»).
- `cita_subsanacion` también se comprueba cuando existe.

### Reglas firmes

Una regla está **firme** cuando:
1. tiene `severidad`, `subsanacion` y `fundamento` con valores permitidos;
2. el fundamento es literal en la norma;
3. cumple los invariantes:
   - `observacion` ⇔ `informativa`;
   - criterio B ⇔ `bloqueante`, criterio O ⇔ `observacion`;
   - tipo documental ⇒ `plano` o `documento`;
   - lote mínimo ⇒ `bloqueante` y `autoridad`.

Lo comprueba `tests/test_severidad_catalogo.py`. Las reglas siguen en `borrador` hasta que las apruebe la DOYC (ADR-0005).

### Cómo se revisa

- Un script preclasifica las 2194 reglas y las agrupa por cita.
- Subagentes revisan cada familia con el texto de la norma a la vista. No modifican `reglas/`.
- Daniel decide los casos en disputa.
- Un script aplica el resultado: versión + 1 con la nota «Versión N (2026-10-19, ADR-0017): …». La `cita_textual` no cambia.

El material queda en `docs/revision-catalogo/adr0017/`.

## Consequences

**Positive**
- Cada regla dice por qué bloquea o no, con una cita comprobable, y cambiarla exige una versión nueva con su fundamento.
- El arquitecto ve qué tiene que hacer: cambiar el proyecto, completar el plano, traer un documento o esperar la decisión de la DOYC.
- El lote mínimo vuelve a contar como incumplimiento, pero con su propia etiqueta, sin parecer un error del proyecto.

**Negative**
- Las 2194 reglas suben una versión.
- Las rondas evaluadas con el catálogo anterior no se comparan directamente con las nuevas: hay una cuarta etapa de severidad (desde este cambio).
- Hasta la fase 5, la web no muestra «decide la DOYC» ni «requiere documento»: un lote mínimo incumplido se ve como «No cumple».

## Links

- Modifica: [[0014-requisitos-de-contenido-del-plano-son-no-cumple-falta-en-el-plano.md]] (lo documental se expresa como `subsanacion: plano`) y el cambio de lotes del 16-oct (`3f39c30`).
- Base: `docs/revision-catalogo/politica-severidad-propuesta.md` (8-oct), `docs/revision-catalogo/adr0017/clausulas.json`.
