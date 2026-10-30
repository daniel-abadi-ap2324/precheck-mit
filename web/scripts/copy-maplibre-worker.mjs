// MapLibre 6 carga su worker como módulo ES relativo a su propio archivo, lo que no sobrevive al
// bundler de Next. Se sirve desde public/ y se apunta con setWorkerUrl (components/map/map-viewer.tsx).
import { copyFileSync, mkdirSync } from "node:fs";
const src = "node_modules/maplibre-gl/dist";
const dst = "public/maplibre";
mkdirSync(dst, { recursive: true });
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) copyFileSync(`${src}/${f}`, `${dst}/${f}`);
