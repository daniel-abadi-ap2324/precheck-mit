"""Serialización canónica y hash encadenado de la bitácora (sad.md §8)."""
import hashlib
import json


def canonico(payload):
    return json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def calcular(hash_previo, payload):
    return hashlib.sha256(((hash_previo or "") + canonico(payload)).encode("utf-8")).hexdigest()


def hash_contenido(contenido):
    """Hash que direcciona el contenido de una versión de regla (ADR-0004)."""
    return hashlib.sha256(canonico(contenido).encode("utf-8")).hexdigest()
