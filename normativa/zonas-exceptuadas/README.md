# Zonas exceptuadas del PLOT

El Art. 3 del PLOT (Acuerdo 61 de 2021) deja fuera de sus fichas las zonas que conservan la norma del MIVIOT (ZOT-E). En esas zonas `lote.norma_aplicable` no es `PLOT-A61-2021`, sino el código del instrumento de la tabla. Cada instrumento tiene su catálogo en `reglas/`, en borrador, con la cita literal comprobada contra su transcripción.

| Norma (`lote.norma_aplicable`) | Instrumento | Catálogo | Transcripción | Reglas | Vigencia usada |
|---|---|---|---|---|---|
| `MIVIOT-CA-R127-2003` | Casco Antiguo, Res. N°127-2003 (ZOT-E1) | `reglas_casco_antiguo_borrador.json` | `textos/res127_2003_casco_antiguo.txt` | 39 | 2003-09-08 (Gaceta 24,882) |
| `MIVIOT-PV-R352-2006` | Panamá Viejo, Res. N°352-2006 (ZOT-E2) | `reglas_panama_viejo_borrador.json` | `textos/res352_2006_panama_viejo.txt` | 39 | 2006-11-20 (fecha de la resolución; la copia no trae la Gaceta) |
| `LEY21-1997` | Ley 21 de 1997, Plan General del Área del Canal (ZOT-E3) | `reglas_ley21_borrador.json` | `textos/ley21_1997.txt` | 18 | 1997-07-03 (Gaceta 23,323) |
| `MIVIOT-AC-R160-2002` | Área del Canal, Res. N°160-2002 del MIVI | `reglas_area_canal_borrador.json` | `textos/res160_2002_area_canal.txt` | 401 | 2002-09-24 (Gaceta 24,645) |
| `MIVIOT-CDE` | Normas Especiales de Costa del Este (ZOT-E6) | `reglas_costa_del_este_borrador.json` | `textos/costa_del_este.txt` | 33 | 2004-06-17 (fecha del plano) |
| `MIVIOT-ML1` | Plan Parcial, Línea 1 del Metro (ZOT-E7) | `reglas_metro_l1_borrador.json` | `textos/metro_l1.txt` | 134 | 2021-04-21 (la del PLOT) |
| `MIVIOT-ML2` | Plan Parcial, Línea 2 del Metro (ZOT-E8) | `reglas_metro_l2_borrador.json` | `textos/metro_l2.txt` | 137 | 2019-06-26 (Gaceta 28804-A) |
| `MIVIOT-LC-R15-1992` | La Cresta, Res. No. 15-92 | `reglas_la_cresta_borrador.json` | `textos/res15_1992_la_cresta.txt` | 53 | 1992-03-04 (Gaceta 21.985) |
| `MIVIOT-EC-R192-2013` | El Carmen, Res. No. 192-2013 (ZOT-E9) | `reglas_el_carmen_borrador.json` | `textos/res192_2013_el_carmen.txt` | 147 | 2013-04-30 (Gaceta 27276) |
| `MIVIOT` | Zona exceptuada sin catálogo (p. ej. Santa María) | — | — | 0 | todo va a revisión manual |

Los conteos son de reglas (un id por regla), no de versiones. Algunas reglas ya van por la versión 2, porque una corrección crea una versión nueva y no se edita la anterior (principio 4; la cadena de reglas rechaza otro contenido con el mismo número de versión). La nota de cada una explica qué cambió:

| Catálogo | Reglas | En versión 2 | Corrección |
|---|---|---|---|
| Casco Antiguo | 39 | 5 | `CA-C1-USOS` y `CA-C2-USOS` citan la lista de actividades. Las reglas de estacionamientos por orden de conservación (`-1Y2-ORDEN`, `-3-ORDEN`, `-4-ORDEN`) solo aplican con `proyecto.estacionamientos > 0`, y la de Tercer Orden (Art. 29, permisivo) pasa a observación. |
| Metro L1 | 134 | 7 | Las reglas de usos de `MP-C1`…`MP-C3`, `MP-SEU1`…`MP-SEU3` y `MP-TTU` citan la lista literal de actividades, no solo el encabezado. |
| Metro L2 | 137 | 7 | Igual que en L1 (entre ellas `ML2-C2-USOS`). |

Las citas de todos los catálogos pasan `verificar_citas` contra su transcripción (39, 39, 18, 401, 33, 134, 137, 53 y 147 de 147).

Los PDF originales están en `/home/app/normativas/`. `ocr/` guarda el OCR en bruto (Tesseract), que solo sirvió para ubicar el texto; las transcripciones de `textos/` se cotejaron con la imagen de cada página y son la fuente de las citas.

## Código de zona (`lote.codigo_zona`)

Se escribe **como lo usa el instrumento**. Los catálogos aceptan las grafías que aparecen en cada documento; si el código tiene otra grafía, la regla da NO_APLICA sin avisar.

