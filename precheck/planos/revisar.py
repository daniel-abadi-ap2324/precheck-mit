"""Revisión preliminar de un plano: extracción → hechos → todas las reglas del catálogo (en modo de prueba).

Uso:
    python -m precheck.planos.revisar plano.pdf --lote lote.json --salida carpeta [--fecha AAAA-MM-DD]
    python -m precheck.planos.revisar --extraccion carpeta/extraccion.json --lote lote.json --salida carpeta

`lote.json` trae lo que el plano no dice o lo que se leyó a mano, con la forma de los hechos del motor
(`{"lote": {"norma_aplicable": {"valor": "...", "confianza": 0.95, "fuente": {...}}}}`): la norma y el
código de zona (de `mupa-gis-zonificacion` o de la CEUS), la fecha de presentación y los valores que el
revisor o el agente midieron en el dibujo (retiros, altura, estacionamientos…). Gana sobre la extracción.
Si corrige las fincas (`lote.fincas` o `lote.finca`), conviene que traiga también `lote.cantidad_fincas` con la
confianza del número de fincas; si no la trae y el número no coincide con el de la extracción, se toma el de
`lote.json` con la confianza de sus fincas (ver `cantidad_coherente`).

Si la carpeta de salida tiene `regiones.json` (polígonos del paso 2, ver
`precheck/planos/regiones.py`), agrega los hechos `plano.regiones.*` (confianza < 0.85: evidencia, no verdad), escribe
`regiones_resumen.json` con el contraste contra lo declarado y avisa de las discrepancias.

Escribe `hechos.json`, `resultado.json` y `resumen.md`. Las reglas en borrador solo dan un resultado
indicativo: esto nunca es un dictamen (Acuerdo 110, Art. 3).
"""
from __future__ import annotations

import argparse
import copy
import datetime as dt
import json
import re
import sys
from pathlib import Path

from precheck.motor.evaluador import CUMPLE, NO_APLICA, NO_CUMPLE, REVISION, evaluar_regla, vigente
from precheck.motor.familias import cargar as cargar_familias
from precheck.motor.respaldo import decision_motor
from precheck.motor.zona import (
    GRUPO_ZONA,
    aviso_codigo_inexistente,
    clasificar,
    clave,
    con_campos_confirmados,
    con_zona,
    depende_de_zona,
    motivo_grupo,
    zona_de_trabajo,
)
from precheck.reglas.gobierno import NORMAS, norma_de

RAIZ = Path(__file__).resolve().parents[2]
DIR_REGLAS = RAIZ / "reglas"
ORDEN = {NO_CUMPLE: 0, REVISION: 1, CUMPLE: 2, NO_APLICA: 3}


#: Requisitos documentales cuya evidencia de texto no basta para decidir: el extractor ve la etiqueta, pero el criterio
#: del dato pide algo más (scripts/hechos_documentales.json). Con este tope el motor no decide solo y la IA aplica el
#: criterio. «PROYECTO: <nombre>» o «DESCRIPCIÓN DEL PROYECTO» fuera del membrete no son una descripción del trabajo en
#: el pie (tanda 2, 12-oct-2026: Panamá Norte daba sí por «CASA EJEMPLO»).
TOPE_EXTRACTOR = {"plano.pie_descriptivo.descripcion_trabajo": 0.8}


def a_hechos(extraccion: dict) -> dict:
    """Los hechos planos de `extraccion.json` como árbol del motor. Un hecho sin valor no se copia: el motor lo
    trata como faltante (REQUIERE_REVISION), que es lo correcto."""
    hechos: dict = {}
    for h in extraccion.get("hechos", []):
        if h.get("valor") is None:
            continue
        fuente = {**(h.get("fuente") or {}), "documento": extraccion.get("documento")}
        nodo = {"valor": h["valor"], "confianza": h.get("confianza", 0.0), "fuente": fuente}
        if h.get("estado") != "ok":
            nodo["confianza"] = min(nodo["confianza"], 0.5)   # «revision» del extractor nunca llega al umbral
        _poner(hechos, h["hecho"], nodo)
    for r in extraccion.get("requisitos_documentales", []):
        # Solo evidencia positiva (valor True); el motor decide con confianza >= umbral y, si no, deja la regla en revisión.
        conf = min(r["confianza"], TOPE_EXTRACTOR.get(r["hecho"], 1.0))
        _poner(hechos, r["hecho"], {"valor": r["valor"], "confianza": conf, "fuente": {**(r.get("fuente") or {}), "documento": extraccion.get("documento")}})
    for r in extraccion.get("requisitos_anexo_iv", []):
        _poner(hechos, f"plano.anexo_iv.{r['requisito']}",
               {"valor": r["existe"], "confianza": r["confianza"], "fuente": r.get("fuente")})
    return hechos


def _poner(arbol: dict, ruta: str, valor) -> None:
    *padres, hoja = ruta.split(".")
    for p in padres:
        arbol = arbol.setdefault(p, {})
    arbol[hoja] = valor


def combinar(base: dict, encima: dict) -> dict:
    """Mezcla profunda; un hecho (dict con «valor») de `encima` reemplaza entero al de `base`."""
    res = copy.deepcopy(base)
    for k, v in encima.items():
        if isinstance(v, dict) and "valor" not in v and isinstance(res.get(k), dict) and "valor" not in res[k]:
            res[k] = combinar(res[k], v)
        else:
            res[k] = copy.deepcopy(v)
    return res


