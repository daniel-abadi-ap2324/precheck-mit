import { DISTRITO_BBOX } from "./distrito";
import { localProjector, segmentSegmentDistance } from "./geo";

/** Vértice [lng, lat] en WGS84. */
export type Punto = [number, number];

const AREA_MIN_M2 = 20;
const AREA_MAX_M2 = 1_000_000; // 100 ha: más que eso no es un lote, es un error de dibujo
const DISTRITO = DISTRITO_BBOX;

export const anilloCerrado = (puntos: Punto[]): Punto[] => [...puntos, puntos[0]];

/** Área plana en m² (proyección local alrededor del primer vértice; error < 0,1 % a escala de lote). */
export function areaM2(puntos: Punto[]): number {
  if (puntos.length < 3) return 0;
  const xy = puntos.map(localProjector(puntos[0]));
  let s = 0;
  for (let i = 0; i < xy.length; i++) {
    const [x1, y1] = xy[i];
    const [x2, y2] = xy[(i + 1) % xy.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

/** Centroide de área del polígono (fórmula del polígono simple). */
export function centroide(puntos: Punto[]): Punto {
  let a = 0;
  let cx = 0;
  let cy = 0;
  const [x0, y0] = puntos[0];
  for (let i = 0; i < puntos.length; i++) {
    const [x1, y1] = [puntos[i][0] - x0, puntos[i][1] - y0];
    const [x2, y2] = [puntos[(i + 1) % puntos.length][0] - x0, puntos[(i + 1) % puntos.length][1] - y0];
    const f = x1 * y2 - x2 * y1;
    a += f;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  return a === 0 ? puntos[0] : [x0 + cx / (3 * a), y0 + cy / (3 * a)];
}

function seCruza(puntos: Punto[]): boolean {
  const n = puntos.length;
  const lado = (i: number): [Punto, Punto] => [puntos[i], puntos[(i + 1) % n]];
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // lados contiguos por el cierre
      const [a, b] = lado(i);
      const [c, e] = lado(j);
      if (segmentSegmentDistance(a, b, c, e) === 0) return true;
    }
  }
  return false;
}

const mismo = (a: Punto, b: Punto) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;

/**
 * Quita el vértice de cierre (las tablas de agrimensura repiten el primero al final) y los vértices repetidos
 * seguidos (doble clic): un lado de longitud cero no es un cruce.
 */
export function limpiarVertices(puntos: Punto[]): Punto[] {
  const sinSeguidos = puntos.filter((p, i) => i === 0 || !mismo(p, puntos[i - 1]));
  while (sinSeguidos.length > 1 && mismo(sinSeguidos[0], sinSeguidos[sinSeguidos.length - 1])) sinSeguidos.pop();
  return sinSeguidos;
}

/** Mensaje de error del dibujo, o null si el polígono sirve como lote. Admite vértices repetidos (se limpian). */
export function validarLote(entrada: Punto[]): string | null {
  const puntos = limpiarVertices(entrada);
  if (puntos.length < 3) return "Marque al menos 3 vértices.";
  if (seCruza(puntos)) return "Los lados del lote se cruzan. Revise el orden de los vértices.";
  const area = areaM2(puntos);
  if (area < AREA_MIN_M2) return "El lote mide menos de 20 m². Revise el dibujo.";
  if (area > AREA_MAX_M2) return "El lote mide más de 100 ha. Revise el dibujo.";
  return null;
}

/** UTM zona 17N (EPSG:32617) → WGS84, fórmula inversa de Transverse Mercator (precisión submétrica). */
export function utm17nAWgs84(este: number, norte: number): Punto {
  const a = 6378137;
  const f = 1 / 298.257223563;
  const k0 = 0.9996;
  const e2 = f * (2 - f);
  const ep2 = e2 / (1 - e2);
  const x = este - 500000;
  const m = norte / k0;
  const mu = m / (a * (1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const n1 = a / Math.sqrt(1 - e2 * Math.sin(phi1) ** 2);
  const t1 = Math.tan(phi1) ** 2;
  const c1 = ep2 * Math.cos(phi1) ** 2;
  const r1 = (a * (1 - e2)) / (1 - e2 * Math.sin(phi1) ** 2) ** 1.5;
  const dd = x / (n1 * k0);
  const lat =
    phi1 -
    ((n1 * Math.tan(phi1)) / r1) *
      (dd ** 2 / 2 - ((5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * ep2) * dd ** 4) / 24 +
        ((61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 252 * ep2 - 3 * c1 ** 2) * dd ** 6) / 720);
  const lng =
    (dd - ((1 + 2 * t1 + c1) * dd ** 3) / 6 + ((5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * ep2 + 24 * t1 ** 2) * dd ** 5) / 120) /
    Math.cos(phi1);
  const deg = 180 / Math.PI;
  return [-81 + lng * deg, lat * deg];
}

/**
 * Coordenadas pegadas, un vértice por línea: «lat, lng» en grados (WGS84) o «Este Norte» en metros (UTM 17N,
 * como vienen los planos de agrimensura). Separadas por coma, espacio o punto y coma.
 */
export function leerCoordenadas(texto: string): { puntos: Punto[] } | { error: string } {
  const puntos: Punto[] = [];
  const lineas = texto.split(/\r?\n/);
  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i].trim();
    if (!linea) continue;
    const nums = linea.split(/[\s,;]+/).map(Number);
    if (nums.length !== 2 || nums.some((n) => !Number.isFinite(n))) return { error: `La línea ${i + 1} no tiene dos números.` };
    const [p, q] = nums;
    // En el distrito, el Este UTM ronda 620–720 km y el Norte 980–1 060 km: si viene «Norte Este», se invierte.
    const utm = Math.abs(p) > 1000;
    const [este, norte] = utm && p > 900_000 && q < 900_000 ? [q, p] : [p, q];
    const punto: Punto = utm ? utm17nAWgs84(este, norte) : [q, p];
    const [lng, lat] = punto;
    if (lng < DISTRITO[0] || lng > DISTRITO[2] || lat < DISTRITO[1] || lat > DISTRITO[3]) {
      return { error: `La línea ${i + 1} está fuera del distrito de Panamá.` };
    }
    puntos.push(punto);
  }
  return { puntos };
}
