import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { fakeItem } from "@/test/rule-result-fixtures";
import type { DecisionRegla, DictamenInfo, ExpedienteInfo, ReglasVigentesInfo } from "@/types";
import { ConclusionDictamen, DecisionDictamenDetalle, QueSeSupuso } from "./index";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_MOCK_LATENCY = "0";
});

const { RuleDetails } = await import("@/features/workspace/components/details/rule-details");

const DICTAMEN: DictamenInfo = {
  fecha: "2026-01-17",
  revisor: "agente revisor-planos (arquitecto revisor)",
  conclusion: "El anteproyecto debe agregar la topografía antes de seguir.",
  supuestos: [
    { hecho: "lote.codigo_zona", etiqueta: "Código de zona", valor: "RMH2", fundamento: "declarada en el plano; sin CEUS" },
    { hecho: "proyecto.pisos_totales", etiqueta: "Pisos", valor: "4", fundamento: "corte A-A" },
  ],
  decididas: 3,
  sinDecision: 1,
  noAplica: 1,
};

const DECISION: DecisionRegla = {
  decision: "NO_CUMPLE",
  valorLeido: "sin curvas de nivel",
  limite: "curvas a 1.00 m o menos",
  justificacion: "La localización no muestra curvas de nivel.",
  evidencia: [
    { pagina: 1, detalle: "localización general" },
    { pagina: 7, detalle: "corte" },
  ],
  subsanar: "Agregar la topografía con curvas de nivel.",
};

describe("Conclusión del arquitecto revisor", () => {
  it("muestra la conclusión, los supuestos (la zona asumida) y la fuente, sin presentarlo como oficial", () => {
    renderWithProviders(<ConclusionDictamen dictamen={DICTAMEN} />);
    const region = screen.getByRole("region", { name: "Conclusión del arquitecto revisor" });
    expect(within(region).getByTestId("conclusion-dictamen")).toHaveTextContent("El anteproyecto debe agregar la topografía antes de seguir.");
    const supuestos = within(region).getByRole("list", { name: "Supuestos del dictamen" });
    expect(within(supuestos).getByText("Zona RMH2 asumida: declarada en el plano; sin CEUS")).toBeInTheDocument();
    expect(within(supuestos).getByText("Pisos: 4 (corte A-A)")).toBeInTheDocument();
    expect(region).toHaveTextContent("Dictamen del arquitecto revisor (agente revisor-planos)");
    expect(region).toHaveTextContent("Acuerdo 110, Art. 3");
    expect(region).toHaveTextContent("1 regla quedó sin decisión");
    expect(region).not.toHaveTextContent(/el proyecto cumple/i);
  });
});

describe("Conclusión: quién revisó, costo, discrepancias de regiones y reservas", () => {
  it("dice el proveedor, el modelo y el costo, lista las discrepancias y cuenta lo que no se aplicó", () => {
    const d: DictamenInfo = {
      ...DICTAMEN,
      proveedor: "deepseek-api",
      modelo: "deepseek-flash",
      costoUsd: 0.6234,
      prevaleceMotor: 2,
      informacionRequerida: 1,
      regionesDiscrepantes: [{ referencia: "proyecto.estacionamientos", detalle: "el cuadro declara 373 y se dibujan 369" }],
    };
    renderWithProviders(<ConclusionDictamen dictamen={d} />);
    const region = screen.getByRole("region", { name: "Conclusión del arquitecto revisor" });
    expect(region).toHaveTextContent("Revisó API de DeepSeek (deepseek-flash), costo 0.62 USD.");
    expect(within(region).getByRole("list", { name: "Discrepancias de regiones" })).toHaveTextContent("proyecto.estacionamientos: el cuadro declara 373 y se dibujan 369");
    expect(region).toHaveTextContent("2 decisiones no se aplicaron porque el motor ya había decidido esa regla con los datos (prevalece el motor).");
    expect(region).toHaveTextContent("1 regla depende de un documento que falta en el expediente (información requerida).");
  });
});

