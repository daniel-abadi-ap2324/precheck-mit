"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => undefined;

/** true solo en el cliente: la sesión y los borradores viven en sessionStorage y no existen en el servidor. */
export const useIsClient = (): boolean =>
  useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
