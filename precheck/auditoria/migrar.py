"""Aplicador mínimo de migraciones de la bitácora (SQLite).

Cada migración es un par NNNN_<nombre>.up.sql / .down.sql en ./migraciones. La última aplicada
se registra en PRAGMA user_version; cada archivo corre en su propia transacción.
"""
import pathlib
import sqlite3

DIR = pathlib.Path(__file__).resolve().parent / "migraciones"


def migraciones():
    """Lista ordenada de (numero, archivo_up, archivo_down)."""
    res = []
    for up in sorted(DIR.glob("*.up.sql")):
        numero = int(up.name.split("_", 1)[0])
        res.append((numero, up, up.with_name(up.name.replace(".up.sql", ".down.sql"))))
    return res


def _version(con):
    return con.execute("PRAGMA user_version").fetchone()[0]


def _ejecutar(con, sql, version):
    # executescript hace COMMIT previo; se envuelve en BEGIN/COMMIT explícitos para que el
    # archivo y el cambio de user_version sean atómicos.
    con.executescript(f"BEGIN;\n{sql}\nPRAGMA user_version = {int(version)};\nCOMMIT;")


def aplicar(con: sqlite3.Connection):
    """Aplica las migraciones pendientes y activa las claves foráneas."""
    con.execute("PRAGMA foreign_keys = ON")
    actual = _version(con)
    for numero, up, _ in migraciones():
        if numero > actual:
            _ejecutar(con, up.read_text(encoding="utf-8"), numero)
    con.execute("PRAGMA foreign_keys = ON")


def revertir(con: sqlite3.Connection, hasta: int = 0):
    """Revierte en orden inverso hasta dejar user_version = hasta."""
    actual = _version(con)
    for numero, _, down in reversed(migraciones()):
        if hasta < numero <= actual:
            _ejecutar(con, down.read_text(encoding="utf-8"), numero - 1)
