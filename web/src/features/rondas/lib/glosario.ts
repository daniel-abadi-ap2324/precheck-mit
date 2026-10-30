/**
 * Términos que usa la página /rondas, definidos una sola vez («Cómo leer esta página»). Los textos visibles (catálogo
 * docs/demo/rondas.json y componentes) solo usan estos términos; PALABRAS_PROHIBIDAS es la jerga que no debe aparecer
 * fuera del desplegable «Detalle técnico» (lo comprueba rondas.test.tsx).
 */
export const GLOSARIO: { termino: string; definicion: string }[] = [
  { termino: "Plano", definicion: "Uno de los anteproyectos reales de la DOYC que usamos para probar: Bella Vista, Casco Antiguo, CASO-A, Panamá Norte, San Francisco y Tocumen." },
  { termino: "Plano vectorial o escaneado", definicion: "Vectorial: un PDF hecho desde el programa de dibujo, con el texto legible por la computadora. Escaneado: una foto del papel (Casco Antiguo); hay que reconocer el texto en la imagen y es más difícil." },
  { termino: "Corrida", definicion: "Una revisión completa de un plano hecha por un modelo de IA." },
  { termino: "Ronda", definicion: "Un grupo de corridas hechas después de un cambio en el sistema, para ver si ese cambio mejoró algo." },
  { termino: "Grupo de rondas", definicion: "Las rondas que repitieron la misma prueba con el mismo sistema (por ejemplo, las rondas 43 a 45). Se miden juntas." },
  { termino: "Repetición", definicion: "Otra corrida del mismo plano con el mismo modelo en el mismo grupo. Cada plano se repite 3 veces, porque un modelo no siempre da el mismo resultado." },
  { termino: "Dato", definicion: "Algo que la IA tiene que leer del plano: el área del lote, cuántos estacionamientos hay, si el plano trae la firma del director, etc." },
  { termino: "Se repite", definicion: "De las reglas que decidieron dos repeticiones del mismo modelo y el mismo plano, en qué parte dicen lo mismo. Mide si el modelo es constante, no si acierta." },
  { termino: "Hallazgo", definicion: "Algo que la IA señala fuera de las reglas cargadas (por ejemplo, un documento que falta). Se cuenta aparte cuántos hallazgos repiten las corridas." },
  { termino: "Con la mayoría", definicion: "En qué parte de las reglas una corrida dice lo mismo que la mayoría de las corridas del mismo plano en su grupo." },
  { termino: "Estándar, desviante o rarísima", definicion: "Cómo se compara una corrida con las demás del mismo plano en su grupo. Rarísima: se aleja mucho de lo habitual y conviene revisarla. Hacen falta al menos 3 corridas para clasificar." },
  { termino: "Superficial", definicion: "Una corrida que propuso muy pocos hallazgos propios: puede haber revisado el plano por encima." },
  { termino: "Corridas de prueba", definicion: "Las corridas de las rondas. No salen en el panel ni en Proyectos; están en la carpeta del final de esta página." },
  { termino: "Referencia confirmada", definicion: "Las respuestas correctas de cada plano, revisadas por una persona. Todavía no la hay, así que no medimos aciertos: medimos cuánto se repiten y coinciden las corridas." },
  { termino: "Motor de reglas", definicion: "El programa que, con los datos leídos, decide regla por regla si el plano cumple la norma. La IA solo decide las reglas que el motor no puede resolver solo." },
  { termino: "Criterio", definicion: "La instrucción escrita de cómo leer un dato (por ejemplo, «cuenta las plazas numeradas, no las del cuadro»). Sin criterio, cada modelo interpretaba a su manera." },
  { termino: "Confianza", definicion: "Qué tan segura dice estar la IA de un dato, de 0 a 1. El motor solo usa datos con 0.85 o más." },
  { termino: "Costo de cuota y costo real", definicion: "Los modelos de Anthropic (Sonnet, Opus, Fable, Haiku) se pagan con la suscripción: mostramos lo que consumen de ella. DeepSeek se paga por uso: su costo real es unas 4 veces menor que el precio de lista que contamos." },
];

/** Jerga que no debe aparecer en los textos visibles de /rondas fuera del «Detalle técnico». */
export const PALABRAS_PROHIBIDAS = [
  "exactitud",
  "solapamiento",
  "tipificad",
  "segunda pasada",
  "buscar_texto",
  "texto_pagina",
  "medir_retiro",
  "medir_curvas",
  "medir_dibujo",
  "escribir_hecho",
  "lote.json",
  "hechos.json",
  "INFORMACION_REQUERIDA",
  "NO_CUMPLE",
  "REQUIERE_REVISION",
  "bimodal",
  "cobertura",
  "tokens",
  "normalizador",
  "prompt",
  "commit",
  "ceros falsos",
  "profundidad mínima",
  "contradicci",
];
