---
status: Accepted
owner: "desconocido@correo.invalid"
reviewers: ["Tech Lead", "DOYC"]
updated_at: "2026-10-22"
feature_size: "M"
ticket: "motor-reglas-auditable"
supersedes: []
amends: ["0013", "0016", "0018"]
---

# 0019 — Valores con la forma del contrato de datos

- **Status:** Accepted
- **Date:** 2026-10-22
- **Deciders:** responsable del proyecto (Daniel), a partir de la tabla de supuestos de la página de comparación
  (ronda 80, Casco Antiguo)

## Context

En la página de comparación de la ronda 80, Sonnet y Opus anotaron «Orden de conservación: tercer» y DeepSeek
«TERCER ORDEN»; Sonnet y Opus anotaron «obra nueva: no» y DeepSeek «false». Parecía una diferencia de formato.

Una de las dos sí cambiaba el dictamen:

- **Orden de conservación.** El contrato (`scripts/hechos_documentales.json`) declaraba `lote.orden_conservacion`
  como sí/no, con una definición copiada de otra regla y sin lista de valores. Las reglas de Casco Antiguo lo comparan
  con `'tercer'`. DeepSeek fijó «TERCER ORDEN» en `fijar_alcance`, y ese valor llegó al motor tal cual. Con eso,
  CA-TODAS-ALTURA-3-ORDEN y CA-TODAS-PATIOS-3-ORDEN salieron «no aplica» sin ningún aviso. En Sonnet y Opus, que
  escribieron «tercer», salieron «Cumple».
- **Obra nueva.** Solo era cosmético. El dato era `false` en las tres corridas; la diferencia estaba en el texto libre
  del supuesto del dictamen. El ejemplo del prompt de DeepSeek ponía el valor entre comillas, y la página comparaba
  los textos sin normalizar.

Una auditoría del contrato contra el uso en las reglas encontró:

- 19 datos con un tipo distinto del que usan las reglas (13 números y 6 textos declarados sí/no);
- 7 textos sin la lista de valores que comparan las reglas;
- una entrada `tramite` sí/no con la definición de la compensación urbana. El trámite lo pone la plataforma ('RLA',
  'RDP'…); no es un dato que escriba la IA.

En la misma página, la altura salió 0 m en Sonnet y DeepSeek y 12.6 m en Opus. Sonnet y DeepSeek escribieron 0 con
confianza 0.5–0.6 para decir «no encontré una cota total». El contrato común lo pedía así: «si no se puede leer ni
medir, con confianza ≤ 0.6 y el motivo, sin dejarlo fuera». La sensatez del motor solo marcaba el 0 como dudoso, y el
respaldo (ADR-0016) podía decidir con ese 0.

## Considered options

1. **Corregir solo el prompt de DeepSeek.** No cubre a Claude, que también puede escribir variantes, y no protege
   las reglas cuando alguien escribe otra.
2. **Validar solo en las herramientas de DeepSeek.** Claude escribe `lote.json` y `alcance_ia.json` como archivos, sin
   herramientas. La entrada del motor seguiría sin garantía.
3. **Corregir el contrato, normalizar en la entrada del motor para todos los modelos, validar además en las
   herramientas de DeepSeek y comparar valores normalizados en la página.**

## Decision outcome

**Chosen:** opción 3.

### Contrato

- Cada dato tiene el tipo con que lo usan las reglas. Pasan de sí/no a número: los del letrero (calibre, diámetro de
  tubos, líneas de leyenda, recuadros, tubos galvanizados), `permiso_construccion.meses_restantes`,
  `proyecto.area_uso_principal_m2`, `proyecto.estacionamientos_directos_calle`, `proyecto.locales_comerciales_pb`,
  `proyecto.pisos_adicionados`, `proyecto.pisos_adicionales_frente`, `proyecto.unidades_eficientes_y_hospedaje` y
  `lote.sf_unidad_territorial`.
- Un texto lleva `valores`: la escritura que comparan las reglas. Campos nuevos:
  - `cerrada`: solo vale uno de esos valores;
  - `sinonimos`: otras escrituras del mismo valor («3er», «tercero» → «tercer»);
  - `ruido`: palabras que no cambian el valor («orden», «conservación», «corregimiento»…).
