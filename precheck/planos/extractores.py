"""Reglas de extracción sobre líneas de texto de un plano (mupa-ocr-planos, «Qué extraer y cómo validarlo»).

Cada extractor devuelve el hecho con su procedencia. Nunca elige entre valores distintos ni rellena lo que falta:
lo ambiguo va a «revision» y lo ausente a «no_encontrado» (CLAUDE.md, principio 2). Los datos personales
(propietario, cédula, profesional) solo se registran como presentes o ausentes: su valor no se copia.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Iterable, Optional

from precheck.planos.lineas import Linea

# Confusiones típicas del OCR dentro de un número (O→0, l/I→1, S→5, B→8).
_OCR_DIGITOS = str.maketrans({"O": "0", "o": "0", "l": "1", "I": "1", "S": "5", "B": "8"})
# Cuánto se reduce la confianza de un número que necesitó corrección.
_PENALIZACION_NORMALIZADO = 0.15

CORREGIMIENTOS = (
    "24 de Diciembre", "Alcalde Díaz", "Ancón", "Bella Vista", "Betania", "Caimitillo", "Chilibre", "Curundú",
    "Don Bosco", "El Chorrillo", "Ernesto Córdoba Campos", "Juan Díaz", "La Exposición o Calidonia", "Las Cumbres",
    "Las Garzas", "Las Mañanitas", "Pacora", "Parque Lefevre", "Pedregal", "Pueblo Nuevo", "Río Abajo",
    "San Felipe", "San Francisco", "San Martín", "Santa Ana", "Tocumen",
)


def _sin_tildes(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn").upper()


def numero(token: str) -> tuple[Optional[float], bool]:
    """Número con formato de Panamá (coma de miles, punto decimal). Devuelve (valor, se_corrigio)."""
    t = token.strip()
    corregido = t.translate(_OCR_DIGITOS)
    fue_corregido = corregido != t
    if not re.fullmatch(r"\d{1,3}(,\d{3})+(\.\d+)?|\d+(\.\d+)?", corregido):
        return None, False
    return float(corregido.replace(",", "")), fue_corregido


def _fuente(linea: Linea) -> dict:
    return {"metodo": linea.metodo, "pagina": linea.pagina, "bbox": [round(v, 1) for v in linea.bbox]}


def _hecho(hecho: str, valor, linea: Optional[Linea], confianza: float, estado: str, **extra) -> dict:
    return {"hecho": hecho, "valor": valor, "confianza": round(confianza, 2), "estado": estado,
            "fuente": _fuente(linea) if linea else None, **extra}


def _lecturas(ln: Linea, valor, leer) -> dict:
    """Dos lectores leyeron distinto la línea (Linea.candidatos, ver lector_claude): `candidatos` con ambos valores, el
    que se usa primero, para que la persona elija. `leer` saca el valor de un texto (None si no lo trae)."""
    valores = [valor]
    for texto in ln.candidatos:
        v = leer(texto)
        if v is not None and v not in valores:
            valores.append(v)
    if len(valores) < 2:
        return {}
    return {"candidatos": valores, "nota": "Dos lectores del OCR leyeron distinto este dato: se usa la primera lectura; "
                                           "confírmalo en el plano."}


# Identificador del lote del proyecto entre el rótulo y el número: «LOTE #73», «LOTE MODELO B», «LOTE TIPO A»,
# «LOTE N° 12», «LOTE 73». Con identificador, los dos puntos (o «=») son obligatorios: así «AREA DE LOTE 160 M2»
# no se lee como lote n.º 160. Solo se aceptan estas formas: «AREA DEL LOTE MINIMA: …» (norma) u otros adjetivos
# no pasan. «ÁREA DE LOTES», «ÁREA TOTAL DEL DESARROLLO» o «ÁREA 28,043.08 m²» (la finca madre) tampoco.
_ID_LOTE = r"(?:\s*#\s*[A-Z0-9-]{1,5}|\s+(?:(?:MODELO|TIPO|N\s*[°º.]|NO\.)\s*[A-Z0-9-]{1,5}|\d{1,4}[A-Z]?))"
_M2 = r"(?:M2|M²|MTS2|MTS²|MT2)"
# Rótulo del área del lote (nivel 1, explícito): «AREA DEL LOTE TOTAL: 2980m²», «AREA DE TERRENO 727.54 M2»,
# «Superficie del lote: 450 mts2», «AREA DEL LOTE MODELO B: 177.75 m2», «ÁREA DEL LOTE #73 = 177.75 m2»,
# «AREA DE LA PARCELA: 733.14 M2» (cuadro «RESUMEN DE ÁREAS»), «ÁREA DEL POLÍGONO: 500.00 m2» (levantamiento).
_ROTULO_AREA_LOTE = r"(?:AREA|SUPERFICIE)\s+(?:DE(?:L|\s+LA)?\s+)?(?:LOTE|TERRENO|PARCELA|POLIGONO)(?:\s+TOTAL)?"
_AREA_LOTE = re.compile(
    _ROTULO_AREA_LOTE + rf"(?:{_ID_LOTE}{{1,3}}\s*[:=]|\s*[:=]?)"
    r"\s*([0-9OoIlSB][0-9OoIlSB.,]*)\s*" + _M2,
)
# Área de la finca (nivel 2, solo dentro de un bloque de datos del proyecto o de la finca): «AREA: 733.14M2» bajo
# «DATOS DE LA FINCA», «SUPERFICIE 087193.00 M2» bajo «DATOS DE PROYECTO», «ÁREA INSCRITA= 800.00 m2». Sin calificativo
# entre el rótulo y el número: «ÁREA CERRADA: …», «ÁREA VERDE …» o «ÁREA DE CONSTRUCCIÓN …» no entran. «ÁREA» exige
# «:» o «=» («ÁREA 28,043.08 m²» suelto es el rótulo de una finca madre en el dibujo); «SUPERFICIE» no.
_AREA_FINCA = re.compile(
    r"(?<![A-Z])(?:AREA(?:\s+(?:DE\s+LA\s+FINCA|INSCRITA|REGISTRAL|SEGUN\s+REGISTRO))?\s*[:=]"
    r"|SUPERFICIE(?:\s+(?:DE\s+LA\s+FINCA|INSCRITA|REGISTRAL|SEGUN\s+REGISTRO))?\s*[:=]?)"
    r"\s*([0-9OoIlSB][0-9OoIlSB.,]*)\s*" + _M2,
)
# Rótulo sin valor cuyo número está en la celda de la derecha («ÁREA DE LA PARCELA:» | «733.14 M2»).
_ROTULO_SOLO = re.compile(rf"^\s*(?:{_ROTULO_AREA_LOTE}|AREA|SUPERFICIE)(?:\s+(?:DE\s+LA\s+FINCA|INSCRITA))?\s*[:=]?\s*$")
_VALOR_SOLO = re.compile(r"^\s*[0-9OoIlSB][0-9OoIlSB.,]*\s*" + _M2 + r"\.?\s*$")
#: Distancia máxima (en alturas de línea) entre un rótulo y su valor en la misma fila.
_CELDA_MAX = 40.0


# «AREA = 0 HAS + 0,500.00 m2» (cuadro de datos del levantamiento: hectáreas + metros cuadrados).
_AREA_HAS = re.compile(r"AREA\s*[:=]\s*(\d+)\s*HAS?\s*\+\s*([0-9OoIlSB][0-9OoIlSB.,]*)\s*(?:M2|M²|MTS2)")


# ---------------------------------------------------------------------------------------------------------------
# Norma transcrita. Muchos planos copian el cuadro normativo de la zona («DENSIDAD MÁXIMA: 500 personas/hectáreas»,
# «OCUPACIÓN MÁXIMA: 60%»). Esos números son límites de la norma, no datos del proyecto: tomarlos como hechos del
# proyecto daría un CUMPLE falso. Se reconocen por el calificativo junto al dato o por estar en un bloque normativo.

#: Calificativo de límite antes del número: «MÁXIMA», «MÍNIMO», «PERMITIDA», «NORMA», «según norma», «requerido».
_LIMITE = re.compile(r"MAXIM[AO]S?|MINIM[AO]S?|PERMITID[AO]S?|\bNORMA\b|\bNORMATIV[AO]|REQUERID[AO]S?|EXIGID[AO]S?|\bMAX\b\.?|\bMIN\b\.?")
#: Rótulo que abre un cuadro normativo transcrito (la ficha de la zona).
_ROTULO_NORMATIVO = re.compile(
    r"^\s*(?:CODIGO\s+DE\s+ZONIFICACION|NORMAS?\s+(?:DE\s+(?:DESARROLLO|ZONIFICACION)|APLICABLES?|URBANISTICAS?)"
    r"|CUADRO\s+NORMATIVO|NORMATIVA(?:\s+APLICABLE)?|REGLAMENTACION|DATOS\s+NORMATIVOS)\b"
)
#: Separación vertical (en alturas de línea) que corta un bloque.
_SALTO_BLOQUE = 2.5
#: Líneas con calificativo de límite que hacen falta para tratar un bloque como cuadro normativo.
_MIN_LIMITES_BLOQUE = 2


def bloque_normativo(lineas: Iterable[Linea]) -> set[Linea]:
    """Líneas que pertenecen a un cuadro normativo transcrito: las que siguen al rótulo en la misma columna, sin un
    salto vertical grande."""
    por_pagina: dict[int, list[Linea]] = {}
    for ln in lineas:
        por_pagina.setdefault(ln.pagina, []).append(ln)
    salida: set[Linea] = set()
    for pag in por_pagina.values():
        pag.sort(key=lambda ln: (ln.bbox[1], ln.bbox[0]))
        for i, rot in enumerate(pag):
            if not _ROTULO_NORMATIVO.search(_sin_tildes(rot.texto)):
                continue
            alto = max(rot.bbox[3] - rot.bbox[1], 1.0)
            x0, x1 = rot.bbox[0] - 3 * alto, rot.bbox[2] + 3 * alto
            bloque, ultimo = [rot], rot
            for sig in pag[i + 1:]:
                if sig.bbox[1] - ultimo.bbox[3] > _SALTO_BLOQUE * alto:
                    break
                if x0 <= sig.bbox[0] <= x1:
                    bloque.append(sig)
                    ultimo = sig
            # «CÓDIGO DE ZONIFICACIÓN: R3» también encabeza los datos del proyecto: el bloque solo es normativo si
            # varias de sus líneas son límites («MÁXIMA», «MÍNIMO»…).
            if sum(1 for ln in bloque if es_limite(_sin_tildes(ln.texto))) >= _MIN_LIMITES_BLOQUE:
                salida.update(bloque)
    return salida


def es_limite(prefijo: str) -> bool:
    """¿El texto que precede al número (ya sin tildes) lo califica como límite de la norma?"""
    return bool(_LIMITE.search(prefijo))


# Límites que se reconocen (clave del hecho informativo, patrón con el número en el grupo 1).
_NUM = r"([0-9OoIlSB][0-9OoIlSB.,]*)"
_LIMITES_NORMA = {
    "densidad_pers_ha": re.compile(r"DENSIDAD[^0-9]{0,40}?" + _NUM + r"\s*(?:PERS|HAB|P/HA)"),
    "ocupacion_pct": re.compile(r"OCUPACION[^0-9%]{0,40}?" + _NUM + r"\s*%"),
    "area_libre_pct": re.compile(r"AREA\s+LIBRE[^0-9%]{0,40}?" + _NUM + r"\s*%"),
    "altura_m": re.compile(r"ALTURA[^0-9]{0,40}?" + _NUM + r"\s*(?:M\b|ML\b|MTS\b|METROS)"),
    "altura_pisos": re.compile(r"ALTURA[^0-9]{0,40}?" + _NUM + r"\s*(?:PISOS|NIVELES|ALTOS)"),
    "retiro_frontal_m": re.compile(r"(?:RETIRO\s+(?:FRONTAL|DE\s+FRENTE)|LINEA\s+DE\s+CONSTRUCCION)[^0-9]{0,40}?" + _NUM + r"\s*(?:M\b|ML\b|MTS\b|METROS)"),
    "retiro_lateral_m": re.compile(r"RETIRO\s+LATERAL[^0-9]{0,40}?" + _NUM + r"\s*(?:M\b|ML\b|MTS\b|METROS)"),
    "retiro_posterior_m": re.compile(r"RETIRO\s+POSTERIOR[^0-9]{0,40}?" + _NUM + r"\s*(?:M\b|ML\b|MTS\b|METROS)"),
    "lote_area_minima_m2": re.compile(r"AREA\s+(?:MINIMA\s+)?(?:DE(?:L)?\s+)?LOTE[^0-9]{0,40}?" + _NUM + r"\s*(?:M2|M²|MTS2)"),
    "lote_frente_minimo_m": re.compile(r"FRENTE\s+(?:MINIMO\s+)?(?:DE(?:L)?\s+)?LOTE[^0-9]{0,40}?" + _NUM + r"\s*(?:M\b|ML\b|MTS\b|METROS)"),
    "lote_fondo_minimo_m": re.compile(r"FONDO\s+(?:MINIMO\s+)?(?:DE(?:L)?\s+)?LOTE[^0-9]{0,40}?" + _NUM + r"\s*(?:M\b|ML\b|MTS\b|METROS)"),
}


def norma_transcrita(lineas: Iterable[Linea]) -> list[dict]:
    """plano.norma_transcrita.*: límites de la norma que el plano copia. Son informativos (para contrastar con las
    reglas cargadas); nunca son hechos del proyecto."""
    lineas = list(lineas)
    bloque = bloque_normativo(lineas)
    vistos: dict[str, list[tuple[float, Linea]]] = {}
    for ln in lineas:
        texto = _sin_tildes(ln.texto)
        for clave, patron in _LIMITES_NORMA.items():
            m = patron.search(texto)
            if not m or not (es_limite(texto[:m.start(1)]) or ln in bloque):
                continue
            v, _ = numero(m.group(1).rstrip(".,"))
            if v is not None:
                vistos.setdefault(clave, []).append((v, ln))
    salida = []
    for clave, halladas in vistos.items():
        valores = sorted({v for v, _ in halladas})
        extra = {"candidatos": valores} if len(valores) > 1 else {}
        salida.append(_hecho(f"plano.norma_transcrita.{clave}", halladas[0][0], halladas[0][1], 0.5, "informativo",
                             nota="Límite de la norma transcrito en el plano: no es un dato del proyecto.", **extra))
    return salida


def es_norma(ln: Linea, prefijo: str, bloque: Optional[set[Linea]] = None) -> bool:
    """El número de esta línea es un límite de la norma (por su calificativo o por estar en un cuadro normativo)."""
    return es_limite(prefijo) or (bloque is not None and ln in bloque)


def _con_celda_derecha(lineas: list[Linea]) -> list[tuple[Linea, Linea]]:
    """Rótulos de área sin valor («ÁREA DE LA PARCELA:») unidos al valor de la celda de su derecha en la misma fila
    («733.14 M2»): la línea vecina más cercana a la derecha, si es solo un número con unidad. Devuelve (línea unida,
    rótulo); la unida lleva la caja de las dos y la menor de sus confianzas."""
    salida = []
    for ln in lineas:
        if not _ROTULO_SOLO.match(_sin_tildes(ln.texto)):
            continue
        alto = max(ln.bbox[3] - ln.bbox[1], 1.0)
        fila = [o for o in lineas if o is not ln and o.pagina == ln.pagina and o.bbox[0] >= ln.bbox[2] - alto
                and min(o.bbox[3], ln.bbox[3]) - max(o.bbox[1], ln.bbox[1]) >= 0.5 * min(alto, o.bbox[3] - o.bbox[1])]
        vecina = min(fila, key=lambda o: o.bbox[0], default=None)
        if vecina is None or vecina.bbox[0] - ln.bbox[2] > _CELDA_MAX * alto or not _VALOR_SOLO.match(_sin_tildes(vecina.texto)):
            continue
        caja = (min(ln.bbox[0], vecina.bbox[0]), min(ln.bbox[1], vecina.bbox[1]),
                max(ln.bbox[2], vecina.bbox[2]), max(ln.bbox[3], vecina.bbox[3]))
        salida.append((Linea(f"{ln.texto.strip()} {vecina.texto.strip()}", ln.pagina, caja, vecina.metodo,
                             min(ln.confianza, vecina.confianza)), ln))
    return salida


# Datos registrales de la finca (el área de nivel 2 va junto a ellos, no junto a la lista de unidades del proyecto).
_REGISTRO = re.compile(r"\bFINCAS?\b|\bFOLIOS?\b|\bTOMO\b")
#: Distancia máxima (en alturas de línea) entre el área de la finca y sus datos registrales.
_CERCA_REGISTRO = 6.0


def _junto_a_registro(ln: Linea, registros: list[Linea]) -> bool:
    alto = max(ln.bbox[3] - ln.bbox[1], 1.0)
    return any(r.pagina == ln.pagina and _separacion(r, ln) <= _CERCA_REGISTRO * alto for r in registros)


def _leer_area(texto: str) -> Optional[float]:
    """El área que trae un texto con cualquiera de los rótulos (para comparar lecturas de dos lectores)."""
    t = _sin_tildes(texto)
    m = _AREA_LOTE.search(t) or _AREA_FINCA.search(t)
    return numero(m.group(1).rstrip(".,"))[0] if m else None


def area_lote(lineas: Iterable[Linea]) -> dict:
    """lote.area_m2: el área del lote del proyecto, en dos niveles de evidencia:

    1. Rótulo explícito: «ÁREA DEL LOTE», «ÁREA DEL LOTE #73», «SUPERFICIE DEL LOTE», «ÁREA DE TERRENO», «ÁREA DE LA
       PARCELA», «ÁREA DEL POLÍGONO», el cuadro del levantamiento («ÁREA = 0 HAS + 0,500.00 m2»), también con el valor
       en la celda de la derecha.
    2. Área de la finca dentro del bloque de datos del proyecto o de la finca («DATOS DE LA FINCA» / «ÁREA: 733.14M2»,
       «DATOS DE PROYECTO» / «SUPERFICIE 31450.00 M2»), lejos de un rótulo de colindante.

    Si el bloque da el área de cada una de varias fincas (lote que las reúne), son áreas parciales: no se comparan con
    el área total del lote y, sin ella, van a revisión. No la dan el área de la finca madre o del desarrollo («ÁREA
    TOTAL DEL DESARROLLO», «ÁREA 28,043.08 m²» en el dibujo), las áreas de construcción, abiertas, cerradas o verdes,
    los cuadros de lotes sin rótulo, ni el lote mínimo de la norma («ÁREA MÍNIMA DE LOTE»). Con valores distintos no
    elige: revisión con los candidatos."""
    lineas = list(lineas)
    bloque = bloque_normativo(lineas)
    datos = _bloques_de_datos(lineas)
    avisos = _avisos_colindante(lineas)
    registros = [ln for ln in datos if _REGISTRO.search(_sin_tildes(ln.texto))]
    del_lote: list[tuple[float, Linea, bool]] = []
    de_finca: list[tuple[float, Linea, bool]] = []
    for ln, rotulo in [*((ln, ln) for ln in lineas), *_con_celda_derecha(lineas)]:
        texto = _sin_tildes(ln.texto)
        for m in _AREA_LOTE.finditer(texto):
            if es_norma(ln, texto[:m.start(1)], bloque):
                continue
            v, corregido = numero(m.group(1).rstrip(".,"))
            if v is not None:
                del_lote.append((v, ln, corregido))
        for m in _AREA_HAS.finditer(texto):
            v, corregido = numero(m.group(2))
            if v is not None:
                del_lote.append((int(m.group(1)) * 10_000 + v, ln, corregido))
        if rotulo not in datos or _junto_a_colindante(rotulo, avisos) or not _junto_a_registro(rotulo, registros):
            continue
        for m in _AREA_FINCA.finditer(texto):
            previo = texto[:m.start()].rstrip()
            if (previo and previo[-1] not in ",;|-") or es_norma(ln, texto[:m.start(1)], bloque):
                continue  # «TOTAL DE ÁREA: …», «ÁREA … MÍNIMA»: otro dato
            v, corregido = numero(m.group(1).rstrip(".,"))
            if v is not None:
                de_finca.append((v, ln, corregido))
    parciales = _areas_parciales(de_finca, lineas)
    halladas = del_lote + ([] if parciales else de_finca)
    if not halladas and parciales:
        valores = sorted({v for v, _, _ in de_finca})
        return _hecho("lote.area_m2", None, de_finca[0][1], 0.4, "revision", candidatos=valores,
                      nota=f"El bloque de datos da el área de cada finca ({', '.join(parciales)}) y no el área total "
                           "del lote que las reúne: confírmala en el plano o en el Registro Público.")
    if not halladas:
        return _hecho("lote.area_m2", None, None, 0.0, "no_encontrado")
    valores = sorted({v for v, _, _ in halladas})
    if len(valores) > 1:
        # Dónde se leyó cada valor, para que la persona elija mirando el plano. Se cita desde el rótulo de área: lo que
        # va antes en la línea (un propietario, por ejemplo) no se copia.
        donde = {}
        for v, ln, _ in halladas:
            texto = _sin_tildes(ln.texto)
            rotulo = re.search(r"AREA|SUPERFICIE", texto)
            donde.setdefault(v, f"{v:g} (hoja {ln.pagina}: «{texto[rotulo.start() if rotulo else 0:][:60].strip()}»)")
        return _hecho("lote.area_m2", None, halladas[0][1], 0.5, "revision", candidatos=valores,
                      nota="El plano declara áreas del lote distintas: " + "; ".join(donde[v] for v in valores) + ".")
    v, ln, corregido = halladas[0]
    conf = ln.confianza - (_PENALIZACION_NORMALIZADO if corregido else 0) - (0.05 if ln.metodo == "ocr" else 0)
    otras = _lecturas(ln, v, _leer_area)
    return _hecho("lote.area_m2", v, ln, conf, "ok" if conf >= 0.7 and not otras else "revision", **otras)


def _areas_parciales(de_finca: list[tuple[float, Linea, bool]], lineas: list[Linea]) -> list[str]:
    """Las fincas a las que el bloque de datos asigna un área cada una (lote que reúne varias fincas). Cada área se
    asigna a la mención de finca más cercana de su página. Vacío si es una sola finca, o si una finca tiene dos áreas
    distintas (eso es un conflicto de lecturas, no áreas parciales)."""
    if len(de_finca) < 2:
        return []
    menciones = _menciones_de_fincas(lineas)
    por_finca: dict[str, set[float]] = {}
    for v, ln, _ in de_finca:
        cerca = min(((f, _separacion(o, ln)) for f, o in menciones if o.pagina == ln.pagina), key=lambda x: x[1],
                    default=(None, 0.0))[0]
        if cerca is not None:
            por_finca.setdefault(cerca, set()).add(v)
    if len(por_finca) < 2 or any(len(vs) > 1 for vs in por_finca.values()):
        return []  # una finca con dos áreas: lecturas en conflicto, no parciales
    return sorted(por_finca)


# «FINCA N° 083076», «FINCA: 071091», «FINCA N065840», «FOLIO REAL 076524», «FINCAS 101, 102 Y 103» (lote que reúne varias).
_FINCA = re.compile(
    r"(?:\bFINCAS?|FOLIOS?\s+REALE?S?)\s*(?:N\s*[°ºO.]?\s*|NO\.?\s*|#\s*)?[:#]?\s*(\d{3,9}\b(?:\s*(?:,|\bY\b|&)\s*\d{3,9}\b)*)"
)
_NUMS = re.compile(r"\d{3,9}")
# Lista que sigue en la línea de abajo: «FINCAS 101, 102,» / «103 Y 104».
_SIGUE_LISTA = re.compile(r"^\s*\d{3,9}\b(?:\s*(?:,|\bY\b|&)\s*\d{3,9}\b)*")
# Bloque con los datos del proyecto o de la finca (no los rótulos del dibujo).
_ROTULO_DATOS = re.compile(
    r"DATOS\s+(?:GENERALES|DEL?\s+(?:PROYECTO|LOTE|TERRENO|PROPIEDAD|INMUEBLE|LA\s+FINCA|LAS\s+FINCAS)"
    r"|DE\s+(?:LA|LAS)\s+FINCAS?|REGISTRALES|CATASTRALES)|INFORMACION\s+DEL\s+PROYECTO|DESCRIPCION\s+DE\s+LA\s+PROPIEDAD"
)
# Junto a una finca vecina: «COLINDANTE», «COLINDA CON», «LINDERO NORTE», «VECINO», «RESTO LIBRE DE LA FINCA».
# «VECINO» o «VECINA», no «COMERCIO VECINAL» (nombre de una zona: «RM-H2 + C1 (… COMERCIO VECINAL)»).
_COLINDANTE = re.compile(r"COLINDA|LINDERO|\bVECIN[OA]S?\b|RESTO\s+LIBRE")
#: Distancia (en alturas de línea) a la que un rótulo «COLINDANTE» marca una finca como vecina.
_CERCA_COLINDANTE = 3.0


def _avisos_colindante(lineas: list[Linea]) -> list[Linea]:
    """Líneas que rotulan una finca vecina («COLINDANTE», «LINDERO», «VECINO», «RESTO LIBRE DE LA FINCA»)."""
    return [ln for ln in lineas if _COLINDANTE.search(_sin_tildes(ln.texto))]


def _junto_a_colindante(ln: Linea, avisos: list[Linea]) -> bool:
    """La línea es (o está a menos de _CERCA_COLINDANTE alturas de) un rótulo de colindante de su página."""
    alto_ln = max(ln.bbox[3] - ln.bbox[1], 1.0)
    return any(a.pagina == ln.pagina and _separacion(a, ln) <= _CERCA_COLINDANTE * alto_ln for a in avisos)


def _en_membrete(ln: Linea, ancho: float, alto: float, desde_y: float = 0.55) -> bool:
    """Membrete: franja derecha de la hoja (o su cuadrante inferior derecho)."""
    x0, y0, x1, y1 = ln.bbox
    return (x0 + x1) / 2 > ancho * 0.75 and (y0 + y1) / 2 > alto * desde_y


def _separacion(a: Linea, b: Linea) -> float:
    """Distancia entre las cajas de dos líneas (0 si se tocan)."""
    dx = max(0.0, max(a.bbox[0], b.bbox[0]) - min(a.bbox[2], b.bbox[2]))
    dy = max(0.0, max(a.bbox[1], b.bbox[1]) - min(a.bbox[3], b.bbox[3]))
    return (dx * dx + dy * dy) ** 0.5


def _bloques_de_datos(lineas: list[Linea]) -> set[Linea]:
    """Líneas bajo un rótulo «DATOS DEL PROYECTO», «DATOS GENERALES», «DATOS DE LA FINCA»…, en su columna."""
    por_pagina: dict[int, list[Linea]] = {}
    for ln in lineas:
        por_pagina.setdefault(ln.pagina, []).append(ln)
    salida: set[Linea] = set()
    for pag in por_pagina.values():
        pag.sort(key=lambda ln: (ln.bbox[1], ln.bbox[0]))
        for i, rot in enumerate(pag):
            if not _ROTULO_DATOS.search(_sin_tildes(rot.texto)):
                continue
            alto = max(rot.bbox[3] - rot.bbox[1], 1.0)
            ancho = rot.bbox[2] - rot.bbox[0]
            x0, x1 = rot.bbox[0] - max(ancho, 6 * alto), rot.bbox[2] + max(ancho, 6 * alto)
            salida.add(rot)
            ultimo = rot
            for sig in pag[i + 1:]:
                if sig.bbox[1] - ultimo.bbox[3] > _SALTO_BLOQUE * alto:
                    break
                if x0 <= (sig.bbox[0] + sig.bbox[2]) / 2 <= x1:
                    if _ROTULO_DATOS.search(_sin_tildes(sig.texto)) is None and re.search(r"PROPIETARI", _sin_tildes(sig.texto)):
                        break  # empieza el bloque del propietario
                    salida.add(sig)
                    ultimo = sig
    return salida


def _menciones_de_fincas(lineas: list[Linea]) -> list[tuple[str, Linea]]:
    """(finca, línea) en orden de lectura, con las listas que siguen en la línea de abajo."""
    salida = []
    for k, ln in enumerate(lineas):
        texto = _sin_tildes(ln.texto)
        for m in _FINCA.finditer(texto):
            numeros = _NUMS.findall(m.group(1))
            # «FINCAS 101, 102,» sigue abajo: se une la línea siguiente de la misma página si empieza con números.
            if texto[m.end():].strip() in (",", "Y", "&"):
                sig = lineas[k + 1] if k + 1 < len(lineas) else None
                if sig is not None and sig.pagina == ln.pagina and (c := _SIGUE_LISTA.match(_sin_tildes(sig.texto))):
                    numeros += _NUMS.findall(c.group(0))
            salida += [(n, ln) for n in numeros]
    return salida


def fincas(lineas: Iterable[Linea], ancho: Optional[float] = None, alto: Optional[float] = None,
           dims: Optional[dict[int, tuple[float, float]]] = None) -> dict:
    """lote.finca (ver fincas_del_lote)."""
    return fincas_del_lote(lineas, ancho, alto, dims)[0]


#: Confianza de lote.cantidad_fincas: qué tan seguro es el número de fincas del lote, no sus dígitos. Un rótulo
#: «FINCA: 078850» leído «1336» sigue siendo una sola finca.
CANTIDAD_BLOQUE = 0.9    # el bloque de datos del proyecto dice cuáles son, sin señales en contra
CANTIDAD_UNICA = 0.85    # sin bloque: una sola finca candidata; las demás, rotuladas como colindantes
CANTIDAD_OTRAS = 0.7     # sin bloque: manda la del membrete, pero hay otras fincas sin marca de colindante
CANTIDAD_DUDOSA = 0.4    # fincas madre en el bloque, rótulo incompleto o dos números que pueden ser la misma finca
#: Un rótulo leído con menos confianza que esto puede no ser un rótulo de finca: la cantidad queda bajo el umbral.
_ROTULO_LEGIBLE = 0.5
_CANTIDAD_ROTULO_ILEGIBLE = 0.7
# «FINCAS 101» o «FOLIOS REALES 101»: rótulo en plural.
_PLURAL = re.compile(r"\bFINCAS\b|FOLIOS\s+REALE?S")


def _rotulo_incompleto(ln: Linea, numeros: int) -> bool:
    """Rótulo en plural con un solo número, o lista que termina en «,», «Y» o «&» sin continuación leída.
    `numeros`: cuántos números se tomaron de esta línea (con la continuación de abajo, si la hubo)."""
    texto = _sin_tildes(ln.texto)
    m = _FINCA.search(texto)
    if m is None:
        return False
    if _PLURAL.search(texto[:m.end()]) and numeros == 1:
        return True
    return texto[m.end():].strip() in (",", "Y", "&") and numeros == len(_NUMS.findall(m.group(1)))


#: Por debajo de esta confianza de lectura, dos números casi iguales pueden ser la misma finca mal leída. Con texto
#: vectorial (0.99) no: fincas vecinas con números correlativos (083337, 30002) son comunes.
_LECTURA_SEGURA = 0.9


def _parecidas(del_lote: dict[str, Linea]) -> bool:
    """Dos números que difieren en un dígito, o en uno de más o de menos, y alguno leído con dudas: pueden ser la
    misma finca mal leída."""
    fincas = list(del_lote)
    for i, a in enumerate(fincas):
        for b in fincas[i + 1:]:
            if min(del_lote[a].confianza, del_lote[b].confianza) >= _LECTURA_SEGURA:
                continue
            if len(a) == len(b) and sum(x != y for x, y in zip(a, b, strict=True)) == 1:
                return True
            corto, largo = sorted((a, b), key=len)
            if len(largo) - len(corto) == 1 and any(largo[:k] + largo[k + 1:] == corto for k in range(len(largo))):
                return True
    return False


def _n_fincas(n: int) -> str:
    return "una finca" if n == 1 else f"{n} fincas"


def _cantidad(del_lote: dict[str, Linea], rotulos: list[tuple[Linea, int]], del_bloque: bool, marcadas: list[str],
              otras: list[str]) -> tuple[float, str, str]:
    """(confianza, estado, nota) de lote.cantidad_fincas. `rotulos`: las líneas de donde salieron las fincas del
    lote, con cuántos números dio cada una; `del_bloque`: si salieron del bloque de datos del proyecto; `marcadas`:
    fincas del lote que el dibujo rotula además como resto libre o colindante; `otras`: fincas sin marca de colindante
    que también podrían ser del lote. Alta aunque los dígitos sean dudosos; nunca más que lo que dicen los rótulos."""
    n = len(del_lote)
    donde = "el bloque de datos del proyecto" if del_bloque else "el plano"
    if marcadas:
        return (CANTIDAD_DUDOSA, "revision",
                f"{donde[0].upper()}{donde[1:]} nombra {_n_fincas(n)}, pero el dibujo rotula {', '.join(marcadas)} "
                "como resto libre o colindante: pueden ser las fincas madre del desarrollo y no las del lote.")
    if any(_rotulo_incompleto(ln, k) for ln, k in rotulos):
        return (CANTIDAD_DUDOSA, "revision",
                "Un rótulo de finca parece incompleto (en plural con un solo número, o una lista cortada): pueden "
                "faltar fincas.")
    if n > 1 and _parecidas(del_lote):
        return (CANTIDAD_DUDOSA, "revision", "Dos de las fincas difieren en un dígito: pueden ser la misma finca mal leída.")
    if otras:
        return (CANTIDAD_OTRAS, "revision",
                f"Manda la finca del membrete, pero el plano nombra otras sin marca de colindante ({', '.join(otras)}): "
                "no es seguro cuántas son del lote.")
    if min(ln.confianza for ln, _ in rotulos) < _ROTULO_LEGIBLE:
        return (_CANTIDAD_ROTULO_ILEGIBLE, "revision", "El rótulo de finca se leyó con muy poca confianza.")
    cuantos = "un solo rótulo" if len(rotulos) == 1 else f"{len(rotulos)} rótulos"
    resto = "" if del_bloque else "; las demás que nombra, si las hay, van rotuladas como colindantes"
    return (CANTIDAD_BLOQUE if del_bloque else CANTIDAD_UNICA, "ok",
            f"{_n_fincas(n).capitalize()} en {donde} ({cuantos}){resto}. Es la confianza del número de fincas, no la "
            "de los dígitos (ver lote.fincas).")


def fincas_del_lote(lineas: Iterable[Linea], ancho: Optional[float] = None, alto: Optional[float] = None,
                    dims: Optional[dict[int, tuple[float, float]]] = None) -> list[dict]:
    """[lote.finca, lote.fincas, lote.cantidad_fincas]. Un plano nombra también las fincas colindantes. Orden de
    preferencia:

    1. Las fincas de un bloque de datos del proyecto o de la finca («DATOS DEL PROYECTO», «DATOS GENERALES»…).
    2. Si no hay bloque, se descartan las que van junto a «COLINDANTE», «LINDERO», «VECINO» o «RESTO LIBRE» y,
       de las demás, manda la única del membrete.
    3. Si quedan varias sin desempate, «revision»: el revisor la identifica con el certificado del Registro Público.

    lote.fincas lleva la lista del lote (puede reunir varias fincas); lote.finca, solo cuando es una.
    lote.cantidad_fincas es cuántas fincas tiene el lote, con su propia confianza (ver _cantidad): las reglas que
    distinguen una finca de varias deciden con ella y no con la confianza de los dígitos."""
    lineas = list(lineas)
    menciones = _menciones_de_fincas(lineas)
    if not menciones:
        return [_hecho("lote.finca", None, None, 0.0, "no_encontrado"), _hecho("lote.fincas", None, None, 0.0, "no_encontrado"),
                _hecho("lote.cantidad_fincas", None, None, 0.0, "no_encontrado")]
    vistas: dict[str, Linea] = {}
    for f, ln in menciones:
        vistas.setdefault(f, ln)
    datos = _bloques_de_datos(lineas)
    avisos = _avisos_colindante(lineas)

    def es_colindante(ln: Linea) -> bool:
        return _junto_a_colindante(ln, avisos)

    del_proyecto: dict[str, Linea] = {}
    for f, ln in menciones:
        if ln in datos:
            del_proyecto.setdefault(f, ln)
    por_linea: dict[Linea, int] = {}
    for _, ln in menciones:
        por_linea[ln] = por_linea.get(ln, 0) + 1

    def rotulos(del_lote: dict[str, Linea], solo_bloque: bool = False) -> list[tuple[Linea, int]]:
        """Las líneas que nombran las fincas del lote, con cuántos números dio cada una."""
        return [(ln, por_linea[ln]) for ln in dict.fromkeys(
            ln for f, ln in menciones if f in del_lote and (ln in datos or not solo_bloque))]

    if del_proyecto:
        colindantes = sorted(f for f in vistas if f not in del_proyecto)
        # Una finca del bloque que el dibujo rotula además como «RESTO LIBRE DE LA FINCA» o colindante: el bloque
        # puede listar las fincas madre del desarrollo y no las del lote.
        marcadas = sorted({f for f, ln in menciones if f in del_proyecto and ln not in datos and es_colindante(ln)})
        cantidad = _cantidad(del_proyecto, rotulos(del_proyecto, solo_bloque=True), True, marcadas, [])
        return _resultado_fincas(del_proyecto, colindantes, 0.9, "bloque de datos del proyecto", cantidad)

    colindantes = sorted({f for f, ln in menciones if es_colindante(ln)})
    libres = {f: ln for f, ln in vistas.items() if f not in colindantes}

    def medidas(ln: Linea):
        return dims.get(ln.pagina) if dims else ((ancho, alto) if ancho and alto else None)

    del_membrete = {f: ln for f, ln in libres.items() if (m := medidas(ln)) and _en_membrete(ln, *m, desde_y=0.0)}
    if len(del_membrete) == 1 and len(vistas) > 1:
        otras = sorted(f for f in libres if f not in del_membrete)
        cantidad = _cantidad(del_membrete, rotulos(del_membrete), False, [], otras)
        return _resultado_fincas(del_membrete, sorted(f for f in vistas if f not in del_membrete), 0.8, "membrete", cantidad)
    if len(libres) == 1:
        cantidad = _cantidad(libres, rotulos(libres), False, [], [])
        return _resultado_fincas(libres, colindantes, 0.85 if not colindantes else 0.8, "única finca no colindante",
                                 cantidad)
    if not libres:
        nota = "Solo se hallaron fincas rotuladas como colindantes: falta la del proyecto."
        return [_hecho("lote.finca", None, None, 0.0, "no_encontrado", colindantes=colindantes, nota=nota),
                _hecho("lote.fincas", None, None, 0.0, "no_encontrado", nota=nota),
                _hecho("lote.cantidad_fincas", None, None, 0.0, "no_encontrado", nota=nota)]
    nota = "El plano menciona varias fincas (colindantes o a unificar) sin un bloque de datos que diga cuáles son del lote."
    ln = next(iter(libres.values()))
    return [_hecho("lote.finca", None, ln, 0.4, "revision", candidatos=sorted(libres), nota=nota,
                   **({"colindantes": colindantes} if colindantes else {})),
            _hecho("lote.fincas", None, ln, 0.4, "revision", candidatos=sorted(libres), nota=nota),
            # Cuántas son del lote no se sabe (de una a todas las candidatas): sin valor, no se rellena.
            _hecho("lote.cantidad_fincas", None, ln, 0.4, "revision", candidatos=sorted(libres), nota=nota)]


def _resultado_fincas(del_lote: dict[str, Linea], colindantes: list[str], factor: float, origen: str,
                      cantidad: tuple[float, str, str]) -> list[dict]:
    lista = list(del_lote)
    ln = next(iter(del_lote.values()))
    conf = ln.confianza * factor
    estado = "ok" if conf >= 0.7 else "revision"
    extra = {"colindantes": colindantes} if colindantes else {}
    varias = _hecho("lote.fincas", lista, ln, conf, estado, nota=f"Fincas del lote ({origen}).")
    conf_n, estado_n, nota_n = cantidad
    numero_de_fincas = _hecho("lote.cantidad_fincas", len(lista), ln, conf_n, estado_n, nota=nota_n)
    if len(lista) == 1:
        def leer(t: str):
            m = _FINCA.search(_sin_tildes(t))
            return _NUMS.findall(m.group(1))[0] if m else None
        if otras := _lecturas(ln, lista[0], leer):
            return [_hecho("lote.finca", lista[0], ln, conf, "revision", **extra, **otras), varias, numero_de_fincas]
        return [_hecho("lote.finca", lista[0], ln, conf, estado, **extra), varias, numero_de_fincas]
    return [_hecho("lote.finca", None, ln, min(conf, 0.5), "revision", candidatos=lista, **extra,
                   nota=f"El lote reúne {len(lista)} fincas ({origen}); ver lote.fincas. El revisor confirma con el "
                        "Registro Público si se unifican."), varias, numero_de_fincas]


_ESCALA = re.compile(r"(?:ESC(?:ALA)?\.?|\bE\.)\s*:?\s*1\s*[:/]\s*([0-9][0-9.,]*)")
# «1:25000», «LOTE #73 - MODELO B 1:200»: una razón suelta es escala salvo en pendientes (rampas, taludes).
_ESCALA_SUELTA = re.compile(r"(?<![\d.:/])1\s*:\s*(\d{2,5})(?![\d:])")
_PENDIENTE = re.compile(r"PENDIENTE|RAMPA|TALUD|%")


def escalas(lineas: Iterable[Linea]) -> list[dict]:
    """Escalas declaradas, en el orden en que aparecen (una por línea)."""
    salida = []
    for ln in lineas:
        texto = _sin_tildes(ln.texto)
        m = _ESCALA.search(texto) or (None if _PENDIENTE.search(texto) else _ESCALA_SUELTA.search(texto))
        if m:
            v, _ = numero(m.group(1).rstrip(".,"))
            if v and (m.re is _ESCALA or v >= 20):
                salida.append(_hecho("plano.escala", int(v), ln, ln.confianza, "ok"))
    return salida


# «USO DE SUELO 1ZM6», «CÓDIGO DE ZONIFICACIÓN: RE», «ZONIFICACION: R3 (Residencial…».
_ZONIFICACION = re.compile(
    r"(?:USO\s+DE\s+SUELO|CODIGO\s+DE\s+ZONIFICACION|CODIGO\s+DE\s+ZONA|ZONIFICACION)\s*:?\s*"
    r"((?:[0-9]?[A-Z]{1,3}[0-9]{0,2}(?:-?[A-Z]?[0-9]{1,2})?|[0-9]?[A-Z]{1,3}(?:-?[0-9A-Z]{1,3})?))(?=\s|\(|,|$)"
)

# Etiqueta que termina la línea, y línea siguiente que es solo un código de zona (p. ej. «RM3-C2», «1ZM7»).
_ETIQUETA_ZONIFICACION = re.compile(r"(?:USO\s+DE\s+SUELO|CODIGO\s+DE\s+ZONIFICACION|CODIGO\s+DE\s+ZONA|ZONIFICACION)\s*:?\s*$")
_CODIGO_SOLO = re.compile(r"\s*((?:[0-9]?[A-Z]{1,3}[0-9]{0,2}(?:-?[A-Z]?[0-9]{1,2})?|[0-9]?[A-Z]{1,3}(?:-?[0-9A-Z]{1,3})?))\s*$")


def zonificacion_declarada(lineas: Iterable[Linea]) -> dict:
    """plano.zonificacion_declarada: el código que el profesional escribe en el plano. Se contrasta con el
    Documento Gráfico y con la CEUS; nunca los reemplaza (CLAUDE.md, principio 5)."""
    vistos: dict[str, Linea] = {}
    lineas = list(lineas)
    for i, ln in enumerate(lineas):
        texto = _sin_tildes(ln.texto)
        for m in _ZONIFICACION.finditer(texto):
            vistos.setdefault(m.group(1), ln)
        # Cuadros donde la etiqueta y el código van en líneas distintas («ZONIFICACION:» / «RM3-C2»).
        if i + 1 < len(lineas) and _ETIQUETA_ZONIFICACION.search(texto):
            m = _CODIGO_SOLO.match(_sin_tildes(lineas[i + 1].texto))
            if m and len(m.group(1)) >= 2:
                vistos.setdefault(m.group(1), lineas[i + 1])
    if not vistos:
        return _hecho("plano.zonificacion_declarada", None, None, 0.0, "no_encontrado")
    # Dos grafías del mismo código («RM-H2» y «RMH2», «1ZM7» y «ZM7») no son dos códigos: pasa cuando dos lecturas del OCR
    # (Tesseract y el segundo lector) ven el mismo rótulo. Se compara sin guiones, espacios ni prefijo de clase de suelo.
    if len({_clave_de_zona(c) for c in vistos}) > 1:
        return _hecho("plano.zonificacion_declarada", None, next(iter(vistos.values())), 0.4, "revision", candidatos=sorted(vistos))
    # Entre grafías equivalentes manda la línea de mayor confianza; con empate, la que se leyó primero.
    codigo, ln = max(vistos.items(), key=lambda kv: kv[1].confianza)
    otras = _lecturas(ln, codigo, lambda t: (m.group(1) if (m := _ZONIFICACION.search(_sin_tildes(t))) else None))
    return _hecho("plano.zonificacion_declarada", codigo, ln, ln.confianza * 0.9, "revision" if otras else "ok", **otras)


def _clave_de_zona(codigo: str) -> str:
    """Grafía comparable de un código de zona (la misma idea que precheck.motor.zona.clave)."""
    return re.sub(r"^\d(?=[A-Z])", "", re.sub(r"[^A-Z0-9]", "", codigo.upper()))


_CORREGIMIENTO = re.compile(r"CORREGIMIENTO\s*(?::\s*|DE\s+|\s)\s*([A-Z0-9 ]+?)(?:[,.;(]|\s+DISTRITO|$)")
_ALIAS_CORREGIMIENTO = {"CALIDONIA": "La Exposición o Calidonia", "LA EXPOSICION": "La Exposición o Calidonia", "24 DE DICIEMBRE": "24 de Diciembre"}


def corregimiento(lineas: Iterable[Linea]) -> dict:
    """lote.corregimiento, normalizado contra la lista oficial del distrito de Panamá."""
    oficiales = {_sin_tildes(c): c for c in CORREGIMIENTOS} | _ALIAS_CORREGIMIENTO
    vistos: dict[str, Linea] = {}
    lineas = list(lineas)
    # En los membretes la dirección suele partirse: «…, CORREGIMIENTO» / «DE BELLA VISTA, DISTRITO…».
    for ln, siguiente in zip(lineas, [*lineas[1:], None][:len(lineas)], strict=True):
        texto = _sin_tildes(ln.texto)
        if siguiente is not None and siguiente.pagina == ln.pagina and re.search(r"CORREGIMIENTO(\s+DE)?\s*:?\s*$", texto):
            texto = f"{texto} {_sin_tildes(siguiente.texto)}"
        for m in _CORREGIMIENTO.finditer(texto):
            nombre = m.group(1).strip()
            if nombre in _ALIAS_CORREGIMIENTO:
                vistos.setdefault(_ALIAS_CORREGIMIENTO[nombre], ln)
                continue
            for clave, oficial in oficiales.items():
                if nombre == clave or nombre.startswith(clave + " ") or clave.startswith(nombre + " ") and len(nombre) > 4:
                    vistos.setdefault(oficial, ln)
    if not vistos:
        return _hecho("lote.corregimiento", None, None, 0.0, "no_encontrado")
    if len(vistos) > 1:
        return _hecho("lote.corregimiento", None, next(iter(vistos.values())), 0.4, "revision", candidatos=sorted(vistos))
    nombre, ln = next(iter(vistos.items()))
    return _hecho("lote.corregimiento", nombre, ln, ln.confianza * 0.9, "ok")


_CODIGO_LAMINA = re.compile(r"^(?!DE\b)(?:[A-Z]{1,3}[-_ .]?\d{1,3}(?:\.\d)?|\d{1,2}[-_][A-Z]{2,4})$")
_ROTULO_TITULO = re.compile(r"^(CONTENIDO|TITULO|NOMBRE DEL PLANO|DESCRIPCION DEL PLANO)\s*:?$")
_HOJA = re.compile(r"HOJA\s*#?\s*(\d{1,2})\s*(?:DE|/)\s*(\d{1,2})|^\s*(\d{1,2})\s*/\s*(\d{1,2})\s*$")
_TITULO = re.compile(r"PLANTA|ELEVACI|FACHADA|SECCI|CORTE|DETALLE|LOCALIZACI|UBICACI|INDICE|RESUMEN|CUADRO|TECHO|CONJUNTO")


def lamina(lineas: Iterable[Linea], ancho: float, alto: float) -> dict:
    """Código, título y escala de una hoja, buscados en el membrete (cuadrante inferior derecho o franja derecha)."""
    def en_membrete(ln: Linea) -> bool:
        x0, y0, x1, y1 = ln.bbox
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        return cx > ancho * 0.75 and cy > alto * 0.55

    zona = sorted((ln for ln in lineas if en_membrete(ln)), key=lambda ln: (ln.bbox[1], ln.bbox[0]))
    codigos = [ln for ln in zona if _CODIGO_LAMINA.match(ln.texto.strip().upper())]
    # El código del membrete suele ser el texto más grande de la zona.
    codigo = max(codigos, key=lambda ln: ln.bbox[3] - ln.bbox[1], default=None)
    esc = escalas(zona)
    hoja = total = None
    for ln in zona:
        m = _HOJA.search(_sin_tildes(ln.texto))
        if m:
            hoja, total = int(m.group(1) or m.group(3)), int(m.group(2) or m.group(4))
            break
    return {
        "codigo": codigo.texto.strip().upper() if codigo else None,
        "titulo": _titulo(zona, codigo),
        "escala": esc[0]["valor"] if esc else None,
        "hoja": hoja,
        "total_hojas": total,
    }


def _titulo(zona: list[Linea], codigo: Optional[Linea]) -> Optional[str]:
    """Título de la hoja: las líneas bajo el rótulo «CONTENIDO:» del membrete (hasta el siguiente rótulo), o si no
    hay rótulo, la primera línea con un nombre de hoja típico (PLANTA, ELEVACIÓN…) que no sea un rótulo."""
    for i, ln in enumerate(zona):
        if _ROTULO_TITULO.match(_sin_tildes(ln.texto).strip()):
            partes, ultimo = [], ln
            for sig in zona[i + 1:]:
                texto = sig.texto.strip()
                if not (sig.bbox[0] < ln.bbox[2] + 40 and sig.bbox[2] > ln.bbox[0] - 40):
                    continue  # otra columna del membrete
                if sig.bbox[1] - ultimo.bbox[3] > 30 or texto.endswith(":") or sig is codigo or _HOJA.search(_sin_tildes(texto)):
                    break
                partes.append(texto)
                ultimo = sig
                if len(partes) == 3:
                    break
            if partes:
                return " · ".join(partes)
    return next((ln.texto.strip() for ln in zona
                 if _TITULO.search(_sin_tildes(ln.texto)) and ln is not codigo and not ln.texto.strip().endswith(":")
                 and "INDICA" not in _sin_tildes(ln.texto)), None)


# Requisitos del pie descriptivo y del contenido del anteproyecto (Acuerdo 110, Anexo IV) que se reconocen por texto.
_REQUISITOS = {
    "cuadro_de_areas": re.compile(r"(CUADRO|RESUMEN)\s+DE\s+AREAS"),
    "localizacion_regional": re.compile(r"(LOCALIZACION|UBICACION)\s+REGIONAL"),
    "propietario": re.compile(r"PROPIETARI[OA]|DATOS\s+DEL?\s+PROPIETARIO|PROPIEDAD\s+DE"),
    # Sello del profesional (Ley 15 de 1959, JTIA): número de idoneidad o de licencia, la ley o la Junta Técnica.
    # Tolera lecturas del OCR como «Ley 13 del 26 de Enero de 1959», «Ley 15 … de enero de 1999» o «Tunta Técnica
    # de Ingeniería».
    "profesional_responsable": re.compile(
        r"IDONEO|IDONEIDAD|PROFESIONAL\s+RESPONSABLE|DISENO\s+ARQ|(?:ARQUITECTO|INGENIERO)\s+RESPONSABLE"
        r"|\bLICENCIA\s*(?:N|NO|#)\W|\bLEY\b.{0,30}\b1959\b|\bLEY\s*1\d\b.{0,20}\bENERO\b|\bJTIA\b|[JT]UNTA\s+T\w*\s+DE\s+INGEN|RIA\s+Y\s+ARQUITECTURA\b"
    ),
    "fecha": re.compile(r"\bFECHA\b"),
    "numero_de_hoja": re.compile(r"\bHOJA\b|TOTAL\s+DE\s+HOJAS|\b\d{1,2}\s*/\s*\d{1,2}\b"),
    "escala": _ESCALA,
}


# Indicio débil del profesional: un título abreviado delante de un nombre («Arq. …», «Ing. …»). El nombre no se copia.
_TITULO_PROFESIONAL = re.compile(r"\b(?:ARQ|ING)\.\s*[A-Z]")
#: Confianza máxima de la presencia del profesional deducida solo de un título abreviado.
CONFIANZA_INDICIO_PROFESIONAL = 0.6


def requisitos_anexo_iv(lineas: Iterable[Linea]) -> list[dict]:
    """¿Aparece cada región o dato obligatorio? Solo presencia y dónde: nunca se copia el dato personal (nombres,
    cédulas, números de idoneidad). La ausencia no es un incumplimiento (puede ser un fallo de detección): confianza
    moderada, para revisión."""
    lineas = list(lineas)
    salida = []
    for req, patron in _REQUISITOS.items():
        halladas = [x for x in lineas if patron.search(_sin_tildes(x.texto))]
        # El sello se repite en cada hoja: se cita la lectura más clara.
        ln = (max(halladas, key=lambda x: x.confianza) if req == "profesional_responsable" else halladas[0]) if halladas else None
        if ln:
            salida.append({"requisito": req, "existe": True, "confianza": round(ln.confianza * 0.9, 2), "fuente": _fuente(ln)})
        elif req == "profesional_responsable" and (ln := next((x for x in lineas if _TITULO_PROFESIONAL.search(_sin_tildes(x.texto))), None)):
            salida.append({"requisito": req, "existe": True,
                           "confianza": round(min(ln.confianza * 0.9, CONFIANZA_INDICIO_PROFESIONAL), 2), "fuente": _fuente(ln)})
        else:
            salida.append({"requisito": req, "existe": False, "confianza": 0.5, "fuente": None})
    return salida


# Requisitos documentales de los Anexos III y IV del Acuerdo 110 que se pueden reconocer por texto. Solo EVIDENCIA POSITIVA: si
# no se halla el texto no se emite nada (que un buscador no lo halle no prueba que el plano no lo tenga; queda para la IA).
# Los nombres son los de scripts/hechos_documentales.json y de las reglas de reglas_a110_anexos_iii_iv_borrador.json.
_DOC_FECHA = re.compile(r"\bFECHA\b\W{0,12}(?:DE\s+(?:PRESENTACION|ENTREGA|EMISION)\W{0,6})?(?:\d{1,2}\s*[/.\-]\s*\d{1,2}\s*[/.\-]\s*\d{2,4}|\d{1,2}\s+DE\s+[A-Z]{4,10}(?:\s+DE)?\s+\d{4}|[A-Z]{4,10}\s+(?:DE\s+)?\d{4})")
_DOC_HOJAS = re.compile(r"\bHOJA\s*(?:N[O°º.]*\s*)?\d{1,3}\s*(?:DE|/)\s*\d{1,3}\b")
_DOC_CEDULA = re.compile(r"\bC[EÉ]DULA\b|\bC\.?I\.?P\.?\s*[:N]")
_DOC_DESCRIPCION = re.compile(r"DESCRIPCION\s+DEL\s+(?:TRABAJO|PROYECTO)|ETAPA\s+CONSTRUCTIVA|\bPROYECTO\s*:\s*[A-Z0-9]")
_DOC_CALLE = re.compile(r"\b(?:CALLE|AVENIDA|AV\.|VIA|CARRETERA)\b")
_DOC_REGIONAL_5000 = re.compile(r"\b1\s*:\s*5[ ,.]?000\b")
_DOC_ORIENTACION = re.compile(r"NORTE\s+MAGNETICO|ORIENTACION\s+MAGNETICA")
_DOC_IDONEIDAD = re.compile(r"IDONEIDAD\s*(?:N[O°º.]*|#)?\s*[:\-]?\s*\d")
_DOC_TINAQUERA = re.compile(r"TINAQUERA|CENTRO\s+DE\s+ACOPIO")
#: Palabras de un rótulo de recinto («TINAQUERA», «CUARTO DE TINAQUERA 4.50 M2»); más es una nota.
MAX_PALABRAS_ROTULO = 6
_DOC_TENDEDERO = re.compile(r"\bTENDEDERO")
_DOC_ABIERTAS = re.compile(r"(?:AREA|CONSTRUCCION|AREAS)\s+ABIERT|ABIERT[AO]S?\s+Y\s+CERRAD")
_DOC_CERRADAS = re.compile(r"(?:AREA|CONSTRUCCION|AREAS)\s+CERRAD|ABIERT[AO]S?\s+Y\s+CERRAD")
# Sello del profesional: no basta la etiqueta «DISEÑO ARQ:» ni «PROFESIONAL RESPONSABLE»; hace falta el número de idoneidad, la licencia o la ley.
_DOC_SELLO = re.compile(r"IDONEO|IDONEIDAD|\bJTIA\b|\bLICENCIA\s*(?:N|NO|#)\W|\bLEY\b.{0,30}\b1959\b|[JT]UNTA\s+T\w*\s+DE\s+INGEN")
# Hoja y total de hojas: «HOJA 3 DE 7» o, juntos, un «HOJA N» y un «TOTAL DE HOJAS».
_DOC_HOJA_N = re.compile(r"\bHOJA\s*(?:N[O°º.]*\s*)?\d{1,3}\b")
_DOC_TOTAL_HOJAS = re.compile(r"TOTAL\s+DE\s+HOJAS")


def requisitos_documentales(lineas: Iterable[Linea], requisitos: Optional[list[dict]] = None) -> list[dict]:
    """Hechos booleanos `plano.…` para las reglas documentales de los Anexos III y IV, con evidencia positiva en el texto.
    Cada uno: {hecho, valor: True, confianza, fuente}. Confianza = la de la línea × 0.9 (con OCR queda bajo 0.85 y el motor
    lo deja en revisión). Nunca se emite `False`. No se copia ningún dato personal."""
    lineas = list(lineas)
    requisitos = requisitos if requisitos is not None else requisitos_anexo_iv(lineas)
    previo = {r["requisito"]: r for r in requisitos if r.get("existe")}
    textos = [(ln, _sin_tildes(ln.texto)) for ln in lineas]
    salida: list[dict] = []

    def agregar(hecho: str, ln: Optional[Linea], tope: float = 1.0):
        if ln is not None:
            salida.append({"hecho": hecho, "valor": True, "confianza": round(min(ln.confianza * 0.9, tope), 2), "fuente": _fuente(ln)})

    def primera(patron) -> Optional[Linea]:
        halladas = [ln for ln, s in textos if patron.search(s)]
        return max(halladas, key=lambda x: x.confianza) if halladas else None

    def de_requisito(nombre: str) -> Optional[Linea]:
        r = previo.get(nombre)
        if not r or not r.get("fuente"):
            return None
        f = r["fuente"]
        return next((ln for ln in lineas if ln.pagina == f.get("pagina") and [round(v, 1) for v in ln.bbox] == f.get("bbox")), None)

    # Del requisito de presencia que ya existía (con su propia confianza ya aplicada).
    if "escala" in previo:
        salida.append({"hecho": "plano.pie_descriptivo.escala", "valor": True, "confianza": previo["escala"]["confianza"], "fuente": previo["escala"]["fuente"]})
    agregar("plano.pie_descriptivo.profesional_responsable", primera(_DOC_SELLO))
    agregar("plano.pie_descriptivo.fecha_presentacion", primera(_DOC_FECHA))
    hoja_n, total = primera(_DOC_HOJA_N), primera(_DOC_TOTAL_HOJAS)
    agregar("plano.pie_descriptivo.numero_y_total_hojas", primera(_DOC_HOJAS) or (min((hoja_n, total), key=lambda x: x.confianza) if hoja_n is not None and total is not None else None))
    propietario, cedula = de_requisito("propietario"), primera(_DOC_CEDULA)
    if propietario is not None and cedula is not None:
        agregar("plano.pie_descriptivo.propietario_y_cedula", propietario if propietario.confianza <= cedula.confianza else cedula)
    agregar("plano.pie_descriptivo.descripcion_trabajo", primera(_DOC_DESCRIPCION))
    corregimiento, calle = primera(re.compile(r"CORREGIMIENTO")), primera(_DOC_CALLE)
    if corregimiento is not None and calle is not None:
        agregar("plano.pie_descriptivo.direccion_completa", corregimiento if corregimiento.confianza <= calle.confianza else calle)
    agregar("plano.localizacion_regional.escala_1_5000", primera(_DOC_REGIONAL_5000))
    agregar("plano.localizacion_general.orientacion_magnetica", primera(_DOC_ORIENTACION))
    agregar("plano.listado_disenadores.con_idoneidad", primera(_DOC_IDONEIDAD))
    # Solo un rótulo (pocas palabras): una nota como «el edificio contará con una tinaquera propia» no dibuja el recinto
    # (criterio de plano.tinaquera.presente, ADR-0018).
    rotulos = [(ln, s) for ln, s in textos if _DOC_TINAQUERA.search(s) and len(s.split()) <= MAX_PALABRAS_ROTULO]
    agregar("plano.tinaquera.presente", max((ln for ln, _ in rotulos), key=lambda x: x.confianza) if rotulos else None)
    agregar("plano.tendedero.presente", primera(_DOC_TENDEDERO))
    abiertas, cerradas = primera(_DOC_ABIERTAS), primera(_DOC_CERRADAS)
    if abiertas is not None and cerradas is not None:
        agregar("plano.resumen_areas.abiertas_y_cerradas", abiertas if abiertas.confianza <= cerradas.confianza else cerradas)
    return salida


def profesional_presente(requisitos: list[dict]) -> bool:
    return any(r["requisito"] == "profesional_responsable" and r["existe"] for r in requisitos)
