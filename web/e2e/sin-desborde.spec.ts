import { expect, test } from "@playwright/test";

/**
 * Reflujo (WCAG 1.4.10): ninguna pantalla se desborda hacia los lados. En móvil el informe se ensanchaba a
 * ~2150 px por su índice y la hoja quedaba fuera de la pantalla.
 */
const PANTALLAS = ["/dashboard", "/projects", "/projects/prj-betania-01", "/projects/prj-betania-01/precheck", "/projects/prj-betania-01/results", "/projects/prj-betania-01/report", "/rules", "/zoning", "/map", "/projects/new"];

for (const ruta of PANTALLAS) {
  test(`sin desborde horizontal: ${ruta}`, async ({ page, context }) => {
    await context.addCookies([{ name: "mp_session", value: "demo-token", url: "http://localhost:3100" }]);
    await page.goto(ruta);
    await page.waitForLoadState("networkidle");
    const { ancho, vista } = await page.evaluate(() => ({ ancho: document.documentElement.scrollWidth, vista: window.innerWidth }));
    expect(ancho).toBeLessThanOrEqual(vista + 1);
  });
}

test("en móvil el informe se ve dentro de la pantalla", async ({ page, context }) => {
  test.skip(test.info().project.name !== "mobile", "solo móvil");
  await context.addCookies([{ name: "mp_session", value: "demo-token", url: "http://localhost:3100" }]);
  await page.goto("/projects/prj-betania-01/report");
  const hoja = page.getByRole("article").first();
  await expect(hoja).toBeVisible();
  const caja = await hoja.boundingBox();
  const vista = page.viewportSize();
  expect(caja && vista && caja.x >= 0 && caja.x + caja.width <= vista.width + 1).toBe(true);
});
