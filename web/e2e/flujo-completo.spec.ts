import { expect, test } from "@playwright/test";

/**
 * Criterio de éxito del encargo (§26): Login → Panel → Nuevo PreCheck → Lote → Mapa → Planos →
 * Ejecutar → Procesamiento → Plano → Reglas → Resultados → Informe.
 */
test("flujo completo de demostración", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.getByRole("link", { name: "Nuevo PreCheck" }).first().click();
  await expect(page).toHaveURL(/\/projects\/new/);

  // Paso 1: datos del proyecto
  await page.getByRole("button", { name: /datos de ejemplo/i }).click();
  await page.getByRole("button", { name: /siguiente|continuar/i }).click();

  // Paso 2: ubicar el lote (preseleccionado por el ID del lote). Si no estuviera cargado, se dibuja.
  await expect(page.getByRole("combobox", { name: "Buscar el lote" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Dibujar el lote en el mapa" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Lote PAR-081400" })).toBeVisible();
  await page.getByRole("button", { name: /siguiente|continuar/i }).click();

  // Paso 3: cargar planos
  await page.locator('input[type="file"]').first().setInputFiles({ name: "A-101_planta-de-conjunto.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 demo") });
  await expect(page.getByText(/cargado/i).first()).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /siguiente|continuar/i }).click();

  // Paso 4: revisión → Paso 5: ejecutar
  await page.getByRole("button", { name: "Confirmar y continuar" }).click();
  await page.getByRole("button", { name: /ejecutar precheck/i }).click();

  // Procesamiento
  await expect(page).toHaveURL(/\/processing/);
  await expect(page.getByText(/precheck terminado/i).first()).toBeVisible({ timeout: 20_000 });
  // La pantalla redirige sola a la revisión; si no alcanzó, se usa el enlace.
  const open = page.getByRole("link", { name: /abrir revisión/i }).first();
  if (await open.isVisible().catch(() => false)) await open.click().catch(() => undefined);

  // Workspace: regla preseleccionada con su cota en el plano (en móvil, un panel a la vez)
  await expect(page).toHaveURL(/\/precheck/);
  const mobile = test.info().project.name === "mobile";
  if (mobile) await page.getByRole("button", { name: "Plano", exact: true }).click();
  await expect(page.getByText("4.25 m").first()).toBeVisible({ timeout: 10_000 });
  if (mobile) await page.getByRole("button", { name: "Detalle", exact: true }).click();
  await expect(page.getByText(/Lo establecido ó 5m/).first()).toBeVisible();

  // Resultados
  const tabs = page.getByRole("navigation", { name: "Secciones del proyecto" });
  await tabs.getByRole("link", { name: "Resultados", exact: true }).click();
  await expect(page.getByText(/preliminares y están sujetos a revisión/).first()).toBeVisible();
  await expect(page.getByText(/aprobado/i)).toHaveCount(0);

  // Informe
  await tabs.getByRole("link", { name: "Informe", exact: true }).click();
  await expect(page).toHaveURL(/\/report/);
  await expect(page.getByRole("article", { name: /informe preliminar/i }).or(page.getByRole("region", { name: /informe preliminar/i })).first()).toBeVisible();
  await expect(page.getByText(/preliminares y están sujetos a revisión/).first()).toBeVisible();
});

test("la vista GIS muestra la ficha al elegir una parcela", async ({ page, context }) => {
  await context.addCookies([{ name: "mp_session", value: "demo-token", url: "http://localhost:3100" }]);
  await page.goto("/map");
  if (test.info().project.name === "mobile") await page.getByRole("button", { name: "Buscar y capas" }).click();
  await page.getByRole("combobox", { name: "Dirección, corregimiento, hoja o lote" }).fill("083076");
  await page.getByRole("option", { name: /PAR-081400/ }).first().click();
  await expect(page.getByText(/Lo establecido ó 5m/)).toBeVisible();
});
