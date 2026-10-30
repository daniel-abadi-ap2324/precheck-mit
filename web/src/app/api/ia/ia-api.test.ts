// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** SDK de Anthropic simulado: devuelve la respuesta que fija cada prueba y guarda la solicitud. */
const api = vi.hoisted(() => ({ respuesta: null as unknown, solicitud: null as unknown, error: null as unknown }));
vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {
    status?: number;
  }
  class AuthenticationError extends APIError {}
  class PermissionDeniedError extends APIError {}
  class RateLimitError extends APIError {}
  class APIConnectionError extends APIError {}
  class Anthropic {
    static APIError = APIError;
    static AuthenticationError = AuthenticationError;
    static PermissionDeniedError = PermissionDeniedError;
    static RateLimitError = RateLimitError;
    static APIConnectionError = APIConnectionError;
    beta = {
      messages: {
        stream: (p: unknown) => {
          api.solicitud = p;
          return { finalMessage: async () => (api.error ? Promise.reject(api.error) : api.respuesta) };
        },
      },
    };
  }
  return { default: Anthropic };
});

const IA = await import("./route");
const REVISION = await import("../prechecks/[id]/ia/route");
const REGISTRO = await import("../prechecks/[id]/ia/registro/route");
const { avisoDeProfundidad, contarHechosDocumentales, maxRetomas, datosQuePidenLasReglas, leerZonaDelPlano, esperarIa, explicarFalloClaude, promptClaudeCode } = await import("@/server/ia/revisar");
const { olvidarDisponibilidad } = await import("@/server/ia/config");

const LLAVE = "sk-ant-api03-PRUEBA0000000000000000000000";
const ID = "pck-11111111-2222-4333-8444-555555555555";
const conSesion = { cookie: "mp_session=demo-token", "content-type": "application/json" };
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
let dir: string;

const put = (cuerpo: unknown) => IA.PUT(new Request("http://localhost/api/ia", { method: "PUT", headers: conSesion, body: JSON.stringify(cuerpo) }));
const pedir = (cuerpo?: unknown) => REVISION.POST(new Request("http://localhost", { method: "POST", headers: conSesion, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) }), ctx(ID));
const estadoIa = async () => (await (await REVISION.GET(new Request("http://localhost", { headers: conSesion }), ctx(ID))).json()).ia;

/** Un PreCheck ya evaluado por el motor, con una regla en revisión. */
function precheckListo() {
  const run = join(dir, "prechecks", ID);
  mkdirSync(run, { recursive: true });
  writeFileSync(
    join(run, "estado.json"),
    JSON.stringify({ status: "done", projectId: "prj-1", planIds: [], datos: { nombreProyecto: "P", tramite: "RLA", fechaPresentacion: "2026-09-01", normaAplicable: "PLOT-A61-2021" }, createdAt: "x", updatedAt: "x" }),
  );
  writeFileSync(
    join(run, "resultado.json"),
    JSON.stringify({ resultados: [{ regla_id: "R-1", resultado: "REQUIERE_REVISION", fuente_norma: { norma: "N", articulo: "1", cita_textual: "cita" } }, { regla_id: "R-2", resultado: "CUMPLE" }] }),
  );
  writeFileSync(join(run, "hechos.json"), JSON.stringify({ lote: { area_m2: { valor: 600, confianza: 1 } } }));
  return run;
}

/** Claude Code falso (PRECHECK_CLAUDE_BIN): escribe dictamen.json en la carpeta de --add-dir. */
function claudeFalso(dictamen: unknown = { decisiones: [{ regla_id: "R-1", decision: "CUMPLE", justificacion: "600 m² ≥ 450 m²" }] }, salida = 0) {
  const script = join(dir, "claude.mjs");
  writeFileSync(
    script,
    `import { writeFileSync } from "node:fs";
     const a = process.argv.slice(2);
     if (a.includes("--version")) process.exit(0);
     let prompt = ""; process.stdin.on("data", (c) => (prompt += c)); process.stdin.on("end", () => {
       if (!prompt.includes("dictamen.json")) process.exit(3);
       if (!prompt.includes("NO leas dictámenes")) process.exit(4);
       console.log(JSON.stringify({ type: "system", subtype: "init" }));
       console.log(JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "Reviso la lámina 1" }, { type: "tool_use", name: "Read", input: { file_path: "p1.png" } }] } }));
       console.log(JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", content: [{ type: "image", source: { type: "base64", data: "A".repeat(5000) } }] }, { type: "tool_result", content: "ok datos" }] } }));
       writeFileSync(a[a.indexOf("--add-dir") + 1] + "/args.json", JSON.stringify(a));
       writeFileSync(a[a.indexOf("--add-dir") + 1] + "/dictamen.json", ${JSON.stringify(JSON.stringify(dictamen))});
       process.exit(${salida});
     });`,
  );
  process.env.PRECHECK_CLAUDE_BIN = `"${process.execPath}" "${script}"`;
  olvidarDisponibilidad();
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ia-api-"));
  process.env.IA_DIR = dir;
  process.env.PRECHECKS_DIR = join(dir, "prechecks");
  delete process.env.ANTHROPIC_API_KEY;
  process.env.PRECHECK_IA_RETOMAS = "0";
  delete process.env.PRECHECK_REVISOR;
  claudeFalso();
  api.respuesta = null;
  api.error = null;
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.PRECHECK_CLAUDE_BIN;
});

