"""Catálogos de las zonas exceptuadas del PLOT (Art. 3): normas del MIVIOT y Ley 21.

Cada catálogo `reglas/reglas_<nombre>_borrador.json` se contrasta con su transcripción cotejada en
`normativa/zonas-exceptuadas/textos/`: la cita debe estar literal y en la página del PDF que declara la regla.
"""
import ast
import datetime as dt
import json
import pathlib
import re
import unittest

from precheck.motor.evaluador import NO_APLICA, REVISION, evaluar_regla
from precheck.motor.verificar_citas import norm
from precheck.reglas.gobierno import NORMAS, norma_de

RAIZ = pathlib.Path(__file__).resolve().parent.parent
TEXTOS = RAIZ / "normativa/zonas-exceptuadas/textos"
README = RAIZ / "normativa/zonas-exceptuadas/README.md"

#: norma → (catálogo, transcripción)
CATALOGOS = {
    "MIVIOT-CA-R127-2003": ("reglas_casco_antiguo_borrador.json", "res127_2003_casco_antiguo.txt"),
    "MIVIOT-PV-R352-2006": ("reglas_panama_viejo_borrador.json", "res352_2006_panama_viejo.txt"),
    "LEY21-1997": ("reglas_ley21_borrador.json", "ley21_1997.txt"),
    "MIVIOT-AC-R160-2002": ("reglas_area_canal_borrador.json", "res160_2002_area_canal.txt"),
    "MIVIOT-CDE": ("reglas_costa_del_este_borrador.json", "costa_del_este.txt"),
    "MIVIOT-ML1": ("reglas_metro_l1_borrador.json", "metro_l1.txt"),
    "MIVIOT-ML2": ("reglas_metro_l2_borrador.json", "metro_l2.txt"),
    "MIVIOT-LC-R15-1992": ("reglas_la_cresta_borrador.json", "res15_1992_la_cresta.txt"),
    "MIVIOT-EC-R192-2013": ("reglas_el_carmen_borrador.json", "res192_2013_el_carmen.txt"),
}
TIPOS = {"cuantitativa", "criterio", "documental"}
_PAGINA = re.compile(r"\[\[pág (\d+) del PDF\]\]")
_ZONAS = re.compile(r"lote\.codigo_zona\s*(?:in\s*\[([^\]]*)\]|==\s*'([^']*)')")
#: Cita mínima: sin espacios, al menos esto. «5 m» no identifica un pasaje de la norma.
MIN_CITA = 8


def paginas(texto: str) -> dict[int, str]:
    """Secciones de la transcripción por página del PDF («[[pág N del PDF]]»)."""
    partes = _PAGINA.split(texto)
    secciones: dict[int, str] = {}
    for i in range(1, len(partes) - 1, 2):  # una página puede tener varios tramos transcritos
        secciones[int(partes[i])] = secciones.get(int(partes[i]), "") + partes[i + 1]
    return secciones


def cargar(nombre: str) -> list[dict]:
    datos = json.loads((RAIZ / "reglas" / nombre).read_text(encoding="utf-8"))
    return datos.get("reglas", datos) if isinstance(datos, dict) else datos


def zonas_de(aplica_si: str) -> list[str]:
    m = _ZONAS.search(aplica_si)
    if not m:
        return []
    return [z.strip().strip("'\"") for z in m.group(1).split(",")] if m.group(1) is not None else [m.group(2)]


