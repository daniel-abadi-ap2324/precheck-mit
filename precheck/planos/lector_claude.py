"""Tercer lector, opcional, del recuadro de datos del lote en hojas escaneadas: Claude por el CLI de Claude Code.

Está apagado por defecto; se activa con la variable de entorno `PRECHECK_OCR_CLAUDE=1`. Relee el mismo recorte que el
segundo lector (RapidOCR, ver lineas._reforzar_recuadros) con la instrucción de copiar el texto **literalmente** y
fusiona por rótulos (finca, área, tomo, folio, ubicación, zonificación, uso de suelo):

- si Claude y la lectura anterior (RapidOCR o, si este no leyó el dato, Tesseract) coinciden en el valor: confianza 0.8;
- si difieren: se queda el texto de Claude con confianza 0.6 y la línea lleva `candidatos` con ambas lecturas, para
  que la persona elija en el paso 1;
- si solo Claude leyó el dato: 0.7.

Nunca llega al umbral 0.85 del motor: la persona lo confirma. En la prueba (docs/ocr-glm) Claude leyó el recuadro mejor
que los otros lectores, pero «corrigió» un número del plano (0.073314 en lugar de 0.0773314); por eso la copia literal
y el contraste con otro lector. Si el CLI falla o no está instalado, se ignora sin error.
"""
from __future__ import annotations

import json
import logging
import os
import re
import subprocess
import tempfile
import unicodedata
from pathlib import Path
from typing import Callable, Optional

from precheck.planos.lineas import Linea

log = logging.getLogger(__name__)

VARIABLE = "PRECHECK_OCR_CLAUDE"
#: Modelo del CLI (`--model`); otro con PRECHECK_OCR_CLAUDE_MODELO.
MODELO = "sonnet"
#: Tope de llamadas por documento (cada recuadro de cada hoja es una llamada); otro con PRECHECK_OCR_CLAUDE_MAX.
MAX_LLAMADAS = 3
LIMITE_S = 300
#: Margen extra (puntos) a la izquierda del recorte del segundo lector: el rótulo «FINCA» puede ser el título del
#: recuadro («DATOS DE LA FINCA») y los datos empezar más a la izquierda.
MARGEN_IZQUIERDO = 80.0

#: Tope del lector: coincide con la lectura anterior. Menor que el umbral 0.85 del motor.
CONFIANZA_COINCIDE = 0.8
#: Claude y la lectura anterior difieren: la persona elige entre los `candidatos`.
CONFIANZA_DIFIERE = 0.6
#: Solo Claude leyó el dato (sin contraste).
CONFIANZA_SOLO = 0.7

PROMPT = """Eres un transcriptor literal (OCR). Lee la imagen {ruta} con la herramienta Read. Es un recorte de un plano \
escaneado (el recuadro de datos del lote).

Transcribe EXACTAMENTE el texto que se ve, línea por línea, en el orden de lectura. Reglas:
- Copia literal, carácter por carácter. No corrijas números ni ortografía aunque parezcan errores: no quites, agregues \
ni cambies dígitos aunque un número parezca tener un dígito de más o de menos, ni recalcules nada.
- No completes lo ilegible: escribe [ilegible] en su lugar.
- No traduzcas, no resumas, sin comentarios, sin formato markdown. Responde solo con el texto."""

# Rótulos de datos que se fusionan (sobre el texto sin tildes y en mayúsculas).
_ROTULO = re.compile(
    r"(?:\bCOD(?:IGO)?\.?\s*(?:DE\s+)?)?UBICACION|\bFINCAS?\b|\bAREA(?:\s+(?:DEL?\s+)?(?:LOTE|TERRENO)(?:\s+TOTAL)?)?\b|\bTOMO\b|\bFOLIO\b|ZONIFICACION|USO\s+DE\s+SUELO"
)
# Con separador obligatorio («FINCA: 078850», «AREA:733.14M2», «FINCA #07564»): así «Area Comun Cerrada» o «AREA (M2)» de
# un cuadro de áreas vecino no cuentan como el dato.
_VALOR = re.compile(r"\s*(?:N\s*[°º.]\s*|NO\.\s*)?(?:[:=]\s*#?|#)\s*([A-Z0-9][A-Z0-9.,/+-]*)")
_ILEGIBLE = re.compile(r"\[\s*ILEGIBLE\s*\]")

