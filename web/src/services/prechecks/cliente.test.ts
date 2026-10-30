import { afterEach, describe, expect, it, vi } from "vitest";
import { leerPreCheckReciente } from "./cliente";

const ok = () => new Response(JSON.stringify({ precheck: {}, project: {}, ia: null }), { status: 200 });

describe("leerPreCheckReciente", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("dos lecturas seguidas del mismo PreCheck hacen una sola petición", async () => {
    const fetch = vi.fn(async () => ok());
    vi.stubGlobal("fetch", fetch);
    await Promise.all([leerPreCheckReciente("pck-a"), leerPreCheckReciente("pck-a")]);
    await leerPreCheckReciente("pck-a");
    expect(fetch).toHaveBeenCalledTimes(1);
    await leerPreCheckReciente("pck-b");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("un error no se guarda: la siguiente lectura vuelve a pedir", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ code: "precheck.no_listo", message: "No termina." }), { status: 409 }));
    vi.stubGlobal("fetch", fetch);
    await expect(leerPreCheckReciente("pck-c")).rejects.toThrow("No termina.");
    fetch.mockImplementation(async () => ok());
    await expect(leerPreCheckReciente("pck-c")).resolves.toMatchObject({ ia: null });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
