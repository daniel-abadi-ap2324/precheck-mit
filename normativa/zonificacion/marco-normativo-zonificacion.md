# Marco normativo de zonificación del Distrito de Panamá (investigado el 2026-09-26)

Responde a la pregunta: **¿qué norma fija retiros, altura, densidad, ocupación y estacionamientos de un lote en el Distrito de Panamá?** Fuentes: sitio de la DPU (dpu.mupa.gob.pa) y Gaceta Oficial. Todo valor normativo usado por el motor está en `assets/` con su página y verificado contra los textos de `references/textos/`.

## 1. Jerarquía y vigencia

| Instrumento | Qué hace | Estado |
|---|---|---|
| **Acuerdo N°61 de 30-03-2021** (G.O. 29268-A, 21-04-2021) | Aprueba el **primer PLOT del Distrito de Panamá**. Anexos: 1 PED, 2 MTC, 3 PLOT (tomos), **4 Fichas Normativas del Suelo Urbano**, **5 Matriz de Usos (urbanizable, protección, rural)**, **6 Documento Gráfico de Zonificación**, 7 Áreas bajo Riesgos Naturales. | Vigente desde su promulgación (Art. 91). Horizonte de 10 años (Art. 7). |
| Acuerdo N°131-A | Corrige la numeración de artículos del Acuerdo 61 y hace modificaciones. | Localizado en vLex; texto no revisado aquí. |
| **Acuerdo N°270 de 23-09-2025** (G.O. 30388-A, 16-10-2025) | Nueva zonificación de **San Francisco**: reemplaza los mosaicos 5-5C, 5-4D, 5-5D, 5-4E y 5-5E (Art. 1). Su Anexo 2 fija **limitaciones especiales por unidad territorial**; lo no afectado del Anexo 4 sigue vigente y ambos se evalúan "de manera conjunta" (Art. 2). Crea el **Suelo Programado** (dobles códigos) sujeto a participación en plusvalía o compensación (Arts. 3–4) y las Áreas de Estudio (Art. 5). | Vigente. |
| **Acuerdo N°128 de 12-05-2026** (G.O. 30537, 02-06-2026) | **Compensación urbana por incremento a la edificabilidad**: permite superar la norma básica mediante una carga urbanística. | Vigente. |
| Normas MIVIOT preexistentes | El Acuerdo 61 (Art. 3) **mantiene** los planes y resoluciones del MIVIOT en: zonas de competencia nacional (**Ley 21 de 1997**, área del Canal, ZOT E3), **Casco Antiguo y Panamá Viejo**, **La Cresta, Costa del Este, Santa María y El Carmen**, y los **polígonos de influencia del Metro**. Los códigos de esos instrumentos "se considerarán bajo los parámetros existentes". | Vigentes hasta que el MUPA los revise. |
| Acuerdo 61, Art. 87 (transitorio) | Durante 24 meses, trámites en curso y nuevos anteproyectos podían mantener la densidad anterior y quedar exentos de la altura máxima del PLOT. | **Vencido** (abril de 2023). Sólo es relevante para expedientes antiguos. |

**Riesgo jurídico:** en mayo de 2026 se reportó una **demanda de nulidad contra el Acuerdo 61 ante la Sala Tercera de la CSJ** (es la tercera; las dos anteriores, sobre San Francisco, se perdieron). No se encontró información sobre admisión ni suspensión provisional. **Antes de producción, confirma el estado del proceso con la asesoría legal del MUPA**: una suspensión dejaría sin base la mayoría de las reglas `PLOT-*`.

## 2. Qué dice cada anexo y cómo lo usa el PreCheck

- **Anexo 6, Documento Gráfico:** 78 hojas PDF vectoriales (series 5 = 1:5,000, 10 = 1:10,000, 25 = 1:25,000), en WGS 84 / UTM 17N, fechadas en octubre de 2023 (mosaicos de San Francisco en 2025). `scripts/vectorizar_hoja.py` las convierte en polígonos con código. URLs en `assets/hojas_dgz.txt`.
- **Anexo 4, Fichas del Suelo Urbano:** 33 códigos con densidad, lote mínimo, frente, ocupación, área libre y verde, retiros, altura, estacionamientos, acera y usos. Están en `assets/normas_plot_anexo4.json` y resumidos en `references/codigos-zona.md`.
- **Anexo 5, Matriz de usos:** 25 códigos de suelo urbanizable (2), protección (3) y rural (4), con ✓ vocacional, O permitido y ✗ prohibido por uso. Están en `assets/matriz_anexo5.json`.
- **San Francisco:** en `assets/normas_sf_anexo2.json` (47 fichas) y `assets/unidades_territoriales_sf.json` (55 combinaciones barrio / unidad territorial / código).

