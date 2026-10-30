"""Cuentas y revisión de sentido común de los hechos antes de pasarlos al motor.

La IA lee el plano; las cuentas las hace el sistema, que no se equivoca al dividir. Y antes de que el motor decida,
cada hecho numérico o de texto pasa por preguntas de sentido común (¿una altura de 0 m?, ¿una densidad que equivale
a menos de cinco personas en todo el edificio?). Un hecho que no las pasa no se borra: se le baja la confianza por
debajo del umbral, así el motor deja sus reglas en REQUIERE_REVISION (principio 2: ante la duda, revisión), y se
anota un aviso `DATO_DUDOSO` que la IA ve al reevaluar y que llega a la persona que revisa. La excepción es un valor
imposible (altura, área, frente o pisos en 0): no es una lectura dudosa sino «no lo encontré», así que queda sin valor
(`valor_leido` guarda lo escrito, aviso `DATO_DESCARTADO`) y el motor lo trata como faltante (ADR-0019).

Nada de esto inventa valores normativos: solo comprueba que el dato leído tenga sentido físico.
"""
from __future__ import annotations

import copy

#: Confianza que se deja a un hecho dudoso: por debajo del umbral del motor (0.85) y de lo que da un extractor ok.
CONFIANZA_DUDOSO = 0.5

#: Hechos que en un anteproyecto nunca valen 0 ni menos. (El entrepiso o la altura entre losas sí pueden ser 0: la IA
#: escribe 0 cuando no aplican.)
POSITIVOS = {
    "lote.area_m2": "el área del lote",
    "lote.frente_m": "el frente del lote",
    "proyecto.altura_m": "la altura del edificio",
    "proyecto.pisos_totales": "el número de pisos",
}

#: Porcentajes: entre 0 y 100.
PORCENTAJES = ("proyecto.ocupacion_pct", "proyecto.area_libre_pct", "proyecto.area_verde_pct")

#: Hechos que son un texto (no un sí/no).
TEXTOS = {"profesional.disciplina": "la disciplina del profesional (p. ej. «arquitectura»)"}

#: Altura por piso razonable (m) con dos pisos o más; con un solo piso no hay tope (una nave comercial pasa de 10 m).
ALTURA_POR_PISO = (2.2, 7.0)

#: Diferencia (relativa) a partir de la cual la densidad calculada reemplaza a la que escribió la IA.
TOLERANCIA_CALCULO = 0.02


def _nodo(hechos: dict, ruta: str) -> dict | None:
    actual = hechos
    for p in ruta.split("."):
        if not isinstance(actual, dict) or p not in actual:
            return None
        actual = actual[p]
    return actual if isinstance(actual, dict) and "valor" in actual else None


def _poner(hechos: dict, ruta: str, nodo: dict) -> None:
    *padres, hoja = ruta.split(".")
    actual = hechos
    for p in padres:
        actual = actual.setdefault(p, {})
    actual[hoja] = nodo


def _numero(nodo: dict | None) -> float | None:
    if nodo is None:
        return None
    v = nodo.get("valor")
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        try:
            return float(v.replace(",", ".").split()[0])
        except (ValueError, IndexError):
            return None
    return None


def _marcar(hechos: dict, ruta: str, motivo: str, avisos: list[str]) -> None:
    nodo = _nodo(hechos, ruta)
    if nodo is None or nodo.get("definido"):   # lo definido por el arquitecto no se cuestiona
        return
    nodo["confianza"] = min(float(nodo.get("confianza") or 0), CONFIANZA_DUDOSO)
    nodo["dudoso"] = motivo
    avisos.append(f"DATO_DUDOSO: {ruta} = {nodo.get('valor')!r}. {motivo} Vuelve a mirarlo en el plano y corrígelo; si no se puede leer, déjalo con confianza <= 0.6.")


def calcular(hechos: dict) -> tuple[dict, list[str]]:
    """Densidad = personas declaradas / área del lote en hectáreas, si la IA leyó las personas
    (`proyecto.personas_total`) y el área. La confianza es la menor de las dos lecturas."""
    res = copy.deepcopy(hechos)
    avisos: list[str] = []
    personas, area = _nodo(res, "proyecto.personas_total"), _nodo(res, "lote.area_m2")
    p, a = _numero(personas), _numero(area)
    if p is not None and a and a > 0 and p > 0:
        calculada = round(p / (a / 10_000), 1)
        escrita = _numero(_nodo(res, "proyecto.densidad_pers_ha"))
        if (_nodo(res, "proyecto.densidad_pers_ha") or {}).get("definido"):
            return res, avisos
        if escrita is None or abs(escrita - calculada) > TOLERANCIA_CALCULO * calculada:
            _poner(res, "proyecto.densidad_pers_ha", {
                "valor": calculada,
                "confianza": min(float(personas.get("confianza") or 0), float(area.get("confianza") or 0)),
                "fuente": {"metodo": "calculo", "detalle": f"{p:g} personas / {a / 10_000:.4f} ha (lote de {a:g} m²), calculado por el sistema"},
            })
            if escrita is not None:
                avisos.append(f"CALCULO: proyecto.densidad_pers_ha pasó de {escrita:g} a {calculada:g} pers/ha "
                              f"({p:g} personas / {a / 10_000:.4f} ha). La densidad la calcula el sistema.")
    return res, avisos


