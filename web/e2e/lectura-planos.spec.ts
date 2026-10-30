import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

/** Planos de demo/ (fuera de public/): se leen con el lector de precheck/planos en el servidor. */
const EJEMPLOS = process.env.PLANOS_EJEMPLO_DIR ?? "../demo";
const CASCO_ANTIGUO = "casco-antiguo-rla-1678.pdf";

test.describe("lectura de planos PDF", () => {
  test.skip(({ isMobile }) => isMobile, "El flujo se prueba en escritorio; el reflujo móvil lo cubre sin-desborde.spec.ts");
  test.setTimeout(330_000); // un plano escaneado se lee con OCR en unos minutos

  test.beforeEach(async ({ context }) => {
    await context.addCookies([{ name: "mp_session", value: "demo-token", url: "http://localhost:3100" }]);
  });

  test("un anteproyecto de ejemplo se lee y muestra láminas, datos con procedencia y contraste", async ({ page }) => {
    await page.goto("/projects/prj-betania-01/plans");
    await page.getByLabel("Plano de ejemplo").selectOption(CASCO_ANTIGUO);
    await page.getByRole("button", { name: "Cargar y leer el ejemplo" }).click();

    const lectura = page.getByRole("region", { name: `Lectura de ${CASCO_ANTIGUO}` });
    await expect(lectura.getByRole("list", { name: "Datos leídos del plano" })).toBeVisible({ timeout: 280_000 });
    await expect(lectura.getByRole("list", { name: "Contraste con el expediente" })).toContainText("Corregimiento: el plano dice San Felipe; el expediente, Betania");
    const miniatura = lectura.getByRole("list", { name: "Láminas del plano" }).getByRole("img").first();
    await expect(miniatura).toHaveJSProperty("complete", true);
    expect(await miniatura.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await expect(page.getByRole("row", { name: new RegExp(CASCO_ANTIGUO) })).toContainText("Listo");
  });

  test("la API recibe el PDF real, rechaza lo que no es PDF y exige sesión", async ({ page, playwright }) => {
    const request = page.request; // comparte la cookie de sesión del contexto
    const pdf = readFileSync(`${EJEMPLOS}/${CASCO_ANTIGUO}`);
    const ok = await request.post("/api/planos", { multipart: { file: { name: CASCO_ANTIGUO, mimeType: "application/pdf", buffer: pdf } } });
    expect(ok.status()).toBe(202);
    const { id } = await ok.json();
    await expect.poll(async () => (await (await request.get(`/api/planos/${id}`)).json()).status, { timeout: 280_000 }).toBe("ready");

    const falso = await request.post("/api/planos", { multipart: { file: { name: "falso.pdf", mimeType: "application/pdf", buffer: Buffer.from("no soy un pdf") } } });
    expect(falso.status()).toBe(415);

    const anonimo = await playwright.request.newContext({ baseURL: "http://localhost:3100" });
    expect((await anonimo.post("/api/planos", { multipart: { file: { name: "a.pdf", mimeType: "application/pdf", buffer: pdf } } })).status()).toBe(401);
    await anonimo.dispose();
  });
});
