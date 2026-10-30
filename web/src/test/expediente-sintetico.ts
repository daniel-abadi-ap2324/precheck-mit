/** resultado.json sintético (sin datos personales) con la forma que produce el agente revisor-planos. */
export const RESULTADO_SINTETICO = {
  fecha_presentacion: "2026-01-15",
  norma_aplicable: "MIVIOT-AC-R160-2002",
  codigo_zona: "R3",
  umbral: 0.85,
  oficial: false,
  resumen: { CUMPLE: 1, NO_CUMPLE: 2, REQUIERE_REVISION: 1, NO_APLICA: 1 },
  avisos: ["aviso de prueba"],
  no_aplican: 12,
  documento: "Pueblo Ficticio - RLA-0000-1.pdf",
  resultados: [
    {
      regla_id: "AC-R3-RETIRO-FRONTAL",
      regla_version: 2,
      fuente_norma: { norma: "Resolución de prueba", articulo: "Artículo 9", pagina_pdf: 40, cita_textual: "Retiro frontal: 5 mts" },
      severidad: "bloqueante",
      resultado: "NO_CUMPLE",
      motivo: "el retiro frontal es menor que el mínimo",
      valores_usados: {
        "lote.norma_aplicable": { valor: "MIVIOT-AC-R160-2002", confianza: 0.9, fuente: { metodo: "inferido" } },
        "proyecto.retiro_frontal_m": { valor: 2.5, confianza: 0.9, fuente: { documento: "plano.pdf", pagina: 2, metodo: "vision", detalle: "planta baja" } },
      },
      titulo: "R3: retiro frontal",
      norma: "MIVIOT-AC-R160-2002",
    },
    {
      regla_id: "AC-R3-AREA-VERDE",
      regla_version: 1,
      fuente_norma: { norma: "Resolución de prueba", articulo: "Artículo 10", pagina_pdf: 41, cita_textual: "Area verde libre: 30%" },
      severidad: "observacion",
      resultado: "NO_CUMPLE",
      motivo: "área libre menor",
      valores_usados: { "proyecto.area_libre_pct": { valor: 20, confianza: 0.95, fuente: { documento: "plano.pdf", pagina: 1, metodo: "vision" } } },
      titulo: "R3: área verde libre",
      norma: "MIVIOT-AC-R160-2002",
    },
    {
      regla_id: "A110-AIV-CURVAS-NIVEL",
      regla_version: 1,
      fuente_norma: { norma: "Acuerdo N°110 de 22-04-2025", articulo: "Anexo IV, 4", pagina_pdf: 49, cita_textual: "Topografía mediante curvas de nivel" },
      severidad: "bloqueante",
      resultado: "REQUIERE_REVISION",
      motivo: "la confianza está bajo el mínimo",
      valores_usados: {},
      titulo: "Topografía con curvas de nivel",
      norma: "A110-2025",
    },
    { regla_id: "AC-R3-ALTURA", resultado: "CUMPLE", titulo: "R3: altura", fuente_norma: { norma: "Resolución de prueba", articulo: "Artículo 11" } },
    { regla_id: "AC-R3-ALTURA", resultado: "NO_APLICA" },
    { regla_id: "AC-R3-USOS", resultado: "RESULTADO_RARO" },
  ],
};

/** hechos.json sintético: lote leído del plano con confianza y fuente (uno bajo el umbral). */
export const HECHOS_SINTETICOS = {
  tramite: { valor: "RLA", confianza: 1, fuente: { metodo: "expediente" } },
  lote: {
    area_m2: { valor: 450, confianza: 0.9, fuente: { documento: "Pueblo Ficticio - RLA-0000-1.pdf", pagina: 1, metodo: "vision", detalle: "cuadro de áreas" } },
    codigo_zona: { valor: "R3", confianza: 0.7, fuente: { documento: "Pueblo Ficticio - RLA-0000-1.pdf", pagina: 1, metodo: "declarado" } },
    norma_aplicable: { valor: "MIVIOT-AC-R160-2002", confianza: 0.9, fuente: { metodo: "inferido" } },
  },
};

/** Dos reglas de otras zonas que dependen de confirmar el código de zona (grupo «zona_por_confirmar»). */
export const RESULTADO_CON_ZONA = {
  ...RESULTADO_SINTETICO,
  resultados: [
    ...RESULTADO_SINTETICO.resultados,
    ...["R1", "R2"].map((z) => ({
      regla_id: `AC-${z}-ALTURA`,
      resultado: "REQUIERE_REVISION",
      titulo: `${z}: altura`,
      grupo: "zona_por_confirmar",
      motivo: "depende de confirmar el código de zona",
      fuente_norma: { norma: "Resolución de prueba", articulo: "Artículo 12" },
    })),
  ],
  agrupadas: { zona_por_confirmar: { total: 2, motivo: "depende de confirmar el código de zona" } },
};

/** extraccion.json sintético: tres páginas, una con código de lámina. */
export const EXTRACCION_SINTETICA = {
  paginas: [
    { numero: 1, tipo: "vectorial", lamina: { codigo: "A-101" } },
    { numero: 2, tipo: "escaneada", lamina: { codigo: null } },
    { numero: 3, tipo: "escaneada", lamina: null },
  ],
};

/**
 * dictamen.json sintético para RESULTADO_CON_ZONA: decide las reglas que el motor dejó en revisión (curvas de nivel
 * NO_CUMPLE, usos OBSERVACION) y da por NO_APLICA las dos de otras zonas, con la zona R3 asumida.
 */
export const DICTAMEN_SINTETICO = {
  version: 1,
  fecha: "2026-01-17",
  revisor: "agente revisor-planos (arquitecto revisor)",
  supuestos: [{ hecho: "lote.codigo_zona", valor: "R3", fundamento: "declarada en el plano; sin CEUS" }],
  decisiones: [
    {
      regla_id: "A110-AIV-CURVAS-NIVEL",
      decision: "NO_CUMPLE",
      valor_leido: "sin curvas de nivel",
      limite: "curvas a intervalos de 1.00 m o menos",
      justificacion: "La localización no muestra curvas de nivel.",
      evidencia: [{ pagina: 1, detalle: "localización general" }],
      subsanar: "Agregar la topografía con curvas de nivel a 1.00 m o menos.",
    },
    {
      regla_id: "AC-R3-USOS",
      decision: "OBSERVACION",
      justificacion: "El uso declarado requiere el certificado del Registro Público para confirmarlo.",
      evidencia: [{ pagina: 2, detalle: "membrete" }],
      subsanar: "Presentar el certificado del Registro Público.",
    },
    { regla_id: "AC-R1-ALTURA", decision: "NO_APLICA", justificacion: "Otra zona: con la zona R3 asumida no aplica.", evidencia: [] },
    { regla_id: "AC-R2-ALTURA", decision: "NO_APLICA", justificacion: "Otra zona: con la zona R3 asumida no aplica.", evidencia: [] },
  ],
  conclusion: "El anteproyecto no puede seguir tal como está: debe agregar la topografía con curvas de nivel.",
};
