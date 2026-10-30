"""OCR de una zona de una lámina escaneada (herramienta leer_zona de DeepSeek).

El OCR de la hoja entera (lineas.lineas_ocr, 150 ppp) deja el texto chico de un plano en 12–18 px y lee mal los dígitos
de cotas y cuadros. Aquí se relee solo una zona, a 300–400 ppp, con la imagen preparada: fondo aplanado (manchas y
amarillo del escaneo), contraste local y enderezado de la inclinación leve del escáner. Tesseract lee en el modo que
pide la zona (texto disperso, cuadro o cotas con solo dígitos), en el giro (0°, 90°, 180° o 270°) en que una lectura
rápida a 150 ppp da más palabras buenas: láminas escaneadas giradas, cotas y rótulos verticales. Si RapidOCR está
instalado, lee él y Tesseract queda de respaldo: en el banco (docs/demo/banco-escaneados.md) RapidOCR lee 18 de 19
valores y Tesseract 9.

Las posiciones vuelven en fracciones 0–1 de la hoja como la muestra ver_recorte (origen arriba a la izquierda), sin
importar el giro con que se leyó la zona.

Uso: python -m precheck.planos.ocr_zona <pdf> <pagina> <x0,y0,x1,y1> [--ppp 350] [--modo texto|cuadro|cotas] [--json]
"""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, field

#: Resolución por defecto y límites. A 350 ppp el texto de 2 mm queda en ~28 px, la altura que Tesseract lee mejor.
PPP_ZONA = 350
PPP_MIN = 200
PPP_MAX = 400
#: Tope de píxeles de la zona renderizada: más que esto se lee a menos ppp; por debajo de PPP_MIN, se rechaza.
MAX_PIXELES = 16_000_000
#: Inclinación máxima que se corrige (grados): más que eso no es un escaneo torcido sino un dibujo girado.
MAX_INCLINACION = 5.0
#: Con segundo lector, las palabras de Tesseract sin dígitos y con menos confianza que esto no se muestran al modelo.
CONF_MIN_CON_SEGUNDO = 0.6
#: Giros que se prueban (horario) y resolución de esa prueba. Una lámina escaneada viene a menudo girada entera (Casco
#: Antiguo p1 a 90°, p7 y Ancón a 180°); leerla sin girar da ruido con alguna palabra «buena» suelta, así que no basta
#: con probar el giro solo cuando la lectura sin girar sale vacía: se comparan todos.
GIROS = (0, 90, 180, 270)
PPP_GIRO = 150

#: Modo → (psm de Tesseract, caracteres permitidos o None).
MODOS = {
    "texto": ("11", None),                       # texto disperso: notas, rótulos, membrete
    "cuadro": ("6", None),                       # bloque uniforme: cuadro de áreas, datos de la finca
    "cotas": ("11", "0123456789.,:-+/xX%m"),      # números de cotas y niveles
}


@dataclass
class Palabra:
    t: str
    x: float
    y: float
    w: float
    h: float
    c: float
    linea: tuple = field(default=(), repr=False)


