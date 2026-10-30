---
status: Accepted
owner: "desconocido@correo.invalid"
reviewers: ["Tech Lead", "DOYC"]
updated_at: "2026-10-19"
feature_size: "M"
ticket: "motor-reglas-auditable"
supersedes: []
amends: []
---

# 0015 — Medir la estabilidad entre corridas, no la exactitud, con rondas de 3 repeticiones

- **Status:** Accepted
- **Date:** 2026-10-19
- **Deciders:** responsable del proyecto (Daniel)

## Context

Desde la ronda 12, «Comparar modelos» y /rondas medían la **exactitud**: qué parte de los datos leídos por la IA coincidía con las «respuestas comprobadas a mano» (`docs/demo/verdad-*.json`), entró con `0cde010`. El 19-oct, Daniel señaló que esas respuestas **no están confirmadas**: varias se escribieron con criterios que luego cambiaron (las 369 plazas, los datos sí/no sin criterio) y nadie de la DOYC las revisó. Una cifra de exactitud sobre una referencia sin confirmar da una precisión falsa, y la página la presentaba como si fuera la medida principal.

Había otros cuatro problemas:

1. **Rondas de una sola corrida.** Casi todas las rondas tenían una corrida por plano y modelo. Así no se distingue un cambio real del azar de una corrida. Las repeticiones existían, pero sueltas: 23–25, 43–45, 46–48 y otras se lanzaron como rondas distintas.
2. **Corridas de prueba en el panel.** Unas 500 corridas de prueba llenaban el panel, Proyectos y el selector. Ahí el usuario debe ver solo lo suyo.
3. **No había forma de guardar una conclusión** interesante o equivocada de una revisión para volver a ella.
4. **Gasto de DeepSeek.** El contador llegó a 96 de 105 USD de tope. Cada corrida cuenta 0.63–0.81 USD.

Antes de `0cde010`, la web ya medía la estabilidad: solapamiento de hallazgos, acuerdo en el catálogo, consenso y la clasificación estándar, desviante o rarísima (`5ba3797`). A Daniel le parecían más útiles esas medidas.

## Considered options

1. **Seguir con la exactitud y avisar que la referencia es provisional.** La cifra seguiría guiando las decisiones aunque no signifique lo que dice.
2. **Confirmar primero la referencia y después medir.** Es lo correcto a largo plazo (Daniel quiere revisar los datos obvios más adelante), pero deja sin medida las pruebas de ahora.
3. **Medir solo cuánto se parecen las corridas entre sí, con repeticiones suficientes, y volver a la exactitud cuando haya una referencia confirmada.**

## Decision outcome

**Chosen:** opción 3.

- **Medidas.** Todo se mide entre corridas del mismo plano dentro de un grupo de rondas:
  - **Acuerdo en el catálogo:** de las reglas que decidieron las dos corridas de un par, en qué parte dicen lo mismo.
  - **Solapamiento de hallazgos.**
  - **Acuerdo con la mayoría.**
  - **Clasificación** estándar, desviante o rarísima: puntaje z robusto con la mediana y la MAD; hacen falta al menos 3 corridas.
  - Las medidas se separan en **entre repeticiones del mismo modelo** y **entre modelos distintos**.
  - Ningún número de exactitud en la web. «exactitud» entra en las palabras prohibidas de /rondas cuando estén reescritos los textos del catálogo que la citan.
- **Grupos de rondas.** `docs/demo/rondas.json` pasa a la versión 2, con un arreglo `grupos`. Las rondas viejas que repetían la misma prueba se agrupan **sin renombrarlas** (por ejemplo, 43–45). Una ronda sin grupo forma uno propio. El servidor avisa si una ronda está en dos grupos o si un grupo mezcla etapas o catálogos de severidad.
- **3 repeticiones por ronda.**
  - `lote_ia.py --repeticiones 3`: la repetición k es el bucle exterior.
  - Los nombres son «… con Opus 5.5 (2)»; la repetición 1 no lleva sufijo, así que los nombres viejos siguen valiendo.
  - `--maximo` cuenta solo las revisiones nuevas.
- **Cálculo en el servidor.** `server/rondas/estabilidad.ts` lee las corridas de cada grupo y plano con las mismas funciones que la página (`features/compare/lib`) y guarda `web/.data/rondas-estabilidad.json` al pulsar «Recalcular métricas». Si ese paso falla, las métricas quedan y la respuesta lleva un aviso.
- **Corridas de prueba fuera de las listas del usuario.**
  - `Project.esPrueba` lo pone `lote_ia.py`, o el servidor cuando el nombre sigue el patrón.
  - La lista de proyectos oculta las pruebas por defecto (`pruebas: "excluir"`).
  - La «carpeta» es /rondas#corridas: por plano, grupo, modelo y repetición, con «Otras corridas de prueba».
- **Marcadores.** Se puede guardar como «Interesante» o «Equivocada» una regla de una revisión o su conclusión, con una nota. El archivo es `web/.data/marcadores.json`, la página `/marcadores` y el panel muestra los 5 más recientes. Cada marcador lleva a la revisión y a la regla.
- **DeepSeek sin repeticiones.** Por gasto, `lote_ia.py` no repite DeepSeek salvo con `--deepseek-repeticiones`. Tampoco se cambia el recorte de tokens por llamada.

## Consequences

- /rondas concluye con el grupo más reciente que tenga repeticiones: cuánto se repite cada modelo, cuánto coincide con la mayoría y cuánto cuesta. La página dice que **repetirse no es acertar**, porque un modelo puede repetir el mismo error.
- Las cifras de rondas de catálogos de severidad distintos (hasta la 56, de la 57 a la 76 y desde la 77, ADR-0014) no se comparan directamente. «Comparar corridas lado a lado» avisa si se mezclan.
- `scripts/analisis/rondas.py` sigue escribiendo `lectura` y `verdad` en `rondas-metricas.json`, porque `comparativa.py` las usa. La web ya no las lee.
- Los scripts de análisis (`reporte_estabilidad.py`, `estados_por_ronda.py`, `consistencia_alcance.py`) miden por grupo de rondas.
- Cuesta más: una ronda con 5 planos y 2 modelos de Anthropic son 30 corridas en lugar de 10. Se compensa juntando las pruebas en menos rondas.
- **Para volver a medir aciertos** hace falta una referencia confirmada: datos «obvios» que Daniel revise uno por uno y, mejor aún, el visto bueno de la DOYC. Ese trabajo queda pendiente y tendrá su propio ADR.