def cantidad_coherente(hechos: dict, complemento: dict) -> dict:
    """lote.cantidad_fincas de acuerdo con las fincas leídas a mano. Si `lote.json` trae lote.fincas (o solo
    lote.finca) sin lote.cantidad_fincas y su número no es el de la extracción, la cantidad de la extracción ya no
    vale: se toma el número de lote.json con su confianza. Si coincide, se conserva la de la extracción, que mide el
    número de fincas y no los dígitos (Casco Antiguo: finca con dígitos dudosos, 0.80, pero una sola)."""
    del_lote = complemento.get("lote") or {}
    if "cantidad_fincas" in del_lote:
        return hechos
    fincas, finca = _nodo(del_lote, "fincas"), _nodo(del_lote, "finca")
    if isinstance(fincas.get("valor"), list) and fincas["valor"]:
        leido, n = fincas, len(fincas["valor"])
    elif finca.get("valor") not in (None, "") and not fincas:
        leido, n = finca, 1
    else:
        return hechos
    if _valor(hechos, "lote.cantidad_fincas") == n:
        return hechos
    res = copy.deepcopy(hechos)
    _poner(res, "lote.cantidad_fincas", {
        "valor": n, "confianza": leido.get("confianza", 1.0), "fuente": leido.get("fuente"),
        "nota": "Número de fincas de lote.json (lectura a mano), que no coincide con el de la extracción."})
    return res


def cargar_reglas(directorio: Path = DIR_REGLAS) -> list[dict]:
    reglas = []
    for ruta in sorted(directorio.glob("*.json")):
        datos = json.loads(ruta.read_text(encoding="utf-8"))
        reglas.extend(datos.get("reglas", datos) if isinstance(datos, dict) else datos)
    return reglas


def _valor(hechos: dict, ruta: str):
    nodo = hechos
    for p in ruta.split("."):
        if not isinstance(nodo, dict) or p not in nodo:
            return None
        nodo = nodo[p]
    return nodo.get("valor") if isinstance(nodo, dict) and "valor" in nodo else nodo


def _nodo(hechos: dict, ruta: str) -> dict:
    """El hecho en `ruta` como dict con «valor» (y «confianza» si la tiene); {} si falta."""
    nodo = hechos
    for p in ruta.split("."):
        if not isinstance(nodo, dict) or p not in nodo:
            return {}
        nodo = nodo[p]
    return nodo if isinstance(nodo, dict) and "valor" in nodo else {"valor": nodo}


def _orden(r: dict) -> tuple:
    """Por gravedad; dentro de REQUIERE_REVISION, primero las de la zona declarada (con resultado provisional),
    después las demás y al final las de otras zonas, que dependen de confirmar la zona (ADR-0012)."""
    rango = 2 if r.get("grupo") == GRUPO_ZONA else 0 if "si_se_confirma_zona" in r else 1
    return ORDEN[r["resultado"]], rango, r["severidad"] != "bloqueante", r["regla_id"]


def _grupo_zona(hechos: dict, ajenas: list[dict]) -> dict:
    """Resumen de las reglas agrupadas: lo declarado (valor y confianza) y los valores que piden esas reglas."""
    campos = sorted({c for r in ajenas for c in r["zona_regla"]})
    declarado = {}
    for c in campos:
        # El código puede no estar en `valores_usados` (el evaluador se detuvo antes): se toma de los hechos.
        nodo = ajenas[0]["valores_usados"].get(c) or next(
            (r["valores_usados"][c] for r in ajenas if c in r["valores_usados"]), None) or _nodo(hechos, c)
        declarado[c] = {"valor": nodo.get("valor"), "confianza": nodo.get("confianza")}
    piden = {}
    for c in campos:
        unicos: dict[str, str] = {}   # una grafía por código («MCU1» y «Mcu1» son el mismo)
        for v in sorted({str(v) for r in ajenas for v in r["zona_regla"].get(c, [])}):
            unicos.setdefault(clave(v), v)
        piden[c] = sorted(unicos.values())
    return {"total": len(ajenas), "motivo": motivo_grupo(campos), "declarado": declarado, "valores_reglas": piden,
            "normas": sorted({r["norma"] for r in ajenas if r.get("norma")})}


def _con_permiso(res: dict, efecto: dict | None) -> dict:
    """Un permiso especial del expediente (paso 1, precheck/planos/alcance.py) exceptúa la regla (NO_APLICA con su cita)
    o la condiciona (queda en revisión para que la IA la decida con la cita). Sin efecto sobre una regla que no aplica."""
    if not efecto or res["resultado"] == NO_APLICA:
        return res
    cita = f"«{efecto['cita'][:300]}» ({efecto.get('documento') or 'plano'}, p. {efecto.get('pagina')})"
    res = {**res, "permiso": efecto["permiso"], "resultado_sin_permiso": res["resultado"]}
    if efecto["accion"] == "exceptua":
        res.update(resultado=NO_APLICA, motivo=f"exceptuada por el permiso {efecto['permiso']}: {cita}" + (f". {efecto['motivo']}" if efecto["motivo"] else ""))
    else:
        res.update(resultado=REVISION, motivo=f"permiso especial {efecto['permiso']}: decidir con {cita}" + (f". {efecto['motivo']}" if efecto["motivo"] else ""))
    return res