@dataclass
class Lectura:
    pagina: int
    zona: tuple[float, float, float, float]
    ppp: int
    modo: str
    giro: int
    inclinacion: float
    palabras: list[Palabra]
    segundo_lector: list[Palabra]
    aviso: str = ""

    def lineas(self) -> list[dict]:
        """Palabras agrupadas por renglón de Tesseract, en su orden de lectura (el de la zona girada si se leyó girada)."""
        grupos: dict[tuple, list[Palabra]] = {}
        for p in self.palabras:
            grupos.setdefault(p.linea, []).append(p)
        return [{"x": round(min(p.x for p in ps), 4), "y": round(min(p.y for p in ps), 4),
                 "c": round(sum(p.c for p in ps) / len(ps), 2), "palabras": [(p.t, p.c) for p in ps]} for ps in grupos.values()]

    def como_dict(self) -> dict:
        def pal(p: Palabra) -> dict:
            return {"t": p.t, "x": p.x, "y": p.y, "w": p.w, "h": p.h, "c": p.c}
        return {"pagina": self.pagina, "zona": list(self.zona), "ppp": self.ppp, "modo": self.modo, "giro": self.giro,
                "inclinacion_grados": self.inclinacion, "palabras": [pal(p) for p in self.palabras],
                "segundo_lector": [pal(p) for p in self.segundo_lector], "aviso": self.aviso}

    def como_texto(self) -> str:
        """Salida compacta para el modelo: un renglón por línea, con la confianza [0–100] solo si es menor de 90.

        Lo normal es un solo lector: RapidOCR, o Tesseract si RapidOCR no leyó nada. Si leyeron los dos (el banco), las
        palabras de Tesseract sin dígitos y con confianza menor de 60 no se muestran: en las zonas que pidió DeepSeek en
        Casco Antiguo (r80) eran un tercio de las palabras y casi todas trazos del dibujo leídos como «NS», «l», «E».
        """
        lector = "RapidOCR" if self.segundo_lector else "Tesseract"
        cab = (f"Lámina {self.pagina}, zona {', '.join(f'{v:.3f}' for v in self.zona)}: OCR ({lector}) a {self.ppp} ppp, "
               f"modo {self.modo}{f', girada {self.giro}°' if self.giro else ''}"
               f"{f', enderezada {self.inclinacion:+.1f}°' if self.inclinacion else ''}. "
               "Renglón: x y (fracciones 0–1 de la hoja) | texto; [n] = confianza si es menor de 90.")
        partes = [self.aviso, cab] if self.aviso else [cab]

        def pal(t: str, c: float) -> str:
            return t if c >= 0.9 else f"{t}[{round(c * 100)}]"

        piso = CONF_MIN_CON_SEGUNDO if self.segundo_lector else 0.0
        lineas = [(ren, [(t, c) for t, c in ren["palabras"] if c >= piso or any(ch.isdigit() for ch in t)]) for ren in self.lineas()]
        omitidas = sum(len(ren["palabras"]) - len(ps) for ren, ps in lineas)
        lineas = [(ren, ps) for ren, ps in lineas if ps]
        if not lineas and not self.segundo_lector:
            partes.append("Sin texto legible en la zona: mírala con ver_recorte o ver_zona.")
        for p in sorted(self.segundo_lector, key=lambda p: (round(p.y, 2), p.x)):
            partes.append(f"{p.x:.3f} {p.y:.3f} | {pal(p.t, p.c)}")
        if lineas and self.segundo_lector:
            partes.append("Tesseract (compáralo en números y dígitos dudosos):")
        for ren, ps in lineas:
            partes.append(f"{ren['x']:.3f} {ren['y']:.3f} | " + " ".join(pal(t, c) for t, c in ps))
        if omitidas:
            partes.append(f"({omitidas} palabras de Tesseract sin dígitos y con confianza menor de {round(piso * 100)} omitidas.)")
        return "\n".join(partes)


# ---------------------------------------------------------------------------------------------------------------
# Imagen.


def renderizar(pagina, zona: tuple, ppp: int):
    """Zona en escala de grises (numpy) y los ppp con que se renderizó (menos que los pedidos si la zona es grande)."""
    import numpy as np  # noqa: PLC0415
    import pymupdf  # noqa: PLC0415

    r = pagina.rect
    x0, y0, x1, y1 = zona
    clip = pymupdf.Rect(r.x0 + r.width * x0, r.y0 + r.height * y0, r.x0 + r.width * x1, r.y0 + r.height * y1)
    pixeles = clip.width * clip.height * (ppp / 72) ** 2
    if pixeles > MAX_PIXELES:
        ppp = int(ppp * (MAX_PIXELES / pixeles) ** 0.5)
    if ppp < PPP_MIN:
        return None, ppp
    pix = pagina.get_pixmap(dpi=ppp, clip=clip, colorspace=pymupdf.csGRAY)
    gris = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.stride)[:, : pix.width].copy()
    return gris, ppp


