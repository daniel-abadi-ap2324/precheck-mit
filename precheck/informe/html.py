"""Documento del informe: HTML autocontenido, forma estructurada y extracción del modelo (ADR-0002).

Dominio puro, sin E/S. El render es determinista (mismo modelo → mismos bytes, sin importar el orden
de las claves): las secciones conocidas salen en orden fijo y todo lo demás en orden de clave, así una
clave nueva del modelo se muestra sin romper nada. El documento no tiene scripts ejecutables ni recursos
externos; todo texto va escapado; los estados se escriben en texto. El modelo va embebido en un bloque
de datos no ejecutable y la trazabilidad (quién emitió y cuándo) se imprime en un contenedor marcado
que no cuenta para la huella. La verificación por archivo compara el documento completo con `render`
(`mismo_documento`). Cambiar la salida exige subir `FORMATO_INFORME`.
"""
import json
import re
from contextvars import ContextVar
from html import escape
from html.parser import HTMLParser
from typing import Any, Mapping, Optional

from precheck.auditoria.canonico import canonico
from precheck.informe import huella as hu

TITULO = "Informe PreCheck — verificación preliminar"
TIPO_DATOS = "precheck-informe"
ID_DATOS = "precheck-informe-modelo"
MARCA_TRAZABILIDAD = "data-precheck-trazabilidad"
USO_INTERNO = "Uso interno — versión del revisor. No es un informe emitido ni puede entregarse al profesional."
MARCA_REGENERADO = "Contenido regenerado para comparación — encabezado no conservado"

_BLOQUE = re.compile(r'<script type="application/json" id="' + ID_DATOS + r'">(.*?)</script>', re.S)
_ESPACIOS = re.compile(r"\s+")

ESTADOS = {
    "CUMPLE": ("Cumple", "cumple"),
    "NO_CUMPLE": ("No cumple", "no-cumple"),
    "REQUIERE_REVISION": ("Requiere revisión", "revision"),
    "NO_APLICA": ("No aplica", "no-aplica"),
    "SIN_REGLAS": ("Sin reglas", "revision"),
    "observacion": ("Observación", "revision"),
    "bloqueante": ("Bloqueante", "no-cumple"),
    "no oficial": ("no oficial", "no-oficial"),
}

ETIQUETAS_1_1 = {
    "expediente": "Expediente", "tramite": "Trámite", "proyecto": "Proyecto", "finca": "Finca",
    "profesional": "Profesional idóneo", "idoneidad": "Idoneidad", "evaluacion": "Evaluación",
    "version": "Versión del informe", "formato_informe": "Formato del informe",
    "version_motor": "Versión del motor", "regla_id": "Regla", "resultado": "Resultado", "oficial": "Carácter",
    "indicativo": "Indicativo", "motivo": "Motivo", "que_hacer": "Qué hacer", "norma": "Norma",
    "vigencia": "Vigencia", "estado": "Estado", "emitido_por": "Emitido por", "emitido_en": "Emitido en",
    "nombre": "Nombre", "persona": "Persona",
}

# Formato 1.2.0: nombre legible para cada campo del modelo. Las claves que son datos (una norma, un hecho, una
# regla) salen tal cual. Un documento 1.1.0 se regenera con ETIQUETAS_1_1 para que siga siendo verificable.
ETIQUETAS = {
    **ETIQUETAS_1_1,
    "accion": "Acción", "actor": "Actor", "advertencias": "Advertencias", "articulo": "Artículo",
    "autor": "Autor", "cantidad": "Cantidad", "ceus": "CEUS", "cita": "Cita", "cita_textual": "Cita textual",
    "clave": "Clave", "codigo": "Código", "confianza": "Confianza", "decisiones": "Decisiones",
    "declaracion": "Declaración", "descartados": "Descartados", "desde": "Desde", "documento": "Documento",
    "documento_grafico": "Documento Gráfico", "donde": "Dónde", "estado_regla": "Estado de la regla",
    "evaluacion_seq": "N.º de evaluación", "faltantes": "Pendiente", "fecha_presentacion": "Fecha de presentación",
    "fuente": "Fuente", "fuente_norma": "Fuente normativa", "hash": "Huella de la evaluación",
    "hash_contenido": "Huella de la regla", "hasta": "Hasta", "historial_indicaciones": "Historial de indicaciones",
    "indicacion": "Indicación", "indicaciones": "Indicaciones", "metodo": "Método",
    "norma_aplicable": "Norma aplicable", "normas_con_reglas_aprobadas": "Normas con reglas aprobadas",
    "normas_decididas_a_mano": "Normas decididas por el revisor", "normas_evaluadas": "Normas evaluadas",
    "normas_sin_reglas": "Normas sin reglas", "ocurrido_en": "Fecha", "por_que": "Por qué", "que": "Qué",
    "reglas_no_evaluadas": "Reglas no evaluadas", "reglas_sin_aprobar": "Reglas sin aprobar",
    "rotulo": "Rótulo", "seq": "N.º de registro", "severidad": "Severidad",
    "sin_dato_declarado": "Sin dato declarado", "tema": "Tema", "temas_evaluados": "Temas evaluados",
    "texto": "Texto", "trasladada": "Trasladada al profesional", "usada": "Zona usada", "valor": "Valor",
    "valores_usados": "Valores usados", "veredicto": "Veredicto", "veredictos_favorables": "Veredictos favorables",
    "visto_bueno": "Visto bueno", "zona": "Zona", "zona_sin_ceus": "Zona sin CEUS",
}

