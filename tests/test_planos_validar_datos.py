import unittest

from precheck.planos.validar_datos import validar

REGLAS = [
    {"id": "A", "aplica_si": "lote.norma_aplicable == 'PLOT' and lote.codigo_zona in ['R2', '1R2']"},
    {"id": "B", "aplica_si": "lote.norma_aplicable == 'PLOT' and lote.codigo_zona == 'RM3-C2'"},
]


def por_campo(avisos):
    return {a["campo"]: a for a in avisos}


class ZonaDeOtraNorma(unittest.TestCase):
    def test_r2a_existe_en_el_carmen(self):
        reglas = [
            {"aplica_si": "lote.norma_aplicable == 'PLOT-A61-2021' and lote.codigo_zona in ['R2', '1R2']"},
            {"aplica_si": "lote.norma_aplicable == 'MIVIOT-EC-R192-2013' and lote.codigo_zona in ['R2-A', 'R2-B']"},
        ]
        avisos = validar({"zona": "R2-A", "norma": "PLOT-A61-2021"}, reglas)
        self.assertEqual(len(avisos), 1)
        self.assertEqual(avisos[0]["norma_sugerida"], "MIVIOT-EC-R192-2013")
        self.assertIn("sí existe en MIVIOT-EC-R192-2013", avisos[0]["mensaje"])

    def test_en_su_norma_no_hay_aviso(self):
        reglas = [{"aplica_si": "lote.norma_aplicable == 'MIVIOT-EC-R192-2013' and lote.codigo_zona in ['R2-A']"}]
        self.assertEqual(validar({"zona": "R2-A", "norma": "MIVIOT-EC-R192-2013"}, reglas), [])


class ValidarDatos(unittest.TestCase):
    def test_zona_mal_escrita_sugiere_la_de_la_norma(self):
        a = por_campo(validar({"zona": "R2-A", "norma": "PLOT"}, REGLAS))["zona"]
        self.assertEqual(a["sugerencia"], "R2")
        self.assertIn("R2-A", a["mensaje"])

    def test_zona_valida_no_avisa(self):
        self.assertEqual(validar({"zona": "RM3-C2", "norma": "PLOT", "finca": "078850", "area_m2": 733.14, "corregimiento": "San Felipe"}, REGLAS), [])

    def test_zona_que_no_existe_pide_la_ceus(self):
        a = por_campo(validar({"zona": "XYZ9", "norma": "PLOT"}, REGLAS))["zona"]
        self.assertNotIn("sugerencia", a)
        self.assertIn("CEUS", a["mensaje"])

    def test_sin_norma_o_sin_zona_no_hay_nada_que_comparar(self):
        self.assertEqual(validar({"zona": "R2-A"}, REGLAS), [])
        self.assertEqual(validar({"norma": "PLOT"}, REGLAS), [])

    def test_finca_area_y_corregimiento(self):
        a = por_campo(validar({"finca": "07-6524", "area_m2": 0, "corregimiento": "Tocmen"}, REGLAS))
        self.assertEqual(a["finca"]["sugerencia"], "076524")
        self.assertEqual(a["area_m2"]["nivel"], "error")
        self.assertEqual(a["corregimiento"]["sugerencia"], "Tocumen")

    def test_corregimiento_en_mayusculas_y_sin_tildes_es_valido(self):
        self.assertEqual(validar({"corregimiento": "SAN FRANCISCO"}, REGLAS), [])
        self.assertEqual(validar({"corregimiento": "rio abajo"}, REGLAS), [])


if __name__ == "__main__":
    unittest.main()
