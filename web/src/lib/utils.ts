import { createCn } from "cn/config";

/**
 * Une clases de Tailwind resolviendo conflictos. Los tamaños de letra propios (`--text-*` en globals.css @theme)
 * se declaran aquí: sin ellos, `text-compact` se toma por un color y borra, p. ej., `text-primary-foreground`.
 */
export const cn = createCn({
  extend: { classGroups: { "font-size": [{ text: ["2xs", "compact"] }] } },
});
