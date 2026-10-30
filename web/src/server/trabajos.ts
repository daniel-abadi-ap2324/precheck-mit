/**
 * Trabajos en segundo plano de este proceso del servidor (lectura de planos, motor de reglas, revisión con IA).
 * Se guardan en globalThis para que todas las rutas compartan las mismas colas aunque el empaquetador cargue el
 * módulo más de una vez. Si el servidor se reinicia, las colas se vacían: un estado «leyendo» o «revisando» en
 * disco sin trabajo en curso aquí es un trabajo interrumpido (enCurso lo detecta).
 */
type Limite = { enUso: number; espera: (() => void)[] };
type Registro = { colas: Map<string, Promise<void>>; activos: Set<string>; limites?: Map<string, Limite>; esperando?: Set<string>; cancelados?: Set<string> };
const g = globalThis as typeof globalThis & { __precheckTrabajos?: Registro };
const registro: Registro = (g.__precheckTrabajos ??= { colas: new Map(), activos: new Set() });
// Un registro creado por una versión anterior del módulo (recarga en caliente) no trae estos campos.
const limites = (registro.limites ??= new Map());
const esperando = (registro.esperando ??= new Set());
const cancelados = (registro.cancelados ??= new Set());

/**
 * Cancela una tarea que todavía espera turno (encolarLimitado): cuando le toque, no corre. Una tarea que ya corre no se
 * interrumpe (el proceso de la IA sigue hasta su fin). Devuelve si había algo que cancelar.
 */
export function cancelarEnEspera(clave: string): boolean {
  if (!esperando.has(clave)) return false;
  cancelados.add(clave);
  return true;
}

/** Encola una tarea en la cola indicada (una a la vez por cola) y la marca en curso hasta que termina. */
export function encolar(cola: string, clave: string, tarea: () => Promise<void>): void {
  registro.activos.add(clave);
  const previa = registro.colas.get(cola) ?? Promise.resolve();
  const siguiente = previa
    .then(tarea)
    .catch((e: unknown) => console.warn(`[trabajos] ${clave}: ${e instanceof Error ? e.message.slice(0, 200) : "error"}`))
    .finally(() => registro.activos.delete(clave));
  registro.colas.set(cola, siguiente);
}

/**
 * Como `encolar`, pero a lo sumo `max` tareas del mismo `grupo` a la vez, aunque cada una tenga su propia cola. La que
 * no tiene turno queda «en curso» (enCurso) y «en espera» (enEspera) hasta que otra termina y le pasa su lugar.
 */
export function encolarLimitado(cola: string, clave: string, grupo: string, max: number, tarea: () => Promise<void>): void {
  encolar(cola, clave, async () => {
    const l = limites.get(grupo) ?? { enUso: 0, espera: [] };
    limites.set(grupo, l);
    if (l.enUso < max) l.enUso += 1;
    else {
      esperando.add(clave);
      // El lugar se traspasa directo (sin pasar por enUso): así nunca se supera el máximo.
      await new Promise<void>((seguir) => l.espera.push(seguir));
      esperando.delete(clave);
    }
    try {
      if (cancelados.delete(clave)) throw new Error("cancelada antes de empezar");
      await tarea();
    } finally {
      const siguiente = l.espera.shift();
      if (siguiente) siguiente();
      else l.enUso -= 1;
    }
  });
}

/** La tarea está encolada pero todavía no tiene turno (límite de encolarLimitado). */
export const enEspera = (clave: string): boolean => esperando.has(clave);
/** Cuántas tareas del grupo corren y cuántas esperan turno. */
export const estadoLimite = (grupo: string): { corriendo: number; esperando: number } => {
  const l = limites.get(grupo);
  return { corriendo: l?.enUso ?? 0, esperando: l?.espera.length ?? 0 };
};

export const esperar = (cola: string): Promise<void> => registro.colas.get(cola) ?? Promise.resolve();
/** Espera todas las colas cuyo nombre empieza por el prefijo (una cola por revisión con IA). */
export const esperarPrefijo = async (prefijo: string): Promise<void> => {
  await Promise.all([...registro.colas].filter(([c]) => c.startsWith(prefijo)).map(([, p]) => p));
};
export const enCurso = (clave: string): boolean => registro.activos.has(clave);