- `lote.orden_conservacion`: lista cerrada (primer, segundo, tercer, cuarto, baldio). La definición pasa a citar la
  Res. 127-2003, Art. 15, y el criterio dice que se escribe solo la palabra; si no hay edificación, «baldio».
- Listas abiertas: `lote.corregimiento`, `lote.subregion`, `lote.sf_sector`, `equipo.tipo`, `obra.tipo` y
  `expediente.tramite_plano_asociado` (agrega OBRAS_MENORES). Dato nuevo `lote.parcela` (H, K) con sus cuatro reglas.
- Sale `tramite`.
- `tests/test_contrato_tipos.py` comprueba que el tipo coincide con el uso, que los valores cubren lo que comparan las
  reglas y que toda clave del contrato tiene punto (el trámite no es del contrato).

### Normalización en la entrada del motor

`precheck/planos/valores.py` corre en `revisar.py` después de juntar `lote.json` y otra vez después del alcance y de lo
definido:

- «true», «sí» → `true`; «733.14 m2», «1,500.5» → número.
- Un texto con valores pasa a su escritura del contrato, sin contar mayúsculas, tildes, sinónimos ni palabras de
  ruido. Ejemplo: «TERCER ORDEN» → «tercer». Queda el aviso `FORMA:` y el valor leído en `valor_leido`.
- Si no tiene forma, el valor queda vacío y el motor lo trata como faltante. Aviso `VALOR_SIN_FORMA:`. Pasa con:
  - un sí/no o un número que no se puede leer;
  - un texto fuera de una lista cerrada.

  Así no sale «no aplica» en silencio, sino revisión.
- No se tocan: el código de zona y la norma (tienen su propia lectura), el trámite, lo definido por el usuario ni los
  textos de listas abiertas que no coinciden.

### Ceros imposibles

- La sensatez descarta el área y el frente del lote, la altura y los pisos totales cuando valen 0 o menos. El valor
  queda vacío y se trata como faltante. Aviso `DATO_DESCARTADO:` con la indicación de qué escribir.
- El contrato común (`contrato.ts`, C-DATOS) cambia:
  - 0 solo cuando el elemento no existe (no hay estacionamientos);
  - si existe y no se lee, la mejor estimación del plano (la altura como diferencia de niveles) con confianza ≤ 0.6;
  - si no hay base, no se escribe;
  - nunca 0 para decir «no lo encontré».

### Prompt y DeepSeek

- El prompt de todos los modelos dice el tipo de cada dato. Para una lista cerrada: `texto, solo uno de: "primer",
  … (esa palabra sola, sin otras)`.
- En DeepSeek, `formaDelContrato` valida tipo y lista cerrada:
  - en `escribir_hecho`;
  - en `fijar_alcance`, que antes no validaba los datos de alcance. Con un error no escribe `alcance_ia.json` y
    devuelve la lista de correcciones.
- El ejemplo de supuestos del dictamen usa `false` sin comillas. Pide el mismo valor que se escribió para el dato.

### Página de comparación

- Un supuesto muestra el valor con que decidió el motor. Si la corrida no tiene ese dato, muestra el anotado, con
  «true»/«false» como «sí»/«no».
- «Difiere» compara sin mayúsculas ni tildes.
- Un dato descartado (altura 0, texto fuera de lista) se ve como «—».

### Comprobación sin corridas nuevas

Se repitió el motor sobre las tres corridas de Casco Antiguo de la ronda 80 (DeepSeek `pck-fc5c9144`, Sonnet
`pck-b2aac4c0`, Opus `pck-48e36367`). Se usaron los mismos `extraccion.json`, `lote.json`, `alcance_ia.json` y
`plano.pdf`, con el código de `windows-demo-local` (46c108d) y con el de ahora:

- **DeepSeek.** «TERCER ORDEN» se usa como «tercer». CA-TODAS-ALTURA-3-ORDEN y CA-TODAS-PATIOS-3-ORDEN vuelven a
  evaluarse y salen «Cumple», como en Sonnet y Opus. La altura 0 queda descartada.
