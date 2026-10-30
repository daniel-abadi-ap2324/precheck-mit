---
status: Accepted
owner: "desconocido@correo.invalid"
reviewers: ["Tech Lead", "DOYC"]
updated_at: "2026-10-21"
feature_size: "M"
ticket: "motor-reglas-auditable"
supersedes: []
amends: ["0013", "0016"]
---

# 0018 — Criterios de los datos sí/no disputados y «no aplica» por prerrequisito

- **Status:** Accepted
- **Date:** 2026-10-21
- **Deciders:** responsable del proyecto (Daniel), sobre la lista `docs/demo/criterios-disputados-casco.md`

## Context

En las 102 corridas de Casco Antiguo con revisión de IA, los modelos no coinciden en diez datos sí/no. Ninguno es
un problema de lectura: todos los modelos ven lo mismo en el plano y escriben valores distintos porque el criterio
del dato no decide el caso (`docs/demo/criterios-disputados-casco.md`, sección A).

El caso que más pesa es el «no aplica». Casco Antiguo no tiene rampas, ni estacionamientos, ni otro anteproyecto en
la finca. Para decir «no aplica», unos modelos escriben «sí» (no hay nada que incumplir) y otros «no» (el plano no lo
indica). En la ronda 80, DeepSeek escribió además `rampa.ancho_m = 0` («no hay rampa»). Como las reglas de rampa
usaban `existe(rampa.ancho_m)` en `aplica_si`, el 0 contaba como rampa: las reglas seguían aplicando y pedían
`rampa.inicia_en_linea_construccion`, que el modelo tampoco sabía cómo llenar.

La vigencia de la idoneidad de la JTIA es otro caso: el sello da el número de licencia, pero no su vigencia. Los
modelos escribían «sí» o «no» con confianza 0.5–0.6, y el respaldo del motor (ADR-0016) decidía con ese dato dudoso:
en la ronda 80 salió «No cumple» por un dato que el plano no puede probar.

## Considered options

1. **Dejar los criterios como están y medir más corridas.** Las corridas repetidas no resuelven una pregunta de
   criterio: solo muestran que cada modelo la contesta a su manera.
2. **Un dato nuevo por prerrequisito (`rampa.existe`, como proponía la lista).** Suma un dato universal más al
   prompt y deja dos formas de decir lo mismo (`rampa.existe = false` y `rampa.ancho_m = 0`).
3. **Decidir cada criterio y expresar el «no aplica» con el dato que ya decide si la regla aplica.** El sí/no de un
   requisito que no existe no se escribe; se escribe su prerrequisito y la regla sale «no aplica».

## Decision outcome

**Chosen:** opción 3.

### «No aplica» por prerrequisito

- El sí/no de un requisito que no existe en el proyecto **no se escribe**. Se escribe el dato que decide si la regla
  aplica:
  - `rampa.ancho_m = 0` si no hay rampa vehicular;
  - `proyecto.estacionamientos = 0`;
  - `lote.otros_anteproyectos_misma_finca = false`;
  - `plano.tinaquera.presente = false`.
- Un dato numérico que no aplica se escribe 0 (como ya decía el contrato).
- Las cinco reglas de rampa cambian `existe(rampa.ancho_m)` por `rampa.ancho_m > 0`. Con 0 la regla sale
  «no aplica»; leído con duda, el respaldo del motor también decide «no aplica».
- Los datos pedidos (`scripts/datos_pedidos.py` y `reglasQuePiden` en `web/src/server/ia/revisar.ts`) ya no cuentan
  las reglas que salieron «no aplica». Tampoco las entradas de las reglas que quedaron sin resolver en `aplica_si`:
  de esas solo se pide el dato que falta para saber si aplican.
- El contrato común (`contrato.ts`, C-DATOS) y el prompt de Claude lo dicen. En DeepSeek, `controlDelContrato`
  rechaza un sí/no cuyo detalle empieza con «no aplica» y le dice qué dato escribir.

### Criterios de los diez datos