#: Métodos con que la IA lee la zona en el Documento Gráfico. Solo cuentan con las coordenadas del lote (ADR-0016).
METODOS_DOCUMENTO_GRAFICO = {"documento_grafico", "punto_en_poligono"}
_COORDENADAS = re.compile(r"coordenad|\bUTM\b|punto en pol[ií]gono", re.I)


def procedencia_de(nodo: dict, oficiales=()) -> str:
    """De dónde viene un código de zona, por su fuente: «oficial» (permiso o documento oficial del expediente),
    «arquitecto» (definido), «documento_grafico» (la IA lo leyó en el mapa con las coordenadas del lote), «usuario»
    (indicado al crear el PreCheck), «plano» o «ia»."""
    if nodo.get("definido"):
        return "arquitecto"
    f = nodo.get("fuente") or {}
    if f.get("origen") == "permiso" or (f.get("documento") and f.get("documento") in set(oficiales)):
        return "oficial"
    if f.get("metodo") in METODOS_DOCUMENTO_GRAFICO and (
            f.get("coordenadas") or _COORDENADAS.search(f"{f.get('detalle') or ''} {f.get('cita') or ''}")):
        return "documento_grafico"
    if f.get("metodo") == "declarado":
        return "usuario"
    doc = str(f.get("documento") or "plano").lower()
    return "ia" if doc.startswith("complementario") or f.get("metodo") in METODOS_DOCUMENTO_GRAFICO else "plano"


def fuente_de_zona(nodo: dict, procedencia: str) -> dict:
    return {"procedencia": procedencia, "codigo": nodo.get("valor"), "confianza": nodo.get("confianza"),
            "fuente": nodo.get("fuente"), **({"nombre": nodo["nombre"]} if nodo.get("nombre") else {})}


def fuentes_de_hechos(hechos: dict) -> list[dict]:
    """Fuentes de la zona que se ven en los hechos, cuando no las reunió `revisar` (pruebas, otros llamadores): el
    código del lote, según su procedencia, y el que declara el plano."""
    salida = []
    lote = _nodo(hechos, "lote.codigo_zona")
    if lote.get("valor"):
        salida.append(fuente_de_zona(lote, procedencia_de(lote)))
    plano = _nodo(hechos, "plano.zonificacion_declarada")
    if plano.get("valor"):
        salida.append(fuente_de_zona(plano, "plano"))
    return salida


def nombre_en_texto(codigo, texto) -> str | None:
    """El nombre que acompaña al código en el plano: «ZONIFICACION: R3 (Residencial de baja densidad)»."""
    if not codigo or not texto:
        return None
    m = re.search(rf"{re.escape(str(codigo))}\s*\(([^)]{{4,80}})", str(texto))
    return m.group(1).strip() if m else None


def fuentes_del_expediente(carpeta: Path, hechos: dict, reglas: list[dict], usuario: dict, ia: dict,
                           definidos: dict) -> tuple[list[dict], list[str]]:
    """Todas las fuentes de la zona de un PreCheck: los documentos oficiales del expediente, el arquitecto
    (definidas.json), lo que fijó la IA en el paso 1 (según su fuente), el plano y el usuario."""
    from precheck.motor.zona import codigos_de_norma  # noqa: PLC0415
    from precheck.planos import alcance  # noqa: PLC0415

    norma = _valor(hechos, "lote.norma_aplicable")
    oficiales, avisos, documentos = alcance.zonas_de_documentos_oficiales(carpeta, codigos_de_norma(reglas, norma)) if norma else ([], [], set())
    fuentes = list(oficiales)
    if definidos.get("lote.codigo_zona") not in (None, ""):
        fuentes.append({"procedencia": "arquitecto", "codigo": definidos["lote.codigo_zona"], "confianza": 1.0,
                        "fuente": {"metodo": "declarado", "detalle": "definida por el arquitecto"}})
    for nodo in (ia, usuario):
        if nodo.get("valor") not in (None, "") and not nodo.get("definido"):
            fuentes.append(fuente_de_zona(nodo, procedencia_de(nodo, documentos)))
    plano = _nodo(hechos, "plano.zonificacion_declarada")
    if plano.get("valor") not in (None, ""):
        fuentes.append(fuente_de_zona(plano, "plano"))
    for f in fuentes:
        if not f.get("nombre"):
            texto = " ".join(str((f.get("fuente") or {}).get(k) or "") for k in ("cita", "detalle"))
            nombre = nombre_en_texto(f["codigo"], texto)
            if nombre:
                f["nombre"] = nombre
    return fuentes, [f"ZONA_TRABAJO: {a}" for a in avisos]


def _final(regla: dict, res: dict, hechos: dict, falta: str) -> str:
    """El resultado final de una regla: el del motor si ya lo es, y si no, el de la decisión de respaldo."""
    if res["resultado"] != REVISION:
        return res["resultado"]
    return (decision_motor(regla, res, hechos, falta) or {}).get("resultado", REVISION)


