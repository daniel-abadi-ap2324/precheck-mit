import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure" },
  expect: { timeout: 15_000 },
  // El flujo de demostración de las pruebas no depende de planos reales: el PreCheck usa el resultado de ejemplo.
  webServer: {
    command: "npm run build && npm run start -- -p 3100",
    url: "http://localhost:3100/login",
    reuseExistingServer: true,
    timeout: 300_000,
    env: { NEXT_PUBLIC_PRECHECK_MODE: "demo" },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
