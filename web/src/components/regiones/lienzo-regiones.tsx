"use client";

import { useEffect, useId, useRef, type KeyboardEvent, type PointerEvent } from "react";
import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import type { PaginaRegiones, RegionPlano } from "@/types";
import { Button } from "@/components/ui/button";
import { useElementSize } from "@/components/plan-viewer/use-element-size";
import { usePanZoom } from "@/components/plan-viewer/use-pan-zoom";
import { coloresExportacionRegiones } from "@/config/region-colors";
import { aFraccion, colorDeTipo, etiquetaDeTipo, proyectarEnSegmento, type Punto } from "@/lib/regiones";

export interface LienzoRegionesProps {
  pagina: PaginaRegiones;
  imagen: string;
  rotulo: string;
  /** Regiones de esta página. */
  regiones: RegionPlano[];
  seleccion: string | null;
  vertice: number | null;
  /** Vértices de la región que se está dibujando (null: no se dibuja). */
  dibujo: Punto[] | null;
  colorDibujo: string;
  onSeleccionar: (id: string | null) => void;
  onVertice: (i: number | null) => void;
  onMoverVertice: (id: string, i: number, p: Punto) => void;
  onAgregarVertice: (id: string, despuesDe: number, p: Punto) => void;
  onPuntoDibujo: (p: Punto) => void;
  onCerrarDibujo: () => void;
  onCancelar: () => void;
  onQuitar: () => void;
}

const PASO = 0.002;
const PASO_LARGO = 0.01;

/**
 * Lámina con las regiones como polígonos semitransparentes (coordenadas del SVG = píxeles del raster). Zoom con la rueda
 * o los botones, desplazamiento arrastrando el fondo o con las flechas; vértices arrastrables y movibles con las flechas.
 */
