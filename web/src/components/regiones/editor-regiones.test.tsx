import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RegionPlano, RegionesPlano } from "@/types";
import { renderWithProviders } from "@/test/render";
import { EditorRegiones } from "./editor-regiones";

const region = (id: string, extra: Partial<RegionPlano> = {}): RegionPlano => ({
  id,
  pagina: 1,
  tipo: "estacionamiento",
  puntos: [
    [0.1, 0.1],
    [0.3, 0.1],
    [0.3, 0.3],
    [0.1, 0.3],
  ],
  origen: "vision",
  confianza: 0.5,
  etiqueta: "",
  confirmada: false,
  editada: false,
  ...extra,
});

const DATOS: RegionesPlano = {
  version: 1,
  generado: "g1",
  paginas: { "1": { imagen: "r1.png", ancho_px: 200, alto_px: 100, escala: 200 }, "2": { imagen: "r2.png", ancho_px: 200, alto_px: 100 } },
  regiones: [region("r-a"), region("r-b", { tipo: "lote", origen: "vectorial", confianza: 0.7 }), region("r-c", { pagina: 2, tipo: "huella" })],
};

/**
 * Sin ResizeObserver real el lienzo mide 800×600: la lámina de 200×100 px se dibuja a escala 3.76 desde (24, 112).
 * El punto de pantalla (400, 300) cae en el centro de la página: fracción (0.5, 0.5).
 */
const CENTRO = { clientX: 400, clientY: 300 };

function montar(extra: Partial<Parameters<typeof EditorRegiones>[0]> = {}) {
  const onGuardar = vi.fn(async (regiones: RegionPlano[]) => ({ ...DATOS, regiones: regiones.map((r) => ({ ...r, confianza: r.confirmada ? 0.8 : r.confianza })) }));
  const onProponer = vi.fn();
  const descargar = vi.fn(async () => undefined);
  const vista = renderWithProviders(
    <EditorRegiones datos={DATOS} nombre="A-101.pdf" imagenUrl={(n) => `/img/${n}`} onGuardar={onGuardar} onProponer={onProponer} descargar={descargar} {...extra} />,
  );
  const lienzo = screen.getByRole("application", { name: /Lámina: A-101\.pdf, página 1/ });
  return { ...vista, onGuardar, onProponer, descargar, lienzo };
}