const VIGENTES: ReglasVigentesInfo = {
  norma: "MIVIOT-ML2",
  zona: "MP-C2",
  total: 84,
  sinDeterminar: 3,
  exceptuadas: 1,
  alcanceIa: { presente: true, aplicado: ["lote.norma_aplicable", "proyecto.obra_nueva"], errores: ["sf_sector: la cita no aparece en plano, p. 1."] },
  permisos: [{ id: "PERM-1", tipo: "excepcion", titulo: "Adosamiento lateral", cita: "se autoriza el adosamiento lateral", documento: "complementario-1", pagina: 2, efecto: [{ reglaId: "ML2-RETIRO-LATERAL", accion: "exceptua" }] }],
  propuestas: 1,
};

const INFO: ExpedienteInfo = { documento: null, paginas: 2, normaAplicable: "MIVIOT-ML2", fechaPresentacion: null, umbral: 0.85, noAplican: 0, avisos: [], lote: [], proyecto: [] };

describe("Reglas vigentes y objeciones", () => {
  it("muestra la norma, la zona, lo que fijó la IA, lo rechazado, los permisos con su cita y las objeciones", () => {
    // Las reglas vigentes van en «Qué se supuso en esta revisión» (ADR-0016); las de un dictamen viejo también.
    const d: DictamenInfo = { ...DICTAMEN, vigentes: VIGENTES, objeciones: [{ reglaId: "ML2-ALTURA", motivo: "la azotea no es habitable", cita: "no cuentan techos" }] };
    renderWithProviders(
      <>
        <QueSeSupuso info={{ ...INFO, dictamen: d }} />
        <ConclusionDictamen dictamen={d} />
      </>,
    );
    expect(screen.getAllByTestId("reglas-vigentes")).toHaveLength(1);
    const vig = screen.getByTestId("reglas-vigentes");
    expect(vig).toHaveTextContent("Norma MIVIOT-ML2, zona MP-C2: 84 reglas vigentes (1 exceptuada por permiso; 3 sin poder determinar si aplican).");
    expect(vig).toHaveTextContent("Alcance fijado por la IA con su fuente: lote.norma_aplicable, proyecto.obra_nueva.");
    expect(vig).toHaveTextContent("Rechazado por el motor (sin fuente comprobable): sf_sector");
    expect(vig).toHaveTextContent("Permiso PERM-1 — Adosamiento lateral (excepcion): «se autoriza el adosamiento lateral» (complementario-1, p. 2). exceptúa ML2-RETIRO-LATERAL.");
    expect(vig).toHaveTextContent("1 propuesta de regla para el equipo");
    expect(screen.getByTestId("objeciones")).toHaveTextContent("ML2-ALTURA: la azotea no es habitable («no cuentan techos»)");
  });
});

