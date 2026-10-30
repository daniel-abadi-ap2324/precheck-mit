"""Líneas de texto de un plano, con su procedencia: página, caja en la orientación en que se lee la hoja, método
(texto vectorial del PDF u OCR) y confianza."""
from __future__ import annotations

import io
import re
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Linea:
    texto: str
    pagina: int
    #: [x0, y0, x1, y1] en puntos, en la orientación de lectura de la hoja.
    bbox: tuple[float, float, float, float]
    #: "pdf_texto" (vectorial, exportado de CAD) u "ocr" (escaneado).
    metodo: str
    confianza: float
    #: Lecturas distintas de la misma línea por dos lectores (primero la que se usa; ver lector_claude). Vacío casi siempre.
    candidatos: tuple[str, ...] = ()


# ---------------------------------------------------------------------------------------------------------------
# Lectura de líneas desde una página del PDF.


#: Por debajo de este número de palabras con texto vectorial, la hoja se trata como escaneada.
MIN_PALABRAS_VECTORIAL = 20
#: Resolución del OCR: el texto de un plano mide 2–3 mm; a 150 ppp queda en 12–18 px, legible para Tesseract.
DPI_OCR = 150


def es_escaneada(pagina) -> bool:
    return len(pagina.get_text("words")) < MIN_PALABRAS_VECTORIAL and bool(pagina.get_images())


def lineas_vectoriales(pagina, numero: int) -> list[Linea]:
    """Texto exportado de CAD: palabras agrupadas por línea, con la caja en la orientación de lectura."""
    grupos: dict[tuple[int, int], list] = {}
    for x0, y0, x1, y1, texto, bloque, linea, _ in pagina.get_text("words"):
        grupos.setdefault((bloque, linea), []).append((x0, y0, x1, y1, texto))
    salida = []
    for palabras in grupos.values():
        palabras.sort(key=lambda w: (w[0], w[1]))
        import pymupdf  # noqa: PLC0415 (dependencia opcional del módulo)

        caja = pymupdf.Rect(min(w[0] for w in palabras), min(w[1] for w in palabras),
                            max(w[2] for w in palabras), max(w[3] for w in palabras)) * pagina.rotation_matrix
        salida.append(Linea(" ".join(w[4] for w in palabras), numero, (caja.x0, caja.y0, caja.x1, caja.y1), "pdf_texto", 0.99))
    return salida


def _tesseract(png: bytes, *args: str) -> str:
    with tempfile.TemporaryDirectory() as d:
        ruta = Path(d) / "hoja.png"
        ruta.write_bytes(png)
        r = subprocess.run(["tesseract", str(ruta), "-", *args], capture_output=True, text=True, timeout=600)
        return r.stdout


#: Por debajo de esta confianza del detector de orientación, se lee la hoja en ambas orientaciones y se elige la mejor.
CONFIANZA_ORIENTACION = 5.0


def orientacion(png: bytes) -> tuple[int, float]:
    """(grados a girar en sentido horario para leer la imagen, confianza) según Tesseract (--psm 0)."""
    salida = _tesseract(png, "--psm", "0")
    m = re.search(r"Rotate:\s*(\d+)", salida)
    c = re.search(r"Orientation confidence:\s*([\d.]+)", salida)
    return (int(m.group(1)) if m else 0), (float(c.group(1)) if c else 0.0)


def _girar(png: bytes, giro: int):
    from PIL import Image  # noqa: PLC0415

    img = Image.open(io.BytesIO(png))
    if giro:
        img = img.rotate(-giro, expand=True)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return img, buf.getvalue()


def _palabras(png: bytes, psm: str = "11") -> list[tuple]:
    """Palabras del OCR: (x0, y0, x1, y1, texto, confianza, clave de línea) en píxeles."""
    salida = []
    for fila in _tesseract(png, "-l", "spa", "--psm", psm, "tsv").splitlines()[1:]:
        c = fila.split("\t")
        if len(c) < 12 or not c[11].strip() or float(c[10]) < 0:
            continue
        x, y, w, h = int(c[6]), int(c[7]), int(c[8]), int(c[9])
        salida.append((x, y, x + w, y + h, c[11], float(c[10]), (c[2], c[3], c[4])))
    return salida


def _calidad(palabras: list[tuple]) -> int:
    """Palabras reales leídas con confianza alta: sirve para comparar dos orientaciones de la misma hoja."""
    return sum(1 for p in palabras if p[5] >= 70 and len(p[4]) >= 3 and any(ch.isalnum() for ch in p[4]))