describe("EditorRegiones", () => {
  it("muestra las regiones de la página con su leyenda y el aviso de que no son medida exacta", () => {
    const { container } = montar();
    expect(screen.getByRole("note")).toHaveTextContent("Las regiones ayudan a revisar; no se toman como medida exacta.");
    expect(container.querySelectorAll("polygon[data-region]")).toHaveLength(2);
    const leyenda = screen.getByRole("list", { name: "Leyenda de regiones" });
    expect(within(leyenda).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Lote1", "Estacionamiento1"]);
    expect(container.querySelector('polygon[data-region="r-a"]')).toHaveAttribute("fill", "#7c3aed");
  });

  it("selecciona en la lámina o en la lista y muestra origen, confianza y estado", async () => {
    const user = userEvent.setup();
    const { container } = montar();
    fireEvent.pointerDown(container.querySelector('polygon[data-region="r-b"]')!);
    const detalle = screen.getByRole("region", { name: "Región elegida" });
    expect(detalle).toHaveTextContent("Origen: polígono del PDF · confianza 70 %");
    expect(detalle).toHaveTextContent("Propuesta sin revisar");
    await user.click(screen.getByRole("button", { name: /1\. Estacionamiento/ }));
    expect(screen.getByRole("region", { name: "Región elegida" })).toHaveTextContent("modelo de visión · confianza 50 %");
    expect(screen.getAllByRole("button", { name: /Vértice \d de 4/ })).toHaveLength(4);
  });

  it("arrastra un vértice, confirma la región y guarda con estado de guardado", async () => {
    const user = userEvent.setup();
    const { onGuardar, lienzo } = montar();
    await user.click(screen.getByRole("button", { name: /1\. Estacionamiento/ }));
    expect(screen.getByRole("status")).toHaveTextContent("Sin cambios");

    fireEvent.pointerDown(screen.getByRole("button", { name: "Vértice 1 de 4" }), { pointerId: 1 });
    fireEvent.pointerMove(lienzo, { pointerId: 1, ...CENTRO });
    fireEvent.pointerUp(lienzo, { pointerId: 1, ...CENTRO });
    const detalle = screen.getByRole("region", { name: "Región elegida" });
    expect(detalle).toHaveTextContent("Editada a mano");
    expect(detalle).toHaveTextContent("dibujada o editada a mano · confianza 70 %");
    expect(screen.getByRole("status")).toHaveTextContent("Cambios sin guardar");
    // Con cambios sin guardar no se propone de nuevo (se perderían).
    expect(screen.getByRole("button", { name: "Proponer de nuevo" })).toBeDisabled();

    await user.click(within(detalle).getByRole("button", { name: "Confirmar región" }));
    expect(screen.getByRole("region", { name: "Región elegida" })).toHaveTextContent("Confirmada");

    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Cambios guardados"));
    const enviadas = onGuardar.mock.calls[0][0];
    const a = enviadas.find((r) => r.id === "r-a")!;
    expect(a.puntos[0][0]).toBeCloseTo(0.5);
    expect(a.puntos[0][1]).toBeCloseTo(0.5);
    expect(a).toMatchObject({ confirmada: true, editada: true, origen: "humano" });
    expect(enviadas).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Proponer de nuevo" })).toBeEnabled();
  });

  it("muestra el error si no se pudo guardar", async () => {
    const user = userEvent.setup();
    montar({ onGuardar: vi.fn().mockRejectedValue(new Error("El tipo «x» no está permitido.")) });
    await user.click(screen.getByRole("button", { name: "Confirmar todas" }));
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("No se guardó: El tipo «x» no está permitido."));
  });

  it("con el teclado: mueve el vértice con flechas, lo quita con Supr y no deja menos de 3", async () => {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole("button", { name: /2\. Lote/ }));
    screen.getByRole("button", { name: "Vértice 2 de 4" }).focus();
    await user.keyboard("{Delete}");
    expect(screen.getAllByRole("button", { name: /Vértice \d de 3/ })).toHaveLength(3);
    screen.getByRole("button", { name: "Vértice 1 de 3" }).focus();
    await user.keyboard("{Delete}");
    expect(screen.getByRole("alert")).toHaveTextContent("al menos 3 vértices");
    await user.keyboard("{Shift>}{ArrowRight}{/Shift}");
    expect(screen.getByRole("region", { name: "Región elegida" })).toHaveTextContent("Editada a mano");
  });

  it("agrega un vértice con doble clic en un lado y cambia el tipo", async () => {
    const user = userEvent.setup();
    const { container } = montar();
    await user.click(screen.getByRole("button", { name: /1\. Estacionamiento/ }));
    fireEvent.doubleClick(container.querySelector('line[data-lado="0"]')!, { clientX: 24 + 3.76 * 40, clientY: 112 + 3.76 * 10 });
    expect(screen.getAllByRole("button", { name: /Vértice \d de 5/ })).toHaveLength(5);
    await user.selectOptions(screen.getByRole("combobox", { name: "Tipo" }), "acera");
    expect(screen.getByRole("list", { name: "Leyenda de regiones" })).toHaveTextContent("Acera1");
  });

  it("dibuja una región nueva con clics y Enter, y la quita", async () => {
    const user = userEvent.setup();
    const { lienzo, container } = montar();
    await user.selectOptions(screen.getByRole("combobox", { name: "Tipo de la región nueva" }), "tinaquera");
    await user.click(screen.getByRole("button", { name: "Dibujar región" }));
    fireEvent.click(lienzo, { clientX: 100, clientY: 150 });
    fireEvent.click(lienzo, { clientX: 100, clientY: 150 }); // repetido (doble clic): se ignora
    fireEvent.click(lienzo, { clientX: 300, clientY: 150 });
    expect(screen.getByRole("button", { name: /Cerrar región \(2 vértices\)/ })).toBeDisabled();
    fireEvent.click(lienzo, { clientX: 300, clientY: 250 });
    fireEvent.keyDown(lienzo, { key: "Enter" });
    expect(container.querySelectorAll("polygon[data-region]")).toHaveLength(3);
    const detalle = screen.getByRole("region", { name: "Región elegida" });
    expect(detalle).toHaveTextContent("Dibujada a mano");
    expect(screen.getByRole("list", { name: "Leyenda de regiones" })).toHaveTextContent("Tinaquera1");
    await user.click(within(detalle).getByRole("button", { name: "Quitar región" }));
    expect(container.querySelectorAll("polygon[data-region]")).toHaveLength(2);
  });

  it("cambia de página, propone con visión y descarga la imagen con la leyenda", async () => {
    const user = userEvent.setup();
    const { onProponer, descargar, container } = montar();
    await user.selectOptions(screen.getByRole("combobox", { name: "Página" }), "2");
    expect(container.querySelectorAll("polygon[data-region]")).toHaveLength(1);
    expect(container.querySelector("image")).toHaveAttribute("href", "/img/2");
    await user.click(screen.getByRole("button", { name: "Proponer con IA (visión)" }));
    expect(onProponer).toHaveBeenCalledWith(true);
    await user.click(screen.getByRole("button", { name: "Descargar imagen" }));
    expect(descargar).toHaveBeenCalledWith("/img/2", expect.objectContaining({ leyenda: [{ color: "#dc2626", texto: "Huella de la edificación: 1" }] }), "regiones-A-101-p2.png");
  });
});
