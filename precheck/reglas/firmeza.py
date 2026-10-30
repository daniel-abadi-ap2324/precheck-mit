"""Regla firme (ADR-0017): severidad, subsanación y fundamento con valores permitidos, cita literal e invariantes.

Una sola fuente para el script de consolidación, el de aplicación, la propuesta de reglas (servicio.proponer) y las
pruebas del catálogo. Las funciones son puras: reciben los textos de normativa/ ya normalizados (verificar_citas.norm).
"""
import re
from pathlib import Path

from precheck.motor.verificar_citas import cita_en_normativa, norm

SEVERIDADES = ("bloqueante", "observacion")
SUBSANACIONES = ("proyecto", "plano", "documento", "autoridad", "informativa")
TIPOS = ("cuantitativa", "documental", "criterio", "plazo")
CRITERIOS_BLOQUEANTES = ("B1", "B2", "B3", "B4", "B5")
CRITERIOS_OBSERVACION = ("O1", "O2", "O3", "O4")
CRITERIOS = CRITERIOS_BLOQUEANTES + CRITERIOS_OBSERVACION
LOTE_MINIMO = re.compile(r"-LOTE-(AREA|FRENTE|FONDO)(-|$)")


def cargar_textos(raiz):
    """Textos de normativa/ que pueden fundar una regla: el Acuerdo 110, los textos de zonificación y de zonas
    exceptuadas, y el Decreto 88 (accesibilidad). Claves 'normativa/…' con barras normales."""
    raiz = Path(raiz)
    rutas = [raiz / "normativa" / "acuerdo-110" / "texto-completo.md", *sorted((raiz / "normativa").glob("*/textos/*.txt")),
             *sorted((raiz / "normativa" / "ley42-discapacidad").glob("*.txt"))]
    return {p.relative_to(raiz).as_posix(): norm(p.read_text(encoding="utf-8", errors="replace")) for p in rutas if p.exists()}


def errores_de_valores(regla):
    """Valores fuera de la lista permitida (solo de los campos presentes)."""
    errores = []
    if "severidad" in regla and regla["severidad"] not in SEVERIDADES:
        errores.append(f"severidad no permitida: {regla['severidad']!r}")
    if "subsanacion" in regla and regla["subsanacion"] not in SUBSANACIONES:
        errores.append(f"subsanación no permitida: {regla['subsanacion']!r}")
    if "tipo" in regla and regla["tipo"] not in TIPOS:
        errores.append(f"tipo no permitido: {regla['tipo']!r}")
    f = regla.get("fundamento")
    if f is not None:
        if not isinstance(f, dict):
            errores.append("fundamento no es un objeto")
        elif f.get("criterio") not in CRITERIOS:
            errores.append(f"criterio no permitido: {f.get('criterio')!r}")
    return errores


def errores_de_invariantes(regla):
    """Coherencia entre severidad, subsanación, criterio, tipo e id (ADR-0017, «Reglas firmes»)."""
    sev, sub = regla.get("severidad"), regla.get("subsanacion")
    crit = (regla.get("fundamento") or {}).get("criterio")
    errores = []
    if (sev == "observacion") != (sub == "informativa"):
        errores.append(f"severidad {sev} con subsanación {sub}: observación ⇔ informativa")
    if crit in CRITERIOS_BLOQUEANTES and sev != "bloqueante":
        errores.append(f"criterio {crit} exige severidad bloqueante")
    if crit in CRITERIOS_OBSERVACION and sev != "observacion":
        errores.append(f"criterio {crit} exige severidad observación")
    if regla.get("tipo") == "documental" and sev == "bloqueante" and sub not in ("plano", "documento"):
        errores.append(f"regla documental bloqueante con subsanación {sub}: debe ser plano o documento")
    if LOTE_MINIMO.search(regla.get("id", "")) and (sev, sub) != ("bloqueante", "autoridad"):
        errores.append(f"lote mínimo con {sev}/{sub}: debe ser bloqueante/autoridad")
    return errores


def errores_de_fundamento(regla, textos):
    """El fundamento cita la norma literal. textos: {ruta relativa 'normativa/…': texto normalizado}."""
    f = regla.get("fundamento")
    if not isinstance(f, dict):
        return []
    errores = []
    archivo, cita = f.get("archivo"), f.get("cita")
    if archivo not in textos:
        errores.append(f"archivo del fundamento desconocido: {archivo!r}")
    elif not cita_en_normativa(cita, textos[archivo]):
        errores.append("la cita del fundamento no está literal en su archivo")
    sub = f.get("cita_subsanacion")
    if sub and not any(cita_en_normativa(sub, t) for t in textos.values()):
        errores.append("la cita de la subsanación no está literal en normativa/")
    return errores


def errores_de_firmeza(regla, textos):
    """Todo lo que impide que la regla sea firme: campos que faltan, valores, invariantes y fundamento."""
    faltan = [c for c in ("severidad", "subsanacion", "fundamento") if not regla.get(c)]
    errores = [f"falta {c}" for c in faltan]
    return errores + errores_de_valores(regla) + errores_de_invariantes(regla) + errores_de_fundamento(regla, textos)
