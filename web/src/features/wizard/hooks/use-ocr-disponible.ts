"use client";

import { useQuery } from "@tanstack/react-query";
import { disponibilidadOcr } from "@/services/planos/cliente";

/** Qué lectores OCR funcionan en el servidor (Tesseract, Ollama con GLM-OCR, Claude Code). */
export const useOcrDisponible = () => useQuery({ queryKey: ["ocr-disponible"], queryFn: disponibilidadOcr, staleTime: 30_000 });