_estado = {"llamadas": 0, "costo_usd": 0.0, "fallos": 0}


def activo() -> bool:
    return os.environ.get(VARIABLE, "").strip() == "1"


def reiniciar() -> None:
    """Contador de llamadas y costo de un documento (extraer.extraer lo llama al empezar)."""
    _estado.update(llamadas=0, costo_usd=0.0, fallos=0)


def resumen() -> dict:
    return {"llamadas": _estado["llamadas"], "costo_usd": round(_estado["costo_usd"], 4), "fallos": _estado["fallos"]}


def _max_llamadas() -> int:
    try:
        return int(os.environ.get("PRECHECK_OCR_CLAUDE_MAX", MAX_LLAMADAS))
    except ValueError:
        return MAX_LLAMADAS


def llamar_cli(prompt: str, carpeta: Path) -> tuple[str, Optional[float]]:
    """(texto, costo en USD si el CLI lo informa) de `claude -p`. Lanza excepción si falla."""
    from precheck.planos.regiones import _comando_claude  # noqa: PLC0415 (evita el ciclo regiones → medicion → lineas)

    modelo = os.environ.get("PRECHECK_OCR_CLAUDE_MODELO", "").strip() or MODELO
    args = [*_comando_claude(), "-p", "--model", modelo, "--allowedTools", "Read", "--add-dir", str(carpeta),
            "--output-format", "json", "--no-session-persistence", "--settings", json.dumps({"disableAllHooks": True})]
    entorno = {k: v for k, v in os.environ.items() if k != "CLAUDECODE"}  # se puede lanzar desde otra sesión
    r = subprocess.run(args, input=prompt, capture_output=True, text=True, encoding="utf-8", timeout=LIMITE_S, env=entorno)
    salida = json.loads(r.stdout)
    if r.returncode != 0 or salida.get("is_error"):
        raise RuntimeError(f"Claude Code terminó con error: {str(salida.get('result') or r.stderr)[-300:]}")
    costo = salida.get("total_cost_usd")
    return str(salida.get("result") or ""), float(costo) if isinstance(costo, (int, float)) else None


def leer(png: bytes, ejecutar: Optional[Callable[[str, Path], tuple[str, Optional[float]]]] = None) -> Optional[str]:
    """Transcripción literal del recorte, o None (apagado, tope de llamadas alcanzado o el CLI falló)."""
    if not activo() or _estado["llamadas"] >= _max_llamadas():
        return None
    _estado["llamadas"] += 1
    with tempfile.TemporaryDirectory(prefix="precheck-ocr-claude-") as tmp:
        ruta = Path(tmp) / "recuadro.png"
        ruta.write_bytes(png)
        try:
            texto, costo = (ejecutar or llamar_cli)(PROMPT.format(ruta=ruta), Path(tmp))
        except Exception as e:  # noqa: BLE001 — sin CLI, sin cuota o sin red: se sigue con los otros lectores
            _estado["fallos"] += 1
            log.warning("OCR con Claude: se omite (%s: %s)", type(e).__name__, str(e)[:200])
            return None
    if costo is not None:
        _estado["costo_usd"] += costo
        log.info("OCR con Claude: costo %.4f USD (acumulado %.4f USD)", costo, _estado["costo_usd"])
    return texto


# ---------------------------------------------------------------------------------------------------------------
# Fusión por rótulos.