def lineas_ocr(pagina, numero: int, dpi: int = DPI_OCR):
    """Hoja escaneada: se endereza con el detector de orientación y se lee con Tesseract (español, texto disperso).
    Devuelve (líneas en puntos de la hoja enderezada, imagen enderezada, ancho, alto)."""
    original = pagina.get_pixmap(dpi=dpi).tobytes("png")
    giro, confianza = orientacion(original)
    candidatos = [giro] if confianza >= CONFIANZA_ORIENTACION or giro == 0 else [giro, 0]
    lecturas = []
    for g in candidatos:
        img, png = _girar(original, g)
        lecturas.append((_calidad(pal := _palabras(png)), g, img, pal))
    _, giro, img, palabras = max(lecturas, key=lambda x: x[0])
    a_puntos = 72 / dpi
    lineas: dict[tuple, list] = {}
    for x0, y0, x1, y1, texto, conf, clave in palabras:
        lineas.setdefault(clave, []).append((x0, y0, x1, y1, texto, conf))
    salida = []
    for grupo in lineas.values():
        grupo.sort()
        caja = (min(p[0] for p in grupo) * a_puntos, min(p[1] for p in grupo) * a_puntos,
                max(p[2] for p in grupo) * a_puntos, max(p[3] for p in grupo) * a_puntos)
        conf = sum(p[5] for p in grupo) / len(grupo) / 100
        salida.append(Linea(" ".join(p[4] for p in grupo), numero, caja, "ocr", round(conf, 2)))
    salida = _reforzar_recuadros(pagina, giro, salida, numero, img.width * a_puntos, img.height * a_puntos)
    return salida, img, img.width * a_puntos, img.height * a_puntos


# Segundo lector (RapidOCR) para el recuadro de datos del lote («DATOS DE LA FINCA», «FINCA: …», «AREA: …»). Es texto de pocos
# puntos en una hoja grande y Tesseract lo lee con dígitos mal (la finca 078850 sale «1336» y el área 733.14 sale «133.14», en
# cualquier resolución). Solo se relee la zona alrededor del rótulo «FINCA», nunca toda la hoja (la hoja completa a esta
# resolución la reduce y pierde el texto). Es opcional: sin RapidOCR instalado no cambia nada.
ANCLA_RECUADRO = re.compile(r"\bFINCA\b", re.IGNORECASE)
DPI_RECUADRO = 300
#: Margen (puntos) alrededor del rótulo: izquierda, arriba, derecha, abajo.
MARGEN_RECUADRO = (30.0, 40.0, 420.0, 260.0)
MAX_RECUADROS = 3
#: Lo leído por el segundo lector nunca llega solo al umbral del motor (0.85): se probó en un solo plano. La IA lo ve y lo comprueba.
#: Con 0.8 una finca leída solo por el segundo lector llega a 0.72, por encima del 0.7 con que el extractor la da por «ok».
CONFIANZA_SEGUNDO_LECTOR = 0.8
_SEGUNDO_LECTOR: list = []   # [] sin intentar; [motor] o [None] si no está disponible


def _segundo_lector():
    if not _SEGUNDO_LECTOR:
        try:
            import logging  # noqa: PLC0415

            from rapidocr import RapidOCR  # noqa: PLC0415

            logging.getLogger("RapidOCR").setLevel(logging.ERROR)
            _SEGUNDO_LECTOR.append(RapidOCR())
        except Exception:  # noqa: BLE001 — sin la librería o sin sus modelos, se sigue solo con Tesseract
            _SEGUNDO_LECTOR.append(None)
    return _SEGUNDO_LECTOR[0]


def region_del_recuadro(caja: tuple, ancho: float, alto: float) -> tuple[float, float, float, float]:
    """Zona (puntos) que se relee alrededor de la línea con el rótulo, recortada a la hoja."""
    izq, arriba, der, abajo = MARGEN_RECUADRO
    return (max(0.0, caja[0] - izq), max(0.0, caja[1] - arriba), min(ancho, caja[2] + der), min(alto, caja[3] + abajo))


