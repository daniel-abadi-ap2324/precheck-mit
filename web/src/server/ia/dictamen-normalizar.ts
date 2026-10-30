/**
 * Comprobaciones del dictamen contra resultado.json después de escribirlo, iguales para los tres proveedores
 * (Claude Code, API de Anthropic y DeepSeek). Funciones puras: revisar.ts lee y escribe los archivos.
 *
 * - Jerarquía motor → IA (CLAUDE.md, principio 2): las decisiones sobre reglas que el motor ya decidió de otra forma se
 *   cuentan y se anotan en el registro; el archivo no se toca, así la contradicción queda medible y la web la muestra con
 *   reserva (prevalece el motor; ver traductor.ts).
 * - Documentos externos: una regla cuyo único dato es un documento o dato ajeno al plano (expediente.*, registro_publico.*)
 *   que la IA deja en OBSERVACION o NO_CUMPLE pasa a OBSERVACION con estado INFORMACION_REQUERIDA. Falta un papel, no
 *   falla el plano; en «subsanar» va qué aportar.
 */

/** Datos que no salen del plano sino de otro documento del expediente. */
export const DATO_DE_DOCUMENTO_EXTERNO = /^(expediente\.|registro_publico\.)/;
/** Datos de contexto que fija el usuario o el trámite; no cuentan al decidir si una regla es «de documento». */
const CONTEXTO_REGLA = /^(tramite|lote\.norma_aplicable|lote\.codigo_zona|lote\.sf_sector|lote\.sf_unidad_territorial|expediente\.fecha_presentacion)$/;

const DECIDIDO_POR_EL_MOTOR = new Set(["CUMPLE", "NO_CUMPLE", "NO_APLICA"]);

/** Reglas cuyos datos (sin el contexto) son todos de un documento ajeno al plano. */
export function reglasDeDocumentoExterno(entradasPorRegla: Map<string, string[]>): Set<string> {
  const salida = new Set<string>();
  for (const [id, entradas] of entradasPorRegla) {
    const datos = entradas.filter((e) => !CONTEXTO_REGLA.test(e));
    if (datos.length && datos.every((e) => DATO_DE_DOCUMENTO_EXTERNO.test(e))) salida.add(id);
  }
  return salida;
}

/** Reglas cuyos datos salen todos del plano (ninguno de otro documento): lo que les falta es una observación, no información requerida. */
export function reglasSoloDelPlano(entradasPorRegla: Map<string, string[]>): Set<string> {
  const salida = new Set<string>();
  for (const [id, entradas] of entradasPorRegla) {
    const datos = entradas.filter((e) => !CONTEXTO_REGLA.test(e));
    if (datos.length && datos.every((e) => !DATO_DE_DOCUMENTO_EXTERNO.test(e))) salida.add(id);
  }
  return salida;
}

export interface Decision {
  regla_id?: unknown;
  decision?: unknown;
  estado?: unknown;
  subsanar?: unknown;
  [k: string]: unknown;
}

export interface CambiosDictamen {
  /** Reglas que el motor decidió y la IA quiso cambiar: «id (IA X, motor Y)». */
  prevaleceMotor: string[];
  /** Reglas de documento externo que pasaron a INFORMACION_REQUERIDA. */
  informacionRequerida: string[];
  /** Reglas cuyos datos salen del plano a las que la IA puso INFORMACION_REQUERIDA: se les quita (queda la decisión). */
  sinInformacionRequerida: string[];
}

/**
 * Aplica las comprobaciones a las decisiones. `motor` es regla_id → resultado de resultado.json (el final, tras las
 * reevaluaciones de la IA); `externas`, las reglas de documento externo; `soloPlano`, las que solo leen datos del plano
 * (DeepSeek ponía «información requerida» a 33 de 41 reglas de Bella Vista porque faltaba el elemento en el plano: eso es
 * una observación). Devuelve las decisiones (nuevas solo si cambió algo) y lo que se anotó.
 */
export function normalizarDecisiones(decisiones: Decision[], motor: Map<string, string>, externas: Set<string>, soloPlano: Set<string> = new Set()): { decisiones: Decision[]; cambios: CambiosDictamen } {
  const cambios: CambiosDictamen = { prevaleceMotor: [], informacionRequerida: [], sinInformacionRequerida: [] };
  let tocado = false;
  const salida = decisiones.map((d) => {
    if (typeof d.regla_id !== "string" || typeof d.decision !== "string") return d;
    const resultadoMotor = motor.get(d.regla_id);
    if (resultadoMotor && DECIDIDO_POR_EL_MOTOR.has(resultadoMotor) && resultadoMotor !== d.decision) {
      cambios.prevaleceMotor.push(`${d.regla_id} (IA ${d.decision}, motor ${resultadoMotor})`);
      return d;
    }
    if (externas.has(d.regla_id) && (d.decision === "OBSERVACION" || d.decision === "NO_CUMPLE") && d.estado !== "INFORMACION_REQUERIDA") {
      cambios.informacionRequerida.push(d.regla_id);
      tocado = true;
      const subsanar = typeof d.subsanar === "string" && d.subsanar.trim() ? d.subsanar : "Aporte al expediente el documento que exige la regla.";
      return { ...d, decision: "OBSERVACION", estado: "INFORMACION_REQUERIDA", subsanar };
    }
    if (soloPlano.has(d.regla_id) && d.estado === "INFORMACION_REQUERIDA") {
      cambios.sinInformacionRequerida.push(d.regla_id);
      tocado = true;
      const resto = { ...d };
      delete resto.estado;
      return resto;
    }
    return d;
  });
  return { decisiones: tocado ? salida : decisiones, cambios };
}