# (clave, título) en el orden en que se presentan después de la primera página.
SECCIONES = (
    ("aviso_no_vigente", "Aviso"),
    ("estado", "Estado de la revisión"),
    ("observaciones", "Observaciones"),
    ("resultados", "Resultados"),
    ("cumplimientos", "Verificaciones que cumplen"),
    ("alcance", "Alcance"),
    ("cobertura", "Cobertura"),
)
_DATOS_EXPEDIENTE = ("expediente", "evaluacion", "version", "formato_informe", "version_motor")
_PRIMERAS_COLUMNAS = ("regla_id", "resultado", "oficial")
_CONSUMIDAS = {"nota_preliminar", "encabezado", "normas_consultadas", *_DATOS_EXPEDIENTE,
               *(k for k, _ in SECCIONES)}

ESTILOS = """
:root { color-scheme: light; }
body { font-family: Georgia, "Times New Roman", serif; font-size: 11pt; color: #111; background: #fff;
       margin: 0 auto; max-width: 190mm; padding: 12mm 10mm; line-height: 1.4; }
h1 { font-size: 17pt; margin: 0 0 4mm; }
h2 { font-size: 13pt; margin: 6mm 0 2mm; border-bottom: 1px solid #555; }
.nota { border: 2px solid #111; padding: 3mm 4mm; margin: 4mm 0; }
.uso-interno, .regenerado { font-weight: bold; text-transform: none; border: 2px dashed #111; padding: 2mm; }
table { border-collapse: collapse; width: 100%; margin: 2mm 0; }
th, td { border: 1px solid #555; padding: 1mm 2mm; text-align: left; vertical-align: top; }
thead { display: table-header-group; }
tr { break-inside: avoid; page-break-inside: avoid; }
dl { margin: 0; } dt { font-weight: bold; } dd { margin: 0 0 1mm 4mm; }
.estado { font-weight: bold; }
.estado-cumple { color: #145a14; } .estado-no-cumple { color: #9b1111; }
.estado-revision, .estado-no-oficial { color: #7a4b00; }
.trazabilidad { border-top: 1px solid #555; margin-top: 6mm; font-size: 9pt; }
.pie { font-size: 8pt; border-top: 1px solid #555; margin-top: 6mm; padding-top: 1mm; }
@page { size: letter; margin: 18mm 15mm 22mm 15mm; }
@media print {
  body { max-width: none; padding: 0 0 12mm 0; }
  .pie { position: fixed; bottom: 0; left: 0; right: 0; margin: 0; background: #fff; }
  .uso-interno { position: fixed; top: 0; left: 0; right: 0; background: #fff; }
  .uso-interno + * { margin-top: 14mm; }
  h2 { break-after: avoid; page-break-after: avoid; }
}
"""


# --- valores ------------------------------------------------------------------------------------

# Formato del documento que se está generando (lo fija `render` con el del modelo).
_formato: ContextVar[Optional[str]] = ContextVar("formato_informe", default=None)


def es_campo(clave: str) -> bool:
    """¿La clave es el nombre de un campo del modelo («fecha_presentacion») y no un dato («PLOT-A61-2021»)?"""
    return re.fullmatch(r"[a-z][a-z_]*", clave) is not None


def _nombre(clave: Any) -> str:
    clave = str(clave)
    if _formato.get() == "1.1.0":
        return ETIQUETAS_1_1.get(clave) or clave.replace("_", " ").capitalize()
    if not es_campo(clave):
        return clave
    return ETIQUETAS.get(clave) or clave.replace("_", " ").capitalize()


def _etiqueta(clave: Any) -> str:
    return escape(_nombre(clave))


def _texto(valor: str) -> str:
    if valor in ESTADOS:
        texto, clase = ESTADOS[valor]
        return f'<span class="estado estado-{clase}">{escape(texto)}</span>'
    return escape(valor)


def _ordenadas(claves, primeras=()) -> list:
    claves = set(map(str, claves))
    return [c for c in primeras if c in claves] + sorted(claves - set(primeras))