class TestCatalogos(unittest.TestCase):
    def test_cada_norma_del_catalogo_esta_registrada(self):
        for codigo in CATALOGOS:
            self.assertIn(codigo, NORMAS)
            self.assertTrue(NORMAS[codigo]["prefijos"], codigo)

    def test_transcripciones_con_encabezado_y_paginas(self):
        for codigo, (_, texto) in CATALOGOS.items():
            with self.subTest(codigo):
                t = (TEXTOS / texto).read_text(encoding="utf-8")
                self.assertIn("Transcripción cotejada", t[:1500])
                self.assertTrue(paginas(t), "sin marcas [[pág N del PDF]]")

    def test_reglas(self):
        vistos: set[str] = set()
        for otro in (RAIZ / "reglas").glob("*.json"):
            if otro.name not in {c for c, _ in CATALOGOS.values()}:
                vistos |= {r["id"] for r in cargar(otro.name)}
        for codigo, (catalogo, texto) in CATALOGOS.items():
            with self.subTest(codigo, catalogo=catalogo):
                self.assertTrue((RAIZ / "reglas" / catalogo).exists(), "falta el catálogo")
                self.assertTrue((TEXTOS / texto).exists(), "falta la transcripción")
                reglas = cargar(catalogo)
                self.assertTrue(reglas, "catálogo vacío")
            if not (RAIZ / "reglas" / catalogo).exists() or not (TEXTOS / texto).exists():
                continue
            secciones = {n: norm(s) for n, s in paginas((TEXTOS / texto).read_text(encoding="utf-8")).items()}
            for r in reglas:
                with self.subTest(codigo, regla=r.get("id")):
                    self._regla(r, codigo, secciones, vistos)

    def _regla(self, r, codigo, secciones, vistos):
        rid = r["id"]
        self.assertNotIn(rid, vistos, "id repetido")
        vistos.add(rid)
        self.assertEqual(norma_de(rid), codigo, "el prefijo del id no es el de su norma")
        self.assertEqual(r["estado_revision"], "borrador")
        self.assertIsInstance(r["version"], int)
        self.assertGreaterEqual(r["version"], 1)
        if r["version"] > 1:   # principio 4: una corrección es una versión nueva y dice qué cambió
            self.assertIn(f"Versión {r['version']}", r.get("nota", ""), "versión nueva sin explicar el cambio")
        self.assertIn(r["tipo"], TIPOS)
        self.assertTrue(r["titulo"] and r["mensaje_no_cumple"])
        self.assertIn(r["severidad"], {"bloqueante", "observacion"})
        dt.date.fromisoformat(r["vigencia"]["desde"])

        f = r["fuente"]
        cita, pag = f["cita_textual"], f["pagina_pdf"]
        self.assertTrue(f["norma"] and f["articulo"])
        self.assertGreaterEqual(len(norm(cita)), MIN_CITA, "cita demasiado corta")
        # Literal y en su página (o empezando en ella y siguiendo en la siguiente).
        self.assertIn(pag, secciones, f"la transcripción no tiene la página {pag}")
        self.assertIn(norm(cita), secciones[pag] + secciones.get(pag + 1, ""), f"cita no está en la pág {pag}")

        self.assertIn(f"lote.norma_aplicable == '{codigo}'", r["aplica_si"])
        ast.parse(r["aplica_si"].replace("true", "True").replace("false", "False"), mode="eval")
        if r["tipo"] == "cuantitativa":
            self.assertTrue(r.get("condicion") and r.get("entradas"), "cuantitativa sin condición o entradas")
            ast.parse(r["condicion"], mode="eval")
            for e in r["entradas"]:
                self.assertRegex(e, r"^[a-z_]+(\.[a-z0-9_]+)+$")
                self.assertIn(e, r["condicion"])

        # Con su norma y su zona, la regla aplica; sin datos del proyecto, una cuantitativa va a revisión.
        zonas = zonas_de(r["aplica_si"])
        solo_norma_y_zona = re.sub(r"lote\.norma_aplicable == '[^']*'|" + _ZONAS.pattern, "", r["aplica_si"])
        if zonas and not re.search(r"[a-z_]+\.[a-z_]", solo_norma_y_zona):
            hechos = {"lote": {"norma_aplicable": {"valor": codigo, "confianza": 1.0},
                               "codigo_zona": {"valor": zonas[0], "confianza": 1.0}}}
            res = evaluar_regla(r, hechos, 0.85)
            self.assertNotEqual(res["resultado"], NO_APLICA, "no aplica con su propia zona")
            if r["tipo"] == "cuantitativa":
                self.assertEqual(res["resultado"], REVISION)

    def test_citas_de_usos_traen_la_lista_de_actividades(self):
        """Una regla de usos cita la lista de actividades, no solo el encabezado de la ficha."""
        encabezados = ("Categoría y actividad:", "Intensidad (C1):", "Intensidad:", "tales como,")
        for codigo, (catalogo, _) in CATALOGOS.items():
            for r in cargar(catalogo):
                if r["id"].endswith("-USOS"):
                    with self.subTest(codigo, regla=r["id"]):
                        self.assertFalse(r["fuente"]["cita_textual"].rstrip().endswith(encabezados),
                                         "la cita termina en el encabezado de la lista")
        ml2 = {r["id"]: r for r in cargar("reglas_metro_l2_borrador.json")}
        cita = ml2["ML2-C2-USOS"]["fuente"]["cita_textual"]
        for actividad in ("Abasto: Minisúper", "Hospedaje público: Actividades hoteleras", "centro comercial."):
            self.assertIn(actividad, cita)

    def test_estacionamientos_casco_antiguo_solo_si_se_proponen(self):
        reglas = {r["id"]: r for r in cargar("reglas_casco_antiguo_borrador.json")}
        r = reglas["CA-TODAS-ESTACIONAMIENTOS-3-ORDEN"]
        self.assertEqual(r["severidad"], "observacion")   # el Art. 29 permite, no exige
        # CA-TODAS-ESTACIONAMIENTOS-4-ORDEN se retiró el 2026-10-08 (catálogo definitivo, reglas_retiradas/): la conversión
        # a edificio de estacionamientos es facultativa y su único límite lo verifica CA-TODAS-ALTURA-4-ORDEN-PISOS.
        for rid, orden in (("CA-TODAS-ESTACIONAMIENTOS-1Y2-ORDEN", "primer"),
                           ("CA-TODAS-ESTACIONAMIENTOS-3-ORDEN", "tercer")):
            lote = {"norma_aplicable": "MIVIOT-CA-R127-2003", "codigo_zona": "RMH1", "orden_conservacion": orden}
            with self.subTest(rid):
                sin = evaluar_regla(reglas[rid], {"lote": lote, "proyecto": {"estacionamientos": 0}}, 0.85)
                self.assertEqual(sin["resultado"], NO_APLICA)
                falta = evaluar_regla(reglas[rid], {"lote": lote, "proyecto": {}}, 0.85)
                self.assertEqual(falta["resultado"], REVISION)
        lote = {"norma_aplicable": "MIVIOT-CA-R127-2003", "codigo_zona": "RMH1", "orden_conservacion": "tercer"}
        con = evaluar_regla(r, {"lote": lote, "proyecto": {"estacionamientos": 4}}, 0.85)
        self.assertEqual(con["resultado"], REVISION)

    def test_readme_documenta_cada_norma(self):
        t = README.read_text(encoding="utf-8")
        for codigo, (catalogo, _texto) in CATALOGOS.items():
            with self.subTest(codigo):
                self.assertIn(codigo, t)
                self.assertIn(catalogo, t)


if __name__ == "__main__":
    unittest.main()
