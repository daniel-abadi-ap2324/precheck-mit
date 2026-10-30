"""Reglas vigentes de un PreCheck: ficha de alcance (paso 0), alcance que fija la IA (paso 1) y lista cerrada de reglas.

La revisión con IA va en dos pasos, iguales para todos los modelos:

1. **Reglas vigentes.** El servidor deja `alcance_base.json` (paso 0, determinista): la norma declarada y las que
   reconocen el código de zona, la zona del usuario y la del plano, los datos que deciden si aplica cada regla
   (`aplica_si`) y los documentos complementarios. La IA decide con su criterio la norma, la zona, esos datos y los
   permisos especiales del expediente, y lo escribe en `alcance_ia.json` con su fuente. El motor lo aplica en cada
   evaluación (`aplicar`): sin fuente comprobable no entra, y el error se devuelve a la IA en `reglas_a_evaluar.json`.
2. **Evaluación rígida.** El motor evalúa y escribe `reglas_a_evaluar.json`: la lista cerrada de reglas que aplican,
   las exceptuadas por un permiso y las que todavía no se sabe si aplican. Fuera de esa lista no hay reglas que decidir.

Un permiso especial (una nota de la DPU, una resolución) puede exceptuar reglas (NO_APLICA con su cita) o condicionarlas
(quedan en revisión para que la IA las decida con la cita). Si trae una regla que el catálogo no tiene, la IA deja la
propuesta en `propuestas_reglas.json`: el catálogo (`reglas/`) solo cambia por el gobierno de cuatro ojos.
"""
from __future__ import annotations

import copy
import difflib
import json
import re
import unicodedata
from pathlib import Path

from precheck.motor.zona import clave, codigos_de_regla, normas_de_regla

ARCHIVO_BASE = "alcance_base.json"
ARCHIVO_IA = "alcance_ia.json"
ARCHIVO_LISTA = "reglas_a_evaluar.json"
ARCHIVO_PROPUESTAS = "propuestas_reglas.json"

#: Campos de `alcance_ia.json` que ubican el lote en la norma, con su ruta en los hechos.
UBICACION = {"norma": "lote.norma_aplicable", "codigo_zona": "lote.codigo_zona",
             "sf_sector": "lote.sf_sector", "sf_unidad_territorial": "lote.sf_unidad_territorial"}
#: Datos del expediente que no decide nadie más que quien los presenta: no son de alcance.
NO_SON_ALCANCE = re.compile(r"^(tramite|expediente\.fecha_presentacion|lote\.(norma_aplicable|codigo_zona|sf_sector|sf_unidad_territorial))$")
#: Métodos de lectura cuya cita se comprueba contra el texto de la página (capa vectorial u OCR).
METODOS_DE_TEXTO = {"texto", "lectura", "documento", "expediente", "pdf_texto", "ocr", "declarado"}
ACCIONES = {"exceptua", "condiciona"}
TIPOS_PERMISO = {"excepcion", "norma_especial", "resolucion_edificabilidad", "otro"}
CONFIANZA_POR_DEFECTO = 0.9
#: El sector y la unidad territorial de San Francisco solo se fijan con evidencia que los distinga: con confianza de
#: 0.6 o menos (contrato, C-ZONA) no entran y las reglas que dependen de ellos quedan sin determinar. En la ronda 78
#: Opus escribía «UT 5» con 0.4–0.5 como valor de referencia y el motor lo usaba; Sonnet no lo fijaba.
SUBDIVISIONES = {"sf_sector", "sf_unidad_territorial"}
CONFIANZA_MAXIMA_DUDOSA = 0.6
_CLAVE = re.compile(r"\b([a-z_]+\.[a-z_][a-z0-9_.]*)")
_EXISTE = re.compile(r"existe\(\s*([a-z_]+\.[a-z_][a-z0-9_.]*)\s*\)")
_MIN_CITA = 8   # caracteres comparables: una cita más corta no prueba nada


# ---------------------------------------------------------------- paso 0: ficha de alcance

