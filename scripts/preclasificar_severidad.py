#!/usr/bin/env python3
"""Preclasificación de severidad, subsanación y fundamento de cada regla (ADR-0017). Solo lectura sobre reglas/.

Para cada una de las reglas de reglas/*.json propone:
  criterio     B1–B5 (bloqueante) u O1–O4 (observación), según la tabla de ADR-0017
  severidad    la que sale del criterio
  subsanacion  proyecto, plano, documento, autoridad o informativa, según la tabla de asignación de ADR-0017
  fundamento   {criterio, cita, archivo}: la cita_textual de la regla y el texto de normativa/ donde aparece literal
  confianza    alta si el motivo de la revisión del 8-oct y las palabras de la cita apuntan al mismo criterio; baja si no

Fuentes que reutiliza: el motivo de docs/revision-catalogo/severidad.json (8-oct), la clase de criterio.json, el
veredicto y el error para la DOYC de docs/catalogo-definitivo/decisiones.json (9-oct) y alcance()/estado_cita() de
scripts/auditar_catalogo.py. Agrupa las reglas con la misma cita normalizada y la misma propuesta, para que los
subagentes revisen cada grupo una sola vez, y asigna cada regla a una de las 10 familias de revisión.

Uso: python scripts/preclasificar_severidad.py [--salida docs/revision-catalogo/adr0017]
Escribe preclasificacion.json (grupos) e imprime un resumen.
"""
import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))
sys.path.insert(0, str(RAIZ / "scripts"))
from auditar_catalogo import alcance, cargar_normativa, estado_cita  # noqa: E402
from precheck.motor.verificar_citas import norm  # noqa: E402

REVISION = RAIZ / "docs" / "revision-catalogo"

# Motivo de la revisión del 8-oct (prefijo) → criterio de ADR-0017. «Forma o rotulado» pasa de O5 a B4.
MOTIVO_A_CRITERIO = [
    ("Dimensión mínima de lote o unidad", "B1"),
    ("Retiro, línea de construcción o colindancia", "B1"),
    ("Porcentaje máximo o mínimo de ocupación", "B1"),
    ("Dotación o disposición mínima de estacionamientos", "B1"),
    ("Altura o número de pisos máximo", "B1"),
    ("Densidad máxima o mínima", "B1"),
    ("Acera, acceso vehicular o rampa", "B1"),
    ("Uso permitido o prohibido", "B2"),
    ("Prohibición o condición de edificabilidad", "B2"),
    ("Dotación obligatoria", "B3"),
    ("Obligación con mínimo", "B3"),
    ("Obligación o prohibición expresa", "B3"),
    ("Detalle constructivo o de acabado", "B3"),
    ("Contenido técnico o de identificación", "B4"),
    ("Forma o rotulado de la lámina", "B4"),
    ("Documento o aprobación que la norma exige", "B4"),
    ("Condición de admisibilidad del trámite", "B4"),
    ("Obligación de regirse por norma o ficha no cargada", "B5"),
    ("Texto facultativo o de recomendación", "O1"),
    ("Definición o regla de cómputo", "O2"),
    ("Ley 21: categoría o directriz", "O3"),
    ("Disposición transitoria", "O3"),
    ("Remisión sin verbo de obligación", "O3"),
    ("Exención o constancia", "O3"),
    ("Guía para elegir la norma", "O3"),
    ("Tolerancia sujeta a aprobación", "O4"),
]
# Motivos que la revisión del 8-oct no resolvió con claridad: se marcan para revisión aunque las señales coincidan.
MOTIVOS_DUDOSOS = ("Detalle constructivo", "Remisión sin verbo", "Condición de admisibilidad")

