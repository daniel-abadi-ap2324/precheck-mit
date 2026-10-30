import type { RegionPlano } from "@/types";
import { coloresExportacionRegiones as C } from "@/config/region-colors";
import { AVISO_REGIONES, colorDeTipo, conteoPorTipo } from "@/lib/regiones";

/**
 * Reporte visual: la lámina con sus regiones y la leyenda, en un PNG que se arma en el navegador (canvas). El plan de
 * dibujo es puro (se prueba sin canvas); `dibujarExportacion` lo pinta en cualquier contexto 2D.
 */
export interface PlanExportacion {
  ancho: number;
  alto: number;
  /** Alto de la lámina (la leyenda va debajo). */
  altoLamina: number;
  titulo: string;
  poligonos: { color: string; puntos: [number, number][] }[];
  leyenda: { color: string; texto: string }[];
  aviso: string;
}

const FILA = 28;
const MARGEN = 16;

export function planDeExportacion(regiones: RegionPlano[], pagina: number, ancho: number, alto: number, titulo: string): PlanExportacion {
  const aqui = regiones.filter((r) => r.pagina === pagina);
  const leyenda = conteoPorTipo(aqui).map((t) => ({ color: t.color, texto: `${t.etiqueta}: ${t.conteo}` }));
  const filas = 2 + Math.max(1, leyenda.length);
  return {
    ancho,
    alto: alto + MARGEN * 2 + filas * FILA,
    altoLamina: alto,
    titulo,
    poligonos: aqui.map((r) => ({ color: colorDeTipo(r.tipo), puntos: r.puntos.map(([x, y]) => [x * ancho, y * alto] as [number, number]) })),
    leyenda: leyenda.length ? leyenda : [{ color: colorDeTipo("otro"), texto: "Sin regiones en esta página" }],
    aviso: AVISO_REGIONES,
  };
}

/** Lo mínimo del CanvasRenderingContext2D que se usa (así se prueba con un contexto falso). */
export type Contexto2D = Pick<
  CanvasRenderingContext2D,
  "drawImage" | "beginPath" | "moveTo" | "lineTo" | "closePath" | "fill" | "stroke" | "fillRect" | "strokeRect" | "fillText"
> & { fillStyle: CanvasRenderingContext2D["fillStyle"]; strokeStyle: CanvasRenderingContext2D["strokeStyle"]; lineWidth: number; globalAlpha: number; font: string };

export function dibujarExportacion(ctx: Contexto2D, imagen: CanvasImageSource, plan: PlanExportacion): void {
  ctx.globalAlpha = 1;
  ctx.fillStyle = C.fondo;
  ctx.fillRect(0, 0, plan.ancho, plan.alto);
  ctx.drawImage(imagen, 0, 0, plan.ancho, plan.altoLamina);
  const grosor = Math.max(2, Math.round(plan.ancho / 600));
  for (const p of plan.poligonos) {
    ctx.beginPath();
    p.puntos.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = p.color;
    ctx.globalAlpha = 0.25;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = p.color;
    ctx.lineWidth = grosor;
    ctx.stroke();
  }
  let y = plan.altoLamina + MARGEN + FILA * 0.7;
  ctx.fillStyle = C.texto;
  ctx.font = "bold 16px sans-serif";
  ctx.fillText(plan.titulo, MARGEN, y);
  y += FILA;
  ctx.font = "14px sans-serif";
  for (const l of plan.leyenda) {
    ctx.fillStyle = l.color;
    ctx.fillRect(MARGEN, y - 12, 16, 16);
    ctx.fillStyle = C.texto;
    ctx.fillText(l.texto, MARGEN + 24, y);
    y += FILA;
  }
  ctx.fillStyle = C.textoSuave;
  ctx.font = "italic 13px sans-serif";
  ctx.fillText(plan.aviso, MARGEN, y);
}

/** Nombre de archivo seguro para la descarga. */
export const nombreDescarga = (archivo: string, pagina: number) =>
  `regiones-${archivo.replace(/\.pdf$/i, "").replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(0, 80) || "plano"}-p${pagina}.png`;

/** Carga la imagen, dibuja y descarga el PNG (solo en el navegador). */
export async function descargarImagenRegiones(src: string, plan: PlanExportacion, nombre: string): Promise<void> {
  const img = new Image();
  img.decoding = "async";
  await new Promise<void>((ok, falla) => {
    img.onload = () => ok();
    img.onerror = () => falla(new Error("No se pudo cargar la imagen de la lámina."));
    img.src = src;
  });
  const canvas = document.createElement("canvas");
  canvas.width = plan.ancho;
  canvas.height = plan.alto;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("El navegador no permite generar la imagen.");
  dibujarExportacion(ctx, img, plan);
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/png"));
  if (!blob) throw new Error("No se pudo generar la imagen.");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
