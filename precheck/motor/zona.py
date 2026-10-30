"""Zona del lote en `aplica_si`: qué códigos reconoce cada regla, qué zona se usa para evaluar y qué pasa si se
confirma lo declarado.

Dominio puro, sin E/S (ADR-0012 y ADR-0016 de motor-reglas-auditable):

- `zona_de_trabajo` elige UNA zona cuando no está clara (documento oficial, arquitecto, Documento Gráfico, plano,
  usuario; si el código no existe, la grafía de la norma o la familia que encaja con el lote) y dice si es firme o
  un supuesto.
- `clasificar` agrupa los REQUIERE_REVISION que dependen de confirmar el código de zona (o el sector y la unidad
  territorial de San Francisco) cuando no hay zona de trabajo, y `aviso_codigo_inexistente` avisa cuando el código
  no lo reconoce ninguna regla de la norma.
"""
from __future__ import annotations

import ast
import copy
import re
import unicodedata

from precheck.motor.evaluador import NO_APLICA, REVISION, _normalizar, evaluar_regla, umbral_efectivo

CAMPO_CODIGO = "lote.codigo_zona"
CAMPO_NORMA = "lote.norma_aplicable"
# Campos que ubican el lote en la norma. Con confianza baja, cada regla de otra zona sale «no se puede
# determinar si aplica»; se agrupan para que no tapen las de la zona declarada (ADR-0012).
CAMPOS_ZONA = (CAMPO_CODIGO, "lote.sf_sector", "lote.sf_unidad_territorial")
GRUPO_ZONA = "zona_por_confirmar"
_NOMBRES = {CAMPO_CODIGO: "el código de zona", "lote.sf_sector": "el sector",
            "lote.sf_unidad_territorial": "la unidad territorial"}


def motivo_grupo(campos) -> str:
    """«depende de confirmar el código de zona: …» con los campos que separan a la regla de lo declarado."""
    nombres = [_NOMBRES.get(c, c) for c in CAMPOS_ZONA if c in set(campos)] or [_NOMBRES[CAMPO_CODIGO]]
    lista = nombres[0] if len(nombres) == 1 else ", ".join(nombres[:-1]) + " y " + nombres[-1]
    return (f"depende de confirmar {lista}: la regla es de otra zona de la misma norma y solo aplicaría si lo "
            "declarado no es correcto")


def _ruta(n: ast.AST) -> str | None:
    if isinstance(n, ast.Name):
        return n.id
    if isinstance(n, ast.Attribute):
        base = _ruta(n.value)
        return f"{base}.{n.attr}" if base else None
    return None


def _constantes(expr: str | None, campo: str) -> set | None:
    """Valores literales con que `aplica_si` compara `campo` (`campo == 'X'` o `campo in ['X', 'Y']`).
    None si la expresión no lo compara o no se puede leer."""
    if not expr:
        return None
    try:
        arbol = ast.parse(_normalizar(expr), mode="eval")
    except SyntaxError:
        return None
    valores: set | None = None
    for n in ast.walk(arbol):
        if not (isinstance(n, ast.Compare) and len(n.ops) == 1 and _ruta(n.left) == campo):
            continue
        op, der = n.ops[0], n.comparators[0]
        if isinstance(op, ast.Eq) and isinstance(der, ast.Constant) and der.value is not None:
            valores = (valores or set()) | {der.value}
        elif isinstance(op, ast.In) and isinstance(der, ast.List):
            valores = (valores or set()) | {e.value for e in der.elts
                                            if isinstance(e, ast.Constant) and e.value is not None}
    return valores


def _conjuntos(n: ast.AST) -> list[ast.AST]:
    """Condiciones unidas por `and` en la raíz de la expresión (o la expresión entera si no es un `and`)."""
    if isinstance(n, ast.BoolOp) and isinstance(n.op, ast.And):
        return [c for v in n.values for c in _conjuntos(v)]
    return [n]