def lineas_del_segundo_lector(cajas, textos, puntajes, numero: int, region: tuple, dpi: int = DPI_RECUADRO) -> list[Linea]:
    """Líneas en puntos de la hoja a partir de lo que leyó el segundo lector sobre un recorte (cajas en píxeles del recorte)."""
    k = 72 / dpi
    salida = []
    for caja, texto, puntaje in zip(cajas, textos, puntajes):
        texto = str(texto).strip()
        if not texto:
            continue
        xs, ys = [float(p[0]) for p in caja], [float(p[1]) for p in caja]   # RapidOCR devuelve numpy: no se serializa a JSON
        salida.append(Linea(texto, numero, (min(xs) * k + region[0], min(ys) * k + region[1], max(xs) * k + region[0], max(ys) * k + region[1]),
                            "ocr", round(min(float(puntaje), CONFIANZA_SEGUNDO_LECTOR), 2)))
    return salida


#: Rótulos de datos numéricos del recuadro (sin : el OCR junta el rótulo con el número, «AREA733.14M2»).
ROTULOS_DE_DATOS = re.compile(r"FINCA|AREA|ÁREA|TOMO|FOLIO|UBICACI", re.IGNORECASE)


def fusionar_recuadro(lineas: list[Linea], nuevas: list[Linea], region: tuple | None = None) -> list[Linea]:
    """Solo las líneas nuevas con rótulo de dato numérico (finca, área, tomo, folio, ubicación) reemplazan a las de la primera
    lectura que caen sobre ellas. El resto de la primera lectura (la zona, los textos) queda como estaba: el segundo lector
    se probó para los dígitos de esos datos, no para todo el recuadro."""
    utiles = [n for n in nuevas if ROTULOS_DE_DATOS.search(n.texto)]

    def tapada(ln: Linea) -> bool:
        cx, cy = (ln.bbox[0] + ln.bbox[2]) / 2, (ln.bbox[1] + ln.bbox[3]) / 2
        return any(n.bbox[0] - 2 <= cx <= n.bbox[2] + 2 and n.bbox[1] - 3 <= cy <= n.bbox[3] + 3 for n in utiles)
    return [ln for ln in lineas if not tapada(ln)] + utiles


def _reforzar_recuadros(pagina, giro: int, lineas: list[Linea], numero: int, ancho: float, alto: float) -> list[Linea]:
    """Relee el recuadro de datos con el segundo lector (RapidOCR, si está instalado) y, si PRECHECK_OCR_CLAUDE=1, con
    el tercero: GLM-OCR en esta computadora (lector_glm, si Ollama lo tiene) o Claude (lector_claude)."""
    from precheck.planos import lector_claude, lector_glm  # noqa: PLC0415

    anclas = [ln for ln in lineas if ANCLA_RECUADRO.search(ln.texto)]
    motor = _segundo_lector() if anclas else None
    con_glm = bool(anclas) and lector_glm.activo()
    con_claude = bool(anclas) and (con_glm or lector_claude.activo())
    if motor is None and not con_claude:
        return lineas
    from PIL import Image  # noqa: PLC0415

    Image.MAX_IMAGE_PIXELS = None   # una hoja de 24×36 pulgadas a 300 dpi son ~78 millones de píxeles
    hoja, hechas, leidas = None, [], []
    k = DPI_RECUADRO / 72

    def recorte(region) -> bytes:
        nonlocal hoja
        if hoja is None:
            hoja, _ = _girar(pagina.get_pixmap(dpi=DPI_RECUADRO).tobytes("png"), giro)
        buf = io.BytesIO()
        hoja.crop(tuple(int(v * k) for v in region)).save(buf, format="PNG")
        return buf.getvalue()

    for ancla in anclas:
        if len(hechas) >= MAX_RECUADROS or any(r[0] <= ancla.bbox[0] <= r[2] and r[1] <= ancla.bbox[1] <= r[3] for r in hechas):
            continue
        region = region_del_recuadro(ancla.bbox, ancho, alto)
        nuevas = []
        if motor is not None:
            try:
                r = motor(recorte(region))
                nuevas = lineas_del_segundo_lector(r.boxes, r.txts, r.scores, numero, region) if r is not None and r.txts else []
            except Exception:  # noqa: BLE001 — un fallo del segundo lector no debe tumbar la lectura de la hoja
                nuevas = []
        leidas.append((ancla, region, nuevas))
        if nuevas:
            lineas = fusionar_recuadro(lineas, nuevas)
            hechas.append(region)
    if not con_claude:
        return lineas
    # Tercer lector, después de todos los recortes del segundo (que si no reemplazaría lo de Claude). Cuesta por llamada:
    # solo un recuadro de datos (no un rótulo suelto de finca vecina) y una vez por recuadro. Con más margen a la
    # izquierda: el rótulo puede ser el título del recuadro («DATOS DE LA FINCA») y los datos empezar más a la izquierda.
    del_segundo = [n for _, _, nuevas in leidas for n in nuevas]
    de_claude: list[tuple] = []
    for ancla, region, _ in leidas:
        zona = (max(0.0, region[0] - lector_claude.MARGEN_IZQUIERDO), *region[1:])
        if any(ancla.bbox[0] <= z[2] and z[0] <= ancla.bbox[2] and ancla.bbox[1] <= z[3] and z[1] <= ancla.bbox[3] for z in de_claude):
            continue
        if not lector_claude.es_recuadro_de_datos(lineas, zona, numero):
            continue
        texto = lector_glm.leer(recorte(zona)) if con_glm else None
        if texto:
            lineas = lector_claude.fusionar(lineas, texto, zona, numero, del_segundo, ancla, coincide=lector_glm.CONFIANZA_COINCIDE)
            de_claude.append(zona)
            continue
        texto = lector_claude.leer(recorte(zona))
        if texto:
            lineas = lector_claude.fusionar(lineas, texto, zona, numero, del_segundo, ancla)
            de_claude.append(zona)
    return lineas