describe("Qué se supuso en esta revisión (ADR-0016)", () => {
  const conZona: ExpedienteInfo = {
    ...INFO,
    avisos: ["ZONA_TRABAJO: El plano declara R3, que no existe en la norma. Se evaluó con R1d1: encaja con el lote.", "DATO_DUDOSO: lote.codigo_zona leído con confianza 0.6."],
    zonaTrabajo: {
      codigo: "R1d1",
      norma: "MIVIOT-AC-R160-2002",
      procedencia: "familia",
      firme: false,
      explicacion: "El plano declara R3, que no existe en la norma. Se evaluó con R1d1: encaja con el lote.",
      falta: null,
      descartadas: [
        { codigo: "R1c", norma: "MIVIOT-AC-R160-2002", motivo: "no se pudo comprobar si encaja con el lote", reglasDistintas: 5 },
        { codigo: "R1d3", norma: "MIVIOT-AC-R160-2002", motivo: "no encaja con el lote", reglasDistintas: 0 },
      ],
    },
    supuestos: [
      { id: "S1", tipo: "zona", texto: "El plano declara R3…", accion: "Traiga la certificación de uso de suelo (CEUS) de la DPUOT y vuelva a evaluar.", reglas: 15 },
      { id: "S2", tipo: "dato_dudoso", texto: "Estacionamientos: se usó «2» tal como lo dice el plano, p. 2, leído con confianza 0.6.", accion: "Confírmelo en el plano o corríjalo con su fuente.", reglas: 4 },
    ],
    vigentes: { ...VIGENTES, norma: "MIVIOT-AC-R160-2002", zona: "R1d1", generales: 63, zonificacion: 15, procedenciaZona: "supuesta, supuesta por la familia de zona" },
    conteo: { noCumple: 14, conSupuesto: 3, observaciones: 12, informacionRequerida: 5, revisar: 0, agrupadas: 0, cumple: 44 },
  };

  it("zona supuesta con su acción, descartadas con las reglas que cambiarían, datos supuestos, la línea nueva de vigentes, avisos en lenguaje llano y el conteo con 0 en revisión", () => {
    renderWithProviders(<QueSeSupuso info={conZona} />);
    const s = screen.getByRole("region", { name: "Qué se supuso en esta revisión" });
    expect(within(s).getByTestId("zona-de-trabajo")).toHaveTextContent("Zona de trabajo R1d1 (MIVIOT-AC-R160-2002), supuesta (S1). El plano declara R3");
    expect(within(s).getByTestId("zona-de-trabajo")).toHaveTextContent("Traiga la certificación de uso de suelo (CEUS)");
    const descartadas = within(s).getByRole("list", { name: "Zonas descartadas" });
    expect(descartadas).toHaveTextContent("R1c (MIVIOT-AC-R160-2002): no se pudo comprobar si encaja con el lote. Con ella cambiarían 5 reglas.");
    expect(descartadas).toHaveTextContent("R1d3 (MIVIOT-AC-R160-2002): no encaja con el lote. Con ella no cambiaría ninguna regla.");
    expect(within(s).getByRole("list", { name: "Datos supuestos" })).toHaveTextContent("S2 Estacionamientos: se usó «2» tal como lo dice el plano, p. 2, leído con confianza 0.6. (4 reglas). Confírmelo");
    expect(within(s).getByTestId("reglas-vigentes")).toHaveTextContent(
      "Norma MIVIOT-AC-R160-2002, zona R1d1 (supuesta, supuesta por la familia de zona). 78 reglas vigentes: 63 generales del Acuerdo 110 y 15 de zonificación",
    );
    // El aviso de la zona repite la explicación: no se muestra dos veces. Los demás, sin el prefijo técnico.
    const avisos = within(s).getByRole("list", { name: "Avisos del motor" });
    expect(avisos).not.toHaveTextContent("ZONA_TRABAJO");
    expect(avisos).toHaveTextContent("El código de zona leído con confianza 0.6.");
    expect(within(s).getByTestId("conteo-final")).toHaveTextContent(
      "Conteo final: 44 cumplen, 14 no cumplen, 3 no cumplen con supuesto (por confirmar), 12 observaciones, 5 con información requerida y 0 en revisión.",
    );
    expect(screen.queryByTestId("ia-fallida")).not.toBeInTheDocument();
  });

  it("si la IA no terminó lo dice arriba: qué falló y cuántas reglas decidió el motor", () => {
    renderWithProviders(<QueSeSupuso info={{ ...conZona, iaFallida: { error: "La IA se detuvo antes de escribir el dictamen.", decididasPorMotor: 41, parcial: true } }} />);
    expect(screen.getByTestId("ia-fallida")).toHaveTextContent(
      "La revisión con IA no terminó: La IA se detuvo antes de escribir el dictamen. El informe se armó con las decisiones que alcanzó a dar la IA y la decisión de respaldo del motor en 41 reglas.",
    );
  });

  it("sin zona de trabajo ni avisos ni vigentes (resultado viejo sin nada que contar) no hay sección", () => {
    const { container } = renderWithProviders(<QueSeSupuso info={INFO} />);
    expect(container.querySelector("#que-se-supuso")).toBeNull();
  });
});

describe("Decisión de respaldo del motor", () => {
  it("dice que es del motor, en qué supuestos descansa y el estado antes del respaldo", () => {
    const d: DecisionRegla = { decision: "NO_CUMPLE", justificacion: "Se decide con lo que dice el plano (proyecto.estacionamientos = 2), leído con confianza baja.", evidencia: [], origen: "motor", supuestos: ["S1", "S2"] };
    renderWithProviders(<DecisionDictamenDetalle result={{ dictamen: d, motorStatus: "MANUAL_REVIEW" }} />);
    expect(screen.getByTestId("respaldo-motor")).toHaveTextContent("Decisión de respaldo del motor. La IA no decidió esta regla; descansa en los supuestos S1, S2");
    expect(screen.getByRole("heading", { name: "Motivo" })).toBeInTheDocument();
    expect(screen.getByText("Antes del respaldo:")).toBeInTheDocument();
  });
});

