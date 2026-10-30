#!/usr/bin/env python3
"""Comprobaciones previas a lanzar revisiones con IA: lo que ya costó corridas perdidas, sin gastar cuota.

1. Formato de los archivos que lee Claude Code (`.claude/agents/*.md`, `.claude/skills/*/SKILL.md`): la primera línea debe
   ser «---» y los saltos de línea deben ser LF. Con CRLF el agente «no se encuentra» y la corrida muere en un minuto.
2. Zona: lo que el motor ya sabe antes de la IA. `ZONA_DISCREPANTE` (el usuario indicó una zona y el plano declara otra)
   detiene el lote; «el código no existe en la norma» solo se avisa (es un resultado legítimo: norma no cargada).

Uso: python scripts/preflight_ia.py            (revisa el formato; sale con 1 si hay problemas)
"""
import json
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent


def archivos_de_claude(raiz: Path = RAIZ) -> list[Path]:
    return sorted((raiz / ".claude" / "agents").glob("*.md")) + sorted((raiz / ".claude" / "skills").glob("*/SKILL.md"))


def problemas_de_formato(raiz: Path = RAIZ) -> list[str]:
    """Archivos de agentes y skills con saltos CRLF o sin «---» en la primera línea."""
    salida = []
    for f in archivos_de_claude(raiz):
        datos = f.read_bytes().removeprefix(b"\xef\xbb\xbf") if f.suffix == ".md" else b""
        if not datos.startswith(b"---\n"):
            salida.append(f"{f.relative_to(raiz)}: la primera línea debe ser «---» con salto LF")
        elif b"\r" in datos:
            salida.append(f"{f.relative_to(raiz)}: tiene saltos CRLF; Claude Code los rechaza (usa LF)")
    return salida


def avisos_de_zona(carpeta: Path) -> tuple[list[str], list[str]]:
    """(bloqueos, advertencias) de zona en el resultado.json que el motor dejó en la carpeta del PreCheck."""
    try:
        avisos = json.loads((carpeta / "resultado.json").read_text(encoding="utf-8")).get("avisos") or []
    except (OSError, ValueError):
        return [], ["no se pudo leer resultado.json para comprobar la zona"]
    bloqueos = [a for a in avisos if str(a).startswith("ZONA_DISCREPANTE")]
    advertencias = [a for a in avisos if "no existe en la norma" in str(a) or str(a).startswith("Falta lote.norma")]
    return bloqueos, advertencias


def main() -> int:
    problemas = problemas_de_formato()
    for p in problemas:
        print("PROBLEMA:", p)
    if not problemas:
        print(f"Formato de {len(archivos_de_claude())} archivos de agentes y skills: OK")
    return 1 if problemas else 0


if __name__ == "__main__":
    sys.exit(main())
