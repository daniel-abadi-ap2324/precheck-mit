---
status: Accepted
owner: "desconocido@correo.invalid"
reviewers: ["Tech Lead", "DOYC"]
updated_at: "2026-10-19"
feature_size: "L"
ticket: "motor-reglas-auditable"
supersedes: []
amends: ["0012"]
---

# 0016 — Evaluar con una zona de trabajo con procedencia y cerrar cada regla con la decisión de respaldo del motor

- **Status:** Accepted
- **Date:** 2026-10-19
- **Deciders:** responsable del proyecto (Daniel)

## Context

En Ancón (`pck-92f8b2c3…`) el plano declara R3, un código del PLOT. Pero el lote está en el Área del Canal, donde rige MIVIOT-AC-R160-2002 y R3 no existe. El motor dejó **449 reglas en revisión**: 423 agrupadas por ADR-0012 como «zona por confirmar». El informe además escondía el aviso del motor. Hay casos parecidos:

- San Francisco declara RM3-C2.
- Tocumen declara MP-C2 contra el PLOT.
- En CASO-A el plano dice R2-A, pero la nota DPU-OT-1091-2026 dice 1R2.

A eso se suman otros problemas:

- Avisos ZONA_DISCREPANTE sin conclusión.
- «Ninguna regla aplicó».
- Unidades territoriales ambiguas.
- Normas sin reglas cargadas.
- Datos dudosos o que faltan.
- Revisiones con IA que terminan en `failed` y dejan el informe sin dictamen.

ADR-0012 agrupaba las reglas de otras zonas sin cambiar su resultado. Era correcto, pero no decidía nada: el revisor recibía cientos de reglas «a revisar» y ninguna conclusión. El principio 2 dice que REQUIERE_REVISION es un estado intermedio, nunca el final, pero sin la IA nada lo cerraba.

## Considered options

1. **Seguir agrupando y esperar la CEUS.** Es seguro, pero inútil sin CEUS, y casi ningún expediente la trae.
2. **Que la IA elija la zona sin reglas fijas.** Cada corrida podría elegir una zona distinta, sin fuente comprobable.
3. **Que el motor elija una zona de trabajo con una prelación fija y una procedencia escrita.** Las candidatas descartadas se evalúan igual, cada regla en revisión lleva una decisión de respaldo, y lo que descansa en un supuesto se marca.

## Decision outcome

**Chosen:** opción 3, en dos capas.

### 1. Zona de trabajo (`precheck/motor/zona.py`, `zona_de_trabajo`)

**Prelación.** La primera fuente cuyo código existe en la norma, en este orden:

1. Documento oficial del expediente: CEUS o nota DPU (`alcance.zonas_de_documentos_oficiales`, con página y cita).
2. El arquitecto (`definidas.json`).
3. El Documento Gráfico, solo si la IA lo leyó con las coordenadas del lote y una fuente.
4. El plano.
5. El usuario.
6. La IA sin coordenadas.

En el punto 3, sin coordenadas gana el plano. En los dos casos la otra queda descartada con sus `reglas_distintas`. Esto aplica también a ZONA_DISCREPANTE.

**Si ningún código existe en la norma:**

- **Misma clave con otra grafía** (`1ZM7` / `ZM7`): se usa la grafía de las reglas.
- **Código de otra norma:**
  - Las candidatas son las de la misma familia (`normativa/zonificacion/datos/familias_zona.json`: uso y densidad con cita literal comprobada por prueba, densidad máxima incluida).
  - Gana la que encaja con el lote (área, frente, esquina, tipología).
  - Entre las que quedan igual, gana la más restrictiva: menor densidad máxima, después más NO_CUMPLE bloqueantes, después el orden del código.
- **Norma no determinada:** se usa la norma y la zona del plano, con aviso.
- **Sin zona razonable** (San Francisco sin unidad territorial): no se inventa. Las reglas de zona quedan en INFORMACION_REQUERIDA, «falta la CEUS o la unidad territorial».

**Firme o supuesto.** Solo es firme la zona por documento oficial, o la que no tiene conflicto y tiene confianza suficiente (la grafía cuenta aquí). Las demás son el **supuesto S1**:

- Sus reglas no pasan a 1.0.
- Quedan en REQUIERE_REVISION con `causa: zona_supuesta`, así que la IA puede decidirlas (C-JERARQUIA no las bloquea).

**Candidatas descartadas.** Cada una se evalúa y guarda `reglas_distintas`: qué reglas cambiarían y cómo.

**Reglas de otras zonas.** Siguen agrupadas como en ADR-0012, ahora con decisión de respaldo:

- con zona → NO_APLICA;
- sin zona → INFORMACION_REQUERIDA.

### 2. Decisión de respaldo (`precheck/motor/respaldo.py`)

Cada REQUIERE_REVISION lleva una `causa` estructurada (`dudoso`, `faltante`, `criterio`, `borde`, `error`) y una `decision_motor {resultado, motivo, con_supuesto}`:

- **Dato dudoso del plano:** se usa tal como está, con supuesto `dato_dudoso`.
- **Dato que falta en el plano:** OBSERVACION «falta en el plano».
- **Documento o dato externo** (CEUS, Registro Público, certificados): INFORMACION_REQUERIDA.
- **Dato que decide si la regla aplica** (servidumbre, arrendada):
  - si la regla es bloqueante: OBSERVACION «el plano no indica…; si existe, aplica…»;
  - si no lo es: NO_APLICA con supuesto `no_indicado`.
- **Regla de criterio:** OBSERVACION «la decide el revisor».
- **Borde de la tolerancia:** el resultado de la comparación, con supuesto `borde`.

`resultado.json` agrega:

- `zona_trabajo`;
- `supuestos`;
- `final {por_decision, generales, zonificacion}`: sin las agrupadas, con 0 sin decisión.

### En la web

- **Origen de cada decisión.** Toda decisión lleva su origen: `ia` (el dictamen) o `motor` (el respaldo). La de la IA prevalece. Lo que la IA no decide, o todo si la IA falla, queda con el respaldo.
- **NO_CUMPLE con supuesto.** Un NO_CUMPLE que descansa en un supuesto se muestra **«No cumple · con supuesto»**, en tono propio, y cuenta como pendiente. Lo mismo pasa con un NO_CUMPLE de la IA sobre la zona supuesta.
- **Métricas de estabilidad.** «Comparar modelos» y /rondas comparan solo decisiones de la IA: el respaldo se compara como el estado previo, «Requiere revisión», igual que en las corridas anteriores. Las cifras de rondas viejas no cambian al recalcular; lo comprueba una prueba.
- **Sección «Qué se supuso en esta revisión».** Va arriba del resumen y del informe, con o sin dictamen, y muestra:
  - la zona y su procedencia;
  - las descartadas con cuántas reglas cambiarían;
  - los datos supuestos con qué hacer;
  - la línea nueva de vigentes, «N reglas vigentes: G generales del Acuerdo 110 y Z de zonificación»;
  - los avisos del motor siempre y en lenguaje llano;
  - el conteo final, que cierra con 0 en revisión.
- **IA fallida.** El dictamen a medias queda como `dictamen.parcial.json` y el informe se arma con él y con el respaldo. Un aviso visible dice qué falló y cuántas reglas decidió el motor.
- **Contrato** (C-ESTADOS, C-JERARQUIA, C-ZONA, C-VEREDICTO) y principios 2 y 5 de CLAUDE.md, con esta semántica.

## Consequences

- **Antes/después** solo con el motor, sobre copias locales:
  - **Ancón:** antes 449 en revisión. Después, zona de trabajo R1d1 supuesta (familia «baja densidad»; R1c, R1d2 y R1d3 descartadas con 5, 2 y 1 reglas distintas) y 0 en revisión. Quedan 12 no cumple, 3 no cumple con supuesto, 14 observaciones, 5 con información requerida y 44 cumple.
  - **CASO-A:** 1R2 firme por la nota DPU, página 2.
  - **San Francisco:** sin zona, 584 reglas de otras zonas en una línea como información requerida.
  - **Tocumen:** MP-C2 con la norma del plano.
- **Límite.** El motor no distingue ML1 de ML2 en Tocumen: elige ML1 por ser la más restrictiva entre iguales, y es un supuesto. La ubicación (Línea 2) la confirma la IA o la CEUS.
- **Resultados viejos.** Los PreChecks anteriores no traen `decision_motor` y se traducen igual que antes. Para tener la zona de trabajo hay que reevaluar con el motor, que es gratis.
- **Avisos.** El aviso «se necesita la CEUS» del código inexistente solo sale cuando no hubo zona de trabajo. Con zona, el aviso ZONA_TRABAJO dice qué se descartó.
- **Riesgo.** Una zona supuesta puede ser la equivocada. Por eso nunca es firme, sus NO_CUMPLE se muestran aparte y la sección «Qué se supuso» pide el documento que la confirma.
- **Pendiente** (fases B, C y D):
  - pedir los datos indispensables en el paso 2 del asistente;
  - pausar la IA cuando falte un dato externo;
  - lotes con `pausarPorDatos: false`.