Los criterios quedan en `scripts/hechos_documentales.json`, que el prompt inyecta en todos los modelos.

| Dato | Criterio | Casco Antiguo |
|---|---|---|
| `rampa.inicia_en_linea_construccion`, `rampa.pendiente_pct_indicada` | Solo si `rampa.ancho_m > 0`; si no, no se escriben. | no aplica |
| `plano.acceso_vehicular.indicado` | Solo si `proyecto.estacionamientos > 0`. | no aplica |
| `plano.delimitacion_area_anteproyecto.presente`, `plano.indica_otros_proyectos_finca.presente` | Solo si `lote.otros_anteproyectos_misma_finca` es true. Con una sola obra en la finca se escribe ese dato en false. | no aplica |
| `plano.pie_descriptivo.coordinador_en_nivel_superior` | El membrete es la tabla de casillas con su marco. Un recuadro con borde propio (logo, sello, datos de la oficina) no es parte del membrete aunque esté pegado. Se evalúa lámina por lámina. | No (A-01: la primera fila es «PROYECTO») |
| `plano.resumen_areas.desglose_por_uso` | Basta que cada área se pueda atribuir a un uso sin interpretar. El nombre de la unidad (local, apartamento, oficina, depósito, estacionamiento) cuenta. No hace falta un subtotal por uso. | Sí |
| `plano.tinaquera.presente`, `plano.tinaquera.puertas_abren_dentro`, `plano.centro_acopio.dentro_propiedad_y_accesible` | Tinaquera = centro de acopio. Tiene que haber un recinto dibujado y rotulado; una nota sola no basta. Para «fácil acceso» basta un recorrido común hasta la calle (un vestíbulo común sirve), sin pasar por unidades privadas. | Sí |
| `plano.acera.corrida_especificada_con_ancho` | Una acera existente que se conserva («a mantener») con su ancho acotado basta. La especificación se exige si la acera es nueva o se reconstruye. | Sí |
| `proyecto.aberturas_posteriores` (dato nuevo) | Vanos (ventanas, puertas, balcones) hacia el retiro o patio posterior. Paredes ciegas o edificación adosada con pared ciega: No. | Sí: la regla mide el retiro contra 3.00 m |
| `expediente.invoca_uso_anterior` | Sí solo si el uso que se mantiene no está permitido hoy en la zona: ahí está el derecho que se invoca. | No, si el uso que se mantiene (comercial abajo, residencial arriba) está permitido en la zona |
| `profesional.idoneidad_jtia_vigente` | No sale del plano. Solo de la constancia de la JTIA del expediente (documento y página). | información requerida |

La servidumbre vial y el ancho de acera ya tenían el criterio que proponía la lista: sus desacuerdos son de lectura
y se atacan con el harness de escaneados, no con criterio.

### Cambios en el motor

- **Respaldo (ADR-0016):** un dato externo al plano (`EXTERNOS`, como `profesional.*`) leído con duda da
  «información requerida», igual que si faltara. Antes el respaldo decidía con el dato dudoso.
- **Extractor:** `plano.tinaquera.presente` solo sale de rótulos cortos (seis palabras o menos), no de notas
  generales como «el edificio contará con una tinaquera propia».
- **DeepSeek:** `controlDelContrato` rechaza `profesional.*vigente` sacado del plano.

### Reglas que suben de versión

Nota «Versión N (2026-10-21, ADR-0018): …»; la `cita_textual` no cambia.

- `aplica_si` de `existe(rampa.ancho_m)` a `rampa.ancho_m > 0`: A110-AIII-5-RAMPA-INICIO (v5),
  A110-AIII-5-RAMPA-PENDIENTE (v5), A110-AIV-4-RAMPA-INICIO (v5), A110-AIV-RAMPA-DOBLE (v4), A110-AIV-RAMPA-SIMPLE (v4).
