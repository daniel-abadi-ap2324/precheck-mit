#!/usr/bin/env python3
"""Verifica la cadena de hashes de eventos de auditoría del PreCheck MUPA.

Entrada: JSON con una lista de eventos {expediente_id, payload, hash_previo, hash, id}.
hash = sha256((hash_previo or "") + json canónico del payload).
Uso: verificar_cadena.py eventos.json   (también: --sellar para calcular hashes de eventos sin sellar)
"""
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
from precheck.auditoria.canonico import calcular, canonico  # noqa: E402,F401


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    eventos = json.load(open(sys.argv[1], encoding="utf-8"))
    sellar = "--sellar" in sys.argv
    ultimo, errores = {}, 0
    for ev in sorted(eventos, key=lambda e: e.get("id", 0)):
        exp = ev["expediente_id"]
        esperado_previo = ultimo.get(exp)
        if sellar:
            ev["hash_previo"] = esperado_previo
            ev["hash"] = calcular(esperado_previo, ev["payload"])
        if ev.get("hash_previo") != esperado_previo:
            print(f"ROTA  evento {ev.get('id')} ({exp}): hash_previo no coincide con el evento anterior")
            errores += 1
        if ev.get("hash") != calcular(ev.get("hash_previo"), ev["payload"]):
            print(f"ALTERADO evento {ev.get('id')} ({exp}): el payload no corresponde a su hash")
            errores += 1
        ultimo[exp] = ev.get("hash")
    if sellar:
        json.dump(eventos, sys.stdout, ensure_ascii=False, indent=2)
        return
    print("OK: cadena íntegra" if not errores else f"{errores} problema(s) encontrados")
    sys.exit(1 if errores else 0)


if __name__ == "__main__":
    main()