def codigo_excluido(regla: dict, declarado) -> list | None:
    """Códigos que pide `aplica_si` cuando lo excluye por sí solo el código `declarado`: una condición de la raíz
    (unida con `and`) compara `lote.codigo_zona` con literales y ninguno coincide con lo declarado, ni en grafía
    comparable. Si se confirma lo declarado, la regla no aplica, falte el dato que falte (en San Francisco, la
    unidad territorial). None si no lo excluye o no se puede leer: lo conservador es no agrupar."""
    if declarado is None or not regla.get("aplica_si"):
        return None
    try:
        arbol = ast.parse(_normalizar(regla["aplica_si"]), mode="eval")
    except SyntaxError:
        return None
    for n in _conjuntos(arbol.body):
        if not (isinstance(n, ast.Compare) and len(n.ops) == 1 and _ruta(n.left) == CAMPO_CODIGO):
            continue
        op, der = n.ops[0], n.comparators[0]
        if isinstance(op, ast.Eq):
            elementos = [der]
        elif isinstance(op, ast.In) and isinstance(der, ast.List):
            elementos = list(der.elts)
        else:
            continue
        if not elementos or not all(isinstance(e, ast.Constant) and e.value is not None for e in elementos):
            continue
        pide = {e.value for e in elementos if isinstance(e, ast.Constant)}
        if clave(declarado) not in {clave(v) for v in pide}:
            return sorted(pide, key=str)
    return None


def codigos_de_regla(regla: dict) -> set[str] | None:
    """Códigos de zona que reconoce la regla, tal como están escritos en su `aplica_si`."""
    v = _constantes(regla.get("aplica_si"), CAMPO_CODIGO)
    return {str(c) for c in v} if v is not None else None


def normas_de_regla(regla: dict) -> set[str] | None:
    v = _constantes(regla.get("aplica_si"), CAMPO_NORMA)
    return {str(c) for c in v} if v is not None else None


def clave(codigo) -> str:
    """Grafía comparable: sin mayúsculas, guiones, espacios ni el prefijo de clase de suelo («1ZM6» → «ZM6»).
    Solo sirve para sugerir o para no esconder una regla; el evaluador compara el texto exacto."""
    c = re.sub(r"[^A-Z0-9]", "", str(codigo).upper())
    return re.sub(r"^\d(?=[A-Z])", "", c)


def codigos_de_norma(reglas: list[dict], norma: str) -> set[str]:
    """Todos los códigos de zona que reconocen los `aplica_si` de las reglas de `norma`."""
    codigos: set[str] = set()
    for r in reglas:
        if norma in (normas_de_regla(r) or ()):
            codigos |= codigos_de_regla(r) or set()
    return codigos


def aviso_codigo_inexistente(reglas: list[dict], norma: str | None, codigo) -> str | None:
    """Aviso si `codigo` no está en ningún `aplica_si` de `norma` (independiente de su confianza).
    Sin norma, sin código o sin reglas con código para esa norma no hay nada que comparar: None."""
    if not norma or codigo is None or str(codigo).strip() == "":
        return None
    conocidos = codigos_de_norma(reglas, norma)
    if not conocidos or codigo in conocidos:
        return None
    parecidos = sorted(c for c in conocidos if clave(c) == clave(codigo))
    if parecidos:
        return (f"El código de zona {codigo!r} no lo reconoce, tal como está escrito, ninguna regla de {norma}; "
                f"grafías que sí reconocen: {', '.join(parecidos)}. Confirme el código con la CEUS y escríbalo "
                "como lo usa la norma.")
    return (f"El código de zona {codigo!r} no existe en la norma {norma} (no aparece en ningún aplica_si de sus "
            "reglas): se necesita la CEUS.")


def _hecho(hechos: dict, ruta: str) -> dict | None:
    nodo = hechos
    for p in ruta.split("."):
        if not isinstance(nodo, dict) or p not in nodo:
            return None
        nodo = nodo[p]
    if isinstance(nodo, dict) and "valor" in nodo:
        return nodo if nodo["valor"] is not None else None
    return {"valor": nodo, "confianza": 1.0}