def _homologa(regla_id: str, de: str, a: str) -> str:
    """La regla de la candidata que corresponde a `regla_id` («AC-R1D1-ALTURA» → «AC-R1D2-ALTURA»)."""
    de, a = clave(de).upper(), clave(a).upper()
    return re.sub(rf"(?<![A-Z0-9]){re.escape(de)}(?![A-Z0-9])", a, regla_id) if de and de != a else regla_id


def reglas_distintas(con_trabajo: dict[str, str], con_candidata: dict[str, str], zona: str, candidata: str) -> list[dict]:
    """Reglas cuyo resultado cambia entre la zona de trabajo y una candidata, emparejando las reglas homólogas de cada
    zona (la altura de R1d1 con la altura de R1d2). No cuenta las que no aplican con ninguna de las dos."""
    kz, kc = clave(zona).upper(), clave(candidata).upper()

    def nombra(rid: str, k: str) -> bool:
        return bool(k) and re.search(rf"(?<![A-Z0-9]){re.escape(k)}(?![A-Z0-9])", rid) is not None

    ids = list(dict.fromkeys([*con_trabajo, *con_candidata]))
    salida = []
    for rid in ids:
        otra = rid
        if kz != kc and nombra(rid, kz):
            otra = _homologa(rid, zona, candidata)           # la de la zona de trabajo, con su homóloga
        elif kz != kc and nombra(rid, kc) and _homologa(rid, candidata, zona) in ids:
            continue                                          # ya se comparó desde su homóloga
        rt, rc = con_trabajo.get(rid, NO_APLICA), con_candidata.get(otra, NO_APLICA)
        if rt != rc:
            salida.append({"regla_id": rid, **({"regla_candidata": otra} if otra != rid else {}),
                           "con_zona_de_trabajo": rt, "con_candidata": rc})
    return salida


def _aviso_zona(zt: dict, id_supuesto: str | None) -> str | None:
    if zt["codigo"] is None:
        return f"ZONA_TRABAJO: {zt['explicacion']}" if zt["explicacion"] else None
    if id_supuesto:
        texto = (f"{zt['explicacion']} Las reglas de zonificación se decidieron con este supuesto ({id_supuesto}); "
                 "confírmelo con la certificación de uso de suelo (CEUS).")
        # Se conserva el prefijo ZONA_DISCREPANTE cuando el usuario y el plano no coinciden: lo leen la revisión con IA
        # (web/src/server/ia/revisar.ts) y la comprobación previa de los lotes (scripts/preflight_ia.py).
        usuario = next((d["codigo"] for d in zt["declarado"] if d["procedencia"] == "usuario"), None)
        plano = next((d["codigo"] for d in zt["declarado"] if d["procedencia"] == "plano"), None)
        if usuario and plano and clave(usuario) != clave(plano):
            return f"ZONA_DISCREPANTE: el usuario indicó la zona {usuario!r} pero el plano declara {plano!r}. {texto}"
        return f"ZONA_TRABAJO: {texto}"
    if zt["modo"] == "grafia" or zt["procedencia"] == "oficial":
        return f"ZONA_TRABAJO: {zt['explicacion']}"
    return None


