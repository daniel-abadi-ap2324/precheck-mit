import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FileUploader, type FileUploaderProps } from "./file-uploader";
import type { UploadItem } from "./types";

const file = (name: string, size = 2048) => new File([new Uint8Array(size)], name, { type: "application/octet-stream" });

const item = (over: Partial<UploadItem> = {}): UploadItem => ({
  id: "f1",
  name: "A-101 planta.pdf",
  size: 2048,
  format: "PDF",
  progress: 40,
  status: "uploading",
  ...over,
});

/** El componente es controlado: la subida la hace quien lo usa, aquí con funciones falsas. */
function setup(props: Partial<FileUploaderProps> = {}) {
  const handlers = { onAdd: vi.fn(), onRemove: vi.fn(), onReplace: vi.fn() };
  const view = render(<FileUploader items={[]} {...handlers} {...props} />);
  return { ...handlers, ...view };
}

describe("FileUploader", () => {
  it("rechaza una extensión no admitida con un mensaje claro y no la entrega", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const { onAdd } = setup();
    await user.upload(screen.getByTestId("plan-file-input"), file("memoria.docx"));

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("memoria.docx");
    expect(alert).toHaveTextContent("Formato no admitido. Use PDF, DWG, DXF o IFC.");
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.queryByRole("list", { name: "Planos cargados" })).not.toBeInTheDocument();
  });

  it("entrega un PDF válido a onAdd con su formato", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const { onAdd } = setup();
    await user.upload(screen.getByTestId("plan-file-input"), file("A-101 planta.pdf"));

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0][0]).toEqual([expect.objectContaining({ name: "A-101 planta.pdf", format: "PDF", size: 2048 })]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("muestra el avance mientras sube y lo oculta al quedar «Cargado»", () => {
    const { rerender, onAdd, onRemove, onReplace } = setup({ items: [item()] });
    const list = screen.getByRole("list", { name: "Planos cargados" });
    expect(within(list).getByText("A-101 planta.pdf")).toBeInTheDocument();
    expect(within(list).getByText("PDF")).toBeInTheDocument();
    expect(within(list).getByText("Cargando")).toBeInTheDocument();
    expect(within(list).getByRole("progressbar", { name: /Progreso de carga/ })).toBeInTheDocument();

    rerender(
      <FileUploader
        items={[item({ status: "uploaded", progress: 100 })]}
        onAdd={onAdd}
        onRemove={onRemove}
        onReplace={onReplace}
        announcement="A-101 planta.pdf cargado."
      />,
    );
    expect(within(list).getByText("Cargado")).toBeInTheDocument();
    expect(within(list).queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("A-101 planta.pdf cargado.");
  });

  it("muestra el error de un archivo que no se pudo cargar", () => {
    setup({ items: [item({ status: "failed", error: "Se cortó la conexión." })] });
    expect(screen.getByText("Error")).toBeInTheDocument();
    expect(screen.getByText("Se cortó la conexión.")).toBeInTheDocument();
  });

  it("quita y reemplaza un archivo por su id", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const { onRemove, onReplace } = setup({ items: [item({ status: "uploaded", progress: 100 })] });

    await user.click(screen.getByRole("button", { name: "Quitar A-101 planta.pdf" }));
    expect(onRemove).toHaveBeenCalledWith("f1");

    await user.click(screen.getByRole("button", { name: "Reemplazar A-101 planta.pdf" }));
    await user.upload(screen.getByTestId("plan-replace-input"), file("A-101 planta v2.dxf"));
    expect(onReplace).toHaveBeenCalledWith("f1", expect.objectContaining({ name: "A-101 planta v2.dxf", format: "DXF" }));
  });

  it("abre el selector con Enter desde la zona de arrastre", async () => {
    const user = userEvent.setup();
    setup();
    const input = screen.getByTestId("plan-file-input");
    let opened = 0;
    input.addEventListener("click", () => (opened += 1));
    screen.getByRole("button", { name: "Elegir archivos de planos" }).focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(opened).toBe(2);
  });
});