describe("/api/ia", () => {
  it("sin sesión responde 401", async () => {
    expect((await IA.GET(new Request("http://localhost/api/ia"))).status).toBe(401);
  });

  it("guarda la llave en el servidor y nunca la devuelve", async () => {
    const r = await put({ proveedor: "anthropic-api", llave: LLAVE });
    const texto = await r.text();
    expect(texto).not.toContain(LLAVE);
    expect(JSON.parse(texto)).toMatchObject({ proveedor: "anthropic-api", llaveConfigurada: true, origenLlave: "web", claudeCodeDisponible: true });
    expect(readFileSync(join(dir, "ia.secreto.json"), "utf8")).toContain(LLAVE);
    const get = await (await IA.GET(new Request("http://localhost/api/ia", { headers: conSesion }))).text();
    expect(get).not.toContain(LLAVE);
    await put({ llave: null });
    expect(existsSync(join(dir, "ia.secreto.json"))).toBe(false);
  });

  it("rechaza proveedor, modelo o llave inválidos", async () => {
    expect(await (await put({ proveedor: "otro" })).json()).toMatchObject({ code: "ia.proveedor_invalido" });
    expect(await (await put({ modelo: "gpt" })).json()).toMatchObject({ code: "ia.modelo_invalido" });
    expect(await (await put({ llave: "no-es-una-llave" })).json()).toMatchObject({ code: "ia.llave_invalida" });
  });

  it("rechaza un modelo de otro proveedor con un mensaje que dice cuáles valen, y no guarda nada", async () => {
    const r = await put({ proveedor: "deepseek-api", modelo: "claude-opus-5-5" });
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ code: "ia.modelo_ajeno", message: "El modelo claude-opus-5-5 no está disponible con DeepSeek. Modelos posibles: deepseek-flash." });
    // Sin cambiar de proveedor: el modelo se compara con el proveedor guardado.
    await put({ proveedor: "anthropic-api" });
    expect(await (await put({ modelo: "deepseek-flash" })).json()).toMatchObject({ code: "ia.modelo_ajeno" });
    expect(JSON.parse(readFileSync(join(dir, "ia.json"), "utf8"))).toEqual({ proveedor: "anthropic-api", modelo: "claude-sonnet-5-5", modeloEscaneados: null });
  });

  it("al cambiar de proveedor pasa a su modelo por defecto y solo lista los modelos de ese proveedor", async () => {
    await put({ proveedor: "claude-code", modelo: "claude-opus-5-5" });
    const ds = await (await put({ proveedor: "deepseek-api" })).json();
    expect(ds).toMatchObject({ proveedor: "deepseek-api", modelo: "deepseek-flash" });
    expect(ds.modelos.map((m: { id: string }) => m.id)).toEqual(["deepseek-flash"]);
    const cc = await (await put({ proveedor: "claude-code" })).json();
    expect(cc).toMatchObject({ proveedor: "claude-code", modelo: "claude-sonnet-5-5" });
    expect(cc.modelos.map((m: { id: string }) => m.id)).not.toContain("deepseek-flash");
    // Repetir el mismo proveedor no pisa el modelo elegido.
    await put({ modelo: "claude-opus-5-5" });
    expect(await (await put({ proveedor: "claude-code" })).json()).toMatchObject({ modelo: "claude-opus-5-5" });
  });

  it("el modelo para escaneados empieza en null, acepta cualquier modelo de la lista (de cualquier proveedor) y vuelve a null", async () => {
    const inicial = await (await IA.GET(new Request("http://localhost/api/ia", { headers: conSesion }))).json();
    expect(inicial.modeloEscaneados).toBeNull();
    expect(inicial.modelosEscaneados.map((m: { id: string }) => m.id)).toEqual(["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5", "claude-fable-5-1", "deepseek-flash"]);
    await put({ proveedor: "claude-code" });
    expect(await (await put({ modeloEscaneados: "deepseek-flash" })).json()).toMatchObject({ proveedor: "claude-code", modeloEscaneados: "deepseek-flash" });
    expect(await (await put({ modeloEscaneados: "gpt-5" })).json()).toMatchObject({ code: "ia.modelo_invalido" });
    // Cambiar de proveedor no la toca.
    expect(await (await put({ proveedor: "deepseek-api" })).json()).toMatchObject({ modeloEscaneados: "deepseek-flash" });
    expect(await (await put({ modeloEscaneados: null })).json()).toMatchObject({ modeloEscaneados: null });
    // Un valor que no es un modelo, escrito a mano en ia.json, se lee como null.
    writeFileSync(join(dir, "ia.json"), JSON.stringify({ proveedor: "claude-code", modelo: "claude-sonnet-5-5", modeloEscaneados: "sonnet" }));
    expect(await (await IA.GET(new Request("http://localhost/api/ia", { headers: conSesion }))).json()).toMatchObject({ modeloEscaneados: null });
  });

  it("GET informa el gasto acumulado de DeepSeek y si hay llave, sin mostrarla nunca", async () => {
    const { TOPE_USD } = await import("@/server/ia/deepseek");
    const LLAVE_DS = "sk-prueba-deepseek-0123456789";
    const antes = { key: process.env.DEEPSEEK_API_KEY, home: process.env.HOME, perfil: process.env.USERPROFILE };
    try {
      writeFileSync(join(dir, "deepseek_gasto.json"), JSON.stringify({ usd: 10.4, llamadas: 37, tokens_entrada: 1, tokens_salida: 1 }));
      process.env.DEEPSEEK_API_KEY = LLAVE_DS;
      const texto = await (await IA.GET(new Request("http://localhost/api/ia", { headers: conSesion }))).text();
      expect(texto).not.toContain(LLAVE_DS);
      expect(JSON.parse(texto).deepseek).toEqual({ llave: true, gastoUsd: 10.4, topeUsd: TOPE_USD, llamadas: 37 });
      // Sin variable y con un home vacío (sin ~/.config/precheck/deepseek.env): no hay llave y el gasto parte de cero.
      delete process.env.DEEPSEEK_API_KEY;
      process.env.HOME = dir;
      process.env.USERPROFILE = dir;
      rmSync(join(dir, "deepseek_gasto.json"));
      const sin = await (await IA.GET(new Request("http://localhost/api/ia", { headers: conSesion }))).json();
      expect(sin.deepseek).toEqual({ llave: false, gastoUsd: 0, topeUsd: TOPE_USD, llamadas: 0 });
    } finally {
      for (const [k, v] of [["DEEPSEEK_API_KEY", antes.key], ["HOME", antes.home], ["USERPROFILE", antes.perfil]] as const) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
});

describe("POST /api/prechecks/[id]/ia", () => {
  it("con Claude Code: el agente escribe dictamen.json y el estado pasa a «done»", async () => {
    const run = precheckListo();
    await put({ proveedor: "claude-code" });
    expect((await pedir()).status).toBe(202);
    await esperarIa();
    expect(await estadoIa()).toMatchObject({ status: "done", proveedor: "claude-code" });
    expect(JSON.parse(readFileSync(join(run, "dictamen.json"), "utf8")).decisiones[0].regla_id).toBe("R-1");
  });

  it("si el agente se corta después de escribir un dictamen válido, se usa", async () => {
    const run = precheckListo();
    claudeFalso(undefined, 1);
    await put({ proveedor: "claude-code" });
    await pedir();
    await esperarIa();
    expect(await estadoIa()).toMatchObject({ status: "done" });
    expect(existsSync(join(run, "dictamen.json"))).toBe(true);
  });

  it("guarda el registro de lo que hizo la IA y lo sirve detrás de la sesión", async () => {
    const run = precheckListo();
    await put({ proveedor: "claude-code" });
    await pedir();
    await esperarIa();
    const txt = readFileSync(join(run, "ia.log.txt"), "utf8");
    expect(txt).toContain("Mensaje: Reviso la lámina 1");
    expect(txt).toContain("Herramienta → Read: p1.png");
    expect(txt).toContain("Resultado: ok datos");
    expect(txt).toContain("Dictamen válido guardado.");
    const jsonl = readFileSync(join(run, "ia.log.jsonl"), "utf8").trim().split("\n");
    expect(jsonl.map((l) => JSON.parse(l).type)).toEqual(["system", "assistant", "user"]);
    expect(readFileSync(join(run, "ia.log.jsonl"), "utf8")).toContain("[imagen omitida: 5000 caracteres base64]");
    expect(readFileSync(join(run, "ia.log.jsonl"), "utf8")).not.toContain("AAAAAAAAAA");

    const pedirRegistro = (query: string, headers: Record<string, string> = conSesion) =>
      REGISTRO.GET(new Request(`http://localhost/api/registro${query}`, { headers }), ctx(ID));
    expect((await pedirRegistro("", {})).status).toBe(401);
    expect(await (await pedirRegistro("?formato=txt")).text()).toContain("Mensaje: Reviso la lámina 1");
    const descarga = await pedirRegistro("?formato=jsonl&descargar=1");
    expect(descarga.headers.get("content-disposition")).toContain(`${ID}-ia.log.jsonl`);
  });

  it("el modelo elegido para esta revisión manda sobre el de Configuración", async () => {
    const run = precheckListo();
    await put({ proveedor: "claude-code", modelo: "claude-sonnet-5-5" });
    expect((await pedir({ modelo: "claude-opus-5-5" })).status).toBe(202);
    await esperarIa();
    expect(await estadoIa()).toMatchObject({ status: "done", modelo: "claude-opus-5-5" });
    const args = JSON.parse(readFileSync(join(run, "args.json"), "utf8")) as string[];
    expect(args[args.indexOf("--model") + 1]).toBe("claude-opus-5-5");
    // Sin elegir, usa el de Configuración.
    await pedir();
    await esperarIa();
    expect(await estadoIa()).toMatchObject({ modelo: "claude-sonnet-5-5" });
  });

  it("el proveedor sale del modelo pedido: DeepSeek con Claude Code configurado corre con DeepSeek (y al revés)", async () => {
    precheckListo();
    // Con Claude Code configurado y sin llave de DeepSeek: la petición de deepseek-flash intenta DeepSeek (409 por la
    // llave), no Claude Code (que la habría encolado con el modelo equivocado).
    const antes = { key: process.env.DEEPSEEK_API_KEY, home: process.env.HOME, perfil: process.env.USERPROFILE };
    try {
      delete process.env.DEEPSEEK_API_KEY;
      process.env.HOME = dir;
      process.env.USERPROFILE = dir;
      await put({ proveedor: "claude-code" });
      const r = await pedir({ modelo: "deepseek-flash" });
      expect(r.status).toBe(409);
      expect(await r.json()).toMatchObject({ code: "ia.no_disponible", message: expect.stringMatching(/llave de DeepSeek/) });
    } finally {
      for (const [k, v] of [["DEEPSEEK_API_KEY", antes.key], ["HOME", antes.home], ["USERPROFILE", antes.perfil]] as const) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
    // Con DeepSeek configurado, un modelo Claude corre con Claude Code: así un lote con los dos proveedores no cambia la configuración entre encolados.
    await put({ proveedor: "deepseek-api" });
    const r = await pedir({ modelo: "claude-opus-5-5" });
    expect(r.status).toBe(202);
    expect((await r.json()).ia).toMatchObject({ proveedor: "claude-code", modelo: "claude-opus-5-5" });
    await esperarIa();
    expect(await estadoIa()).toMatchObject({ status: "done", proveedor: "claude-code", modelo: "claude-opus-5-5" });
    await put({ proveedor: "claude-code" });
  });

  it("política de escaneados: un plano escaneado corre con el modelo de Configuración y el estado dice cuál se pidió", async () => {
    const run = precheckListo();
    const paginas = (tipos: string[]) => writeFileSync(join(run, "extraccion.json"), JSON.stringify({ paginas: tipos.map((tipo, i) => ({ numero: i + 1, tipo })) }));
    const modeloDeArgs = () => {
      const args = JSON.parse(readFileSync(join(run, "args.json"), "utf8")) as string[];
      return args[args.indexOf("--model") + 1];
    };
    paginas(["escaneada", "escaneada", "vectorial"]);
    // Sin política (por defecto): corre el modelo pedido, también con el plano escaneado.
    await put({ proveedor: "claude-code", modelo: "claude-sonnet-5-5" });
    await pedir();
    await esperarIa();
    expect(await estadoIa()).toMatchObject({ status: "done", modelo: "claude-sonnet-5-5" });
    expect((await estadoIa()).modeloPedido).toBeUndefined();

    await put({ modeloEscaneados: "claude-opus-5-5" });
    const r = await pedir({ modelo: "claude-haiku-5-5" });
    expect((await r.json()).ia).toMatchObject({ status: "running", modelo: "claude-opus-5-5", modeloPedido: "claude-haiku-5-5", enrutado: expect.stringMatching(/plano escaneado/) });
    await esperarIa();
    expect(await estadoIa()).toMatchObject({ status: "done", proveedor: "claude-code", modelo: "claude-opus-5-5", modeloPedido: "claude-haiku-5-5", enrutado: expect.stringMatching(/se pidió claude-haiku-5-5 y revisa claude-opus-5-5/) });
    expect(modeloDeArgs()).toBe("claude-opus-5-5");
    expect(readFileSync(join(run, "ia.log.txt"), "utf8")).toMatch(/Enrutamiento: plano escaneado/);

    // La mitad o menos de las hojas escaneadas: no se desvía.
    paginas(["escaneada", "vectorial"]);
    await pedir({ modelo: "claude-haiku-5-5" });
    await esperarIa();
    expect(await estadoIa()).toMatchObject({ status: "done", modelo: "claude-haiku-5-5" });
    expect((await estadoIa()).enrutado).toBeUndefined();
    expect(modeloDeArgs()).toBe("claude-haiku-5-5");
    await put({ modeloEscaneados: null });
  });

  it("política de escaneados hacia otro proveedor: valida la llave de ese proveedor", async () => {
    const run = precheckListo();
    writeFileSync(join(run, "extraccion.json"), JSON.stringify({ paginas: [{ numero: 1, tipo: "escaneada" }] }));
    const antes = { key: process.env.DEEPSEEK_API_KEY, home: process.env.HOME, perfil: process.env.USERPROFILE };
    try {
      delete process.env.DEEPSEEK_API_KEY;
      process.env.HOME = dir;
      process.env.USERPROFILE = dir;
      await put({ proveedor: "claude-code", modeloEscaneados: "deepseek-flash" });
      const r = await pedir({ modelo: "claude-sonnet-5-5" });
      expect(r.status).toBe(409);
      expect(await r.json()).toMatchObject({ message: expect.stringMatching(/llave de DeepSeek/) });
    } finally {
      for (const [k, v] of [["DEEPSEEK_API_KEY", antes.key], ["HOME", antes.home], ["USERPROFILE", antes.perfil]] as const) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      await put({ modeloEscaneados: null });
    }
  });

  it("rechaza un modelo que no está en la lista", async () => {
    precheckListo();
    for (const modelo of ["gpt-5", 7]) {
      const r = await pedir({ modelo });
      expect(r.status).toBe(400);
      expect(await r.json()).toMatchObject({ code: "ia.modelo_invalido" });
    }
  });

  it("lanza Claude Code sin hooks de plugins y, si se detiene sin dictamen, dice el motivo", async () => {
    const run = precheckListo();
    claudeFalso();
    await put({ proveedor: "claude-code" });
    await pedir();
    await esperarIa();
    const args = JSON.parse(readFileSync(join(run, "args.json"), "utf8")) as string[];
    expect(JSON.parse(args[args.indexOf("--settings") + 1])).toEqual({ disableAllHooks: true });

    // Claude Code se detiene por un hook y no deja dictamen.
    const script = join(dir, "claude-parado.mjs");
    writeFileSync(
      script,
      `const a = process.argv.slice(2);
       if (a.includes("--version")) process.exit(0);
       process.stdin.resume(); process.stdin.on("end", () => { console.log(JSON.stringify({ type: "result", subtype: "success", terminal_reason: "hook_stopped", num_turns: 54, duration_ms: 1000 })); });`,
    );
    process.env.PRECHECK_CLAUDE_BIN = `"${process.execPath}" "${script}"`;
    olvidarDisponibilidad();
    await pedir();
    await esperarIa();
    expect(await estadoIa()).toMatchObject({ status: "failed", error: expect.stringMatching(/hook_stopped.*un hook lo detuvo/) });
    expect(existsSync(join(run, "dictamen.json"))).toBe(false);
  });

  it("una caída de red se reintenta una vez; si persiste, el mensaje habla de internet y no de la sesión", async () => {
    const run = precheckListo();
    process.env.PRECHECK_IA_ESPERA_REINTENTO_MS = "10";
    const marca = join(dir, "intento");
    const script = join(dir, "claude-red.mjs");
    const dictamen = JSON.stringify({ decisiones: [{ regla_id: "R-1", decision: "CUMPLE", justificacion: "ok" }] });
    writeFileSync(
      script,
      `import { existsSync, writeFileSync } from "node:fs";
       const a = process.argv.slice(2);
       if (a.includes("--version")) process.exit(0);
       process.stdin.resume(); process.stdin.on("end", () => {
         if (!existsSync(${JSON.stringify(marca)}) || process.env.SIEMPRE_FALLA) {
           writeFileSync(${JSON.stringify(marca)}, "1");
           console.log(JSON.stringify({ type: "result", is_error: true, result: "API Error: Can't reach the API server — check your internet or DNS (ENOTFOUND)" }));
           process.exit(1);
         }
         writeFileSync(a[a.indexOf("--add-dir") + 1] + "/dictamen.json", ${JSON.stringify(dictamen)});
       });`,
    );
    process.env.PRECHECK_CLAUDE_BIN = `"${process.execPath}" "${script}"`;
    olvidarDisponibilidad();
    await put({ proveedor: "claude-code" });
    await pedir();
    await esperarIa();
    expect(await estadoIa()).toMatchObject({ status: "done" });
    expect(readFileSync(join(run, "ia.log.txt"), "utf8")).toContain("Reintentando en 30 segundos");

    // Si la red sigue caída, falla con un mensaje de red.
    rmSync(join(run, "dictamen.json"), { force: true });
    rmSync(marca, { force: true });
    process.env.SIEMPRE_FALLA = "1";
    await pedir();
    await esperarIa();
    delete process.env.SIEMPRE_FALLA;
    expect(await estadoIa()).toMatchObject({ status: "failed", error: expect.stringMatching(/conexión con la API de Anthropic \(internet o DNS\)/) });
  });

  it("sin registro, la ruta responde 404", async () => {
    precheckListo();
    expect((await REGISTRO.GET(new Request("http://localhost/api/registro", { headers: conSesion }), ctx(ID))).status).toBe(404);
  });

  it("un dictamen inválido no se guarda y el estado explica el fallo", async () => {
    const run = precheckListo();
    claudeFalso({ decisiones: [{ regla_id: "R-1", decision: "TAL_VEZ" }] });
    await put({ proveedor: "claude-code" });
    await pedir();
    await esperarIa();
    expect(await estadoIa()).toMatchObject({ status: "failed", error: expect.stringMatching(/no tiene la forma esperada/) });
    expect(existsSync(join(run, "dictamen.json"))).toBe(false);
  });

  it("con la API: envía solo las reglas en revisión y guarda las decisiones de esas reglas", async () => {
    const run = precheckListo();
    await put({ proveedor: "anthropic-api", llave: LLAVE });
    api.respuesta = {
      stop_reason: "end_turn",
      model: "claude-sonnet-5-5",
      content: [
        {
          type: "text",
          text: JSON.stringify({
            conclusion: "CUMPLE CON OBSERVACIONES",
            supuestos: [],
            decisiones: [
              { regla_id: "R-1", decision: "OBSERVACION", estado: "INFORMACION_REQUERIDA", valor_leido: "", limite: "", justificacion: "Falta la CEUS.", subsanar: "Presentar la CEUS.", evidencia: [{ pagina: 0, detalle: "dato del usuario" }] },
              { regla_id: "INVENTADA", decision: "CUMPLE", estado: "", valor_leido: "", limite: "", justificacion: "x", subsanar: "", evidencia: [] },
            ],
          }),
        },
      ],
    };
    await pedir();
    await esperarIa();
    expect(await estadoIa()).toMatchObject({ status: "done", proveedor: "anthropic-api" });
    const enviado = api.solicitud as { model: string; messages: { content: string }[]; output_config: { format: { type: string } } };
    expect(enviado.model).toBe("claude-sonnet-5-5");
    expect(enviado.output_config.format.type).toBe("json_schema");
    expect(enviado.messages[0].content).toContain("R-1");
    expect(enviado.messages[0].content).not.toContain(LLAVE);
    const dictamen = JSON.parse(readFileSync(join(run, "dictamen.json"), "utf8"));
    expect(dictamen.decisiones).toEqual([expect.objectContaining({ regla_id: "R-1", estado: "INFORMACION_REQUERIDA", evidencia: [{ pagina: null, detalle: "dato del usuario" }] })]);
  });

  it("sin llave, o con la IA apagada, no empieza", async () => {
    precheckListo();
    await put({ proveedor: "anthropic-api" });
    expect(await (await pedir()).json()).toMatchObject({ code: "ia.no_disponible", message: expect.stringMatching(/llave/) });
    await put({ proveedor: "ninguno" });
    expect(await (await pedir()).json()).toMatchObject({ code: "ia.no_disponible", message: expect.stringMatching(/apagada/) });
  });

  it("una revisión que quedó «en curso» sin trabajo en el servidor (reinicio) aparece como interrumpida y se puede repetir", async () => {
    const run = precheckListo();
    const estado = JSON.parse(readFileSync(join(run, "estado.json"), "utf8"));
    writeFileSync(join(run, "estado.json"), JSON.stringify({ ...estado, ia: { status: "running", proveedor: "claude-code", modelo: "claude-sonnet-5-5", actualizadoEn: "x" } }));
    expect(await estadoIa()).toMatchObject({ status: "failed", error: expect.stringMatching(/interrumpió/) });
    await put({ proveedor: "claude-code" });
    expect((await pedir()).status).toBe(202);
    await esperarIa();
    expect(await estadoIa()).toMatchObject({ status: "done" });
  });
});

describe("explicarFalloClaude", () => {
  it("dice la causa real en lugar de culpar siempre a la sesión", () => {
    expect(explicarFalloClaude("[31m--agent 'revisor-planos' not found. Available agents: claude, Explore")).toMatch(/no encontró el agente revisor-planos.*LF/);
    expect(explicarFalloClaude("Error: Not logged in · Please run /login")).toMatch(/claude \/login/);
    expect(explicarFalloClaude("API Error: 529 overloaded")).toMatch(/límite de uso o saturación/);
    expect(explicarFalloClaude("Invalid model: claude-xyz")).toMatch(/no reconoce el modelo/);
    expect(explicarFalloClaude("algo raro pasó")).toBe("Claude Code terminó con error: algo raro pasó (el detalle está en el registro de la IA).");
    expect(explicarFalloClaude("")).toMatch(/sin dar detalle/);
  });
});

describe("avisoDeProfundidad", () => {
  it("avisa si la revisión fue muy corta o propuso muy pocos hallazgos, y calla si fue completa", () => {
    const tres = [{ regla_id: "HALLAZGO-LAMINAS-FALTANTES" }, { regla_id: "HALLAZGO-1" }, { regla_id: "HALLAZGO-2" }, { regla_id: "R-1" }];
    expect(avisoDeProfundidad(tres, 12, "claude-code")).toBeUndefined();
    // La duración sola no alarma: Sonnet termina en 2 a 4 min con 9 hallazgos.
    expect(avisoDeProfundidad(tres, 2, "claude-code")).toBeUndefined();
    expect(avisoDeProfundidad([{ regla_id: "R-1" }, { regla_id: "HALLAZGO-1" }], 15, "claude-code")).toMatch(/propuso 1 hallazgo fuera del catálogo/);
    expect(avisoDeProfundidad([{ regla_id: "R-1" }], 1.2, "claude-code")).toMatch(/terminó en 1 min y propuso 0 hallazgos/);
    // La API no tiene duración que valga: solo cuentan los hallazgos.
    expect(avisoDeProfundidad([{ regla_id: "R-1" }], 0.1, "anthropic-api")).toMatch(/^Revisión posiblemente superficial: propuso 0 hallazgos/);
  });
});

describe("requisitos documentales: la IA escribe hechos, no decisiones", () => {
  const estado = { datos: { tramite: "RLA", fechaPresentacion: "2026-10-07", normaAplicable: "PLOT-A61-2021" } } as Parameters<typeof promptClaudeCode>[2];

  it("contarHechosDocumentales cuenta solo los plano.… que escribió la revisión (no los del usuario ni los del extractor)", () => {
    const lote = {
      plano: {
        pie_descriptivo: { escala: { valor: true, confianza: 0.89, fuente: { metodo: "pdf_texto" } }, fecha_presentacion: { valor: true, confianza: 0.9, fuente: { metodo: "vision" } } },
        tinaquera: { presente: { valor: false, confianza: 0.9, fuente: { metodo: "vision" } } },
      },
      lote: { area_m2: { valor: 100, confianza: 1, fuente: { metodo: "vision" } } },
    };
    expect(contarHechosDocumentales(lote)).toBe(2);
    expect(contarHechosDocumentales(null)).toBe(0);
    expect(contarHechosDocumentales({ plano: {} })).toBe(0);
  });

  it("con 10 hechos documentales escritos no avisa de revisión superficial aunque haya pocos hallazgos propios", () => {
    expect(avisoDeProfundidad([{ regla_id: "R-1" }], 15, "claude-code", 10)).toBeUndefined();
    expect(avisoDeProfundidad([{ regla_id: "R-1" }], 15, "claude-code", 9)).toMatch(/superficial/);
  });

  it("datosQuePidenLasReglas adjunta la definición a los datos documentales y el prompt la lista", async () => {
    const carpeta = join(dir, "doc-defs");
    mkdirSync(carpeta, { recursive: true });
    writeFileSync(join(carpeta, "resultado.json"), JSON.stringify({ resultados: [{ regla_id: "A110-AIII-5-CODIGO-ZONA", resultado: "REQUIERE_REVISION" }] }));
    const lista = await datosQuePidenLasReglas(carpeta);
    const zona = lista.find((d) => d.clave === "plano.localizacion_general.codigo_zona_indicado");
    expect(zona?.reglas).toBe(1);
    expect(zona?.definicion).toMatch(/^sí\/no: .*código de zonificación/);
    // El criterio operativo (si lo hay) va detrás de la definición, para que todos los modelos decidan igual.
    const conCriterio = join(dir, "con-criterio.json");
    writeFileSync(conCriterio, JSON.stringify({ datos: [{ clave: "plano.localizacion_general.codigo_zona_indicado", tipo: "bool", definicion: "código de zona", criterio: "sí si está impreso" }] }));
    const lista2 = await datosQuePidenLasReglas(carpeta, undefined, undefined, conCriterio);
    expect(lista2.find((d) => d.clave === "plano.localizacion_general.codigo_zona_indicado")?.definicion).toBe("sí/no: código de zona CRITERIO: sí si está impreso");
    // Un dato universal (no documental) con criterio de medida también lo lleva.
    const universales = join(dir, "universales-criterio.json");
    writeFileSync(universales, JSON.stringify({ datos: [{ clave: "proyecto.retiro_posterior_m", criterio: "lindero opuesto al frente" }] }));
    const lista3 = await datosQuePidenLasReglas(carpeta, undefined, universales, conCriterio);
    expect(lista3.find((d) => d.clave === "proyecto.retiro_posterior_m")?.definicion).toBe("CRITERIO: lindero opuesto al frente");
    const sinDefiniciones = await datosQuePidenLasReglas(carpeta, undefined, join(dir, "sin-universales.json"), join(dir, "sin-definiciones.json"));
    expect(sinDefiniciones.every((d) => d.definicion === undefined)).toBe(true);
    const p = promptClaudeCode("C:/x", null, estado, lista);
    expect(p).toContain("Qué comprobar en los datos documentales");
    expect(p).toContain("plano.localizacion_general.codigo_zona_indicado = sí/no:");
    expect(p).toContain("No los decidas en decisiones");
    expect(promptClaudeCode("C:/x", null, estado, [{ clave: "lote.area_m2", reglas: 1 }])).not.toContain("Qué comprobar en los datos documentales");
  });
});

describe("la zona en el prompt: el código del usuario es un dato por verificar", () => {
  const estado = (codigoZona?: string) => ({ datos: { tramite: "RLA", fechaPresentacion: "2026-09-01", normaAplicable: "PLOT-A61-2021", ...(codigoZona ? { codigoZona } : {}) } }) as Parameters<typeof promptClaudeCode>[2];

  it("si el plano dice otra zona, se lo dice a la IA y le pide el polígono del lote, no los vecinos", () => {
    const p = promptClaudeCode("C:/x", null, estado("1ZM7"), [], { codigoPlano: "RM3-C2", avisos: ["ZONA_DISCREPANTE: el usuario indicó la zona '1ZM7' pero el plano declara 'RM3-C2'."] });
    expect(p).toContain("indicado por el usuario: 1ZM7");
    expect(p).toContain("«RM3-C2»");
    expect(p).toContain("NO COINCIDEN");
    expect(p).toContain("no los lotes vecinos");
    expect(p).not.toContain("Datos confirmados por el usuario");
  });

  it("sin discrepancia no alarma; sin zona del usuario pide determinarla", () => {
    expect(promptClaudeCode("C:/x", null, estado("1ZM7"), [], { codigoPlano: "1ZM7", avisos: [] })).not.toContain("NO COINCIDEN");
    const sin = promptClaudeCode("C:/x", null, estado(), [], { codigoPlano: "RM3-C2", avisos: [] });
    expect(sin).toContain("no indicó el código de zona");
    expect(sin).toContain("«RM3-C2»");
  });

  it("leerZonaDelPlano toma el código del extractor (solo si está ok) y los avisos del motor", async () => {
    const carpeta = join(dir, "zona-plano");
    mkdirSync(carpeta, { recursive: true });
    writeFileSync(join(carpeta, "extraccion.json"), JSON.stringify({ hechos: [{ hecho: "plano.zonificacion_declarada", valor: "RM3-C2", estado: "ok" }] }));
    writeFileSync(join(carpeta, "resultado.json"), JSON.stringify({ avisos: ["ZONA_DISCREPANTE: x", "otro"] }));
    expect(await leerZonaDelPlano(carpeta)).toEqual({ codigoPlano: "RM3-C2", avisos: ["ZONA_DISCREPANTE: x", "otro"] });
    writeFileSync(join(carpeta, "extraccion.json"), JSON.stringify({ hechos: [{ hecho: "plano.zonificacion_declarada", valor: "RM3-C2", estado: "revision" }] }));
    expect((await leerZonaDelPlano(carpeta)).codigoPlano).toBeNull();
    expect(await leerZonaDelPlano(join(dir, "no-existe"))).toEqual({ codigoPlano: null, avisos: [] });
  });
});

describe("datosQuePidenLasReglas: la lista de datos sale de las reglas que aplican, no de una lista fija", () => {
  const conResultado = (ids: string[]) => {
    const carpeta = join(dir, "lista-datos");
    mkdirSync(carpeta, { recursive: true });
    writeFileSync(join(carpeta, "resultado.json"), JSON.stringify({ resultados: ids.map((regla_id) => ({ regla_id, resultado: "REQUIERE_REVISION" })) }));
    return carpeta;
  };

  it("suma los datos universales de todo anteproyecto (scripts/datos_universales.json) aunque ninguna regla aplicable los use", async () => {
    const lista = await datosQuePidenLasReglas(conResultado(["PLOT-R1-LOTE-AREA"]));
    const claves = lista.map((d) => d.clave);
    for (const k of ["lote.finca", "lote.area_m2", "proyecto.retiro_posterior_m", "proyecto.acera_ancho_m", "acceso_vehicular.rotura_cordon_m", "plano.intervalo_curvas_nivel_m"]) expect(claves).toContain(k);
    expect(lista.find((d) => d.clave === "lote.area_m2")?.reglas).toBe(1);
    expect(lista.find((d) => d.clave === "lote.finca")?.reglas).toBe(0);
    expect(claves.length).toBeGreaterThanOrEqual(19);
  });

  it("junta las entradas de las reglas evaluadas (catálogos reales) y cuenta cuántas reglas usan cada una", async () => {
    const lista = await datosQuePidenLasReglas(conResultado(["PLOT-R1-DENSIDAD", "PLOT-R1-LOTE-AREA", "PLOT-R1-LOTE-FRENTE"]), undefined, join(dir, "no-existe.json"));
    expect(lista.map((d) => d.clave).sort()).toEqual(["lote.area_m2", "lote.frente_m", "proyecto.densidad_pers_ha"]);
    expect(lista.every((d) => d.reglas === 1)).toBe(true);
  });

  it("depende de la norma: otras reglas dan otra lista, y los datos ajenos al plano (norma, zona, registro) no se piden", async () => {
    const a = await datosQuePidenLasReglas(conResultado(["PLOT-R1-LOTE-AREA"]), undefined, join(dir, "no-existe.json"));
    const b = await datosQuePidenLasReglas(conResultado(["CA-RMH1-DENSIDAD-PB-PB1", "CA-RMH1-DENSIDAD-PB2"]), undefined, join(dir, "no-existe.json"), join(dir, "sin-definiciones.json"));
    expect(a.map((d) => d.clave)).toEqual(["lote.area_m2"]);
    expect(b).toEqual([{ clave: "proyecto.densidad_pers_ha", reglas: 2 }]);
    expect([...a, ...b].some((d) => /norma_aplicable|codigo_zona|registro_publico|^tramite$/.test(d.clave))).toBe(false);
  });

  it("el prompt lleva esa lista, con cuántas reglas usan cada dato; sin lista, pide mirar las entradas de las reglas", () => {
    const estado = { datos: { tramite: "RLA", fechaPresentacion: "2026-09-01", normaAplicable: "PLOT-A61-2021" } } as Parameters<typeof promptClaudeCode>[2];
    const con = promptClaudeCode("C:/x", null, estado, [{ clave: "lote.area_m2", reglas: 5 }, { clave: "proyecto.altura_m", reglas: 2 }]);
    expect(con).toContain("lote.area_m2 (5), proyecto.altura_m (2)");
    expect(con).toContain("datos_pedidos.py");
    expect(con).not.toContain("proyecto.retiro_lateral_m");
    expect(promptClaudeCode("C:/x", null, estado)).toContain("mira las entradas de esas reglas con grep en reglas/");
  });
});

describe("segunda pasada dirigida: el servidor reabre la sesión de la IA con lo pendiente", () => {
  const NL = String.fromCharCode(10);

  /** Claude Code falso que anota cada llamada (argumentos y mensaje) y deja el dictamen en la primera. */
  function claudeDeRetoma(salidaDeLaRetoma = 0) {
    const script = join(dir, "claude-retoma.mjs");
    const llamadas = join(dir, "llamadas.jsonl");
    writeFileSync(
      script,
      `import { appendFileSync, writeFileSync } from "node:fs";
       const a = process.argv.slice(2);
       if (a.includes("--version")) process.exit(0);
       let prompt = ""; process.stdin.on("data", (c) => (prompt += c)); process.stdin.on("end", () => {
         appendFileSync(${JSON.stringify(llamadas)}, JSON.stringify({ args: a, prompt }) + String.fromCharCode(10));
         const reanuda = a.includes("--resume");
         const sesion = a[a.indexOf(reanuda ? "--resume" : "--session-id") + 1];
         console.log(JSON.stringify({ type: "system", subtype: "init", session_id: sesion }));
         if (!reanuda) writeFileSync(a[a.indexOf("--add-dir") + 1] + "/dictamen.json", JSON.stringify({ decisiones: [{ regla_id: "R-1", decision: "CUMPLE", justificacion: "ok" }] }));
         process.exit(reanuda ? ${salidaDeLaRetoma} : 0);
       });`,
    );
    process.env.PRECHECK_CLAUDE_BIN = `"${process.execPath}" "${script}"`;
    olvidarDisponibilidad();
    return () => readFileSync(llamadas, "utf8").split(NL).filter(Boolean).map((l) => JSON.parse(l) as { args: string[]; prompt: string });
  }

  /** Motor falso (PRECHECK_REVISOR): en la 1.ª evaluación deja `pendientes` reglas en revisión por datos; en las siguientes, todo decidido. */
  function motorFalso(motivos: string[]) {
    const script = join(dir, "motor-retoma.mjs");
    const cuenta = join(dir, "evaluaciones.txt");
    writeFileSync(
      script,
      `import { appendFileSync, readFileSync, existsSync, writeFileSync } from "node:fs";
       const a = process.argv.slice(2); const salida = a[a.indexOf("--salida") + 1];
       const n = existsSync(${JSON.stringify(cuenta)}) ? readFileSync(${JSON.stringify(cuenta)}, "utf8").length : 0;
       appendFileSync(${JSON.stringify(cuenta)}, "x");
       const motivos = ${JSON.stringify(motivos)};
       const resultados = [{ regla_id: "R-1", resultado: "CUMPLE" }, ...motivos.map((m, i) => (n === 0 ? { regla_id: "R-" + (i + 2), resultado: "REQUIERE_REVISION", motivo: m } : { regla_id: "R-" + (i + 2), resultado: "CUMPLE" }))];
       writeFileSync(salida + "/resultado.json", JSON.stringify({ resultados }));`,
    );
    process.env.PRECHECK_REVISOR = `"${process.execPath}" "${script}"`;
    return () => (existsSync(cuenta) ? readFileSync(cuenta, "utf8").length : 0);
  }

  const DATOS = ["dato faltante: proyecto.altura_m", "dato faltante: proyecto.pisos_totales", "dato faltante: proyecto.ocupacion_pct"];

  it("por defecto hay una retoma", () => {
    delete process.env.PRECHECK_IA_RETOMAS;
    expect(maxRetomas()).toBe(1);
    process.env.PRECHECK_IA_RETOMAS = "0";
    expect(maxRetomas()).toBe(0);
    process.env.PRECHECK_IA_RETOMAS = "9";
    expect(maxRetomas()).toBe(1);
  });

  it("con datos pendientes reabre la misma sesión, les pide solo eso y deja el estado terminado con el antes y el después", async () => {
    precheckListo();
    const llamadas = claudeDeRetoma();
    const evaluaciones = motorFalso(DATOS);
    process.env.PRECHECK_IA_RETOMAS = "1";
    await put({ proveedor: "claude-code" });
    await pedir();
    await esperarIa();
    const [primera, segunda] = llamadas();
    expect(llamadas()).toHaveLength(2);
    // Primera pasada: sesión con id propio y que se guarda (sin --no-session-persistence).
    const id = primera.args[primera.args.indexOf("--session-id") + 1];
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(primera.args).not.toContain("--no-session-persistence");
    // Segunda: reanuda esa sesión, con el mismo agente, modelo y carpeta, y un mensaje que nombra los datos.
    expect(segunda.args[segunda.args.indexOf("--resume") + 1]).toBe(id);
    expect(segunda.args).not.toContain("--session-id");
    expect(segunda.args[segunda.args.indexOf("--agent") + 1]).toBe("revisor-planos");
    expect(segunda.args[segunda.args.indexOf("--add-dir") + 1]).toBe(primera.args[primera.args.indexOf("--add-dir") + 1]);
    expect(segunda.prompt).toContain("Segunda pasada dirigida");
    for (const d of ["proyecto.altura_m", "proyecto.pisos_totales", "proyecto.ocupacion_pct"]) expect(segunda.prompt).toContain(d);
    expect(await estadoIa()).toMatchObject({ status: "done", retomas: 1, pendientesAntes: 3, pendientesDespues: 0 });
    expect(evaluaciones()).toBe(2); // tras la primera pasada y tras la segunda
    expect((await (await REGISTRO.GET(new Request("http://localhost?formato=txt", { headers: conSesion }), ctx(ID))).text())).toContain("Segunda pasada: se reabre la sesión");
  });

  it("no reabre la sesión si no quedan datos que escribir (solo criterio o zona) ni si son menos de tres", async () => {
    precheckListo();
    const llamadas = claudeDeRetoma();
    motorFalso(["regla de criterio: requiere juicio del revisor", "x", "dato faltante: proyecto.altura_m"]);
    process.env.PRECHECK_IA_RETOMAS = "1";
    await put({ proveedor: "claude-code" });
    await pedir();
    await esperarIa();
    // Sin segunda pasada de datos; la única retoma es la de cobertura (reglas en revisión que el dictamen no decide).
    expect(llamadas()).toHaveLength(2);
    expect(llamadas()[1].prompt).toContain("C-COBERTURA");
    expect(await estadoIa()).toMatchObject({ status: "done", retomas: 0, pendientesAntes: 1 });
  });

  it("si la retoma falla se conserva el dictamen de la primera pasada y la revisión no se marca como fallida", async () => {
    const run = precheckListo();
    const llamadas = claudeDeRetoma(1);
    motorFalso(DATOS);
    process.env.PRECHECK_IA_RETOMAS = "1";
    await put({ proveedor: "claude-code" });
    await pedir();
    await esperarIa();
    // La segunda pasada falla y después la retoma de cobertura también: queda el dictamen de la primera.
    expect(llamadas()).toHaveLength(3);
    expect(llamadas()[2].prompt).toContain("C-COBERTURA");
    const estado = await estadoIa();
    expect(estado).toMatchObject({ status: "done", retomas: 0, pendientesAntes: 3 });
    expect(JSON.parse(readFileSync(join(run, "dictamen.json"), "utf8")).decisiones[0]).toMatchObject({ regla_id: "R-1", decision: "CUMPLE" });
  });

  it("sin retomas la sesión no se guarda, como antes", async () => {
    precheckListo();
    const llamadas = claudeDeRetoma();
    process.env.PRECHECK_IA_RETOMAS = "0";
    await put({ proveedor: "claude-code" });
    await pedir();
    await esperarIa();
    const [unica] = llamadas();
    expect(llamadas()).toHaveLength(1);
    expect(unica.args).toContain("--no-session-persistence");
    expect(unica.args).not.toContain("--session-id");
    expect((await estadoIa()).retomas).toBeUndefined();
  });
});

describe("regiones del plano en el prompt (paso 3)", () => {
  const estado = { datos: { tramite: "RLA", fechaPresentacion: "2026-09-01", normaAplicable: "PLOT-A61-2021" } } as Parameters<typeof promptClaudeCode>[2];

  it("con regiones: son hipótesis por verificar, nunca prueba única de CUMPLE; la discrepancia confirmada es OBSERVACION", () => {
    const p = promptClaudeCode("C:/x", null, estado, [], undefined, true);
    expect(p).toContain("regiones.json");
    expect(p).toContain("regiones_resumen.json");
    expect(p).toContain("HIPÓTESIS (confianza < 0.85");
    expect(p).toContain("Nunca uses una región como única prueba de un CUMPLE");
    expect(p).toMatch(/se confirma en la lámina, la decisión de la regla afectada es OBSERVACION, con una marca/);
    expect(p).toContain("`regiones_discrepantes`");
    expect(p).toContain("contrasta con el conteo de regiones de regiones_resumen.json");
  });

  it("NO_CUMPLE por ausencia solo con la lámina ampliada (>= 150 ppp) y confianza >= 0.85; si no, OBSERVACION", () => {
    const p = promptClaudeCode("C:/x", null, estado);
    expect(p).toContain("NO_CUMPLE POR AUSENCIA");
    expect(p).toMatch(/150 ppp o más[\s\S]*confianza en que falta es >= 0\.85[\s\S]*Si no, la decisión es OBSERVACION/);
    expect(p).toContain("ampliaste la pertinente a 150 ppp o más y no está, con confianza >= 0.85");
  });

  it("sin regiones el prompt no las menciona; tieneRegiones mira la carpeta del PreCheck", async () => {
    expect(promptClaudeCode("C:/x", null, estado)).not.toContain("regiones.json");
    const { tieneRegiones } = await import("@/server/ia/revisar");
    const carpeta = mkdtempSync(join(tmpdir(), "regiones-ia-"));
    try {
      expect(await tieneRegiones(carpeta)).toBe(false);
      writeFileSync(join(carpeta, "regiones.json"), "{}");
      expect(await tieneRegiones(carpeta)).toBe(true);
    } finally {
      rmSync(carpeta, { recursive: true, force: true });
    }
  });
});