# Señales en la cita (minúsculas, sin tildes).
SENALES = {
    "limite": r"\bminim[oa]s?\b|\bmaxim[oa]s?\b|\bhasta\b|\bno mayor|\bno menor|\bpers/ha|\bm2\b|\bpisos\b|%",
    "prohibicion": r"no se permitir|se prohib|no podra|no podran|solo podra|unicamente|en ningun caso|no se aplica|usos? (permitidos?|prohibidos?)",
    "obligacion": r"\bdebera|\bdeberan|\bdebe\b|\bdeben\b|\btendran\b|\brequieren?\b|\bse requiere|\bobligatori",
    "facultativo": r"\bpodra\b|\bpodran\b|de preferencia|se recomienda|incentivar",
    "definicion": r"se entendera|se computar|se considerara",
    "transitoria": r"transicion|transitori|periodo de|vigencia de",
    "tolerancia": r"tolerancia",
    "remision": r"debe regirse|segun lo estipulado|referir(se)? a|segun requerimientos",
    "autoridad": r"a juicio|previa (aprobacion|autorizacion|solicitud)|podra evaluar|corresponde al mupa",
}
ENTIDADES = r"\b(MOP|METRO|SINAPROC|DNPH|ACP|BCBRP|MI ?AMBIENTE|MIAMBIENTE|DPUOT|DPU|MIVI|MIVIOT|SENADIS|IDAAN|ETESA|AAC|CEUS)\b|no objeci|visto bueno|aprobaci[oó]n de|certificad|informe favorable"
LOTE = re.compile(r"-LOTE-(AREA|FRENTE|FONDO)(-|$)")

FAMILIAS = [
    (1, "A110 Anexos III y IV, definitivo-nuevas", ("reglas_a110_anexos_iii_iv_borrador.json", "reglas_definitivo_nuevas_borrador.json")),
    (2, "A110 artículos, Anexos V y VI", ("reglas_a110_borrador.json", "reglas_ampliacion_a110_anexo_v_2_borrador.json",
                                         "reglas_ampliacion_a110_anexo_vi_borrador.json", "reglas_ampliacion_a110_articulos_borrador.json",
                                         "reglas_ampliacion_a110_articulos_2_borrador.json")),
    (3, "PLOT artículos y usos, A128, ampliación A270", ("reglas_ampliacion_plot_articulos_borrador.json", "reglas_ampliacion_plot_articulos_2_borrador.json",
                                                       "reglas_ampliacion_plot_usos_borrador.json", "reglas_ampliacion_a128_borrador.json",
                                                       "reglas_ampliacion_a128_2_borrador.json", "reglas_ampliacion_a270_borrador.json")),
    (4, "Fichas del PLOT", ("reglas_plot_borrador.json",)),
    (5, "San Francisco", ("reglas_sf_borrador.json",)),  # partir_san_francisco reparte entre 5 y 6
    (6, "San Francisco", ()),
    (7, "Área del Canal", ("reglas_area_canal_borrador.json", "reglas_ampliacion_area_canal_borrador.json")),
    (8, "Metro L1 y L2", ("reglas_metro_l1_borrador.json", "reglas_metro_l2_borrador.json")),
    (9, "El Carmen y La Cresta", ("reglas_el_carmen_borrador.json", "reglas_ampliacion_el_carmen_borrador.json",
                                  "reglas_la_cresta_borrador.json", "reglas_ampliacion_la_cresta_borrador.json")),
    (10, "Casco Antiguo, Panamá Viejo, Costa del Este, Ley 21", ("reglas_casco_antiguo_borrador.json", "reglas_ampliacion_casco_antiguo_borrador.json",
                                                                 "reglas_panama_viejo_borrador.json", "reglas_costa_del_este_borrador.json",
                                                                 "reglas_ampliacion_costa_del_este_borrador.json", "reglas_ley21_borrador.json",
                                                                 "reglas_ampliacion_ley21_borrador.json")),
]


def sin_tildes(s):
    return s.lower().translate(str.maketrans("áéíóúüñ", "aeiouun"))


def senales(cita):
    t = sin_tildes(cita or "")
    return sorted(k for k, p in SENALES.items() if re.search(p, t))


def criterio_por_senales(regla, sen):
    """Criterio que sugieren solo el tipo, el id y las palabras de la cita (sin la revisión del 8-oct)."""
    tipo = regla.get("tipo")
    if "definicion" in sen:
        return "O2"
    if "tolerancia" in sen and "autoridad" in sen:
        return "O4"
    if "remision" in sen:
        return "B5"
    if "prohibicion" in sen:
        return "B2"
    if tipo == "documental":
        return "B4"
    if tipo == "cuantitativa" or "limite" in sen:
        return "B1"
    if "obligacion" in sen:
        return "B3"
    if "facultativo" in sen:
        return "O1"
    if "transitoria" in sen:
        return "O3"
    return None


