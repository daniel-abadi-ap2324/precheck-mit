"""Lector del recuadro de datos del lote en hojas escaneadas con GLM-OCR, que corre en esta computadora con Ollama.

El plano no sale de la máquina. En la prueba (docs/ocr-glm) GLM-OCR leyó el recuadro de Casco Antiguo sin un solo error
(15 de 15 números), pero tarda: unos 8 minutos por recorte sin tarjeta gráfica. Por eso se lee un solo recuadro por
documento y solo en hojas escaneadas (las vectoriales traen el texto en el PDF).

Se enciende con `PRECHECK_OCR_GLM=1` (la web lo pone cuando la persona elige GLM-OCR al cargar el plano) y solo si
Ollama responde y tiene el modelo `glm-ocr`. Apagado por defecto: así la línea de comandos y las pruebas no esperan. Se fusiona por rótulos
como el lector de Claude (lector_claude.fusionar): si GLM-OCR y la lectura anterior coinciden, el dato queda
comprobado por dos lectores independientes (0.95, sobre el umbral del motor) y no se le pregunta a la persona; si
difieren, quedan los dos candidatos (0.6) para que la persona elija.
"""
from __future__ import annotations

import base64
import json
import logging
import os
import time
import urllib.request
from typing import Callable, Optional

log = logging.getLogger(__name__)

URL = os.environ.get("PRECHECK_OLLAMA_URL", "http://127.0.0.1:11434")
MODELO = "glm-ocr"
#: Tope de recortes por documento: cada uno tarda ~8 min en CPU.
MAX_LLAMADAS = 1
LIMITE_S = 12 * 60
#: Dos lectores independientes leyeron lo mismo: dato comprobado.
CONFIANZA_COINCIDE = 0.95

_estado = {"llamadas": 0, "fallos": 0, "segundos": 0.0, "disponible": None}


def reiniciar() -> None:
    _estado.update(llamadas=0, fallos=0, segundos=0.0)


def resumen() -> dict:
    return {"llamadas": _estado["llamadas"], "fallos": _estado["fallos"], "segundos": round(_estado["segundos"], 1)}


def activo() -> bool:
    """Encendido con PRECHECK_OCR_GLM=1 y solo si Ollama tiene el modelo (se pregunta una vez por proceso)."""
    if os.environ.get("PRECHECK_OCR_GLM", "").strip() != "1":
        return False
    if _estado["disponible"] is None:
        try:
            with urllib.request.urlopen(f"{URL}/api/tags", timeout=3) as r:
                nombres = [m.get("name", "") for m in json.load(r).get("models", [])]
            _estado["disponible"] = any(n.split(":")[0] == MODELO for n in nombres)
        except Exception:  # noqa: BLE001 — sin Ollama no hay tercer lector
            _estado["disponible"] = False
    return bool(_estado["disponible"])


def llamar_ollama(png: bytes) -> str:
    cuerpo = json.dumps({"model": MODELO, "prompt": "Text Recognition:", "images": [base64.b64encode(png).decode()], "stream": False}).encode()
    req = urllib.request.Request(f"{URL}/api/generate", data=cuerpo, headers={"content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=LIMITE_S) as r:
        return str(json.load(r).get("response") or "")


def leer(png: bytes, ejecutar: Optional[Callable[[bytes], str]] = None) -> Optional[str]:
    """Transcripción del recorte, o None (apagado, tope alcanzado o Ollama falló)."""
    if ejecutar is None and not activo():
        return None
    if _estado["llamadas"] >= MAX_LLAMADAS:
        return None
    _estado["llamadas"] += 1
    t = time.monotonic()
    try:
        return (ejecutar or llamar_ollama)(png)
    except Exception as e:  # noqa: BLE001 — se sigue con los otros lectores
        _estado["fallos"] += 1
        log.warning("GLM-OCR: se omite (%s: %s)", type(e).__name__, str(e)[:200])
        return None
    finally:
        _estado["segundos"] += time.monotonic() - t
