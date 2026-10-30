"""Huella del modelo del informe y código impreso (ADR-0002, ADR-0005). Dominio puro, sin E/S.

huella = SHA-256(canonico(normalizar(modelo))): todo texto se normaliza a NFC; en el encabezado,
además, se recortan los espacios de los extremos y se colapsan los repetidos. El bloque de
trazabilidad (quién emitió y cuándo) no forma parte del modelo, así que queda fuera de la huella.
"""
import dataclasses
import hashlib
import re
import unicodedata
from typing import Any, Mapping

from precheck.auditoria.canonico import canonico
from precheck.errores import ErrorPreCheck

CAMPOS_ENCABEZADO = ("tramite", "proyecto", "finca", "profesional", "idoneidad")
MINIMO_PREFIJO = 16
_ESPACIOS = re.compile(r"\s+")


def _nfc(obj: Any, recortar: bool = False) -> Any:
    if isinstance(obj, str):
        texto = unicodedata.normalize("NFC", obj)
        return _ESPACIOS.sub(" ", texto).strip() if recortar else texto
    if isinstance(obj, Mapping):
        return {_nfc(k): _nfc(v, recortar) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_nfc(v, recortar) for v in obj]
    return obj


def normalizar(modelo: Mapping) -> dict:
    """Copia del modelo con todo texto en NFC y los espacios del encabezado recortados."""
    normal = _nfc(modelo)
    if isinstance(normal.get("encabezado"), Mapping):
        normal["encabezado"] = _nfc(normal["encabezado"], recortar=True)
    return normal


def _sha256(obj) -> str:
    return hashlib.sha256(canonico(obj).encode("utf-8")).hexdigest()


def huella(modelo: Mapping) -> str:
    return _sha256(normalizar(modelo))


def _campos_encabezado(encabezado) -> dict:
    if encabezado is None:
        return {}
    if dataclasses.is_dataclass(encabezado) and not isinstance(encabezado, type):
        return dataclasses.asdict(encabezado)
    if isinstance(encabezado, Mapping):
        return dict(encabezado)
    return {c: getattr(encabezado, c, None) for c in CAMPOS_ENCABEZADO}


def huella_encabezado(encabezado) -> str:
    """Huella de los datos de encabezado (los ausentes valen None), con la misma normalización."""
    campos = _campos_encabezado(encabezado)
    return _sha256(_nfc({c: campos.get(c) for c in CAMPOS_ENCABEZADO}, recortar=True))


def codigo(huella_hex: str) -> str:
    """Huella completa en bloques de 4 caracteres separados por espacio, para imprimir."""
    return " ".join(huella_hex[i:i + 4] for i in range(0, len(huella_hex), 4))


def normalizar_codigo(texto: str) -> str:
    """Quita espacios y guiones y pasa a minúsculas."""
    return re.sub(r"[\s\-]", "", texto).lower()


def coincide_prefijo(huella_hex: str, codigo_impreso: str) -> bool:
    """¿El código (completo o sus primeros ≥ 16 caracteres) es prefijo de la huella?"""
    prefijo = normalizar_codigo(codigo_impreso)
    if len(prefijo) < MINIMO_PREFIJO:
        raise ErrorPreCheck("informe.codigo_corto", caracteres=len(prefijo))
    return huella_hex.lower().startswith(prefijo)
