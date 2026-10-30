import { expect, test } from "@playwright/test";

/**
 * Tamaño de los objetivos (WCAG 2.5.8 AA: 24 px; en móvil, 44 px como en 2.5.5 y las guías de iOS/Android).
 * Se excluyen los enlaces dentro de un párrafo (excepción «en línea») y el enlace oculto «Saltar al contenido».
 */
const PANTALLAS = ["/dashboard", "/projects", "/projects/prj-betania-01", "/projects/prj-betania-01/precheck", "/projects/prj-betania-01/results", "/rules", "/map", "/projects/new"];

for (const ruta of PANTALLAS) {
  test(`objetivos de tamaño suficiente: ${ruta}`, async ({ page, context }) => {
    await context.addCookies([{ name: "mp_session", value: "demo-token", url: "http://localhost:3100" }]);
    await page.goto(ruta);
    await page.waitForLoadState("networkidle");
    const minimo = test.info().project.name === "mobile" ? 44 : 24;
    const chicos = await page.evaluate((min) => {
      const sel = "a[href],button,input:not([type=hidden]),select,textarea,[role=button],[role=option],[role=tab],[role=checkbox],[role=combobox]";
      return [...document.querySelectorAll<HTMLElement>(sel)]
        .filter((e) => e.offsetParent !== null && !e.closest("p") && e.textContent?.trim() !== "Saltar al contenido" && !e.closest(".maplibregl-ctrl-attrib"))
        // Una casilla con etiqueta usa la etiqueta como área de toque: cuenta el tamaño de la etiqueta.
        .map((e) => (e.getAttribute("role") === "checkbox" ? ((e.closest("label") ?? (e.id ? document.querySelector(`label[for="${e.id}"]`) : null) ?? e) as HTMLElement) : e))
        .map((e) => ({ e, r: e.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && (r.height < min || r.width < min))
        .map(({ e, r }) => `${(e.getAttribute("aria-label") || e.textContent || e.tagName).trim().slice(0, 40)} ${Math.round(r.width)}×${Math.round(r.height)}`);
    }, minimo);
    expect(chicos).toEqual([]);
  });
}

test("las pestañas del proyecto no se solapan", async ({ page, context }) => {
  await context.addCookies([{ name: "mp_session", value: "demo-token", url: "http://localhost:3100" }]);
  await page.goto("/projects/prj-betania-01");
  const cajas = await page.getByRole("navigation", { name: "Secciones del proyecto" }).getByRole("link").evaluateAll((els) =>
    els.map((e) => ({ izq: e.getBoundingClientRect().left, der: e.getBoundingClientRect().right, texto: (e as HTMLElement).scrollWidth <= e.clientWidth + 1 })),
  );
  for (let i = 1; i < cajas.length; i++) expect(cajas[i].izq).toBeGreaterThanOrEqual(cajas[i - 1].der - 1);
  expect(cajas.every((c) => c.texto)).toBe(true);
});