def criterio_de_motivo(motivo):
    for prefijo, c in MOTIVO_A_CRITERIO:
        if (motivo or "").startswith(prefijo):
            return c
    return None


def subsanacion(regla, criterio):
    """Tabla de asignación de ADR-0017."""
    if criterio is None:
        return None
    if criterio.startswith("O"):
        return "informativa"
    if criterio == "B1":
        return "autoridad" if LOTE.search(regla["id"]) else "proyecto"
    if criterio == "B2":
        return "proyecto"
    if criterio == "B3":
        return "plano" if regla.get("tipo") == "documental" else "proyecto"
    if criterio == "B4":
        texto = (regla.get("cita_textual_") or "") + " " + regla.get("titulo", "") + " " + regla.get("mensaje_no_cumple", "")
        return "documento" if re.search(ENTIDADES, texto, re.I) else "plano"
    if criterio == "B5":
        return "autoridad"
    return None


def familia(archivo):
    for n, nombre, archivos in FAMILIAS:
        if archivo in archivos:
            return n, nombre
    return 0, "sin familia"


def partir_san_francisco(filas):
    """San Francisco va en dos familias de tamaño parecido, sin partir un barrio (SF-<barrio>-UT…)."""
    sf = [f for f in filas if f["archivo"] == "reglas_sf_borrador.json"]
    por_barrio = defaultdict(list)
    for f in sf:
        por_barrio[f["id"].split("-UT")[0]].append(f)
    acumulado = 0
    for barrio in sorted(por_barrio):
        n = 5 if acumulado < len(sf) / 2 else 6
        acumulado += len(por_barrio[barrio])
        for f in por_barrio[barrio]:
            f["familia"], f["familia_nombre"] = n, f"San Francisco ({'primera' if n == 5 else 'segunda'} mitad de barrios)"


def leer_lista(ruta):
    return json.loads(ruta.read_text(encoding="utf-8")) if ruta.exists() else []


def preclasificar(raiz=RAIZ):
    sev8 = {x["id"]: x for x in leer_lista(REVISION / "severidad.json")}
    crit = {x["id"]: x for x in leer_lista(REVISION / "criterio.json")}
    dec9 = {x["id"]: x for x in leer_lista(raiz / "docs" / "catalogo-definitivo" / "decisiones.json")}
    textos = cargar_normativa(raiz)
    filas = []
    for ruta in sorted((raiz / "reglas").glob("*.json")):
        for r in json.loads(ruta.read_text(encoding="utf-8")):
            cita = (r.get("fuente") or {}).get("cita_textual") or ""
            r = {**r, "cita_textual_": cita}
            sen = senales(cita + " " + r.get("titulo", ""))
            motivo = (sev8.get(r["id"]) or {}).get("motivo")
            c_motivo = criterio_de_motivo(motivo)
            c_senal = criterio_por_senales(r, sen)
            if (crit.get(r["id"]) or {}).get("clase") == "remite_a_otra_norma_o_autoridad" and c_motivo is None:
                c_motivo = "B5"
            c = c_motivo or c_senal
            dudas = []
            if c_motivo and c_senal and c_motivo != c_senal:
                dudas.append(f"el motivo del 8-oct dice {c_motivo} y las palabras de la cita {c_senal}")
            if not c_motivo:
                dudas.append("sin motivo del 8-oct (regla nueva o fuera de alcance)")
            if motivo and motivo.startswith(MOTIVOS_DUDOSOS):
                dudas.append("motivo del 8-oct marcado como dudoso")
            if c is None:
                dudas.append("no se pudo proponer un criterio")
            if "autoridad" in sen:
                dudas.append("la cita menciona una decisión o aprobación de autoridad")
            if r.get("tipo") == "plazo":
                dudas.append("regla de plazo: decidir informativa o documento")
            sub = subsanacion(r, c)
            sev = None if c is None else ("observacion" if c.startswith("O") else "bloqueante")
            estado, donde = estado_cita(cita, (r.get("fuente") or {}).get("norma"), textos)
            entra, motivo_fuera = alcance(r)
            d9 = dec9.get(r["id"]) or {}
            n, nombre = familia(ruta.name)
            filas.append({
                "id": r["id"], "archivo": ruta.name, "version": r.get("version"), "familia": n, "familia_nombre": nombre,
                "titulo": r.get("titulo"), "tipo": r.get("tipo"), "severidad_actual": r.get("severidad"),
                "cita": cita, "senales": sen, "motivo_8oct": motivo,
                "veredicto_9oct": d9.get("veredicto"), "error_doyc_9oct": (d9.get("error_para_doyc") or {}).get("descripcion"),
                "en_alcance_rla": entra, "fuera_de_alcance": motivo_fuera or None,
                "propuesta": {"criterio": c, "severidad": sev, "subsanacion": sub,
                              "fundamento": {"criterio": c, "cita": cita, "archivo": donde[0] if donde else None}},
                "estado_cita": estado, "confianza": "baja" if dudas else "alta", "dudas": dudas,
            })
    partir_san_francisco(filas)
    return filas


