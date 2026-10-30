import type { ApiClient } from "./contract";
import { httpClient } from "./http";
import { mockClient } from "@/mocks/adapter";

/** Fuente de datos: NEXT_PUBLIC_API_MODE=mock (por defecto) | http. Los componentes nunca importan mocks/. */
export const api: ApiClient = process.env.NEXT_PUBLIC_API_MODE === "http" ? httpClient : mockClient;

export * from "./contract";