def evaluar(hechos: dict, reglas: list[dict], fecha: str, umbral: float = 0.85, permisos: list[dict] | None = None,
            fuentes_zona: list[dict] | None = None, familias: list[dict] | None = None,
            norma_determinada: bool | None = None) -> dict:
    """Evalúa todas las reglas vigentes con la zona de trabajo (ADR-0016).

    `fuentes_zona`: de dónde sale el código de zona (ver `zona_de_trabajo`); si no se dan, se toman de los hechos.
    `norma_determinada`: la norma no es solo la que indicó el usuario; por defecto, se deduce de su fuente."""
    from precheck.planos.alcance import efectos_por_regla  # noqa: PLC0415

    vigentes = [r for r in reglas if r.get("estado_revision") != "retirada" and vigente(r, fecha)]
    nodo_norma = _nodo(hechos, "lote.norma_aplicable")
    norma = nodo_norma.get("valor")
    if norma_determinada is None:
        norma_determinada = (nodo_norma.get("fuente") or {}).get("metodo") != "declarado" or bool(nodo_norma.get("definido"))
    fuentes = fuentes_zona if fuentes_zona is not None else fuentes_de_hechos(hechos)
    zt = zona_de_trabajo(fuentes, norma if norma in NORMAS else None, vigentes, hechos,
                         familias if familias is not None else cargar_familias(), umbral, norma_determinada)
    norma_dudosa = norma is not None and float(nodo_norma.get("confianza", 1.0)) < umbral
    if zt["codigo"] and norma_dudosa and zt["firme"] and zt["procedencia"] != "oficial":
        zt.update(firme=False, explicacion=zt["explicacion"] + f" La norma se leyó con confianza {nodo_norma.get('confianza')}.")

    supuestos: list[dict] = []
    claves_supuesto: dict[tuple, str] = {}

    def supuesto(datos: dict, llave: tuple | None = None) -> str:
        if llave is not None and llave in claves_supuesto:
            return claves_supuesto[llave]
        sid = f"S{len(supuestos) + 1}"
        supuestos.append({"id": sid, **datos, "reglas": []})
        if llave is not None:
            claves_supuesto[llave] = sid
        return sid

    if zt["codigo"]:
        base = con_zona(hechos, zt["codigo"], zt["norma"],
                        {**(zt["fuente"] or {}), "origen": "zona_trabajo", "procedencia": zt["procedencia"]})
        falta = "la CEUS"
    else:
        # Sin zona razonable: el código declarado no se da por cierto y las reglas de otras zonas se agrupan (ADR-0012);
        # su decisión de respaldo es INFORMACION_REQUERIDA.
        base = copy.deepcopy(hechos)
        z = (base.get("lote") or {}).get("codigo_zona")
        if isinstance(z, dict) and z.get("valor") is not None:
            z["confianza"] = min(float(z.get("confianza", 1.0)), 0.5)
        falta = zt.get("falta") or "la CEUS"
    zona_sup = None
    if zt["codigo"] and not zt["firme"]:
        zona_sup = supuesto({"tipo": "zona", "codigo": zt["codigo"], "norma": zt["norma"], "procedencia": zt["procedencia"],
                             "modo": zt["modo"], "explicacion": zt["explicacion"], "fuente": zt["fuente"],
                             "accion": "Traiga la certificación de uso de suelo (CEUS) de la DPUOT y vuelva a evaluar."})
    elif zt["codigo"] is None and norma:
        supuestos.append({"id": f"S{len(supuestos) + 1}", "tipo": "sin_zona", "norma": norma, "explicacion": zt["explicacion"],
                          "accion": f"Traiga {falta} y vuelva a evaluar.", "reglas": []})

    confirmados = con_campos_confirmados(base)
    efectos = efectos_por_regla(permisos or [])
    resultados, exceptuadas, finales_trabajo = [], [], {}
    no_aplican_por_zona = 0
    for r in vigentes:
        res = _con_permiso(clasificar(r, evaluar_regla(r, base, umbral), base, umbral, confirmados), efectos.get(r["id"]))
        res["titulo"] = r.get("titulo")
        res["norma"] = norma_de(r["id"])
        # La web separa el NO_CUMPLE de un requisito de contenido del plano («falta en el plano») del que exige cambiar el proyecto.
        res["tipo"] = r.get("tipo")
        dep = depende_de_zona(r)
        final = _final(r, res, base, falta)
        if dep:
            finales_trabajo[r["id"]] = final
        if res["resultado"] == REVISION:
            dm = decision_motor(r, res, base, falta)
            ids = [supuesto(s, (s["tipo"], s.get("campo") if s["tipo"] != "borde" else None)) for s in dm["supuestos"]]
            if zona_sup and dep:
                ids.insert(0, zona_sup)
            res["decision_motor"] = {"resultado": dm["resultado"], "motivo": dm["motivo"], "con_supuesto": ids}
        elif zona_sup and dep and res["resultado"] in (CUMPLE, NO_CUMPLE):
            # Zona supuesta: el motor no decide en firme. Queda para la IA (puede cambiarla) con el resultado provisional.
            provisional = res["resultado"]
            res["decision_motor"] = {"resultado": provisional, "motivo": res.get("mensaje") or res.get("motivo"),
                                     "con_supuesto": [zona_sup]}
            res.update(resultado=REVISION, causa={"tipo": "zona_supuesta", "resultado": provisional},
                       motivo=f"zona de trabajo supuesta ({zt['codigo']}, {zona_sup}): resultado provisional {provisional}; "
                              "la revisión lo confirma o lo cambia")
        elif zona_sup and dep and res["resultado"] == NO_APLICA:
            no_aplican_por_zona += 1
        dm = res.get("decision_motor")
        if dm:
            if dm["resultado"] == NO_CUMPLE:
                dm["mensaje"] = r.get("mensaje_no_cumple")
            for sid in dm["con_supuesto"]:
                if dm["resultado"] != NO_APLICA or sid != zona_sup:
                    supuestos[int(sid[1:]) - 1]["reglas"].append(r["id"])
        resultados.append(res)
        if res.get("permiso") and res["resultado"] == NO_APLICA:
            exceptuadas.append({"regla_id": res["regla_id"], "titulo": res["titulo"], "permiso": res["permiso"], "motivo": res["motivo"]})

    # Cada candidata descartada se evalúa también (es gratis) y se guarda qué reglas habrían salido distintas.
    for d in zt["descartadas"]:
        hc = con_zona(hechos, d["codigo"], d["norma"])
        con_candidata = {r["id"]: _final(r, evaluar_regla(r, hc, umbral), hc, falta) for r in vigentes if depende_de_zona(r)}
        distintas = reglas_distintas(finales_trabajo, con_candidata, zt["codigo"], d["codigo"])
        d["reglas_distintas"] = distintas
        d["total_distintas"] = len(distintas)
    if zona_sup:
        supuestos[int(zona_sup[1:]) - 1]["descartadas"] = zt["descartadas"]
        supuestos[int(zona_sup[1:]) - 1]["no_aplican_por_zona"] = no_aplican_por_zona

    aplicables = [r for r in resultados if r["resultado"] != NO_APLICA]
    aplicables.sort(key=_orden)
    resumen: dict = {}
    for r in aplicables:
        resumen[r["resultado"]] = resumen.get(r["resultado"], 0) + 1
    # La cuenta que cierra: cada regla aplicable con su decisión final (la del motor o la de respaldo).
    final_por_decision: dict = {}
    zonificacion = generales = 0
    for r in aplicables:
        f = (r.get("decision_motor") or {}).get("resultado", r["resultado"])
        final_por_decision[f] = final_por_decision.get(f, 0) + 1
        if f == NO_APLICA or r.get("grupo") == GRUPO_ZONA:   # las de otras zonas no son vigentes
            continue
        if r.get("norma") in (None, "A110-2025"):
            generales += 1
        else:
            zonificacion += 1
    norma_eval = zt["norma"] if zt["codigo"] else norma
    codigo = zt["codigo"] or _valor(hechos, "lote.codigo_zona")
    con_reglas = {r["norma"] for r in aplicables}
    avisos = []
    if not norma:
        avisos.append("Falta lote.norma_aplicable: sin norma no se evalúa la zonificación.")
    elif norma not in NORMAS:
        avisos.append(f"La norma {norma!r} no está registrada en precheck/reglas/normas.json.")
    else:
        # Con zona de trabajo, los avisos ZONA_TRABAJO ya dicen qué código se descartó y por qué; «se necesita la CEUS»
        # solo cuando no hubo zona con qué evaluar.
        for c in dict.fromkeys(str(f["codigo"]) for f in fuentes if f.get("codigo") and not zt["codigo"]):
            inexistente = aviso_codigo_inexistente(vigentes, norma, c)
            if inexistente:
                avisos.append(inexistente)
        if norma_eval not in con_reglas:
            avisos.append(f"Ninguna regla de {norma_eval} aplicó a este lote: su zonificación requiere revisión manual.")
    aviso = _aviso_zona(zt, zona_sup)
    if aviso:
        avisos.insert(0, aviso)
    avisos += [f"ZONA_TRABAJO: {a}" for a in zt["avisos"]]
    ajenas = [r for r in aplicables if r.get("grupo") == GRUPO_ZONA]
    return {"fecha_presentacion": fecha, "norma_aplicable": norma_eval, "codigo_zona": codigo,
            "umbral": umbral, "oficial": False, "resumen": resumen, "avisos": avisos,
            "resultados": aplicables, "no_aplican": len(resultados) - len(aplicables),
            # Campo nuevo (ADR-0012): `resumen` sigue contando todas las reglas; esto dice cuántas se agrupan.
            "agrupadas": {GRUPO_ZONA: _grupo_zona(base, ajenas)} if ajenas else {},
            # ADR-0016: la zona con que se evaluó, los supuestos y la cuenta final (0 sin decisión).
            "zona_trabajo": {**{k: v for k, v in zt.items() if k != "encaje"}, "supuesto": zona_sup},
            "supuestos": supuestos,
            "final": {"por_decision": final_por_decision, "zonificacion": zonificacion, "generales": generales},
            **({"exceptuadas": exceptuadas} if exceptuadas else {})}