# ---------------------------------------------------------------------------------------------------------------
# Imágenes incrustadas en una hoja vectorial (sello del profesional escaneado y pegado en el membrete).

#: Lado mínimo y máximo (pt) de una imagen que puede ser un sello: de 0.5" a 5".
LADO_SELLO_PT = (36.0, 360.0)
#: Resolución del OCR de esas imágenes: el texto del sello es pequeño.
DPI_SELLO = 200
#: Tope de imágenes distintas que se leen por documento (control de tiempo).
MAX_IMAGENES_SELLO = 12


def lineas_sellos(doc, paginas: list[int]) -> list[Linea]:
    """OCR de las imágenes pequeñas de las hojas vectoriales que pueden ser el sello del profesional. El sello se pega
    en cada hoja en el mismo sitio: se leen primero las imágenes que más se repiten y, a igualdad, las más a la
    derecha (membrete). Cada imagen distinta (por tamaño en píxeles) se lee una sola vez, en su orientación de lectura."""
    candidatos: dict[tuple, dict] = {}
    for n in paginas:
        pagina = doc[n - 1]
        for img in pagina.get_images(full=True):
            xref, ancho_px, alto_px = img[0], img[2], img[3]
            for rect in pagina.get_image_rects(xref):
                r = rect * pagina.rotation_matrix
                if not (LADO_SELLO_PT[0] <= r.width <= LADO_SELLO_PT[1] and LADO_SELLO_PT[0] <= r.height <= LADO_SELLO_PT[1]):
                    continue
                c = candidatos.setdefault((ancho_px, alto_px), {"paginas": set(), "n": n, "rect": r, "derecha": r.x1 / pagina.rect.width})
                c["paginas"].add(n)
    orden = sorted(candidatos.values(), key=lambda c: (-len(c["paginas"]), -c["derecha"]))[:MAX_IMAGENES_SELLO]
    salida: list[Linea] = []
    for c in orden:
        salida += _ocr_recorte(doc[c["n"] - 1], c["n"], c["rect"])
    return salida


def _ocr_recorte(pagina, numero: int, r) -> list[Linea]:
    png = pagina.get_pixmap(dpi=DPI_SELLO, clip=r).tobytes("png")
    a_puntos = 72 / DPI_SELLO
    grupos: dict[tuple, list] = {}
    # El sello es un bloque de texto compacto: se lee como bloque (--psm 6), no como texto disperso.
    for x0, y0, x1, y1, texto, conf, clave in _palabras(png, psm="6"):
        grupos.setdefault(clave, []).append((x0, y0, x1, y1, texto, conf))
    salida = []
    for grupo in grupos.values():
        grupo.sort()
        caja = (r.x0 + min(g[0] for g in grupo) * a_puntos, r.y0 + min(g[1] for g in grupo) * a_puntos,
                r.x0 + max(g[2] for g in grupo) * a_puntos, r.y0 + max(g[3] for g in grupo) * a_puntos)
        salida.append(Linea(" ".join(g[4] for g in grupo), numero, caja, "ocr",
                            round(sum(g[5] for g in grupo) / len(grupo) / 100, 2)))
    return salida
