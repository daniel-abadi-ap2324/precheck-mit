/** Texto para la IA sobre las variables que el arquitecto definió al 100 % (precheck/planos/definidas.py las impone en cada evaluación). */
export function textoDefinidas(valores: Record<string, string | number>): string {
  const lista = Object.entries(valores).map(([clave, valor]) => `${clave} = ${JSON.stringify(valor)}`);
  if (!lista.length) return "";
  return (
    `VARIABLES DEFINIDAS POR EL ARQUITECTO (decisión suya, al 100 %): ${lista.join("; ")}. Úsalas tal cual: no las cuestiones, no las contrastes con el plano ` +
    "para dudar de ellas, no las escribas en lote.json (el sistema las impone con confianza 1.0 aunque escribas otro valor), no abras hallazgos ni " +
    "observaciones sobre su validez y no cambies la zona aunque el plano o la norma sugieran otra. Si la zona definida no existe en la norma o no tiene " +
    "reglas cargadas, las reglas de la zona quedan en revisión del motor: no la sustituyas por otra. Tu trabajo es evaluar el plano contra esas variables."
  );
}