- **Sonnet.** La altura 0 queda descartada. Ninguna regla del alcance usa la altura, así que no cambia ningún
  resultado.
- **Opus.** Sin cambios por esta decisión.

También se repitieron San Francisco y Tocumen (comercial) de Sonnet en la ronda 78 (`pck-e1505c12`, `pck-5d285f53`):
sin cambios por esta decisión.

Las demás diferencias de la repetición son de ADR-0018 (rampas e idoneidad JTIA), que aún no está en
`windows-demo-local`.

La primera repetición mostró además el error de la entrada `tramite`. Con ella, el normalizador vaciaba
`tramite = 'RLA'` y todas las reglas quedaban sin resolver en `aplica_si`. Por eso sale del contrato y el normalizador
no lo toca aunque vuelva a aparecer.

## Consequences

**Positive**
- El motor recibe la misma escritura sea cual sea el modelo. Un texto mal escrito ya no deja reglas en «no aplica»
  sin aviso.
- Un 0 que significa «no lo encontré» no decide reglas ni se muestra como lectura en la comparación.
- La tabla de supuestos marca solo los desacuerdos que vio el motor.

**Negative**
- Un texto fuera de una lista cerrada va a revisión: más REQUIERE_REVISION donde antes salía «no aplica».
- Las listas hay que mantenerlas cuando una regla compara un texto nuevo. `test_contrato_tipos` falla si falta.
- En las reglas CA de tercer orden y en la altura, las rondas anteriores al 22-oct no se comparan directamente con las
  nuevas.

**Pendiente**
- `existe(acceso_vehicular.rotura_cordon_m)` tiene el mismo problema que tenían las rampas (ADR-0018).
- Un `true`/`false` en un dato numérico pasa como antes: el motor lo compara como 1/0. `false` en
  `proyecto.pisos_adicionales_frente` dice bien «ninguno»; `true` no dice cuántos. Falta decidir si `true` queda
  faltante. (Resuelto el 26-oct, abajo.)

**Resuelto el 22-oct**
- La entrada `tramite` la agregó `scripts/activar_propuestas.py` (8-oct): copiaba las `entradas` de la regla sin el
  filtro de las expresiones. Ahora pasan por el mismo filtro (`FUERA_DEL_CONTRATO`: norma, zona y trámite;
  `tests/test_activar_propuestas.py`). `aplicar_correcciones_reglas.py` solo escribe las claves de sus listas, y
  `aplicar_catalogo_definitivo.py` ya excluía el trámite.

**Resuelto el 26-oct (decisión de Daniel)**
- Un sí/no en un dato numérico ya no pasa como 1/0. `false` o «no» pasa a 0 («ninguno»), con aviso `FORMA`. `true` o
  «sí» no dice cuánto: queda faltante (`VALOR_SIN_FORMA`) y la regla va a revisión. Antes,
  `acceso_vehicular.rotura_cordon_m = true` salía CUMPLE con `> 0` y `<= 7.5`.
- En las 514 carpetas de `web/.data/prechecks` había 304 con un sí/no en un dato numérico. Casi todos eran `false`
  (228 en `proyecto.estacionamientos_directos_calle`, 79 en `proyecto.pisos_adicionados`, 36 en
  `proyecto.pisos_adicionales_frente`), que dan lo mismo que antes. Los `true` eran 42: 26 en
  `estacionamientos_directos_calle`, 10 en `area_uso_principal_m2` y el resto en retiros, rotura de cordón y pisos
  adicionados. Esas reglas pasan a revisión al reevaluar.

## Links

- Modifica: [[0013-revision-con-ia-en-dos-pasos-con-contrato-comun.md]] (contrato C-DATOS),
  [[0016-zona-de-trabajo-con-procedencia-y-decision-de-respaldo-del-motor.md]] (sensatez antes del respaldo) y
  [[0018-criterios-de-datos-disputados-y-no-aplica-por-prerrequisito.md]] (el 0 solo para lo que no existe).
- Medición: [[0015-medir-estabilidad-entre-corridas-no-exactitud.md]].