def _declarado(d: dict) -> str:
    return ", ".join(f"{c.split('.')[-1]} {v.get('valor')!r} (confianza {v.get('confianza')})" for c, v in d.items())


def resumen_md(res: dict, documento: str | None) -> str:
    ico = {NO_CUMPLE: "❌", REVISION: "⚠️", CUMPLE: "✅"}
    grupo = (res.get("agrupadas") or {}).get(GRUPO_ZONA)
    resumen = ", ".join(f"{k} {v}" for k, v in res["resumen"].items()) or "sin reglas aplicables"
    if grupo:
        resumen += f" (de ellas, {grupo['total']} de otras zonas de la norma, agrupadas en una línea al final)"
    lin = [f"# Revisión preliminar · {documento or 'plano'}", "",
           "> Resultado **indicativo** con reglas en borrador. No sustituye el dictamen técnico de la DOYC "
           "(Acuerdo 110, Art. 3). Todo NO_CUMPLE lo confirma una persona.", "",
           f"- Fecha de presentación: {res['fecha_presentacion']}",
           f"- Norma aplicable: {res['norma_aplicable'] or 'no consta'} · zona: {res['codigo_zona'] or 'no consta'}",
           "- Resumen: " + resumen, ""]
    zt = res.get("zona_trabajo") or {}
    if zt.get("codigo"):
        estado = f"supuesto {zt['supuesto']}" if zt.get("supuesto") else "firme"
        lin.insert(-1, f"- Zona de trabajo: {zt['codigo']} ({estado}) · {zt.get('explicacion', '')}")
    for s in res.get("supuestos") or []:
        lin.insert(-1, f"- {s['id']} ({s['tipo']}): {s.get('explicacion') or s.get('campo') or ''} · {len(s.get('reglas') or [])} reglas")
    lin += [f"- ⚠️ {a}" for a in res["avisos"]]
    lin += ["", "| | Regla | Resultado | Motivo | Fuente |", "|---|---|---|---|---|"]
    for r in res["resultados"]:
        if r.get("grupo") == GRUPO_ZONA:
            continue
        f = r.get("fuente_norma") or {}
        motivo = (r.get("mensaje") if r["resultado"] == NO_CUMPLE else r.get("motivo")) or ""
        prov = r.get("si_se_confirma_zona")
        if prov:
            confirma = ", ".join(f"{c.split('.')[-1]} {v!r}" for c, v in prov["declarado"].items())
            motivo += f" · provisional, si se confirma {confirma}: {prov['resultado']}"
            if prov["resultado"] == REVISION:
                motivo += f" ({prov['motivo']})"
        lin.append(f"| {ico.get(r['resultado'], '')} | `{r['regla_id']}` {r.get('titulo') or ''} | {r['resultado']} "
                   f"| {motivo.replace('|', '/')} | {f.get('norma', '')}, {f.get('articulo', '')} |")
    if grupo:
        piden = "; ".join(f"{c.split('.')[-1]}: {', '.join(v)}" for c, v in grupo["valores_reglas"].items())
        lin.append(f"| ⚠️ | {grupo['total']} reglas de otras zonas ({piden}) | {REVISION} "
                   f"| {grupo['motivo']}. Declarado: {_declarado(grupo['declarado'])}. Se resuelven con la CEUS "
                   f"| {', '.join(grupo['normas'])} |")
    return "\n".join(lin) + "\n"