def agrupar(filas):
    grupos = defaultdict(list)
    for f in filas:
        p = f["propuesta"]
        grupos[(f["familia"], norm(f["cita"]), p["criterio"], p["subsanacion"], f["tipo"])].append(f)
    salida = []
    for i, ((fam, _, _, _, _), fs) in enumerate(sorted(grupos.items(), key=lambda kv: (kv[0][0], kv[1][0]["id"])), 1):
        f0 = fs[0]
        salida.append({
            "grupo": f"F{fam}-{i:04d}", "familia": fam, "familia_nombre": f0["familia_nombre"],
            "ids": [f["id"] for f in fs], "versiones": {f["id"]: f["version"] for f in fs},
            "archivos": sorted({f["archivo"] for f in fs}), "titulo": f0["titulo"], "tipo": f0["tipo"],
            "cita": f0["cita"], "severidad_actual": dict(Counter(f["severidad_actual"] for f in fs)),
            "senales": f0["senales"], "motivo_8oct": f0["motivo_8oct"],
            "veredictos_9oct": dict(Counter(f["veredicto_9oct"] or "-" for f in fs)),
            "errores_doyc_9oct": sorted({f["error_doyc_9oct"] for f in fs if f["error_doyc_9oct"]}),
            "en_alcance_rla": any(f["en_alcance_rla"] for f in fs),
            "propuesta": f0["propuesta"], "estado_cita": f0["estado_cita"],
            "confianza": "baja" if any(f["confianza"] == "baja" for f in fs) else "alta",
            "dudas": sorted({d for f in fs for d in f["dudas"]}),
        })
    return salida


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--salida", default=str(REVISION / "adr0017"))
    a = ap.parse_args(argv)
    filas = preclasificar()
    grupos = agrupar(filas)
    salida = Path(a.salida)
    salida.mkdir(parents=True, exist_ok=True)
    (salida / "preclasificacion.json").write_text(json.dumps(grupos, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    # Una entrada por familia para cada subagente de revisión.
    (salida / "familias").mkdir(exist_ok=True)
    for n, _, _ in FAMILIAS:
        parte = [g for g in grupos if g["familia"] == n]
        (salida / "familias" / f"F{n}.json").write_text(json.dumps(parte, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    cambia = [f for f in filas if f["propuesta"]["severidad"] and f["propuesta"]["severidad"] != f["severidad_actual"]]
    print(f"{len(filas)} reglas en {len(grupos)} grupos; confianza baja: {sum(f['confianza'] == 'baja' for f in filas)}")
    print("criterio:", dict(sorted(Counter(f["propuesta"]["criterio"] or "-" for f in filas).items())))
    print("subsanación:", dict(Counter(f["propuesta"]["subsanacion"] or "-" for f in filas)))
    print(f"cambian de severidad: {len(cambia)}", dict(Counter(f"{f['severidad_actual']}→{f['propuesta']['severidad']}" for f in cambia)))
    print("por familia (reglas, grupos):", {n: (sum(f["familia"] == n for f in filas), sum(g["familia"] == n for g in grupos)) for n, _, _ in FAMILIAS})
    print("cita no literal:", sum(f["estado_cita"] != "ok" for f in filas))
    return 0


if __name__ == "__main__":
    sys.exit(main())