- Solo nota con el criterio: A110-AIII-5-ACOPIO-UBICACION (v5), A110-AIV-4-ACOPIO-UBICACION (v5),
  A110-AIII-3-DESGLOSE-USOS (v5), A110-AIV-10-DESGLOSE-USOS (v5), A110-AIV-4-ACERA-CORRIDA (v5),
  A110-ART10-IDONEIDAD-JTIA-VIGENTE (v3), CA-TODAS-RETIRO-POSTERIOR-ABERTURAS (v3), CA-TODAS-ACTIVIDAD-EXISTENTE (v3).

### Comprobación sin corridas nuevas

Se repitió el motor sobre la carpeta de la ronda 80 de DeepSeek (mismos `extraccion.json` y `lote.json`), con el
código de antes y el de ahora. Cambian cinco reglas y nada más:
- las cuatro de rampa pasan de «No cumple» u «Observación» a «no aplica»;
- la idoneidad JTIA pasa de «No cumple» a «información requerida».

`rampa.inicia_en_linea_construccion` deja de pedirse.

## Consequences

**Positive**
- Ningún modelo tiene que elegir entre «sí» y «no» para algo que no existe, y esos datos dejan de pedirse.
- La vigencia de la idoneidad nunca sale «No cumple» por lo que se ve en un sello.
- Las preguntas de criterio quedan escritas en el dato, con la decisión y su razón.

**Negative**
- Si ningún modelo escribe `rampa.ancho_m`, las reglas de rampa quedan en revisión y el respaldo las deja como
  observación («falta en el plano»). Antes `existe()` las dejaba en «no aplica» sin avisar. `rampa.ancho_m` es dato
  universal, así que siempre se pide.
- Con aberturas = sí, CA-TODAS-RETIRO-POSTERIOR-ABERTURAS mide el retiro de Casco Antiguo (2.2 m) contra 3.00 m.
  Falta decidir si la excepción de edificaciones existentes (Art. 25.4) alcanza a una fachada nueva.
- Las rondas anteriores al 21-oct no se comparan directamente en estas reglas.
- La referencia del 11-oct (`docs/demo/verdad-datos-disputados.json`) cambia: los «no aplica» del Art. 28 pasan a
  `lote.otros_anteproyectos_misma_finca` (`planos_v6`); la acera de Casco pasa a «sí»; el coordinador de Casco
  vuelve como «no»; se agrega `proyecto.aberturas_posteriores`; el desglose de Tocumen se retira hasta volver a
  mirar el cuadro.

**Resuelto el 22-oct**
- `existe(acceso_vehicular.rotura_cordon_m)` tenía el mismo problema que las rampas. Pasan a
  `acceso_vehicular.rotura_cordon_m > 0`: A110-AIV-ROTURA-CORDON (v4), PLOT-ART76-ACCESO-RUTA-ACCESIBLE (v3) y
  PLOT-ART77-VADO-EN-FRANJA-INFRAESTRUCTURA (v3). El dato tiene ahora su propia definición (traía la del Art. 76) y el
  criterio «0 si no hay acceso vehicular». `tests/test_prerrequisito_cero.py` impide volver a `existe()` con un
  prerrequisito que puede valer 0.

**Resuelto el 26-oct**
- El desglose por usos de Tocumen vuelve a la referencia como «sí» (`planos_v7`). En la lámina 1, cada uno de los 12
  locales lleva su área, y suman 12,847.88 m², el área cerrada del cuadro. El área verde y la de estacionamientos van
  aparte. Con el criterio de arriba (el nombre de la unidad cuenta, sin subtotal por uso), toda el área se atribuye a
  un uso.

## Links

- Modifica: [[0016-zona-de-trabajo-con-procedencia-y-decision-de-respaldo-del-motor.md]] (respaldo con dato externo dudoso) y [[0013-revision-con-ia-en-dos-pasos-con-contrato-comun.md]] (contrato C-DATOS).
- Base: `docs/demo/criterios-disputados-casco.md`, `docs/revision-catalogo/prerrequisitos-propuesta.md` (D-24).
- Medición: [[0015-medir-estabilidad-entre-corridas-no-exactitud.md]].