def _sin_tildes(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def _comparable(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", _sin_tildes(str(s)).lower())


def indice_de_codigos(reglas: list[dict]) -> dict[str, set[str]]:
    """Código de zona (grafía comparable) → normas cuyas reglas lo reconocen. Una sola pasada por el catálogo."""
    indice: dict[str, set[str]] = {}
    for r in reglas:
        normas, codigos = normas_de_regla(r), codigos_de_regla(r)
        for c in codigos or ():
            indice.setdefault(clave(c), set()).update(normas or ())
    return indice


def normas_candidatas(reglas: list[dict], declarada: str | None, codigo) -> list[str]:
    """La norma declarada y las que reconocen el código de zona (p. ej. MP-C2: Línea 1 y Línea 2 del Metro). No elige
    una: entre varias decide la IA con la ubicación del lote."""
    otras = sorted(indice_de_codigos(reglas).get(clave(codigo), set())) if codigo not in (None, "") else []
    return list(dict.fromkeys([n for n in [declarada, *otras] if n]))


def claves_de_alcance(reglas: list[dict], normas: list[str]) -> tuple[dict[str, dict], list[str]]:
    """Datos que deciden si aplica cada regla de las normas candidatas (y de las reglas generales, sin norma): clave →
    {reglas: cuántas, ejemplos}. Aparte, las que solo cuentan si existen (`existe(...)` en el `aplica_si`)."""
    claves: dict[str, dict] = {}
    en_existe: set[str] = set()
    comparadas: set[str] = set()   # las que algún aplica_si compara con un valor: «false» es un valor, no «no existe»
    for r in reglas:
        expr = r.get("aplica_si")
        if not isinstance(expr, str) or r.get("estado_revision") == "retirada":
            continue
        de = normas_de_regla(r)
        if de is not None and not (de & set(normas)):
            continue
        en_existe |= set(_EXISTE.findall(expr))
        comparadas |= set(_CLAVE.findall(_EXISTE.sub(" ", expr)))
        for k in dict.fromkeys(_CLAVE.findall(expr)):
            if NO_SON_ALCANCE.match(k):
                continue
            d = claves.setdefault(k, {"reglas": 0, "ejemplos": []})
            d["reglas"] += 1
            if len(d["ejemplos"]) < 3:
                d["ejemplos"].append(r["id"])
    return dict(sorted(claves.items())), sorted((en_existe - comparadas) & set(claves))


TIPOS_DOCUMENTO = [
    ("CEUS", re.compile(r"certificaci[oó]n\s+de\s+uso\s+de\s+suelo|\bCEUS\b", re.I)),
    ("nota DPU", re.compile(r"\bDPU\b|planificaci[oó]n\s+urbana|ordenamiento\s+territorial", re.I)),
    ("resolución", re.compile(r"\bresoluci[oó]n\b", re.I)),
    ("carta o autorización", re.compile(r"\bcarta\b|visto\s+bueno|autoriz|no\s+objeci[oó]n", re.I)),
    ("memoria descriptiva", re.compile(r"memoria\s+descriptiva|cuadro\s+de\s+[aá]reas", re.I)),
]


def _texto_documento(ruta: Path, paginas: int = 3) -> tuple[str, bool]:
    """Texto vectorial de las primeras páginas y si alguna está escaneada (sin texto)."""
    try:
        import pymupdf  # noqa: PLC0415 — opcional
    except ImportError:
        return "", False
    try:
        with pymupdf.open(ruta) as doc:
            textos = [doc[i].get_text() for i in range(min(paginas, len(doc)))]
            escaneado = any(not doc[i].get_text("words") for i in range(len(doc)))
    except Exception:  # noqa: BLE001 — un PDF dañado no impide la ficha
        return "", False
    return "\n".join(textos), escaneado


def documentos_de_la_carpeta(carpeta: Path) -> list[dict]:
    try:
        lista = json.loads((carpeta / "documentos.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    salida = []
    for d in lista if isinstance(lista, list) else []:
        if not isinstance(d, dict) or not isinstance(d.get("archivo"), str):
            continue
        texto, escaneado = _texto_documento(carpeta / d["archivo"])
        tipo = next((t for t, rx in TIPOS_DOCUMENTO if rx.search(texto)), None)
        salida.append({"archivo": d["archivo"], "nombre": d.get("nombre"), "tipo_probable": tipo or ("escaneado: leerlo" if escaneado else "otro"),
                       "tiene_paginas_escaneadas": escaneado})
    return salida


#: Tipos de documento complementario cuyo código de zona prevalece sobre el plano (principio 5).
TIPOS_OFICIALES = ("CEUS", "nota DPU", "resolución")
# Códigos con al menos una cifra («1-R2», «R1d1», «MP-C2»); sin cifra hay demasiadas siglas que no son zonas.
_CODIGO_EN_TEXTO = re.compile(r"(?<![A-Za-z0-9])(\d?-?[A-Z]{1,3}\d{1,2}[a-z]?\d?(?:-?[A-Za-z0-9]{1,3})?)(?![A-Za-z0-9])")


def _paginas(ruta: Path, maximo: int = 10) -> list[str]:
    try:
        import pymupdf  # noqa: PLC0415 — opcional
    except ImportError:
        return []
    try:
        with pymupdf.open(ruta) as doc:
            return [doc[i].get_text() for i in range(min(maximo, len(doc)))]
    except Exception:  # noqa: BLE001 — un PDF dañado no impide la evaluación
        return []


def zonas_de_documentos_oficiales(carpeta: Path, conocidos: set[str]) -> tuple[list[dict], list[str], set[str]]:
    """Códigos de zona que dicen los documentos oficiales del expediente (CEUS, nota DPU, resolución) y que existen en
    la norma (`conocidos`, grafía de las reglas). Solo cuenta un documento que nombra UN código de la norma: si nombra
    varios, se avisa y no se usa. Devuelve (fuentes con procedencia «oficial», avisos, nombres de los documentos
    oficiales). Una página escaneada no se lee aquí: la lee la IA en el paso 1."""
    from precheck.motor.zona import resolver  # noqa: PLC0415

    fuentes, avisos, oficiales = [], [], set()
    for d in documentos_de_la_carpeta(carpeta):
        if d["tipo_probable"] not in TIPOS_OFICIALES:
            continue
        oficiales |= {d["archivo"], d.get("nombre") or d["archivo"]}
        vistos: dict[str, dict] = {}
        for pagina, texto in enumerate(_paginas(carpeta / d["archivo"]), 1):
            for linea in texto.splitlines():
                for m in _CODIGO_EN_TEXTO.finditer(linea):
                    r = resolver(m.group(1), conocidos)
                    if r and clave(r[0]) not in vistos:
                        vistos[clave(r[0])] = {"codigo": r[0], "escrito": m.group(1), "pagina": pagina, "cita": linea.strip()}
        if len(vistos) == 1:
            v = next(iter(vistos.values()))
            fuentes.append({"procedencia": "oficial", "codigo": v["codigo"], "confianza": 1.0,
                            "fuente": {"documento": d.get("nombre") or d["archivo"], "archivo": d["archivo"], "tipo": d["tipo_probable"],
                                       "pagina": v["pagina"], "cita": v["cita"], "metodo": "texto", "escrito": v["escrito"]}})
        elif len(vistos) > 1:
            avisos.append(f"El documento {d.get('nombre') or d['archivo']} ({d['tipo_probable']}) nombra varios códigos de la norma "
                          f"({', '.join(v['codigo'] for v in vistos.values())}); no se usa para elegir la zona.")
    return fuentes, avisos, oficiales


def _valor(hechos: dict, ruta: str):
    nodo = hechos
    for p in ruta.split("."):
        if not isinstance(nodo, dict) or p not in nodo:
            return None
        nodo = nodo[p]
    return nodo.get("valor") if isinstance(nodo, dict) and "valor" in nodo else nodo


def ficha(hechos: dict, reglas: list[dict], carpeta: Path, fecha: str) -> dict:
    """Paso 0: lo que la IA necesita para decidir las reglas vigentes. No decide nada."""
    from precheck.motor.zona import aviso_codigo_inexistente  # noqa: PLC0415

    declarada = _valor(hechos, "lote.norma_aplicable")
    codigo = _valor(hechos, "lote.codigo_zona")
    del_plano = _valor(hechos, "plano.zonificacion_declarada")
    candidatas = normas_candidatas(reglas, declarada, codigo)
    if del_plano and clave(del_plano) != clave(codigo or ""):
        candidatas = list(dict.fromkeys([*candidatas, *normas_candidatas(reglas, None, del_plano)]))
    claves, solo_si_existe = claves_de_alcance(reglas, candidatas)
    return {
        "fecha_presentacion": fecha,
        "norma_declarada": declarada,
        "normas_candidatas": candidatas,
        "zona": {"usuario": codigo, "plano": del_plano,
                 "discrepan": bool(codigo and del_plano and clave(codigo) != clave(del_plano)),
                 "aviso": aviso_codigo_inexistente(reglas, declarada, codigo) if declarada else None},
        "datos_de_alcance": claves,
        "solo_si_existe": solo_si_existe,
        "documentos": documentos_de_la_carpeta(carpeta),
    }


# ---------------------------------------------------------------- paso 1: alcance que fija la IA

def _pdf_de(carpeta: Path, documento: str | None) -> tuple[Path | None, Path]:
    """PDF y caché de OCR del documento citado: el plano (plano.pdf en la carpeta) o un complementario, por su archivo o
    por el nombre con que se cargó."""
    doc = str(documento or "plano").strip()
    cache = carpeta / "tmp" / "ocr"
    if doc in ("plano", "plano.pdf", "original.pdf", ""):
        return carpeta / "plano.pdf", cache
    base = doc[:-4] if doc.lower().endswith(".pdf") else doc
    if re.fullmatch(r"complementario-\d+", base):
        return carpeta / f"{base}.pdf", cache / base
    try:
        lista = json.loads((carpeta / "documentos.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        lista = []
    for d in lista if isinstance(lista, list) else []:
        if isinstance(d, dict) and str(d.get("nombre", "")).lower() in (doc.lower(), f"{base.lower()}.pdf"):
            a = str(d.get("archivo", ""))[:-4]
            return carpeta / f"{a}.pdf", cache / a
    # El plano también puede citarse por el nombre con que se cargó (el de extraccion.json).
    return (carpeta / "plano.pdf", cache) if (carpeta / "plano.pdf").exists() and doc.lower().endswith(".pdf") else (None, cache)


class _Textos:
    """Texto de cada página citada, vectorial o, si la página está escaneada, del OCR (con caché en tmp/ocr)."""

    def __init__(self, carpeta: Path):
        self.carpeta = carpeta
        self._memo: dict[tuple[str, int], tuple[str, bool] | None] = {}

    def de(self, documento: str | None, pagina: int) -> tuple[str, bool] | None:
        pdf, cache = _pdf_de(self.carpeta, documento)
        if pdf is None or not pdf.exists():
            return None
        k = (str(pdf), pagina)
        if k not in self._memo:
            self._memo[k] = self._leer(pdf, cache, pagina)
        return self._memo[k]

    @staticmethod
    def _leer(pdf: Path, cache: Path, pagina: int) -> tuple[str, bool] | None:
        try:
            import pymupdf  # noqa: PLC0415
        except ImportError:
            return None
        try:
            with pymupdf.open(pdf) as doc:
                if not 1 <= pagina <= len(doc):
                    return None
                texto = doc[pagina - 1].get_text()
                if texto.strip():
                    return texto, False
                import sys  # noqa: PLC0415

                raiz = str(Path(__file__).resolve().parents[2])
                if raiz not in sys.path:
                    sys.path.insert(0, raiz)
                from scripts.ocr_laminas import ocr_pagina  # noqa: PLC0415

                return "\n".join(ln["t"] for ln in ocr_pagina(doc, pagina, cache)), True
        except Exception:  # noqa: BLE001 — sin texto no se puede comprobar; se avisa
            return None


def aparece(cita: str, texto: str, ocr: bool = False) -> bool:
    """La cita está en el texto, sin contar mayúsculas, tildes, espacios ni signos. En una página leída con OCR basta un
    parecido de 85 % con algún tramo del texto (el OCR confunde letras)."""
    c, t = _comparable(cita), _comparable(texto)
    if len(c) < _MIN_CITA:
        return False
    if c in t:
        return True
    if not ocr or len(t) < len(c):
        return False
    paso = max(1, len(c) // 6)
    return any(difflib.SequenceMatcher(None, c, t[i:i + len(c)]).ratio() >= 0.85 for i in range(0, len(t) - len(c) + 1, paso))


def comprobar_fuente(fuente, textos: _Textos, campo: str, cita_obligatoria: bool = False) -> tuple[dict | None, str | None]:
    """(fuente normalizada, None) si la fuente se puede seguir; (None, error) si no. Una lectura de texto lleva la cita
    literal y se comprueba; una lectura visual (recorte, dibujo, medición) lleva documento y página y queda marcada como
    «no verificada por texto» para que el revisor la mire."""
    if not isinstance(fuente, dict):
        return None, f"{campo}: falta la fuente (documento, página, cita y método)."
    pagina = fuente.get("pagina")
    if not isinstance(pagina, int) or pagina < 1:
        return None, f"{campo}: la fuente necesita la página (número desde 1)."
    metodo = str(fuente.get("metodo") or "lectura").lower()
    cita = str(fuente.get("cita") or fuente.get("cita_textual") or "").strip()
    salida = {**fuente, "pagina": pagina, "metodo": metodo}
    if metodo in METODOS_DE_TEXTO or cita_obligatoria:
        if not cita:
            return None, f"{campo}: una lectura de texto lleva la cita literal (copiada del texto de la página)."
        leido = textos.de(fuente.get("documento"), pagina)
        if leido is None:
            return None, (f"{campo}: no se pudo leer el texto de {fuente.get('documento') or 'el plano'}, página {pagina} "
                          "(¿el documento existe y tiene esa página?). Si lo leíste en la imagen, pon metodo «vision».")
        texto, ocr = leido
        if not aparece(cita, texto, ocr):
            if cita_obligatoria and metodo not in METODOS_DE_TEXTO:
                salida["cita_verificada"] = False
                return salida, None
            return None, (f"{campo}: la cita «{cita[:120]}» no está en el texto de la página {pagina}"
                          f"{' (OCR)' if ocr else ''}. Cópiala literal; si solo se ve en la imagen, pon metodo «vision».")
        salida["cita_verificada"] = True
        return salida, None
    salida["cita_verificada"] = False   # lectura visual: el revisor la comprueba en la página indicada
    return salida, None


def _poner(arbol: dict, ruta: str, valor) -> None:
    *padres, hoja = ruta.split(".")
    for p in padres:
        arbol = arbol.setdefault(p, {})
    arbol[hoja] = valor


def _quitar(arbol: dict, ruta: str) -> None:
    *padres, hoja = ruta.split(".")
    for p in padres:
        if not isinstance(arbol, dict) or p not in arbol:
            return
        arbol = arbol[p]
    if isinstance(arbol, dict):
        arbol.pop(hoja, None)


def _hecho(entrada: dict, fuente: dict) -> dict:
    conf = entrada.get("confianza", CONFIANZA_POR_DEFECTO)
    conf = conf if isinstance(conf, (int, float)) and 0 <= conf <= 1 else CONFIANZA_POR_DEFECTO
    detalle = str(entrada.get("detalle") or fuente.get("detalle") or "fijado en el paso 1 (reglas vigentes)")
    return {"valor": entrada.get("valor"), "confianza": conf, "fuente": {**fuente, "detalle": detalle, "origen": "alcance_ia"}}


def cargar_ia(carpeta: Path) -> dict | None:
    try:
        datos = json.loads((carpeta / ARCHIVO_IA).read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    except (OSError, ValueError) as e:
        return {"_error": f"alcance_ia.json no es un JSON válido: {e}"}
    return datos if isinstance(datos, dict) else {"_error": "alcance_ia.json debe ser un objeto JSON."}


def aplicar(hechos: dict, carpeta: Path, reglas: list[dict], base: dict | None, normas_conocidas) -> tuple[dict, dict]:
    """Paso 1: aplica `alcance_ia.json` sobre los hechos. Devuelve (hechos, estado) con estado = {presente, aplicado,
    permisos, errores, propuestas}. Lo que no tiene fuente comprobable no entra y queda en `errores` para la IA."""
    ia = cargar_ia(carpeta)
    estado = {"presente": ia is not None, "aplicado": [], "permisos": [], "errores": [], "propuestas": [], "no_fijados": []}
    if ia is None:
        return hechos, estado
    if "_error" in ia:
        estado["errores"].append(ia["_error"])
        return hechos, estado
    res = copy.deepcopy(hechos)
    textos = _Textos(carpeta)
    errores = estado["errores"]
    ids = {r.get("id") for r in reglas}

    for campo, ruta in UBICACION.items():
        entrada = ia.get(campo)
        if not isinstance(entrada, dict) or entrada.get("valor") in (None, ""):
            continue
        if campo == "norma" and entrada["valor"] not in normas_conocidas:
            errores.append(f"norma: {entrada['valor']!r} no es una norma registrada ({', '.join(sorted(normas_conocidas))}).")
            continue
        conf = entrada.get("confianza")
        if campo in SUBDIVISIONES and isinstance(conf, (int, float)) and conf <= CONFIANZA_MAXIMA_DUDOSA:
            # No es un error que haya que corregir: la evidencia no distingue, y lo honesto es no fijarlo.
            estado["no_fijados"].append(f"{campo}: {entrada['valor']!r} con confianza {conf} no se fija (hace falta evidencia que lo distinga, p. ej. la CEUS).")
            continue
        fuente, error = comprobar_fuente(entrada.get("fuente"), textos, campo)
        if error:
            errores.append(error)
            continue
        _poner(res, ruta, _hecho(entrada, fuente))
        estado["aplicado"].append(ruta)

    alcance = (base or {}).get("datos_de_alcance") or {}
    solo_si_existe = set((base or {}).get("solo_si_existe") or ())
    for ruta, entrada in (ia.get("datos_de_alcance") or {}).items():
        if NO_SON_ALCANCE.match(ruta) or not _CLAVE.fullmatch(ruta):
            errores.append(f"{ruta}: no es un dato de alcance (la norma y la zona van en sus campos; el trámite y la fecha los da el usuario).")
            continue
        if alcance and ruta not in alcance:
            errores.append(f"{ruta}: ninguna regla de las normas candidatas lo usa para decidir si aplica; si es un dato de la regla, escríbelo en el paso 2.")
            continue
        if not isinstance(entrada, dict):
            errores.append(f"{ruta}: cada dato va como {{valor, confianza, fuente}}.")
            continue
        if entrada.get("valor") is None or entrada.get("valor") is False and ruta in solo_si_existe:
            # «No tiene» en un dato que solo cuenta si existe: se quita, para que las reglas que lo excluyen apliquen.
            _quitar(res, ruta)
            estado["aplicado"].append(f"{ruta} (no existe)")
            continue
        fuente, error = comprobar_fuente(entrada.get("fuente"), textos, ruta)
        if error:
            errores.append(error)
            continue
        _poner(res, ruta, _hecho(entrada, fuente))
        estado["aplicado"].append(ruta)

    vistos: set[str] = set()
    for i, p in enumerate(ia.get("permisos") or [], 1):
        if not isinstance(p, dict):
            errores.append(f"permiso {i}: debe ser un objeto.")
            continue
        pid = str(p.get("id") or f"PERM-{i}")
        if pid in vistos:
            errores.append(f"{pid}: id repetido.")
            continue
        vistos.add(pid)
        tipo = p.get("tipo") if p.get("tipo") in TIPOS_PERMISO else "otro"
        fuente = {"documento": p.get("documento"), "pagina": p.get("pagina"), "cita": p.get("cita_textual"),
                  "metodo": p.get("metodo") or "documento"}
        fuente, error = comprobar_fuente(fuente, textos, pid, cita_obligatoria=True)
        if error:
            errores.append(error)
            continue
        efectos, malos = [], []
        for e in p.get("efecto") or []:
            if not isinstance(e, dict) or e.get("accion") not in ACCIONES or e.get("regla_id") not in ids:
                malos.append(str(e.get("regla_id") if isinstance(e, dict) else e))
                continue
            efectos.append({"regla_id": e["regla_id"], "accion": e["accion"], "motivo": str(e.get("motivo") or "")})
        if malos:
            errores.append(f"{pid}: efectos sin regla del catálogo o sin acción exceptua/condiciona: {', '.join(malos)}.")
        if tipo == "norma_especial":
            norma = p.get("norma")
            if norma in normas_conocidas:
                _poner(res, "lote.norma_aplicable", {"valor": norma, "confianza": 1.0, "fuente": {**fuente, "origen": "permiso", "permiso": pid}})
                estado["aplicado"].append(f"lote.norma_aplicable ({pid})")
            else:
                errores.append(f"{pid}: norma_especial necesita «norma» con una norma registrada.")
        if tipo == "resolucion_edificabilidad":
            if p.get("valor") in (None, ""):
                errores.append(f"{pid}: resolucion_edificabilidad necesita «valor» (número de la resolución).")
            else:
                _poner(res, "proyecto.resolucion_edificabilidad", {"valor": p["valor"], "confianza": 1.0, "fuente": {**fuente, "origen": "permiso", "permiso": pid}})
                estado["aplicado"].append(f"proyecto.resolucion_edificabilidad ({pid})")
        permiso = {"id": pid, "tipo": tipo, "titulo": str(p.get("titulo") or ""), "fuente": fuente, "efecto": efectos}
        estado["permisos"].append(permiso)
        if isinstance(p.get("propuesta_regla"), dict):
            estado["propuestas"].append({"permiso": pid, "fuente": fuente, **p["propuesta_regla"]})
    return res, estado


def efectos_por_regla(permisos: list[dict]) -> dict[str, dict]:
    """regla_id → {accion, permiso, motivo, cita} (la primera acción gana; exceptuar gana a condicionar)."""
    salida: dict[str, dict] = {}
    for p in permisos:
        for e in p.get("efecto") or []:
            previo = salida.get(e["regla_id"])
            if previo and previo["accion"] == "exceptua":
                continue
            salida[e["regla_id"]] = {"accion": e["accion"], "permiso": p["id"], "motivo": e.get("motivo") or "",
                                     "cita": (p.get("fuente") or {}).get("cita") or "",
                                     "documento": (p.get("fuente") or {}).get("documento"), "pagina": (p.get("fuente") or {}).get("pagina")}
    return salida


# ---------------------------------------------------------------- lista cerrada

SIN_DETERMINAR = "no se puede determinar si aplica"


def lista_cerrada(res: dict, estado: dict) -> dict:
    """`reglas_a_evaluar.json`: las reglas de esta corrida. Las de otras zonas agrupadas (ADR-0012) no entran: dependen de
    confirmar la zona, que es tarea del paso 1."""
    from precheck.motor.zona import GRUPO_ZONA  # noqa: PLC0415

    propias = [r for r in res["resultados"] if r.get("grupo") != GRUPO_ZONA]
    return {
        "norma_aplicable": res.get("norma_aplicable"), "codigo_zona": res.get("codigo_zona"),
        # La zona de trabajo del motor (ADR-0016): si es un supuesto, la IA la confirma o la corrige en el paso 1.
        "zona_trabajo": {k: v for k, v in (res.get("zona_trabajo") or {}).items() if k in ("codigo", "norma", "procedencia", "modo", "firme", "explicacion", "supuesto")},
        "alcance_ia": {"presente": estado.get("presente", False), "aplicado": estado.get("aplicado", []),
                       "errores": estado.get("errores", []), "no_fijados": estado.get("no_fijados", [])},
        "permisos": estado.get("permisos", []),
        "total": len(propias),
        "reglas": [{"regla_id": r["regla_id"], "titulo": r.get("titulo"), "norma": r.get("norma"), "resultado": r["resultado"],
                    "motivo": r.get("motivo"), "severidad": r.get("severidad"), **({"permiso": r["permiso"]} if r.get("permiso") else {}),
                    **({"decision_motor": r["decision_motor"]} if r.get("decision_motor") else {})}
                   for r in propias],
        "sin_determinar": [r["regla_id"] for r in propias if str(r.get("motivo", "")).startswith(SIN_DETERMINAR)],
        "exceptuadas": res.get("exceptuadas", []),
        "otras_zonas": len(res["resultados"]) - len(propias),
    }


def escribir(carpeta: Path, nombre: str, datos) -> None:
    (carpeta / nombre).write_text(json.dumps(datos, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
