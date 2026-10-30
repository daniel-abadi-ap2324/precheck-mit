import { afterEach, describe, expect, it, vi } from "vitest";
import { ejemplosDePlanos, estadoDelPlano, miniaturaUrl, subirPlano, usarEjemplo } from "./cliente";

/** XMLHttpRequest falso: permite emitir progreso y fijar la respuesta. */
class XhrFalso {
  static ultimo: XhrFalso;
  upload = { onprogress: null as ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null };
  status = 0;
  responseText = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  metodo = "";
  url = "";
  cuerpo: unknown;
  constructor() {
    XhrFalso.ultimo = this;
  }
  open(m: string, u: string) {
    this.metodo = m;
    this.url = u;
  }
  send(b: unknown) {
    this.cuerpo = b;
  }
  responder(status: number, body: unknown) {
    this.status = status;
    this.responseText = JSON.stringify(body);
    this.onload?.();
  }
}

describe("cliente de planos", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sube el archivo real a /api/planos con avance y devuelve su id", async () => {
    vi.stubGlobal("XMLHttpRequest", XhrFalso);
    const avance: number[] = [];
    const p = subirPlano(new File(["%PDF-1.7"], "A-101.pdf"), (n) => avance.push(n));
    const x = XhrFalso.ultimo;
    expect([x.metodo, x.url]).toEqual(["POST", "/api/planos"]);
    expect((x.cuerpo as FormData).get("file")).toBeInstanceOf(File);
    x.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 });
    x.responder(202, { id: "plan-1", status: "queued", fileName: "A-101.pdf" });
    expect(await p).toMatchObject({ id: "plan-1", status: "queued" });
    expect(avance).toEqual([50, 100]);
  });

  it("un rechazo del servidor llega con su mensaje; un fallo de red, con uno genérico", async () => {
    vi.stubGlobal("XMLHttpRequest", XhrFalso);
    const p = subirPlano(new File(["x"], "a.pdf"));
    XhrFalso.ultimo.responder(415, { code: "plano.formato", message: "El archivo no es un PDF válido." });
    await expect(p).rejects.toMatchObject({ code: "plano.formato", message: "El archivo no es un PDF válido." });
    const q = subirPlano(new File(["x"], "a.pdf"));
    XhrFalso.ultimo.onerror?.();
    await expect(q).rejects.toMatchObject({ code: "plano.red", message: "No se pudo enviar el archivo. Revise la conexión e inténtelo de nuevo." });
  });

  it("consulta el estado y la lectura", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "plan-1", status: "ready", extraccion: { documento: "a.pdf" } }))));
    expect(await estadoDelPlano("plan-1")).toMatchObject({ status: "ready", extraccion: { documento: "a.pdf" } });
    expect(miniaturaUrl("plan-1", 2)).toBe("/api/planos/plan-1/paginas/2");
  });

  it("lista los planos de ejemplo y pide leer uno", async () => {
    const f = vi.fn(async (url: string) =>
      url === "/api/planos/ejemplos" ? new Response(JSON.stringify({ items: [{ nombre: "Bella Vista - RLA-0000-6.pdf", sizeBytes: 10 }] })) : new Response("{}"),
    );
    vi.stubGlobal("fetch", f);
    expect(await ejemplosDePlanos()).toEqual([{ nombre: "Bella Vista - RLA-0000-6.pdf", sizeBytes: 10 }]);
    f.mockResolvedValueOnce(new Response(JSON.stringify({ id: "plan-2", status: "queued", fileName: "Bella Vista - RLA-0000-6.pdf" }), { status: 202 }));
    expect(await usarEjemplo("Bella Vista - RLA-0000-6.pdf")).toMatchObject({ id: "plan-2" });
    expect(f).toHaveBeenLastCalledWith("/api/planos/ejemplos", expect.objectContaining({ method: "POST", body: JSON.stringify({ nombre: "Bella Vista - RLA-0000-6.pdf" }) }));
  });
});