| Norma | Códigos que reconoce el catálogo |
|---|---|
| Casco Antiguo | `RMH1`, `RMH2`, `C1`, `C2`, `SIV`, `SIU`, `PL`; además `lote.orden_conservacion` (`primer`, `segundo`, `tercer`, `cuarto`, `baldio`) |
| Panamá Viejo | `PV`/`Pv`, `SIV`/`SIv`, `SIU`/`Siu`, `REMHT`/`RE-MHT`; `lote.dentro_conjunto_monumental` |
| Ley 21 | la categoría del Plan General: `VIVIENDA-BAJA-DENSIDAD`, `VIVIENDA-MEDIANA-DENSIDAD`, `VIVIENDA-ALTA-DENSIDAD`, `CENTRO-URBANO`, `CENTRO-VECINAL`, `AREA-GENERACION-EMPLEO`, `AREA-VERDE-URBANA`, `AREA-PRODUCCION-RURAL`, `AREA-SILVESTRE-PROTEGIDA`, `AREA-OPERACION-CANAL`, `AREA-USO-DIFERIDO-ESCLUSAS`, `AREA-COMPATIBILIDAD`, `AREA-NO-DESARROLLABLE`, `AREA-USO-DIFERIDO-PELIGROSOS` |
| Área del Canal | `R1d1`…`R3d1`, `R1c`, `R2c`, `Mru1-3`, `Mcv1-3`, `Mcu1-3`, `Pi`, `Pv`, `Prv`, `Pru`, `Pib`, `Pd`, `Pl`, `Pnd`, `Pm`, `Siv1-3`, `Siu1-3`, `Tn1-3`, `Tu1-3`, `Esv`, `Esu`, `TTv`, `TTu`, `TTc`, `Tm`, `Ta`, `Tf` (en mayúsculas, minúsculas o como en la Gaceta) |
| Costa del Este | `RM3-E` (o `RM-3E`), `C2-E` |
| Metro L1 | `MP-RE`, `MP-RME`, `MP-RMEC1`, `MP-RM1`, `MP-RM1C1`, `MP-RM1C2`, `MP-RM2`, `MP-RM2C1`, `MP-RM2C2`, `MP-RM3`, `MP-RM3C1`, `MP-RM3C2`, `MP-RM3C3`, `MP-C1`…`MP-C3`, `MP-SEU1`…`MP-SEU3`, `MP-PL`, `MP-PRV`, `MP-PRU`, `MP-AVND`, `MP-TTU` |
| Metro L2 | como L1, más `MP-REC1`; sin `MP-RM1C2`, `MP-RM2C2` ni `MP-RM3C1` |
| La Cresta | `R1B-E`, `R2A-E`, `R2B-E`, `RM-E` (con o sin guion interno: `R1-B-E`); `RM1-E`, `RM2-E` y `RM3-E` solo dan «norma no cargada» |
| El Carmen | `R1-A`, `R1-B`, `R2-A`, `R2-B`, `R3`, `R3C1`, `RM-1`, `RM1-C2`, `RM-1*`, `RM-2`, `RM-2*`, `RM-3`, `RM3-C2`, `C-1`, `C2`, `P` (también sin guion: `R1B`, `RM1`…) |

## Hechos que usan estas reglas y no están en el PLOT

Además de los habituales (`lote.area_m2`, `lote.frente_m`, `proyecto.pisos_totales`, `proyecto.densidad_pers_ha`, `proyecto.ocupacion_pct`, `proyecto.area_libre_pct`, retiros, estacionamientos y unidades):

- `lote.fondo_m`, `lote.linea_construccion_m` (Área del Canal: distancia desde el eje de la vía; la altura se evalúa como `h ≤ x·Lc`), `lote.parcela` y `lote.frente_paseo_del_mar` (Costa del Este), `lote.servidumbre_paso_posterior`, `lote.colinda_residencial`, `lote.colinda_vivienda`, `lote.subregion`.
- `proyecto.altura_m`, `proyecto.area_verde_pct` (sobre el lote), `proyecto.estacionamientos_visita`, `proyecto.retiro_frontal_m`, `proyecto.retiro_lateral_torre_m`, `proyecto.retiro_posterior_torre_m`, `proyecto.retiro_min_m` (el menor de los retiros exigidos), `proyecto.superficie_dura_pct`, `proyecto.superficie_suave_pct`, `proyecto.superficie_permeable_pct`, `proyecto.area_construccion_cerrada_pct`, `proyecto.area_social_m2_por_vivienda`, `proyecto.area_min_apartamento_m2`, `proyecto.edificios_en_lote`, `proyecto.sobrevuelo_m`, `proyecto.amortiguamiento_m`, `proyecto.camas`, `proyecto.poblacion`.
- Banderas: `proyecto.obra_nueva`, `proyecto.uso_combinado`, `proyecto.aberturas_laterales`, `expediente.invoca_uso_anterior`.

Un hecho que falta deja la regla en REQUIERE_REVISION, que es lo correcto.

## Lo que no está cubierto

- **Metro L1:** la copia no trae la resolución de adopción ni la ficha de MP-RM1 (solo densidad y lote mínimo). La vigencia parte de la del PLOT.
- **Metro L2:** falta el número de la resolución (Gaceta 28804-A) y la ficha de MP-PL (solo lote mínimo).
- **Costa del Este:** la copia es el plano con el cuadro de normas, sin la resolución que las adopta.
- **La Cresta:** RM1-E, RM2-E y RM3-E se rigen por las Res. 93-91 y 115-91, que no están.
- **Área del Canal:** remite a la Res. 139-2000 (Ciudad Jardín), no cargada. En Tm, Ta y Tf el lote se rige por «requerimientos técnicos».
- **Remisiones a normas no cargadas:** Res. 169-2004 y 188-93 (retiros junto a residencial), disposiciones técnicas de estacionamientos, Decreto Ley 9 de 1997 (Casco Antiguo).
- **Santa María** y cualquier otra zona decretada por el MIVIOT sin documento: `MIVIOT`, todo a revisión.

Todas las reglas están en `borrador`: dan un resultado indicativo hasta que un aprobador de la DOYC/DPUOT las apruebe.
