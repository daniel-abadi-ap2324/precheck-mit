import { describe, expect, it } from "vitest";
import type { RegionPlano } from "@/types";
import { dibujarExportacion, nombreDescarga, planDeExportacion, type Contexto2D } from "./exportar";

const r = (id: string, tipo: RegionPlano["tipo"], pagina = 1): RegionPlano => ({
  id,
  pagina,
  tipo,
  puntos: [
    [0.1, 0.2],
    [0.5, 0.2],
    [0.5, 0.6],
  ],
  origen: "vectorial",
  confianza: 0.7,
  etiqueta: "",
  confirmada: false,
  editada: false,
});

/** Contexto 2D falso: anota cada llamada. */
function ctxFalso() {
  const llamadas: string[] = [];
  const anota =
    (n: string) =>
    (...a: unknown[]) => {
      llamadas.push(`${n}(${a.filter((x) => typeof x !== "object").join(",")})`);
    };
  const ctx = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
    font: "",
    drawImage: anota("drawImage"),
    beginPath: anota("beginPath"),
    moveTo: anota("moveTo"),
    lineTo: anota("lineTo"),
    closePath: anota("closePath"),
    fill: () => llamadas.push(`fill(${ctx.fillStyle})`),
    stroke: () => llamadas.push(`stroke(${ctx.strokeStyle})`),
    fillRect: anota("fillRect"),
    strokeRect: anota("strokeRect"),
    fillText: (t: string) => llamadas.push(`fillText(${t})`),
  };
  return { ctx: ctx as unknown as Contexto2D, llamadas };
}

describe("exportación de la lámina con regiones", () => {
  it("el plan pasa los puntos a píxeles, solo de la página, y arma la leyenda con el conteo", () => {
    const plan = planDeExportacion([r("a", "estacionamiento"), r("b", "estacionamiento"), r("c", "lote"), r("d", "huella", 2)], 1, 1000, 500, "A-101 · página 1");
    expect(plan.poligonos).toHaveLength(3);
    expect(plan.poligonos[0]).toEqual({ color: "#7c3aed", puntos: [[100, 100], [500, 100], [500, 300]] });
    expect(plan.leyenda).toEqual([
      { color: "#2563eb", texto: "Lote: 1" },
      { color: "#7c3aed", texto: "Estacionamiento: 2" },
    ]);
    expect(plan.alto).toBeGreaterThan(500);
    expect(plan.aviso).toMatch(/no se toman como medida exacta/);
  });

  it("dibuja la imagen, cada polígono con su color, la leyenda y el aviso", () => {
    const { ctx, llamadas } = ctxFalso();
    const plan = planDeExportacion([r("a", "lote")], 1, 1000, 500, "Plano");
    dibujarExportacion(ctx, {} as CanvasImageSource, plan);
    expect(llamadas).toContain("drawImage(0,0,1000,500)");
    expect(llamadas).toContain("moveTo(100,100)");
    expect(llamadas).toContain("fill(#2563eb)");
    expect(llamadas).toContain("stroke(#2563eb)");
    expect(llamadas).toContain("fillText(Lote: 1)");
    expect(llamadas.at(-1)).toMatch(/fillText\(Las regiones ayudan a revisar/);
  });

  it("sin regiones en la página, la leyenda lo dice; el nombre del archivo es seguro", () => {
    expect(planDeExportacion([r("a", "lote", 2)], 1, 10, 10, "x").leyenda).toEqual([{ color: "#64748b", texto: "Sin regiones en esta página" }]);
    expect(nombreDescarga("Bella Vista / RLA:1.pdf", 3)).toBe("regiones-Bella_Vista_RLA_1-p3.png");
  });
});
