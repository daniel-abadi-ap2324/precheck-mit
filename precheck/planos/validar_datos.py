"""Validación corta de los datos que escribe o confirma el usuario, antes de gastar una corrida.

No usa IA ni cuota: compara contra lo que el sistema ya conoce (los códigos de zona que reconocen las reglas de la
norma, la lista de corregimientos, rangos físicos). Cuando un dato parece mal escrito sugiere el valor probable, por
ejemplo «R2-A» → «R2». Nunca cambia un dato: avisa, y la persona decide (el arquitecto sabe lo que presentó).

Uso: echo '{"zona":"R2-A","norma":"PLOT-A61-2021+A270-2025","finca":"0071877","area_m2":892.03}' | python -m precheck.planos.validar_datos
Salida: JSON {"avisos": [{"campo", "nivel": "error"|"aviso", "mensaje", "sugerencia"?}]}
"""
from __future__ import annotations

import difflib
import json
import re
import sys
import unicodedata

from precheck.motor.zona import clave, codigos_de_norma, normas_de_regla
from precheck.planos.revisar import cargar_reglas

#: Los 26 corregimientos del distrito de Panamá (igual que web/src/schemas/project.ts).
CORREGIMIENTOS = [
    "24 de Diciembre", "Alcalde Díaz", "Ancón", "Bella Vista", "Betania", "Caimitillo", "La Exposición o Calidonia", "Chilibre",
    "Curundú", "Don Bosco", "El Chorrillo", "Ernesto Córdoba Campos", "Juan Díaz", "Las Cumbres", "Las Garzas", "Las Mañanitas",
    "Pacora", "Parque Lefevre", "Pedregal", "Pueblo Nuevo", "Río Abajo", "San Felipe", "San Francisco", "San Martín", "Santa Ana", "Tocumen",
]
AREA_LOTE_M2 = (20.0, 2_000_000.0)


def _sin_tildes(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn").lower().strip()


def _parecidos(codigo: str, conocidos: set[str]) -> list[str]:
    """Códigos de la norma que se parecen al escrito: mismo prefijo base («R2-A» → «R2») o letras cercanas."""
    k = clave(codigo)
    base = re.sub(r"[A-Z]$", "", k) if re.search(r"\d[A-Z]$", k) else k
    por_base = sorted((c for c in conocidos if clave(c) == base or clave(c) == k), key=lambda c: (len(c), c))
    cercanos = difflib.get_close_matches(k, [clave(c) for c in conocidos], n=3, cutoff=0.8)
    por_cercania = sorted({c for c in conocidos if clave(c) in cercanos}, key=lambda c: (len(c), c))
    return list(dict.fromkeys([*por_base, *por_cercania]))[:4]


def normas_con_codigo(reglas: list[dict], codigo: str, salvo: str) -> list[str]:
    """Otras normas cuyas reglas sí reconocen el código tal como está escrito (p. ej. «R2-A» está en El Carmen, no en el PLOT)."""
    normas = sorted({n for r in reglas for n in (normas_de_regla(r) or ())} - {salvo})
    return [n for n in normas if codigo in codigos_de_norma(reglas, n)]


def validar(datos: dict, reglas: list[dict] | None = None) -> list[dict]:
    avisos: list[dict] = []
    nivel_aviso = lambda campo, mensaje, **extra: avisos.append({"campo": campo, "nivel": "aviso", "mensaje": mensaje, **extra})  # noqa: E731
    nivel_error = lambda campo, mensaje, **extra: avisos.append({"campo": campo, "nivel": "error", "mensaje": mensaje, **extra})  # noqa: E731

    zona, norma = str(datos.get("zona") or "").strip(), str(datos.get("norma") or "").strip()
    if zona and norma:
        reglas = reglas if reglas is not None else cargar_reglas()
        conocidos = codigos_de_norma(reglas, norma)
        otras = normas_con_codigo(reglas, zona, norma) if conocidos and zona not in conocidos else []
        if conocidos and zona not in conocidos:
            parecidos = _parecidos(zona, conocidos)
            if otras:
                # La zona existe, pero en otra norma: lo más probable es que la norma elegida no sea la del lote.
                nivel_aviso("zona", f"La zona «{zona}» no está en la norma {norma}, pero sí existe en {' y '.join(otras)}. "
                                    "Si el lote está en esa zona, cambie la norma aplicable; si de verdad es del PLOT, revise el código"
                                    + (f" (¿{' o '.join('«' + p + '»' for p in parecidos)}?)." if parecidos else "."),
                            norma_sugerida=otras[0], normas_sugeridas=otras, **({"sugerencia": parecidos[0], "alternativas": parecidos} if parecidos else {}))
            elif parecidos:
                nivel_aviso("zona", f"La zona «{zona}» no existe en la norma {norma}. Puede que se escribiera distinto: ¿{' o '.join('«' + p + '»' for p in parecidos)}? "
                                    "Si no se corrige, las reglas de esa zona no se evalúan y quedan para revisión.", sugerencia=parecidos[0], alternativas=parecidos)
            else:
                nivel_aviso("zona", f"La zona «{zona}» no existe en la norma {norma}: sin la certificación de uso de suelo (CEUS) no se pueden evaluar las reglas de la zona.")

    finca = str(datos.get("finca") or "").strip()
    if finca and not re.fullmatch(r"\d{3,8}", finca):
        limpia = re.sub(r"\D", "", finca)
        nivel_aviso("finca", f"La finca «{finca}» no parece un número de finca (3 a 8 dígitos).", **({"sugerencia": limpia} if re.fullmatch(r"\d{3,8}", limpia) else {}))

    area = datos.get("area_m2")
    if isinstance(area, (int, float)) and not isinstance(area, bool):
        if area <= 0:
            nivel_error("area_m2", "El área del lote debe ser mayor que cero.")
        elif not AREA_LOTE_M2[0] <= area <= AREA_LOTE_M2[1]:
            nivel_aviso("area_m2", f"El área del lote ({area:g} m²) es poco común para un lote urbano: revise que no falte o sobre un dígito o el punto decimal.")

    corr = str(datos.get("corregimiento") or "").strip()
    if corr and _sin_tildes(corr) not in {_sin_tildes(c) for c in CORREGIMIENTOS}:
        cerca = difflib.get_close_matches(_sin_tildes(corr), [_sin_tildes(c) for c in CORREGIMIENTOS], n=1, cutoff=0.7)
        sugerida = next((c for c in CORREGIMIENTOS if cerca and _sin_tildes(c) == cerca[0]), None)
        nivel_aviso("corregimiento", f"«{corr}» no es un corregimiento del distrito de Panamá." + (f" ¿Quiso decir «{sugerida}»?" if sugerida else ""), **({"sugerencia": sugerida} if sugerida else {}))
    return avisos


def main() -> int:
    try:
        datos = json.loads(sys.stdin.read() or "{}")
        print(json.dumps({"avisos": validar(datos)}, ensure_ascii=False))
        return 0
    except Exception as e:  # noqa: BLE001
        print(f"No se pudieron validar los datos: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