def _descartar(hechos: dict, ruta: str, motivo: str, avisos: list[str]) -> None:
    """Un valor imposible (una altura de 0 m) no es una lectura dudosa: dice «no lo encontré». Queda sin valor y el motor
    lo trata como faltante (ADR-0019); antes, con la confianza baja, el respaldo del motor decidía con ese 0."""
    nodo = _nodo(hechos, ruta)
    if nodo is None or nodo.get("definido"):
        return
    nodo["valor_leido"], nodo["valor"] = nodo["valor"], None
    nodo["descartado"] = motivo
    avisos.append(f"DATO_DESCARTADO: {ruta} = {nodo['valor_leido']!r}. {motivo} El motor lo trata como faltante. Si no se "
                  "puede leer, no escribas 0: escribe la mejor estimación que dé el plano con confianza <= 0.6 (p. ej. la "
                  "altura como diferencia entre los niveles de la elevación) o no lo escribas.")


def revisar_sensatez(hechos: dict) -> tuple[dict, list[str]]:
    """Baja la confianza de los hechos sin sentido físico (o descarta los imposibles) y devuelve un aviso por cada uno."""
    res = copy.deepcopy(hechos)
    avisos: list[str] = []
    for ruta, nombre in POSITIVOS.items():
        n = _numero(_nodo(res, ruta))
        if n is not None and n <= 0:
            _descartar(res, ruta, f"{nombre[0].upper()}{nombre[1:]} no puede ser {n:g}.", avisos)
    for ruta in PORCENTAJES:
        n = _numero(_nodo(res, ruta))
        if n is not None and not 0 <= n <= 100:
            _marcar(res, ruta, f"Un porcentaje tiene que estar entre 0 y 100, no {n:g}.", avisos)
    for ruta, nombre in TEXTOS.items():
        nodo = _nodo(res, ruta)
        v = nodo.get("valor") if nodo else None
        if nodo is not None and (isinstance(v, bool) or (isinstance(v, str) and v.strip().lower() in {"sí", "si", "no", "true", "false", ""})):
            _marcar(res, ruta, f"Aquí va {nombre}, no un sí o no.", avisos)
    altura, pisos = _numero(_nodo(res, "proyecto.altura_m")), _numero(_nodo(res, "proyecto.pisos_totales"))
    if altura and pisos and altura > 0 and pisos > 0 and not _nodo(res, "proyecto.altura_m").get("dudoso"):
        por_piso = altura / pisos
        if por_piso < ALTURA_POR_PISO[0] or (pisos >= 2 and por_piso > ALTURA_POR_PISO[1]):
            _marcar(res, "proyecto.altura_m", f"Con {pisos:g} pisos, {altura:g} m dan {por_piso:.1f} m por piso, fuera de lo "
                    f"posible ({ALTURA_POR_PISO[0]:g} a {ALTURA_POR_PISO[1]:g} m); revisa la altura y los pisos.", avisos)
    # Densidad que equivale a menos personas que viviendas: se escribió el número de personas (u otra cosa) en vez de
    # personas por hectárea (DeepSeek en Casco Antiguo: 52.5 «pers/ha» en 733 m² son 3.8 personas para 25 apartamentos).
    densidad, area = _numero(_nodo(res, "proyecto.densidad_pers_ha")), _numero(_nodo(res, "lote.area_m2"))
    viviendas = _numero(_nodo(res, "proyecto.unidades_vivienda"))
    if densidad and area and viviendas and densidad > 0 and area > 0 and viviendas >= 2 and densidad * area / 10_000 < viviendas:
        _marcar(res, "proyecto.densidad_pers_ha", f"{densidad:g} pers/ha en un lote de {area:g} m² son "
                f"{densidad * area / 10_000:.1f} personas para {viviendas:g} viviendas: parece el número de personas, no "
                "personas por hectárea. Escribe las personas en proyecto.personas_total y el sistema calcula la densidad.", avisos)
    return res, avisos


def aplicar(hechos: dict) -> tuple[dict, list[str]]:
    """Primero las cuentas del sistema, después la revisión de sentido común."""
    calculados, avisos = calcular(hechos)
    revisados, dudosos = revisar_sensatez(calculados)
    return revisados, avisos + dudosos