def con_campos_confirmados(hechos: dict, campos=CAMPOS_ZONA) -> dict:
    """Copia de los hechos con los `campos` de zonificación que existan a confianza 1.0: «si se confirma lo
    declarado». Un campo que falta sigue faltando (no se rellena)."""
    h = copy.deepcopy(hechos)
    for ruta in campos:
        hecho = _hecho(h, ruta)
        if hecho is None:
            continue
        *padres, hoja = ruta.split(".")
        nodo = h
        for p in padres:
            nodo = nodo[p]
        nodo[hoja] = {**hecho, "confianza": 1.0}
    return h


def clasificar(regla: dict, res: dict, hechos: dict, umbral: float, confirmados: dict | None = None) -> dict:
    """Marca un REQUIERE_REVISION que depende de la confianza baja de un campo de zonificación (`CAMPOS_ZONA`).
    No cambia `resultado` ni `motivo`; solo agrega campos.

    - Regla de otra zona: con lo declarado confirmado sería NO_APLICA y su `aplica_si` pide, para algún campo
      dudoso, valores distintos del declarado (ni en grafía comparable). Lleva `grupo` = `motivo_tipo` =
      GRUPO_ZONA y `zona_regla` ({campo: valores que pide}). También lo es la que excluye por sí solo el código
      dudoso (`codigo_excluido`), aunque el evaluador se haya detenido antes por otro dato que falta.
    - Cualquier otra que use un campo dudoso (las de la zona declarada): `si_se_confirma_zona` con el resultado
      provisional. Es indicativo; el resultado sigue siendo REQUIERE_REVISION.

    `confirmados` permite reutilizar `con_campos_confirmados(hechos)` entre reglas."""
    usados = res.get("valores_usados") or {}
    if res.get("resultado") != REVISION:
        return res
    minimo = umbral_efectivo(regla, umbral)
    dudosos = {c: usados[c].get("valor") for c in CAMPOS_ZONA
               if c in usados and (h := _hecho(hechos, c)) is not None and float(h.get("confianza", 1.0)) < minimo}
    # El código dudoso puede excluir la regla aunque el evaluador no haya llegado a leerlo (en San Francisco se
    # detiene antes, en la unidad territorial que falta): mismo sector, otro código.
    codigo = _hecho(hechos, CAMPO_CODIGO)
    excluido = (codigo_excluido(regla, codigo["valor"])
                if codigo is not None and float(codigo.get("confianza", 1.0)) < minimo else None)
    if excluido is not None:
        distintos = {c: sorted(pide, key=str) for c, declarado in dudosos.items()
                     if (pide := _constantes(regla.get("aplica_si"), c)) and
                     clave(declarado) not in {clave(v) for v in pide}}
        return {**res, "grupo": GRUPO_ZONA, "motivo_tipo": GRUPO_ZONA,
                "zona_regla": {**distintos, CAMPO_CODIGO: excluido}}
    if not dudosos:
        return res
    provisional = evaluar_regla(regla, confirmados if confirmados is not None else con_campos_confirmados(hechos),
                                umbral)
    distintos = {}
    for campo, declarado in dudosos.items():
        pide = _constantes(regla.get("aplica_si"), campo)
        if pide and clave(declarado) not in {clave(v) for v in pide}:
            distintos[campo] = sorted(pide, key=str)
    salida = dict(res)
    if distintos and provisional["resultado"] == NO_APLICA:
        salida.update(grupo=GRUPO_ZONA, motivo_tipo=GRUPO_ZONA, zona_regla=distintos)
    else:
        salida["si_se_confirma_zona"] = {"declarado": dudosos, "resultado": provisional["resultado"],
                                         "motivo": provisional.get("motivo")}
    return salida


# ---------------------------------------------------------------- zona de trabajo (ADR-0016)
#
# Cuando la zona no está clara, el motor elige UNA zona de trabajo, la escribe en resultado.json con su procedencia y
# evalúa con ella. Las reglas de las otras zonas son NO_APLICA con el supuesto anotado, y cada candidata descartada se
# evalúa también para decir qué habría cambiado. Puro: las fuentes (documento oficial, arquitecto, Documento Gráfico,
# plano, usuario) las reúne precheck/planos/revisar.py.