## 3. Cómo determinar la norma aplicable a un lote (orden)

1. **¿Está en zona de competencia nacional o en área que conserva la norma del MIVIOT?** Esto incluye: ZOT E3 / Ley 21, Casco Antiguo, Panamá Viejo, La Cresta, Costa del Este, Santa María, El Carmen, polígonos del Metro, rótulos `EOT`, `MP-*` o códigos heredados como `R1-B`, `RM1`, `MCU1`, `C2`. En ese caso, `lote.norma_aplicable = "MIVIOT/<instrumento>"`. No hay fichas cargadas para ellas, así que todo va a `REQUIERE_REVISION` hasta cargar el plan parcial o resolución correspondiente.
2. **¿Está en San Francisco?** Entonces `lote.norma_aplicable = "PLOT-A61-2021+A270-2025"`, con `lote.sf_sector` (Villa Lilla, Coco del Mar, Paitilla, Punta Pacífica, San Francisco Centro, Loma Alegre y Altos del Golf, Boca la Caja) y `lote.sf_unidad_territorial` (número). Las reglas `SF-*` combinan el Anexo 4 con la limitación especial.
3. **En el resto:** `lote.norma_aplicable = "PLOT-A61-2021"` y `lote.codigo_zona` (acepta `R3` o `1R3`). Aplican las reglas `PLOT-*`.
4. **Doble código** (`1P / 1ZM6`, `1ZM7 / 1ZM8 Programado`): el primero es el uso actual y el segundo el futuro. Usar el futuro exige compensación, así que va a revisión.
5. **Lote en dos zonas o cerca de un límite:** revisión humana (ver SKILL.md).
6. Si el proyecto invoca **compensación urbana, excepción o asignación de uso** (`proyecto.resolucion_edificabilidad`), las reglas de altura, densidad y ocupación se sustituyen por la regla de criterio `PLOT-EDIFICABILIDAD-ADICIONAL`.

## 4. Límites de validez

- Los mapas en línea "sólo se muestran a manera de referencia"; para un trámite oficial se requiere la **certificación de uso de suelo (CEUS)** de la DPUOT. El PreCheck debe pedir el número de certificación y, si existe, **la certificación prevalece sobre el código leído del mapa**.
- Los valores extraídos se verificaron automáticamente contra el texto de los PDF y se contrastó a mano la ficha RM-3. Hay una discrepancia interna del documento oficial: **IA**, 3 pisos en la ficha y 4 en la tabla resumen.
- Las reglas `PLOT-*` y `SF-*` están en `borrador` hasta su aprobación por la DOYC/DPUOT (ver `mupa-auditoria-revision`).

## 5. Fuentes

- Documento gráfico de zonificación distrital: https://dpu.mupa.gob.pa/documento-grafico-de-zonificacion-distrital/
- PLOT, anexos documentales y operativos: https://dpu.mupa.gob.pa/plot-distrital/
- Acuerdo 61 de 2021 (Gaceta): https://dpu.mupa.gob.pa/wp-content/uploads/2025/06/GacetaNo_29268a_20210421.pdf
- Anexo 4, Fichas: https://dpu.mupa.gob.pa/wp-content/uploads/2025/08/ANEXOS_4_Fichas_Normativas_SueloUrbano.pdf
- Anexo 5, Matriz: https://dpu.mupa.gob.pa/wp-content/uploads/2025/08/ANEXOS_5_Matriz_Regulacion_Usos_Suelo-.pdf
- Zonificación de San Francisco, Acuerdo 270 y fichas: https://dpu.mupa.gob.pa/zonificacion-del-corregimiento-de-san-francisco/
- Acuerdo 128 de 2026: https://dpu.mupa.gob.pa/wp-content/uploads/2026/06/Acuerdo-128-de-2026-Compensacion-Urbana.pdf
- Certificación de uso de suelo: https://dpu.mupa.gob.pa/requisitos-para-certificaciones-de-uso-de-suelo-mejora-2/
- Demanda contra el PLOT (mayo de 2026): https://www.ecotvpanama.com/politica/alcalde-mayer-mizrachi-senala-consecuencias-demanda-contra-plan-ordenamiento-n6080507
