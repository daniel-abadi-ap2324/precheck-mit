// @vitest-environment node
import { describe, expect, it } from "vitest";
import { POST } from "./route";

const llamar = (cuerpo: unknown, cookie = "mp_session=demo") =>
  POST(new Request("http://x/api/validar-datos", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(cuerpo) }));

describe("POST /api/validar-datos", () => {
  it("sin sesión responde 401", async () => {
    expect((await llamar({ zona: "R2-A" }, "")).status).toBe(401);
  });

  it("devuelve los avisos del validador de Python", async () => {
    process.env.VALIDAR_DATOS_COMANDO = `node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify({avisos:[{campo:'zona',nivel:'aviso',mensaje:'recibí '+JSON.parse(s).zona,sugerencia:'R2'}]})))"`;
    const r = await llamar({ zona: "R2-A", norma: "PLOT", basura: "x" });
    expect(r.status).toBe(200);
    expect((await r.json()).avisos[0]).toMatchObject({ campo: "zona", mensaje: "recibí R2-A", sugerencia: "R2" });
    delete process.env.VALIDAR_DATOS_COMANDO;
  });

  it("si el validador falla responde 500 y no se cuelga", async () => {
    process.env.VALIDAR_DATOS_COMANDO = `node -e "process.exit(1)"`;
    expect((await llamar({ zona: "R2-A" })).status).toBe(500);
    delete process.env.VALIDAR_DATOS_COMANDO;
  });
});