describe("Decisión del dictamen de una regla", () => {
  it("muestra valor leído, límite, justificación, «Qué subsanar» y el resultado del motor; enlaza solo las páginas con miniatura", () => {
    renderWithProviders(<DecisionDictamenDetalle result={{ dictamen: DECISION, motorStatus: "MANUAL_REVIEW", motorReason: "La confianza está bajo el mínimo." }} projectId="exp-x" paginas={[1, 2]} />);
    expect(screen.getByText("sin curvas de nivel")).toBeInTheDocument();
    expect(screen.getByText("curvas a 1.00 m o menos")).toBeInTheDocument();
    expect(screen.getByText("La localización no muestra curvas de nivel.")).toBeInTheDocument();
    const subsanar = screen.getByTestId("que-subsanar");
    expect(within(subsanar).getByRole("heading", { name: "Qué subsanar" })).toBeInTheDocument();
    expect(subsanar).toHaveTextContent("Agregar la topografía con curvas de nivel.");
    expect(screen.getByRole("link", { name: /p\. 1/ })).toHaveAttribute("href", "/projects/exp-x/plans#pagina-1");
    // La página 7 no tiene miniatura: se cita sin enlace.
    expect(screen.queryByRole("link", { name: /p\. 7/ })).not.toBeInTheDocument();
    expect(screen.getByText("p. 7")).toBeInTheDocument();
    expect(screen.getByText("Resultado del motor:")).toBeInTheDocument();
    expect(screen.getByText("Requiere revisión")).toBeInTheDocument();
    expect(screen.getByText("La confianza está bajo el mínimo.")).toBeInTheDocument();
  });

  it("una decisión con reserva (prevalece el motor) y una en INFORMACION_REQUERIDA lo dicen antes del detalle", () => {
    const conReserva: DecisionRegla = { ...DECISION, decision: "CUMPLE", reserva: { motivo: "motor", detalle: "La IA propuso CUMPLE, pero el motor ya había decidido NO_CUMPLE; prevalece el motor." } };
    const { unmount } = renderWithProviders(<DecisionDictamenDetalle result={{ dictamen: conReserva }} />);
    expect(screen.getByTestId("reserva-dictamen")).toHaveTextContent("Prevalece el motor de reglas. La IA propuso CUMPLE");
    expect(screen.queryByTestId("informacion-requerida")).not.toBeInTheDocument();
    unmount();
    const ir: DecisionRegla = { ...DECISION, decision: "OBSERVACION", estado: "INFORMACION_REQUERIDA", subsanar: "Aporte la certificación de uso de suelo (CEUS)." };
    renderWithProviders(<DecisionDictamenDetalle result={{ dictamen: ir, motorStatus: "MANUAL_REVIEW" }} />);
    expect(screen.getByTestId("informacion-requerida")).toHaveTextContent("Información requerida.");
    expect(screen.getByTestId("informacion-requerida")).toHaveTextContent("no es una falla del plano");
    expect(screen.queryByTestId("reserva-dictamen")).not.toBeInTheDocument();
  });

  it("en el detalle de la revisión, «Qué subsanar» reemplaza a la acción recomendada genérica y la regla sigue «no oficial»", () => {
    const item = fakeItem("A110-AIV-CURVAS-NIVEL", "FAIL", {
      rule: { state: "borrador" },
      result: { official: false, dictamen: DECISION, motorStatus: "MANUAL_REVIEW", explanation: DECISION.justificacion, recommendedAction: DECISION.subsanar },
    });
    renderWithProviders(<RuleDetails item={item} precheckId="pc-exp-x" soloLectura expediente={{ projectId: "exp-x", info: { documento: null, paginas: 2, normaAplicable: null, fechaPresentacion: null, umbral: null, noAplican: 0, avisos: [], lote: [], proyecto: [], miniaturas: [1] } }} />);
    expect(screen.getByRole("heading", { name: "Dictamen del arquitecto revisor" })).toBeInTheDocument();
    expect(screen.getByTestId("que-subsanar")).toHaveTextContent("Agregar la topografía con curvas de nivel.");
    expect(screen.queryByRole("heading", { name: "Acción recomendada" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Explicación asistida" })).not.toBeInTheDocument();
    expect(screen.getAllByText("no oficial").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /p\. 1/ })).toHaveAttribute("href", "/projects/exp-x/plans#pagina-1");
  });
});
