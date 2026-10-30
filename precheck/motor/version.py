"""Versión del motor que se registra en cada evaluación (sad.md §8)."""
import pathlib
import subprocess

VERSION_MOTOR = "1.0.0"


def commit() -> str:
    """Commit corto del código en ejecución, o «desconocido» fuera de un repositorio git."""
    try:
        out = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True,
                             cwd=pathlib.Path(__file__).resolve().parent, timeout=5)
        return out.stdout.strip() if out.returncode == 0 and out.stdout.strip() else "desconocido"
    except (OSError, subprocess.SubprocessError):
        return "desconocido"
