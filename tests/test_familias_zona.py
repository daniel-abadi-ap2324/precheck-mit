"""Familias de zona (normativa/zonificacion/datos/familias_zona.json, ADR-0016): cada nombre, uso, densidad y densidad
máxima sale de una cita literal del texto de la norma."""
import re
import unicodedata
import unittest
from pathlib import Path

from precheck.motor.familias import cargar
from precheck.motor.verificar_citas import cita_en_normativa, norm
from precheck.motor.zona import clave, codigos_de_norma
from precheck.planos.revisar import cargar_reglas

RAIZ = Path(__file__).resolve().parents[1]


def comparable(s: str) -> str:
    s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]", "", s.lower())


class TestFamiliasZona(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.familias = cargar()
        cls.textos = {}
        cls.reglas = cargar_reglas()

    def texto(self, archivo):
        if archivo not in self.textos:
            self.textos[archivo] = (RAIZ / archivo).read_text(encoding="utf-8")
        return self.textos[archivo]

    def test_hay_familias_del_area_del_canal_y_del_plot(self):
        normas = {f["norma"] for f in self.familias}
        self.assertEqual(normas, {"MIVIOT-AC-R160-2002", "PLOT-A61-2021"})
        self.assertEqual(sorted(f["codigo"] for f in self.familias if f["norma"] == "MIVIOT-AC-R160-2002"),
                         ["R1c", "R1d1", "R1d2", "R1d3", "R2c", "R2d1", "R2d2", "R2d3", "R3d1"])

    def test_cada_cita_esta_literal_en_su_texto(self):
        for f in self.familias:
            texto = norm(self.texto(f["fuente"]["archivo"]))
            for k, cita in f["fuente"].items():
                if k.startswith("cita_"):
                    with self.subTest(codigo=f["codigo"], cita=k):
                        self.assertTrue(cita_en_normativa(cita, texto), cita)

    def test_el_codigo_esta_en_la_cita_del_nombre(self):
        for f in self.familias:
            with self.subTest(codigo=f["codigo"]):
                self.assertIn(comparable(f["codigo"]), comparable(f["fuente"]["cita_nombre"]))

    def test_la_densidad_maxima_es_el_ultimo_numero_de_su_cita(self):
        for f in self.familias:
            with self.subTest(codigo=f["codigo"]):
                numeros = re.findall(r"\d[\d,]*", f["fuente"]["cita_densidad"])
                self.assertEqual(int(numeros[-1].replace(",", "")), f["densidad_max"])

    def test_la_cita_de_densidad_esta_en_el_articulo_del_codigo(self):
        for f in self.familias:
            seccion = f["fuente"].get("cita_seccion")
            if not seccion:
                continue
            with self.subTest(codigo=f["codigo"]):
                texto = norm(self.texto(f["fuente"]["archivo"]))
                inicio = texto.index(norm(seccion))
                # El artículo termina en el siguiente «ARTICULO N:» (las marcas de página «[[pág …]] ARTICULO N (…)» no
                # llevan dos puntos).
                siguiente = re.compile(r"ARTICULO\d+:").search(texto, inicio + len(norm(seccion)))
                self.assertIn(norm(f["fuente"]["cita_densidad"]), texto[inicio:siguiente.start() if siguiente else None])
                self.assertIn(comparable(f["codigo"]), comparable(seccion))

    def test_uso_y_densidad_salen_de_las_citas(self):
        for f in self.familias:
            citas = comparable(" ".join(v for k, v in f["fuente"].items() if k.startswith("cita_")))
            with self.subTest(codigo=f["codigo"]):
                self.assertIn({"residencial": "residencial", "mixto": "mixta"}[f["uso"]], citas)
                self.assertTrue(f"{f['densidad']}densidad" in citas or f"{f['densidad']}intensidad" in citas)

    def test_cada_codigo_lo_reconocen_las_reglas_de_su_norma(self):
        for norma in {f["norma"] for f in self.familias}:
            conocidos = {clave(c) for c in codigos_de_norma(self.reglas, norma)}
            for f in (f for f in self.familias if f["norma"] == norma):
                with self.subTest(codigo=f["codigo"]):
                    self.assertIn(clave(f["codigo"]), conocidos)


if __name__ == "__main__":
    unittest.main()