#: Orden de prelación de las fuentes de la zona (principio 5 de CLAUDE.md).
PROCEDENCIAS = ("oficial", "arquitecto", "documento_grafico", "plano", "usuario", "ia")
NOMBRE_PROCEDENCIA = {"oficial": "un documento oficial", "arquitecto": "la zona que definió el arquitecto",
                      "documento_grafico": "el Documento Gráfico en las coordenadas del lote", "plano": "el plano",
                      "usuario": "la zona que indicó el usuario", "ia": "la revisión con IA"}
#: Datos del lote y del proyecto que dicen si una candidata encaja (nunca retiros, altura ni ocupación: esos se juzgan).
CAMPOS_ENCAJE = frozenset({"lote.area_m2", "lote.frente_m", "lote.es_extremo", "proyecto.tipologia_vivienda"})
_CAMPO = re.compile(r"\b([a-z_]+\.[a-z_][a-z0-9_.]*)")
_DENSIDAD = re.compile(r"\b(baja|mediana|media|alta)\s+(?:densidad|intensidad)")
_USOS = (("residencial", re.compile(r"residencial")), ("mixto", re.compile(r"\bmixt[ao]")))


def _sin_tildes(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", str(s)) if unicodedata.category(c) != "Mn")


def _quien(procedencia) -> str:
    return NOMBRE_PROCEDENCIA.get(procedencia, str(procedencia))


def resolver(codigo, conocidos: set[str]) -> tuple[str, str] | None:
    """(código como lo escriben las reglas, «exacto» o «grafia») si la norma lo reconoce; None si no existe."""
    if codigo in (None, ""):
        return None
    if codigo in conocidos:
        return str(codigo), "exacto"
    parecidos = [c for c in conocidos if clave(c) == clave(codigo)]
    if not parecidos:
        return None
    # Entre «R1D1», «R1d1» y «r1d1» se muestra la de mayúsculas y minúsculas mezcladas, que es la grafía de la norma.
    return sorted(parecidos, key=lambda c: (c.isupper() or c.islower(), c))[0], "grafia"


def descriptor(nombre) -> tuple[str | None, str | None]:
    """(uso, densidad) que dice un nombre de zona: «Residencial de baja densidad» → («residencial», «baja»)."""
    t = _sin_tildes(nombre or "").lower()
    uso = next((u for u, rx in _USOS if rx.search(t)), None)
    m = _DENSIDAD.search(t)
    densidad = {"media": "mediana"}.get(m.group(1), m.group(1)) if m else None
    return uso, densidad


def nombre_de_codigo(codigo, familias: list[dict], excepto: str | None = None) -> str | None:
    """Nombre del código en las otras normas donde existe (R3 → «Residencial de baja densidad», del PLOT), si todas
    coinciden en uso y densidad."""
    nombres = sorted({f["nombre"] for f in familias if clave(f["codigo"]) == clave(codigo) and f["norma"] != excepto})
    return nombres[0] if nombres and len({descriptor(n) for n in nombres}) == 1 else None


def candidatas_por_familia(nombre, norma: str, familias: list[dict], conocidos: set[str]) -> list[dict]:
    """Códigos de `norma` de la misma familia que el nombre: mismo uso y, si el nombre la dice, misma densidad."""
    uso, densidad = descriptor(nombre)
    if not uso:
        return []
    return [f for f in familias if f["norma"] == norma and f.get("uso") == uso
            and (densidad is None or f.get("densidad") == densidad) and resolver(f["codigo"], conocidos)]


def con_zona(hechos: dict, codigo: str, norma: str | None = None, fuente: dict | None = None) -> dict:
    """Copia de los hechos con la zona (y la norma, si se da) a confianza 1.0: «si la zona fuera esta»."""
    h = copy.deepcopy(hechos)
    lote = h.setdefault("lote", {})
    previo = lote.get("codigo_zona") if isinstance(lote.get("codigo_zona"), dict) else {}
    lote["codigo_zona"] = {**previo, "valor": codigo, "confianza": 1.0, "fuente": fuente or previo.get("fuente")}
    if norma is not None:
        previa = lote.get("norma_aplicable") if isinstance(lote.get("norma_aplicable"), dict) else {}
        misma = previa.get("valor") == norma
        lote["norma_aplicable"] = {**previa, "valor": norma, "confianza": 1.0,
                                   "fuente": previa.get("fuente") if misma else fuente}
    return h


def de_la_zona(regla: dict, codigo: str) -> bool:
    """True si el `aplica_si` de la regla nombra el código (en cualquier grafía)."""
    return clave(codigo) in {clave(c) for c in codigos_de_regla(regla) or ()}


def depende_de_zona(regla: dict) -> bool:
    """La regla mira la norma, el código de zona o la ubicación en San Francisco para decidir si aplica."""
    expr = regla.get("aplica_si") or ""
    return any(c in expr for c in (CAMPO_NORMA, *CAMPOS_ZONA))


def _encaje(codigo: str, norma: str, reglas: list[dict], hechos: dict, umbral: float) -> dict:
    """Cómo encaja una candidata con el lote: las reglas de la candidata cuya condición solo lee CAMPOS_ENCAJE. Cuenta
    también sus NO_CUMPLE bloqueantes con los datos del plano (desempate por la más restrictiva)."""
    h = con_zona(hechos, codigo, norma)
    no_encaja, sin_dato, bloqueantes = [], [], 0
    for r in reglas:
        if norma not in (normas_de_regla(r) or ()) or not de_la_zona(r, codigo):
            continue
        res = evaluar_regla(r, h, umbral)
        if res["resultado"] == "NO_CUMPLE" and r.get("severidad") == "bloqueante":
            bloqueantes += 1
        campos = set(_CAMPO.findall(r.get("condicion") or ""))
        if campos and campos <= CAMPOS_ENCAJE:
            if res["resultado"] == "NO_CUMPLE":
                no_encaja.append(r["id"])
            elif res["resultado"] == REVISION:
                sin_dato.append(r["id"])
    return {"no_encaja": no_encaja, "sin_dato": sin_dato, "no_cumple_bloqueantes": bloqueantes}


def _llave_encaje(c: dict) -> tuple:
    return len(c["encaje"]["no_encaja"]), len(c["encaje"]["sin_dato"])


def _orden_candidatas(cands: list[dict]) -> list[dict]:
    """Primero la que encaja con el lote; entre empatadas, la más restrictiva: menor densidad máxima, después más
    NO_CUMPLE bloqueantes con los datos del plano y al final la norma y el código (ADR-0016)."""
    def k(c):
        dmax = c.get("densidad_max")
        return (*_llave_encaje(c), dmax if isinstance(dmax, (int, float)) else float("inf"),
                -c["encaje"]["no_cumple_bloqueantes"], c["norma"], clave(c["codigo"]))
    return sorted(cands, key=k)


def _motivo_encaje(c: dict) -> str:
    e = c["encaje"]
    if e["no_encaja"]:
        return f"no encaja con el lote ({', '.join(e['no_encaja'])})"
    if e["sin_dato"]:
        return f"no se pudo comprobar si encaja con el lote ({', '.join(e['sin_dato'])})"
    return "encaja con el lote"


def _elegir(cands: list[dict]) -> tuple[dict, list[dict], str]:
    """(elegida, descartadas, por qué ganó)."""
    elegida, *resto = _orden_candidatas(cands)
    empatadas = [c for c in resto if _llave_encaje(c) == _llave_encaje(elegida)]
    por_que = _motivo_encaje(elegida)
    if empatadas:
        nombres = [c["codigo"] if c["norma"] == elegida["norma"] else f"{c['codigo']} de {c['norma']}" for c in empatadas]
        por_que += f"; entre las que quedan igual ({', '.join(nombres)}) es la más restrictiva"
    return elegida, resto, por_que


def _usa_unidad_territorial(reglas: list[dict], norma: str) -> bool:
    return any(norma in (normas_de_regla(r) or ()) and "lote.sf_unidad_territorial" in (r.get("aplica_si") or "") for r in reglas)


def zona_de_trabajo(fuentes: list[dict], norma: str | None, reglas: list[dict], hechos: dict, familias: list[dict],
                    umbral: float = 0.85, norma_determinada: bool = True) -> dict:
    """La zona con la que se evalúa. `fuentes`: [{procedencia, codigo, nombre?, confianza?, fuente?}] en cualquier orden.

    Devuelve {codigo, norma, procedencia, modo, firme, explicacion, fuente, declarado, descartadas, avisos}. `codigo` es
    None si no hay una zona razonable (sin norma, o un código que no existe y nada del plano permite elegir): las reglas
    de zonificación quedan entonces como INFORMACION_REQUERIDA.

    - firme: documento oficial, o una sola zona en todas las fuentes leída con confianza suficiente (o confirmada por
      otra fuente). Una zona firme se evalúa en firme; una supuesta deja sus reglas a la IA con `con_supuesto`.
    - modo: «exacto», «grafia» (el mismo código con otra grafía), «familia» (código de otra norma: la candidata sale de
      su nombre) o «norma_del_plano» (el código existe en otra norma y la norma no la determinó la ubicación).
    """
    orden = {p: i for i, p in enumerate(PROCEDENCIAS)}
    fuentes = sorted((f for f in fuentes if f.get("codigo") not in (None, "")),
                     key=lambda f: orden.get(f.get("procedencia"), len(orden)))
    declarado = [{k: f[k] for k in ("procedencia", "codigo", "confianza") if f.get(k) is not None} for f in fuentes]
    salida = {"codigo": None, "norma": norma, "procedencia": None, "modo": None, "firme": False, "explicacion": "",
              "fuente": None, "declarado": declarado, "descartadas": [], "avisos": []}
    if not norma:
        salida["explicacion"] = "Sin norma aplicable no se puede elegir una zona."
        return salida
    if not fuentes:
        salida["explicacion"] = "Ni el plano ni el expediente declaran un código de zona."
        return salida
    conocidos = codigos_de_norma(reglas, norma)
    resueltas = [(f, r) for f in fuentes if (r := resolver(f["codigo"], conocidos))]
    inexistentes = list(dict.fromkeys(str(f["codigo"]) for f in fuentes if not resolver(f["codigo"], conocidos)))

    # 1-2. La primera fuente, en orden de prelación, cuyo código existe en la norma (tal cual o con otra grafía).
    if resueltas:
        f, (codigo, modo) = resueltas[0]
        alternativas: dict[str, dict] = {}
        for g, (c, _) in resueltas[1:]:
            if clave(c) != clave(codigo):
                alternativas.setdefault(clave(c), {"codigo": c, "norma": norma, "procedencia": g["procedencia"],
                                                   "motivo": f"la declara {_quien(g['procedencia'])}; gana {_quien(f['procedencia'])}"})
        corroborada = any(clave(c) == clave(codigo) for _, (c, _) in resueltas[1:])
        confianza = f.get("confianza")
        confiable = confianza is None or float(confianza) >= umbral or corroborada
        # Otra fuente declara un código distinto, exista o no en la norma: la zona ya no es indiscutible.
        otros = list(dict.fromkeys(str(g["codigo"]) for g in fuentes if clave(g["codigo"]) != clave(codigo)))
        firme = f["procedencia"] == "oficial" or (not otros and confiable)
        explicacion = f"Zona {codigo}, según {_quien(f['procedencia'])}"
        if modo == "grafia":
            explicacion += f" (escrita «{f['codigo']}»; se usa la grafía de la norma)"
        if otros:
            explicacion += "; otras fuentes declaran " + ", ".join(otros)
        elif not confiable:
            explicacion += f"; el código se leyó con confianza {confianza} y ninguna otra fuente lo confirma"
        salida.update(codigo=codigo, procedencia=f["procedencia"], modo=modo, firme=firme, fuente=f.get("fuente"),
                      explicacion=explicacion + ".", descartadas=list(alternativas.values()))
        if inexistentes:
            salida["avisos"].append(f"El código {', '.join(inexistentes)} no existe en la norma {norma}; se descartó.")
        return salida

    # 3. Ningún código existe en la norma: candidatas de la misma familia, por el nombre que dice el plano.
    principal = fuentes[0]
    nombre = next((f.get("nombre") for f in fuentes if f.get("nombre")), None) or nombre_de_codigo(principal["codigo"], familias, norma)
    familia = candidatas_por_familia(nombre, norma, familias, conocidos) if nombre else []
    if familia:
        cands = []
        for fam in familia:
            c = resolver(fam["codigo"], conocidos)[0]
            cands.append({"codigo": c, "norma": norma, "densidad_max": fam.get("densidad_max"), "familia": fam,
                          "encaje": _encaje(c, norma, reglas, hechos, umbral)})
        elegida, resto, por_que = _elegir(cands)
        cita = elegida["familia"]["fuente"]
        salida.update(
            codigo=elegida["codigo"], procedencia="familia", modo="familia", firme=False,
            fuente={"documento": cita.get("archivo"), "articulo": cita.get("articulo"),
                    "cita": cita.get("cita_familia") or cita.get("cita_nombre"), "metodo": "familia_de_zona"},
            explicacion=(f"El plano declara {principal['codigo']}" + (f" ({nombre})" if nombre else "") +
                         f", que no existe en {norma}. Candidatas de la misma familia: "
                         f"{', '.join(c['codigo'] for c in [elegida, *resto])}. Se evaluó con {elegida['codigo']}: {por_que}."),
            descartadas=[{"codigo": c["codigo"], "norma": norma, "procedencia": "familia", "motivo": _motivo_encaje(c),
                          "densidad_max": c.get("densidad_max")} for c in resto],
            encaje=elegida["encaje"])
        return salida

    # 3c. El código existe en otra norma y la norma no la determinó la ubicación: se evalúa con la norma del plano.
    if not norma_determinada:
        cands = []
        for n in sorted({n for r in reglas for n in (normas_de_regla(r) or ())} - {norma}):
            r = resolver(principal["codigo"], codigos_de_norma(reglas, n))
            if r:
                cands.append({"codigo": r[0], "norma": n, "densidad_max": None,
                              "encaje": _encaje(r[0], n, reglas, hechos, umbral)})
        if cands:
            elegida, resto, por_que = _elegir(cands)
            salida.update(
                codigo=elegida["codigo"], norma=elegida["norma"], procedencia=principal["procedencia"],
                modo="norma_del_plano", firme=False, fuente=principal.get("fuente"),
                explicacion=(f"{principal['codigo']} no existe en {norma}, la norma indicada, pero sí en "
                             f"{', '.join(c['norma'] for c in [elegida, *resto])}. Se evaluó con {elegida['norma']}: {por_que}. "
                             "La ubicación del lote debe confirmar la norma."),
                descartadas=[{"codigo": c["codigo"], "norma": c["norma"], "procedencia": principal["procedencia"],
                              "motivo": "el mismo código en otra norma"} for c in resto])
            salida["avisos"].append(f"La norma indicada ({norma}) no reconoce el código {principal['codigo']}; "
                                    f"se evaluó con la norma del plano ({elegida['norma']}).")
            return salida

    falta = "la CEUS o la unidad territorial" if _usa_unidad_territorial(reglas, norma) else "la CEUS"
    salida["explicacion"] = (f"El código {', '.join(inexistentes)} no existe en {norma}"
                             + (f" y «{nombre}» no corresponde a ninguna familia de esa norma" if nombre
                                else " y el plano no dice a qué familia de zona corresponde")
                             + f": no hay una zona razonable para evaluar. Se necesita {falta}.")
    salida["falta"] = falta
    return salida