def limpiar(gris):
    """Aplana el fondo (divide por el fondo estimado con un cierre morfológico grande: quita manchas, amarillo y
    sombras del escaneo) y sube el contraste local con CLAHE. El texto sigue en gris: Tesseract binariza mejor que un
    umbral fijo."""
    import cv2  # noqa: PLC0415

    lado = max(15, (min(gris.shape) // 40) | 1)
    fondo = cv2.morphologyEx(gris, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (lado, lado)))
    plano = cv2.divide(gris, fondo, scale=255)
    return cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(plano)


def inclinacion(img) -> float:
    """Inclinación del escaneo (grados, positivo = antihorario) por la mediana de los segmentos largos casi horizontales
    (líneas del dibujo, renglones del cuadro). 0 si no hay suficientes o si pasa de MAX_INCLINACION."""
    import cv2  # noqa: PLC0415
    import numpy as np  # noqa: PLC0415

    bordes = cv2.Canny(img, 50, 150)
    largo = max(80, img.shape[1] // 20)
    # Resolución de 0.25°: con 0.1° OpenCV 5 no devuelve segmentos; el ángulo final sale de los extremos de cada segmento.
    segs = cv2.HoughLinesP(bordes, 1, np.pi / 720, threshold=100, minLineLength=largo, maxLineGap=20)
    if segs is None:
        return 0.0
    angulos = []
    for x0, y0, x1, y1 in segs.reshape(-1, 4).tolist():
        a = np.degrees(np.arctan2(y0 - y1, x1 - x0))   # y crece hacia abajo: se invierte para que antihorario sea positivo
        if abs(a) <= MAX_INCLINACION:
            angulos.append(a)
    if len(angulos) < 5:
        return 0.0
    a = float(np.median(angulos))
    return round(a, 2) if abs(a) >= 0.15 else 0.0


def enderezar(img, angulo: float):
    """Imagen girada para dejar horizontal lo que estaba inclinado `angulo` grados, y la matriz afín usada."""
    import cv2  # noqa: PLC0415

    alto, ancho = img.shape
    m = cv2.getRotationMatrix2D((ancho / 2, alto / 2), -angulo, 1.0)
    return cv2.warpAffine(img, m, (ancho, alto), flags=cv2.INTER_CUBIC, borderValue=255), m


def _png(img) -> bytes:
    import cv2  # noqa: PLC0415

    return cv2.imencode(".png", img)[1].tobytes()


def _girar(img, giro: int):
    import cv2  # noqa: PLC0415

    if giro == 0:
        return img
    return cv2.rotate(img, {90: cv2.ROTATE_90_CLOCKWISE, 180: cv2.ROTATE_180, 270: cv2.ROTATE_90_COUNTERCLOCKWISE}[giro])


def _desgirar(x: float, y: float, giro: int, ancho: int, alto: int) -> tuple[float, float]:
    """Punto de la imagen girada `giro` grados (horario) → punto de la imagen sin girar de ancho × alto."""
    if giro == 90:
        return y, alto - x
    if giro == 270:
        return ancho - y, x
    if giro == 180:
        return ancho - x, alto - y
    return x, y


# ---------------------------------------------------------------------------------------------------------------
# Lectura.


def _tesseract_palabras(png: bytes, psm: str, permitidos: str | None) -> list[tuple]:
    """Palabras de Tesseract: (x0, y0, x1, y1, texto, confianza 0–100, clave de renglón) en píxeles de la imagen."""
    from precheck.planos.lineas import _tesseract  # noqa: PLC0415

    extra = ["-c", f"tessedit_char_whitelist={permitidos}"] if permitidos else []
    salida = []
    for fila in _tesseract(png, "-l", "spa", "--psm", psm, *extra, "tsv").splitlines()[1:]:
        c = fila.split("\t")
        if len(c) < 12 or not c[11].strip() or float(c[10]) < 0:
            continue
        x, y, w, h = int(c[6]), int(c[7]), int(c[8]), int(c[9])
        salida.append((x, y, x + w, y + h, c[11], float(c[10]), (c[2], c[3], c[4])))
    return salida


def _a_hoja(cajas_px, giro: int, m_inv, ancho: int, alto: int, zona: tuple) -> tuple[float, float, float, float]:
    """Caja en píxeles de la imagen leída (girada y enderezada) → (x, y, w, h) en fracciones de la hoja."""
    import numpy as np  # noqa: PLC0415

    x0, y0, x1, y1 = cajas_px
    puntos = []
    for x, y in ((x0, y0), (x1, y0), (x0, y1), (x1, y1)):
        if m_inv is not None:
            x, y = (m_inv @ np.array([x, y, 1.0])).tolist()
        x, y = _desgirar(x, y, giro, ancho, alto)
        puntos.append((min(max(x, 0), ancho), min(max(y, 0), alto)))
    xs, ys = [p[0] for p in puntos], [p[1] for p in puntos]
    zx0, zy0, zx1, zy1 = zona
    fx, fy = (zx1 - zx0) / ancho, (zy1 - zy0) / alto
    return (round(zx0 + min(xs) * fx, 4), round(zy0 + min(ys) * fy, 4),
            round((max(xs) - min(xs)) * fx, 4), round((max(ys) - min(ys)) * fy, 4))


def es_palabra(texto: str, conf: float) -> bool:
    """Descarta el ruido del dibujo que Tesseract lee como texto: trazos sin letras ni dígitos («—», «-») y lecturas
    cortas con confianza casi nula («h[0]»)."""
    return any(ch.isalnum() for ch in texto) and not (conf < 20 and len(texto) < 4)


def _calidad(palabras: list[tuple]) -> int:
    from precheck.planos.lineas import _calidad as calidad  # noqa: PLC0415

    return calidad(palabras)


def elegir_giro(img, ppp: int) -> int:
    """Giro (grados, horario) con que la zona se lee mejor: se lee una copia reducida a PPP_GIRO en cada giro de GIROS y
    gana la que da más palabras buenas; a igualdad, sin girar."""
    import cv2  # noqa: PLC0415

    k = min(1.0, PPP_GIRO / ppp)
    chica = cv2.resize(img, None, fx=k, fy=k, interpolation=cv2.INTER_AREA) if k < 1 else img
    puntajes = {g: _calidad(_tesseract_palabras(_png(_girar(chica, g)), "11", None)) for g in GIROS}
    return max(GIROS, key=lambda g: (puntajes[g], g == 0))


def _segundo(img) -> list[tuple]:
    """Líneas de RapidOCR (si está instalado) en píxeles de la imagen: (x0, y0, x1, y1, texto, puntaje 0–1)."""
    from precheck.planos.lineas import _segundo_lector  # noqa: PLC0415

    motor = _segundo_lector()
    if motor is None:
        return []
    try:
        r = motor(_png(img))
    except Exception:  # noqa: BLE001 — el segundo lector es opcional
        return []
    if r is None or not r.txts:
        return []
    salida = []
    for caja, texto, puntaje in zip(r.boxes, r.txts, r.scores):
        xs, ys = [float(p[0]) for p in caja], [float(p[1]) for p in caja]
        if str(texto).strip():
            salida.append((min(xs), min(ys), max(xs), max(ys), str(texto).strip(), float(puntaje)))
    return salida


def leer_zona(pdf, pagina: int, zona: tuple, ppp: int = PPP_ZONA, modo: str = "texto", segundo: bool = True,
              tesseract_de_respaldo: bool = True) -> Lectura:
    """Lee con OCR la zona (x0, y0, x1, y1 en fracciones de la hoja) de la lámina `pagina` (desde 1) de `pdf` (ruta o
    documento de PyMuPDF). Con `segundo`, lee RapidOCR; Tesseract lee solo si RapidOCR no leyó nada (o siempre, con
    `tesseract_de_respaldo=False`, para comparar los dos lectores en el banco)."""
    import pymupdf  # noqa: PLC0415

    if modo not in MODOS:
        raise ValueError(f"modo desconocido: {modo} (usa {', '.join(MODOS)})")
    doc = pymupdf.open(pdf) if isinstance(pdf, str) else pdf
    if not 1 <= pagina <= len(doc):
        raise ValueError(f"la lámina {pagina} no existe (el PDF tiene {len(doc)})")
    ppp = min(PPP_MAX, max(PPP_MIN, int(ppp)))
    gris, ppp_real = renderizar(doc[pagina - 1], zona, ppp)
    if gris is None:
        return Lectura(pagina, zona, ppp_real, modo, 0, 0.0, [], [],
                       aviso="Zona demasiado grande para leerla a 200 ppp o más: pide una zona más chica (un cuarto de la hoja o menos).")
    alto, ancho = gris.shape
    img = limpiar(gris)
    psm, permitidos = MODOS[modo]
    giro = elegir_giro(img, ppp_real)
    girada = _girar(img, giro)
    angulo = inclinacion(girada)
    m_inv = None
    if angulo:
        import cv2  # noqa: PLC0415

        girada, m = enderezar(girada, angulo)
        m_inv = cv2.invertAffineTransform(m)
    segundas = []
    if segundo:
        for x0, y0, x1, y1, texto, puntaje in _segundo(girada):
            x, y, w, h = _a_hoja((x0, y0, x1, y1), giro, m_inv, ancho, alto, zona)
            segundas.append(Palabra(texto, x, y, w, h, round(puntaje, 2)))
    salida = []
    # RapidOCR solo lee en el banco lo mismo que con Tesseract al lado (18 de 19; Tesseract solo, 9): si leyó algo,
    # Tesseract no corre y la salida es la mitad. Tesseract queda de respaldo y para elegir el giro.
    if not (segundas and tesseract_de_respaldo):
        for x0, y0, x1, y1, texto, conf, clave in _tesseract_palabras(_png(girada), psm, permitidos):
            if not es_palabra(texto, conf):
                continue
            x, y, w, h = _a_hoja((x0, y0, x1, y1), giro, m_inv, ancho, alto, zona)
            salida.append(Palabra(texto, x, y, w, h, round(conf / 100, 2), clave))
    return Lectura(pagina, tuple(zona), ppp_real, modo, giro, angulo, salida, segundas)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("pdf")
    ap.add_argument("pagina", type=int)
    ap.add_argument("zona", help="x0,y0,x1,y1 en fracciones 0–1 de la hoja")
    ap.add_argument("--ppp", type=int, default=PPP_ZONA)
    ap.add_argument("--modo", default="texto", choices=list(MODOS))
    ap.add_argument("--sin-segundo", action="store_true", help="no usar RapidOCR aunque esté instalado")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)
    try:
        zona = tuple(min(1.0, max(0.0, float(v))) for v in a.zona.split(","))
        if len(zona) != 4 or zona[2] <= zona[0] or zona[3] <= zona[1]:
            raise ValueError("zona inválida: x0,y0,x1,y1 con x1 > x0 y y1 > y0")
        lectura = leer_zona(a.pdf, a.pagina, zona, a.ppp, a.modo, segundo=not a.sin_segundo)
    except ValueError as e:
        print(json.dumps({"error": str(e)}, ensure_ascii=False) if a.json else str(e))
        return 0
    sys.stdout.reconfigure(encoding="utf-8")
    print(json.dumps(lectura.como_dict(), ensure_ascii=False) if a.json else lectura.como_texto())
    return 0


if __name__ == "__main__":
    sys.exit(main())