def _tabla(filas: list) -> str:
    columnas = _ordenadas(set().union(*(f.keys() for f in filas)), _PRIMERAS_COLUMNAS)
    cab = "".join(f'<th scope="col">{_etiqueta(c)}</th>' for c in columnas)
    cuerpo = "".join("<tr>" + "".join(f"<td>{_valor(f.get(c))}</td>" for c in columnas) + "</tr>" for f in filas)
    return f"<table><thead><tr>{cab}</tr></thead><tbody>{cuerpo}</tbody></table>"


def _dl(datos: Mapping, primeras=()) -> str:
    items = "".join(f"<dt>{_etiqueta(k)}</dt><dd>{_valor(datos[k])}</dd>" for k in _ordenadas(datos, primeras))
    return f"<dl>{items}</dl>"


def _valor(v: Any) -> str:
    if v is None:
        return "—"
    if isinstance(v, bool):
        return "sí" if v else "no"
    if isinstance(v, str):
        return _texto(v)
    if isinstance(v, Mapping):
        return _dl(v) if v else "—"
    if isinstance(v, (list, tuple)):
        if not v:
            return "ninguno"
        if all(isinstance(x, Mapping) for x in v):
            return _tabla(list(v))
        return "<ul>" + "".join(f"<li>{_valor(x)}</li>" for x in v) + "</ul>"
    return escape(str(v))


# --- documento ----------------------------------------------------------------------------------

def _envoltorio(modelo: Mapping, trazabilidad: Optional[Mapping]) -> dict:
    return {"tipo": TIPO_DATOS, "modelo": modelo, "trazabilidad": trazabilidad}


def _bloque_datos(modelo: Mapping, trazabilidad: Optional[Mapping]) -> str:
    """JSON canónico con <, > y & escapados: el bloque no puede cerrarse ni abrir comentarios."""
    datos = canonico(_envoltorio(modelo, trazabilidad))
    datos = datos.replace("&", "\\u0026").replace("<", "\\u003c").replace(">", "\\u003e")
    return f'<script type="application/json" id="{ID_DATOS}">{datos}</script>'


def _primera_pagina(modelo: Mapping) -> str:
    nota = modelo.get("nota_preliminar") or []
    parrafos = [nota] if isinstance(nota, str) else list(nota)
    partes = ['<section class="nota"><h2>Carácter preliminar</h2>']
    partes += [f"<p>{_valor(p)}</p>" for p in parrafos]
    partes.append("</section>")
    datos = {k: modelo[k] for k in _DATOS_EXPEDIENTE if k in modelo}
    encabezado = modelo.get("encabezado")
    if isinstance(encabezado, Mapping):
        datos.update({k: v for k, v in encabezado.items() if k not in datos})
    else:
        datos["encabezado"] = encabezado
    partes.append('<section class="expediente"><h2>Datos del expediente</h2>')
    partes.append(_dl(datos, ("expediente", *hu.CAMPOS_ENCABEZADO, *_DATOS_EXPEDIENTE[1:])))
    partes.append("</section>")
    if "normas_consultadas" in modelo:      # con su vigencia, en la primera página (AC-11)
        partes.append(f'<section class="normas"><h2>Normas consultadas</h2>{_valor(modelo["normas_consultadas"])}'
                      "</section>")
    return "".join(partes)


def _secciones(modelo: Mapping) -> str:
    partes = []
    conocidas = [(k, t) for k, t in SECCIONES if k in modelo]
    otras = [(k, _nombre(k)) for k in _ordenadas(modelo) if k not in _CONSUMIDAS]
    for clave, titulo in conocidas + otras:
        valor = modelo[clave]
        if clave == "aviso_no_vigente" and not valor:
            continue
        partes.append(f"<section><h2>{escape(titulo)}</h2>{_valor(valor)}</section>")
    return "".join(partes)


def _trazabilidad(trazabilidad: Optional[Mapping]) -> str:
    if trazabilidad is None:
        return ""
    return (f'<section class="trazabilidad" {MARCA_TRAZABILIDAD}><h2>Trazabilidad</h2>'
            f"{_dl(trazabilidad, ('emitido_por', 'nombre', 'emitido_en'))}</section>")


def render(modelo: Mapping, huella: Optional[str] = None, trazabilidad: Optional[Mapping] = None,
           regenerado: bool = False) -> str:
    """Documento HTML autocontenido del modelo; `huella` se calcula si no se da. `regenerado` rotula el
    contenido regenerado por código (el pie lleva entonces el código de la emisión que se le da)."""
    token = _formato.set(modelo.get("formato_informe"))
    try:
        return _render(modelo, huella, trazabilidad, regenerado)
    finally:
        _formato.reset(token)