export function LienzoRegiones(props: LienzoRegionesProps) {
  const { pagina, imagen, rotulo, regiones, seleccion, vertice, dibujo, colorDibujo } = props;
  const marco = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const idAyuda = useId();
  const { size } = useElementSize(marco);
  const W = pagina.ancho_px, H = pagina.alto_px;
  const { scale, tx, ty, zoomAt, panBy, fit, toWorld } = usePanZoom({ width: W, height: H }, size);
  const arrastre = useRef<{ tipo: "vertice"; id: string; i: number } | { tipo: "pan"; x: number; y: number; movido: boolean } | null>(null);

  // La rueda necesita un oyente no pasivo para que la página no se desplace mientras se hace zoom.
  const zoomRef = useRef(zoomAt);
  useEffect(() => {
    zoomRef.current = zoomAt;
  }, [zoomAt]);
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const rueda = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomRef.current(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", rueda, { passive: false });
    return () => el.removeEventListener("wheel", rueda);
  }, []);

  /** Coordenadas del puntero → fracción de la página. */
  const fraccion = (clientX: number, clientY: number): Punto => {
    const r = svg.current?.getBoundingClientRect();
    const [wx, wy] = toWorld(clientX - (r?.left ?? 0), clientY - (r?.top ?? 0));
    return aFraccion(wx, wy, W, H);
  };

  const elegida = regiones.find((r) => r.id === seleccion) ?? null;

  const alBajar = (e: PointerEvent<SVGSVGElement>) => {
    if (dibujo) return;
    arrastre.current = { tipo: "pan", x: e.clientX, y: e.clientY, movido: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const alMover = (e: PointerEvent<SVGSVGElement>) => {
    const a = arrastre.current;
    if (!a) return;
    if (a.tipo === "vertice") props.onMoverVertice(a.id, a.i, fraccion(e.clientX, e.clientY));
    else {
      const dx = e.clientX - a.x, dy = e.clientY - a.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) a.movido = true;
      if (a.movido) panBy(dx, dy);
      a.x = e.clientX;
      a.y = e.clientY;
    }
  };
  const alSoltar = (e: PointerEvent<SVGSVGElement>) => {
    const a = arrastre.current;
    arrastre.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    // Un clic en el fondo (sin arrastrar) quita la selección.
    if (a?.tipo === "pan" && !a.movido) props.onSeleccionar(null);
  };

  const alTeclear = (e: KeyboardEvent<SVGSVGElement>) => {
    const flechas: Record<string, Punto> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const d = flechas[e.key];
    if (d) {
      e.preventDefault();
      if (elegida && vertice !== null && elegida.puntos[vertice]) {
        const paso = e.shiftKey ? PASO_LARGO : PASO;
        const [x, y] = elegida.puntos[vertice];
        props.onMoverVertice(elegida.id, vertice, [x + d[0] * paso, y + d[1] * paso]);
      } else panBy(-d[0] * 40, -d[1] * 40);
      return;
    }
    if (e.key === "+" || e.key === "=") zoomAt(1.25);
    else if (e.key === "-") zoomAt(1 / 1.25);
    else if (e.key === "Enter" && dibujo) props.onCerrarDibujo();
    else if (e.key === "Escape") props.onCancelar();
    else if (e.key === "Delete" || e.key === "Backspace") props.onQuitar();
    else return;
    e.preventDefault();
  };

  const radio = 6 / scale;
  const ayuda = dibujo
    ? "Dibujando: clic para cada vértice; Enter o doble clic para cerrar; Escape para cancelar."
    : "Arrastre el fondo para desplazar y use la rueda para acercar. Con un vértice elegido, las flechas lo mueven (Mayús: más rápido); Supr lo quita.";

  return (
    <div ref={marco} className="relative h-[60vh] min-h-80 overflow-hidden rounded-md border bg-plan-paper">
      <svg
        ref={svg}
        role="application"
        aria-label={`Lámina: ${rotulo}`}
        aria-describedby={idAyuda}
        tabIndex={0}
        className={`size-full touch-none select-none outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${dibujo ? "cursor-crosshair" : "cursor-grab"}`}
        onPointerDown={alBajar}
        onPointerMove={alMover}
        onPointerUp={alSoltar}
        onPointerCancel={alSoltar}
        onClick={(e) => {
          if (!dibujo) return;
          props.onPuntoDibujo(fraccion(e.clientX, e.clientY));
        }}
        onDoubleClick={() => {
          if (dibujo) props.onCerrarDibujo();
        }}
        onKeyDown={alTeclear}
      >
        <g transform={`translate(${tx} ${ty}) scale(${scale})`}>
          <image href={imagen} x={0} y={0} width={W} height={H} preserveAspectRatio="none" />
          {regiones.map((r) => {
            const color = colorDeTipo(r.tipo);
            const activa = r.id === seleccion;
            return (
              <polygon
                key={r.id}
                data-region={r.id}
                points={r.puntos.map(([x, y]) => `${x * W},${y * H}`).join(" ")}
                fill={color}
                fillOpacity={activa ? 0.35 : 0.22}
                stroke={color}
                strokeWidth={activa ? 3 : 1.5}
                strokeDasharray={r.confirmada ? undefined : "6 4"}
                vectorEffect="non-scaling-stroke"
                className={dibujo ? "pointer-events-none" : "cursor-pointer"}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  props.onSeleccionar(r.id);
                }}
              >
                <title>{`${etiquetaDeTipo(r.tipo)}${r.etiqueta ? `: ${r.etiqueta}` : ""}`}</title>
              </polygon>
            );
          })}
          {elegida && !dibujo
            ? elegida.puntos.map((a, i) => {
                const b = elegida.puntos[(i + 1) % elegida.puntos.length];
                return (
                  // Lado ancho e invisible: doble clic agrega un vértice en el punto más cercano del lado.
                  <line
                    key={`lado-${i}`}
                    data-lado={i}
                    x1={a[0] * W}
                    y1={a[1] * H}
                    x2={b[0] * W}
                    y2={b[1] * H}
                    stroke="transparent"
                    strokeWidth={14}
                    vectorEffect="non-scaling-stroke"
                    className="cursor-copy"
                    onPointerDown={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      props.onAgregarVertice(elegida.id, i, proyectarEnSegmento(fraccion(e.clientX, e.clientY), a, b).punto);
                    }}
                  >
                    <title>Doble clic para agregar un vértice</title>
                  </line>
                );
              })
            : null}
          {elegida && !dibujo
            ? elegida.puntos.map(([x, y], i) => (
                <circle
                  key={`v-${i}`}
                  data-vertice={i}
                  role="button"
                  tabIndex={0}
                  aria-label={`Vértice ${i + 1} de ${elegida.puntos.length}`}
                  aria-pressed={vertice === i}
                  cx={x * W}
                  cy={y * H}
                  r={vertice === i ? radio * 1.4 : radio}
                  fill={vertice === i ? colorDeTipo(elegida.tipo) : coloresExportacionRegiones.vertice}
                  stroke={colorDeTipo(elegida.tipo)}
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                  className="cursor-move outline-none"
                  onFocus={() => props.onVertice(i)}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    props.onVertice(i);
                    arrastre.current = { tipo: "vertice", id: elegida.id, i };
                    svg.current?.setPointerCapture?.(e.pointerId);
                  }}
                />
              ))
            : null}
          {dibujo?.length ? (
            <g className="pointer-events-none">
              <polyline points={dibujo.map(([x, y]) => `${x * W},${y * H}`).join(" ")} fill={colorDibujo} fillOpacity={0.2} stroke={colorDibujo} strokeWidth={2} vectorEffect="non-scaling-stroke" />
              {dibujo.map(([x, y], i) => (
                <circle key={i} cx={x * W} cy={y * H} r={radio} fill={colorDibujo} />
              ))}
            </g>
          ) : null}
        </g>
      </svg>
      <div className="absolute right-2 bottom-2 flex gap-1 rounded-full border bg-card/95 p-0.5 shadow-sm">
        <Button variant="ghost" size="icon-sm" aria-label="Acercar" onClick={() => zoomAt(1.25)}>
          <ZoomIn aria-hidden />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Alejar" onClick={() => zoomAt(1 / 1.25)}>
          <ZoomOut aria-hidden />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Ajustar la lámina" onClick={fit}>
          <Maximize2 aria-hidden />
        </Button>
      </div>
      <p id={idAyuda} className="absolute top-2 left-2 max-w-[70%] rounded bg-card/90 px-2 py-1 text-2xs text-muted-foreground">
        {ayuda}
      </p>
    </div>
  );
}
