import { describe, expect, it } from "vitest";
import { esCorridaDePrueba, esNombreDePrueba, etapaDeSeveridad, etiquetaModelo, leerNombrePrueba, nombreDePrueba } from "./corridas-prueba";

describe("nombres de las corridas de prueba", () => {
  it("lee plano, ronda, modelo y repetición", () => {
    expect(leerNombrePrueba("Tocumen (comercial) - prueba 77 con Opus 5.5")).toEqual({ plano: "Tocumen (comercial)", ronda: 77, modelo: "Opus 5.5", repeticion: 1 });
    expect(leerNombrePrueba("Tocumen (comercial) - prueba 77 con Opus 5.5 (2)")).toEqual({ plano: "Tocumen (comercial)", ronda: 77, modelo: "Opus 5.5", repeticion: 2 });
    expect(leerNombrePrueba("Casco Antiguo - prueba con Sonnet 5.5")).toEqual({ plano: "Casco Antiguo", ronda: 1, modelo: "Sonnet 5.5", repeticion: 1 });
    expect(leerNombrePrueba("Bella Vista - IA Opus 5.5")).toEqual({ plano: "Bella Vista", ronda: 1, modelo: "Opus 5.5", repeticion: 1 });
    expect(leerNombrePrueba("San Francisco - prueba 61 con DeepSeek Flash")?.modelo).toBe("DeepSeek Flash");
    expect(leerNombrePrueba("Residencia Betania 01")).toBeNull();
    expect(leerNombrePrueba("CASO-A - 1R2 con documentos DPU y PH")).toBeNull();
  });

  it("escribe el nombre sin sufijo en la repetición 1 y lo lee de vuelta", () => {
    const uno = { plano: "CASO-A", ronda: 78, modelo: "Fable 5.1", repeticion: 1 };
    expect(nombreDePrueba(uno)).toBe("CASO-A - prueba 78 con Fable 5.1");
    expect(nombreDePrueba({ ...uno, repeticion: 3 })).toBe("CASO-A - prueba 78 con Fable 5.1 (3)");
    expect(leerNombrePrueba(nombreDePrueba({ ...uno, repeticion: 3 }))).toEqual({ ...uno, repeticion: 3 });
  });

  // Los 17 nombres reales (19-oct) que no siguen el formato de lote_ia.
  it.each([
    "CASO-A - R2-A con Opus",
    "Casco Antiguo - manual 2 con Opus 5.5",
    "Bella Vista - IA Opus 5.5",
    "San Francisco - IA Fable 5.1",
    "Tocumen (comercial) - IA Opus 5.5",
    "Panamá Norte - IA Sonnet 5.5",
    "Casco antiguo prueba Fable 5.1",
  ])("«%s» es una corrida de prueba", (nombre) => {
    expect(esNombreDePrueba(nombre)).toBe(true);
  });

  it.each([
    "Ancón  -  RLA-0000-11",
    "dsvds",
    "Residencia Betania 01",
    "CASO-A_ANTEPROYECTO Firmado_Municipio",
    "Bella Vista - manual (RLA-0000-6)",
    "Casco Antiguo - manual 1",
    "CASO-A - 1R2 con documentos DPU y PH",
  ])("«%s» es del usuario", (nombre) => {
    expect(esNombreDePrueba(nombre)).toBe(false);
  });

  it("la marca esPrueba manda aunque el nombre no la delate", () => {
    expect(esCorridaDePrueba({ name: "Plano cualquiera", esPrueba: true })).toBe(true);
    expect(esCorridaDePrueba({ name: "Plano cualquiera" })).toBe(false);
    expect(esCorridaDePrueba({ name: "Bella Vista - prueba 45 con Sonnet 5.5" })).toBe(true);
  });

  it("etapa del catálogo de severidad y modelo enrutado", () => {
    expect([56, 57, 76, 77].map(etapaDeSeveridad)).toEqual(["hasta-56", "57-76", "57-76", "desde-77"]);
    expect(etiquetaModelo("DeepSeek Flash", { enrutado: true })).toBe("Sonnet 5.5 (enrutado)");
    expect(etiquetaModelo("DeepSeek Flash", { enrutado: "plano escaneado", modelo: "claude-sonnet-5-5" })).toBe("Sonnet 5.5 (enrutado)");
    expect(etiquetaModelo("Sonnet 5.5", { enrutado: "plano escaneado", modelo: "claude-opus-5-5" })).toBe("Opus 5.5 (enrutado)");
    expect(etiquetaModelo("DeepSeek Flash", null)).toBe("DeepSeek Flash");
  });
});