def _normal(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn").upper()


def _clave(rotulo: str) -> str:
    r = re.sub(r"\s+", " ", rotulo)
    for clave in ("UBICACION", "FINCA", "AREA"):   # «COD. UBICACION», «FINCAS», «AREA DEL LOTE»
        if clave in r:
            return clave
    return r


def datos(texto: str) -> list[tuple[str, str, str]]:
    """(clave, texto del dato, valor) de cada rótulo de dato del texto. «FINCA: 078850; COD. UBICACION: 8701» da
    [("FINCA", "FINCA: 078850", "078850"), ("UBICACION", "COD. UBICACION: 8701", "8701")]. Se omiten los rótulos sin valor
    («DATOS DE LA FINCA») y los datos con [ilegible]."""
    norm = _normal(texto)
    fuente = texto if len(texto) == len(norm) else norm   # para cortar el texto original en las mismas posiciones
    marcas = list(_ROTULO.finditer(norm))
    salida = []
    for i, m in enumerate(marcas):
        fin = marcas[i + 1].start() if i + 1 < len(marcas) else len(norm)
        trozo = norm[m.start():fin]
        v = _VALOR.match(norm, m.end(), fin)
        if v is None or _ILEGIBLE.search(trozo):
            continue
        salida.append((_clave(m.group(0)), fuente[m.start():fin].strip().rstrip(";,").strip(), v.group(1).rstrip(".,")))
    return salida


#: Rótulos de datos distintos que debe mostrar la lectura previa de la zona para gastar una llamada en ella.
MIN_ROTULOS_RECUADRO = 2


def es_recuadro_de_datos(lineas: list[Linea], region: tuple, numero: int) -> bool:
    """¿La zona parece el recuadro de datos del lote? Al menos dos rótulos de dato distintos con valor (finca, área,
    tomo, folio…) en lo ya leído. Un rótulo suelto («VECINO ADOSADO FINCA: #07564») no lo es."""
    claves = {c for ln in lineas if ln.pagina == numero and _dentro(ln, region) for c, _, _ in datos(ln.texto)}
    return len(claves) >= MIN_ROTULOS_RECUADRO


def _dentro(ln: Linea, region: tuple) -> bool:
    cx, cy = (ln.bbox[0] + ln.bbox[2]) / 2, (ln.bbox[1] + ln.bbox[3]) / 2
    return region[0] <= cx <= region[2] and region[1] <= cy <= region[3]


def _union(cajas: list[tuple]) -> tuple[float, float, float, float]:
    return (min(c[0] for c in cajas), min(c[1] for c in cajas), max(c[2] for c in cajas), max(c[3] for c in cajas))


def fusionar(lineas: list[Linea], texto_claude: str, region: tuple, numero: int, otras: list[Linea] = (),
             ancla: Optional[Linea] = None, coincide: float = CONFIANZA_COINCIDE) -> list[Linea]:
    """Reemplaza los datos del recuadro por los que leyó Claude. `lineas`: la lectura de la hoja (con el segundo lector
    ya fusionado); `otras`: todo lo que leyó el segundo lector en el recorte (para contrastar también los datos que no
    fusionó, como la zonificación). Cada dato de Claude va en su propia línea, en la caja de la línea que lo traía."""
    de_claude: dict[str, str] = {}
    for fila in texto_claude.splitlines():
        for clave, trozo, _valor in datos(fila):
            de_claude.setdefault(clave, trozo)
    if not de_claude:
        return lineas
    en_region = [ln for ln in lineas if ln.pagina == numero and _dentro(ln, region)]
    # Lectura anterior de cada dato: primero la del segundo lector, luego la de la hoja (Tesseract).
    previa: dict[str, tuple[str, str, Linea]] = {}
    for ln in [*(o for o in otras if _dentro(o, region)), *en_region]:
        for clave, trozo, valor in datos(ln.texto):
            previa.setdefault(clave, (trozo, valor, ln))
    # Se quitan las líneas de la hoja cuyos datos trae todos Claude; las que traen además otro dato se conservan.
    quitar, cajas = set(), {}
    for ln in en_region:
        claves = {c for c, _, _ in datos(ln.texto)}
        if claves and claves <= de_claude.keys():
            quitar.add(id(ln))
            for c in claves:
                cajas.setdefault(c, []).append(ln.bbox)
    nuevas = []
    for clave, trozo in de_claude.items():
        valor = datos(trozo)[0][2]
        anterior = previa.get(clave)
        if anterior is None:
            conf, candidatos = CONFIANZA_SOLO, ()
        elif _comparable(anterior[1]) == _comparable(valor):
            conf, candidatos = coincide, ()
        else:
            conf, candidatos = CONFIANZA_DIFIERE, (trozo, anterior[0])
        caja = (_union(cajas[clave]) if clave in cajas else anterior[2].bbox if anterior and _dentro(anterior[2], region)
                else ancla.bbox if ancla else tuple(region))
        nuevas.append(Linea(trozo, numero, tuple(float(v) for v in caja), "ocr", conf, candidatos))
    return [ln for ln in lineas if id(ln) not in quitar] + nuevas


def _comparable(valor: str) -> str:
    """El mismo valor escrito igual: sin espacios ni comas de miles («1,500» = «1500»)."""
    return re.sub(r"[\s,]", "", valor.upper())