def _render(modelo: Mapping, huella: Optional[str], trazabilidad: Optional[Mapping], regenerado: bool) -> str:
    huella = huella or hu.huella(modelo)
    version = modelo.get("version")
    expediente = escape(str(modelo.get("expediente", "no consta")))
    pie = f"Código de huella: {escape(hu.codigo(huella))} · Expediente: {expediente}"
    if version == "revisor":
        pie += " · Uso interno"
    if regenerado:
        pie += f" · {escape(MARCA_REGENERADO)}"
    cuerpo = [f'<header class="regenerado">{escape(MARCA_REGENERADO)}</header>' if regenerado else "",
              f'<header class="uso-interno">{escape(USO_INTERNO)}</header>' if version == "revisor" else "",
              f"<main><h1>{escape(TITULO)}</h1>",
              f"<p>Versión: {_valor(version)}</p>" if version is not None else "",
              _primera_pagina(modelo), _secciones(modelo), _trazabilidad(trazabilidad), "</main>",
              f'<footer class="pie">{pie}</footer>', _bloque_datos(modelo, trazabilidad)]
    return ("<!DOCTYPE html>\n<html lang=\"es\"><head><meta charset=\"utf-8\">"
            "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
            f"<title>{escape(TITULO)}</title><style>{ESTILOS}</style></head>"
            f"<body>{''.join(cuerpo)}</body></html>\n")


def estructurada(modelo: Mapping, trazabilidad: Optional[Mapping] = None) -> str:
    """Forma estructurada: JSON canónico con el modelo (misma huella) y la trazabilidad aparte."""
    return canonico(_envoltorio(modelo, trazabilidad))


# --- extracción y texto visible -----------------------------------------------------------------

CLAVES_SOBRE = ("tipo", "modelo", "trazabilidad")


def _sin_claves_repetidas(pares):
    claves = [k for k, _ in pares]
    if len(claves) != len(set(claves)):
        raise ValueError("clave repetida")
    return dict(pares)


BOM = "\ufeff"


def quitar_bom(texto: str) -> str:
    """Quita un BOM UTF-8 inicial (U+FEFF), que algunos editores agregan al guardar; solo uno (N3)."""
    return texto[1:] if texto.startswith(BOM) else texto


def extraer(contenido) -> Optional[tuple]:
    """(modelo, trazabilidad) de un documento o una forma estructurada del sistema; None si no lo es.
    El sobre debe tener exactamente las claves del sistema y ninguna clave repetida."""
    if isinstance(contenido, (bytes, bytearray)):
        try:
            contenido = bytes(contenido).decode("utf-8")
        except UnicodeDecodeError:
            return None
    if not isinstance(contenido, str):
        return None
    contenido = quitar_bom(contenido)
    if contenido.lstrip().startswith("{"):
        datos = contenido
    else:
        bloques = _BLOQUE.findall(contenido)
        if len(bloques) != 1:
            return None
        datos = bloques[0]
    try:
        obj = json.loads(datos, object_pairs_hook=_sin_claves_repetidas)
    except ValueError:
        return None
    if not isinstance(obj, dict) or set(obj) != set(CLAVES_SOBRE) or obj.get("tipo") != TIPO_DATOS \
            or not isinstance(obj.get("modelo"), dict):
        return None
    trazabilidad = obj.get("trazabilidad")
    if trazabilidad is not None and not isinstance(trazabilidad, dict):
        return None
    return obj["modelo"], trazabilidad


_VACIAS = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}
_OCULTAS = {"head", "script", "style", "template"}


class _Texto(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.partes: list = []
        self.omitir = 0

    def handle_starttag(self, tag, attrs):
        if tag in _VACIAS:
            return
        if self.omitir or tag in _OCULTAS or any(nombre == MARCA_TRAZABILIDAD for nombre, _ in attrs):
            self.omitir += 1

    def handle_endtag(self, tag):
        if self.omitir and tag not in _VACIAS:
            self.omitir -= 1

    def handle_data(self, data):
        if not self.omitir:
            self.partes.append(data)


def normalizar_documento(documento: str) -> str:
    """Lo único que se tolera al comparar un documento: un BOM inicial, saltos CRLF (o CR) y el salto de
    línea final."""
    return quitar_bom(documento).replace("\r\n", "\n").replace("\r", "\n").rstrip("\n")


def mismo_documento(documento: str, modelo: Mapping, huella: str, trazabilidad: Optional[Mapping]) -> bool:
    """¿El documento es, completo, el render del modelo con su huella y su trazabilidad (ADR-0002)?"""
    return normalizar_documento(documento) == normalizar_documento(render(modelo, huella, trazabilidad))


def texto_visible(documento: str) -> str:
    """Texto que ve el lector, sin cabecera, datos embebidos ni bloque de trazabilidad; espacios colapsados."""
    parser = _Texto()
    parser.feed(documento)
    parser.close()
    return _ESPACIOS.sub(" ", " ".join(parser.partes)).strip()
