"""precheck/planos/sensatez.py: cuentas del sistema y revisión de sentido común de los hechos."""
import unittest

from precheck.planos.sensatez import CONFIANZA_DUDOSO, aplicar


def h(valor, confianza=0.9):
    return {"valor": valor, "confianza": confianza}


class TestCalculo(unittest.TestCase):
    def test_densidad_la_calcula_el_sistema(self):
        # Casco Antiguo: 52.5 personas declaradas en un lote de 733.14 m² = 716 pers/ha.
        hechos = {"lote": {"area_m2": h(733.14)}, "proyecto": {"personas_total": h(52.5, 0.85), "densidad_pers_ha": h(52.5, 0.85)}}
        res, avisos = aplicar(hechos)
        d = res["proyecto"]["densidad_pers_ha"]
        self.assertEqual(d["valor"], 716.1)
        self.assertEqual(d["confianza"], 0.85)
        self.assertTrue(any(a.startswith("CALCULO:") for a in avisos))

    def test_densidad_bien_escrita_no_se_toca(self):
        hechos = {"lote": {"area_m2": h(733.14)}, "proyecto": {"personas_total": h(52.5), "densidad_pers_ha": h(716)}}
        res, avisos = aplicar(hechos)
        self.assertEqual(res["proyecto"]["densidad_pers_ha"]["valor"], 716)
        self.assertEqual(avisos, [])


class TestSensatez(unittest.TestCase):
    def test_densidad_que_parece_el_numero_de_personas(self):
        # DeepSeek, ronda 45: escribió 52.5 pers/ha (las personas) sin dividir entre el área.
        res, avisos = aplicar({"lote": {"area_m2": h(733.14)}, "proyecto": {"densidad_pers_ha": h(52.5, 0.85), "unidades_vivienda": h(25)}})
        self.assertEqual(res["proyecto"]["densidad_pers_ha"]["confianza"], CONFIANZA_DUDOSO)
        self.assertIn("proyecto.personas_total", avisos[0])
        # Una casa en un lote pequeño (4 personas, 1 vivienda) no es un error.
        _, avisos = aplicar({"lote": {"area_m2": h(177.75)}, "proyecto": {"densidad_pers_ha": h(225), "unidades_vivienda": h(1)}})
        self.assertEqual(avisos, [])

    def test_alturas_en_cero_y_disciplina_si(self):
        res, avisos = aplicar({"proyecto": {"altura_m": h(0), "pisos_totales": h(4)}, "profesional": {"disciplina": h("sí")}})
        # ADR-0019: una altura de 0 m dice «no la encontré» (Sonnet y DeepSeek en Casco Antiguo, ronda 80): queda faltante.
        self.assertIsNone(res["proyecto"]["altura_m"]["valor"])
        self.assertEqual(res["proyecto"]["altura_m"]["valor_leido"], 0)
        self.assertEqual(res["profesional"]["disciplina"]["confianza"], CONFIANZA_DUDOSO)
        self.assertEqual([a.split(":")[0] for a in avisos], ["DATO_DESCARTADO", "DATO_DUDOSO"])

    def test_altura_que_no_cuadra_con_los_pisos(self):
        res, _ = aplicar({"proyecto": {"altura_m": h(54.25), "pisos_totales": h(3)}})
        self.assertEqual(res["proyecto"]["altura_m"]["confianza"], CONFIANZA_DUDOSO)
        # Una nave de un piso puede ser muy alta; el entrepiso en 0 es «no aplica».
        _, avisos = aplicar({"proyecto": {"altura_m": h(15.7), "pisos_totales": h(1), "altura_libre_entrepiso_m": h(0)}})
        self.assertEqual(avisos, [])
        res, avisos = aplicar({"proyecto": {"altura_m": h(54.25), "pisos_totales": h(16)}})
        self.assertEqual(res["proyecto"]["altura_m"]["confianza"], 0.9)
        self.assertEqual(avisos, [])

    def test_porcentaje_fuera_de_rango_y_no_baja_confianzas_ya_bajas(self):
        res, _ = aplicar({"proyecto": {"ocupacion_pct": h(120), "area_libre_pct": h(30, 0.4)}})
        self.assertEqual(res["proyecto"]["ocupacion_pct"]["confianza"], CONFIANZA_DUDOSO)
        self.assertEqual(res["proyecto"]["area_libre_pct"]["confianza"], 0.4)

    def test_no_modifica_la_entrada(self):
        hechos = {"proyecto": {"altura_m": h(0)}}
        aplicar(hechos)
        self.assertEqual(hechos["proyecto"]["altura_m"]["confianza"], 0.9)


if __name__ == "__main__":
    unittest.main()
