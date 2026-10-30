import { useSyncExternalStore } from "react";
import { vi } from "vitest";

/**
 * Doble de `next/navigation` para pruebas: la URL vive en un pequeño store,
 * así `router.replace` vuelve a renderizar a quien lee `useSearchParams`.
 * Uso: vi.mock("next/navigation", async () => (await import("<ruta>/navigation-mock")).navigationModule);
 */
let current = new URL("http://localhost/projects/prj-betania-01/results");
const listeners = new Set<() => void>();
let params = new URLSearchParams(current.search);

function setUrl(href: string) {
  current = new URL(href, current);
  params = new URLSearchParams(current.search);
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const replace = vi.fn((href: string) => setUrl(href));
const push = vi.fn((href: string) => setUrl(href));
const router = { replace, push, back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() };

export function resetNavigation(href = "http://localhost/projects/prj-betania-01/results") {
  current = new URL(href);
  params = new URLSearchParams(current.search);
  replace.mockClear();
  push.mockClear();
}

export const currentSearch = () => current.search;

export const navigationModule = {
  useRouter: () => router,
  usePathname: () => useSyncExternalStore(subscribe, () => current.pathname),
  useSearchParams: () => useSyncExternalStore(subscribe, () => params),
  useParams: () => ({ id: "prj-betania-01" }),
  notFound: vi.fn(),
  redirect: vi.fn(),
};