#: Las regiones son evidencia, nunca verdad: ningún hecho de regiones llega al umbral del motor (0.85).
CONFIANZA_MAX_REGIONES = 0.80


def _leer_json(ruta: Path):
    try:
        return json.loads(ruta.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _regiones_de_la_carpeta(out: Path) -> dict | None:
    """`regiones.json` de la carpeta del caso (la web lo copia ahí al ejecutar, junto a extraccion.json y lote.json);
    None si no hay. No se lee el de la carpeta del plano: puede estar a medio editar."""
    ruta = out / "regiones.json"
    if not ruta.exists():
        return None
    datos = json.loads(ruta.read_text(encoding="utf-8"))
    return datos if isinstance(datos, dict) else None


def hechos_de_regiones(resumen: dict) -> dict:
    """Hechos `plano.regiones.*` desde el contraste de las regiones (conteos, tipos presentes, medidas y
    discrepancias), con la confianza de las regiones que los sostienen y nunca más de 0.80. Ninguna regla del catálogo
    lee `plano.regiones.*`: sirven a la revisión con IA como evidencia para contrastar con lo declarado."""
    conf = resumen.get("confianza") or {}
    detalles = resumen.get("detalles") or {}
    fuente = {"metodo": "regiones", "documento": "regiones.json"}

    def nodo(valor, c, detalle: str | None = None) -> dict:
        n = {"valor": valor, "confianza": round(min(c if isinstance(c, (int, float)) else 0.5, CONFIANZA_MAX_REGIONES), 2),
             "fuente": dict(fuente)}
        if detalle:
            n["detalle"] = detalle
        return n

    hechos: dict = {}
    for tipo, n in (resumen.get("conteos") or {}).items():
        _poner(hechos, f"plano.regiones.conteo.{tipo}", nodo(n, conf.get(f"conteo.{tipo}")))
        _poner(hechos, f"plano.regiones.presente.{tipo}", nodo(True, conf.get(f"conteo.{tipo}")))
    for clave_m, v in (resumen.get("medidas") or {}).items():
        if v is not None:
            _poner(hechos, f"plano.regiones.{clave_m}", nodo(v, conf.get(clave_m), detalles.get(clave_m)))
    discrepancias = resumen.get("discrepancias") or []
    if discrepancias:
        _poner(hechos, "plano.regiones.discrepancias",
               nodo(discrepancias, min((d.get("confianza") or 0.5) for d in discrepancias)))
    return hechos


def revisar(pdf: str | None, extraccion: str | None, lote: str | None, salida: str, fecha: str | None = None,
            umbral: float = 0.85, reglas: list[dict] | None = None) -> dict:
    out = Path(salida)
    out.mkdir(parents=True, exist_ok=True)
    if extraccion:
        ext = json.loads(Path(extraccion).read_text(encoding="utf-8"))
    elif pdf:
        from precheck.planos.extraer import extraer  # noqa: PLC0415 — pymupdf es opcional
        ext = extraer(pdf, out)
    else:
        ext = {"hechos": []}
    hechos = a_hechos(ext)
    if lote:
        complemento = json.loads(Path(lote).read_text(encoding="utf-8"))
        hechos = cantidad_coherente(combinar(hechos, complemento), complemento)
    # Cada valor con la forma del contrato de datos («TERCER ORDEN» → «tercer»): precheck/planos/valores.py, ADR-0019.
    # Se repite después del alcance y de lo definido, que también traen valores.
    from precheck.planos import valores  # noqa: PLC0415
    contrato = valores.cargar()
    hechos, avisos_valores = valores.normalizar(hechos, contrato)
    resumen_regiones, aviso_regiones = None, None
    try:
        regiones = _regiones_de_la_carpeta(out)
        if regiones is not None:
            from precheck.planos.regiones import contrastar  # noqa: PLC0415

            resumen_regiones = contrastar(regiones, hechos)
    except Exception as e:  # noqa: BLE001 — unas regiones dañadas no impiden la revisión
        aviso_regiones = f"No se pudieron leer las regiones del plano (regiones.json): {e}"
    if resumen_regiones is not None:
        hechos = combinar(hechos, hechos_de_regiones(resumen_regiones))
        (out / "regiones_resumen.json").write_text(json.dumps(resumen_regiones, ensure_ascii=False, indent=1), encoding="utf-8")
    reglas = reglas if reglas is not None else cargar_reglas()
    fecha = fecha or _valor(hechos, "expediente.fecha_presentacion") or dt.date.today().isoformat()
    # Paso 0 (ficha de alcance, una vez por corrida) y paso 1 (la norma, la zona, los datos de alcance y los permisos que
    # fijó la IA con su fuente): precheck/planos/alcance.py.
    from precheck.planos import alcance  # noqa: PLC0415

    base = _leer_json(out / alcance.ARCHIVO_BASE)
    if base is None:
        base = alcance.ficha(hechos, reglas, out, str(fecha))
        alcance.escribir(out, alcance.ARCHIVO_BASE, base)
    # Fuentes de la zona, antes de que la IA o el arquitecto reemplacen el dato (ADR-0016): cada una con su procedencia.
    usuario = _nodo(hechos, "lote.codigo_zona")
    hechos, estado_alcance = alcance.aplicar(hechos, out, reglas, base, NORMAS)
    ia = _nodo(hechos, "lote.codigo_zona") if "lote.codigo_zona" in estado_alcance["aplicado"] else {}
    # Lo que el arquitecto definió se impone sobre la lectura y la IA (precheck/planos/definidas.py).
    from precheck.planos import definidas  # noqa: PLC0415

    valores_definidos = definidas.cargar(out)
    hechos, avisos_definidas = definidas.imponer(hechos, valores_definidos)
    hechos, mas_avisos = valores.normalizar(hechos, contrato)
    avisos_valores += mas_avisos
    # Las cuentas las hace el sistema y los datos sin sentido físico no llegan al umbral (precheck/planos/sensatez.py).
    from precheck.planos.sensatez import aplicar as sensatez  # noqa: PLC0415

    hechos, avisos_sensatez = sensatez(hechos)
    fuentes_zona, avisos_oficiales = fuentes_del_expediente(out, hechos, reglas, usuario, ia, valores_definidos)
    res = evaluar(hechos, reglas, str(fecha), umbral, estado_alcance["permisos"], fuentes_zona)
    res["avisos"] += avisos_oficiales
    res["documento"] = ext.get("documento")
    if resumen_regiones:
        res["avisos"] += [f"REGIONES_DISCREPANTES: {d['mensaje']}" for d in resumen_regiones["discrepancias"]]
    if aviso_regiones:
        res["avisos"].append(aviso_regiones)
    res["avisos"] += avisos_valores + avisos_sensatez + avisos_definidas + [f"ALCANCE_IA: {e}" for e in estado_alcance["errores"]]
    if estado_alcance["permisos"]:
        res["permisos"] = estado_alcance["permisos"]
    lista = alcance.lista_cerrada(res, estado_alcance)
    alcance.escribir(out, alcance.ARCHIVO_LISTA, lista)
    # Resumen de las reglas vigentes para la web (informe y resumen del expediente): la lista completa queda en su archivo.
    res["reglas_vigentes"] = {"total": lista["total"], "sin_determinar": len(lista["sin_determinar"]),
                              "exceptuadas": len(lista["exceptuadas"]), "otras_zonas": lista["otras_zonas"],
                              "alcance_ia": lista["alcance_ia"], "propuestas": len(estado_alcance["propuestas"]),
                              # ADR-0016: «N generales del Acuerdo 110 + M de zonificación de la zona de trabajo».
                              "generales": res["final"]["generales"], "zonificacion": res["final"]["zonificacion"]}
    if estado_alcance["propuestas"]:
        alcance.escribir(out, alcance.ARCHIVO_PROPUESTAS, estado_alcance["propuestas"])
    (out / "hechos.json").write_text(json.dumps(hechos, ensure_ascii=False, indent=1), encoding="utf-8")
    (out / "resultado.json").write_text(json.dumps(res, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
    (out / "resumen.md").write_text(resumen_md(res, ext.get("documento")), encoding="utf-8")
    return res


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="python -m precheck.planos.revisar", description=__doc__.split("\n")[0])
    ap.add_argument("pdf", nargs="?")
    ap.add_argument("--extraccion", help="extraccion.json ya generado (no vuelve a leer el PDF)")
    ap.add_argument("--lote", help="hechos complementarios (norma, zona, fecha, medidas leídas)")
    ap.add_argument("--salida", required=True)
    ap.add_argument("--fecha", help="fecha de presentación AAAA-MM-DD (por defecto la de los hechos o hoy)")
    ap.add_argument("--umbral", type=float, default=0.85)
    a = ap.parse_args(argv)
    if not a.pdf and not a.extraccion and not a.lote:
        ap.error("indique un PDF, --extraccion o --lote")
    try:
        res = revisar(a.pdf, a.extraccion, a.lote, a.salida, a.fecha, a.umbral)
    except Exception as e:  # noqa: BLE001 — la CLI informa y sale con código distinto de 0
        print(f"No se pudo revisar el plano: {e}", file=sys.stderr)
        return 1
    print(f"{res['norma_aplicable']} · {res['resumen']} -> {a.salida}/resumen.md")
    return 0


if __name__ == "__main__":
    sys.exit(main())
