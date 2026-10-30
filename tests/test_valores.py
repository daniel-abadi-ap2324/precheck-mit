"""Forma de los valores antes del motor (precheck/planos/valores.py, ADR-0019)."""
import unittest

from precheck.motor.evaluador import evaluar_regla
from precheck.planos.valores import cargar, canonico, normalizar


def h(valor, confianza=0.9):
    return {"valor": valor, "confianza": confianza, "fuente": {"pagina": 1}}


class TestValores(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.contrato = cargar()

    def test_el_orden_de_conservacion_se_escribe_como_lo_compara_la_regla(self):
        # DeepSeek, Casco Antiguo, ronda 80: «TERCER ORDEN»; la regla compara con 'tercer'.
        e = self.contrato["lote.orden_conservacion"]
        for escrito, esperado in (("TERCER ORDEN", "tercer"), ("Tercer Orden", "tercer"), ("3er orden", "tercer"),
                                  ("4º orden", "cuarto"), ("Lote baldío", "baldio"), ("tercer", "tercer"),
                                  ("Edificio de Segundo Orden", "segundo")):
            with self.subTest(escrito=escrito):
                self.assertEqual(canonico(escrito, e), esperado)
        self.assertIsNone(canonico("monumento nacional", e))

    def test_lista_abierta_solo_corrige_la_escritura(self):
        e = self.contrato["lote.corregimiento"]
        self.assertEqual(canonico("SAN FELIPE", e), "San Felipe")
        self.assertEqual(canonico("Corregimiento de Curundu", e), "Curundú")
        self.assertIsNone(canonico("Bella Vista", e))
        res, avisos = normalizar({"lote": {"corregimiento": h("Bella Vista")}}, self.contrato)
        self.assertEqual(res["lote"]["corregimiento"]["valor"], "Bella Vista")
        self.assertEqual(avisos, [])

    def test_la_regla_aplica_con_el_valor_normalizado(self):
        regla = {"id": "R", "version": 1, "tipo": "cuantitativa", "severidad": "bloqueante",
                 "aplica_si": "lote.orden_conservacion == 'tercer'", "condicion": "proyecto.pisos_adicionales_frente == 0"}
        hechos = {"lote": {"orden_conservacion": h("TERCER ORDEN")}, "proyecto": {"pisos_adicionales_frente": h(0)}}
        self.assertEqual(evaluar_regla(regla, hechos, 0.85)["resultado"], "NO_APLICA")
        res, avisos = normalizar(hechos, self.contrato)
        self.assertEqual(res["lote"]["orden_conservacion"]["valor"], "tercer")
        self.assertEqual(res["lote"]["orden_conservacion"]["valor_leido"], "TERCER ORDEN")
        self.assertTrue(avisos[0].startswith("FORMA: lote.orden_conservacion"))
        self.assertEqual(evaluar_regla(regla, res, 0.85)["resultado"], "CUMPLE")

    def test_lista_cerrada_fuera_de_lista_queda_faltante(self):
        res, avisos = normalizar({"lote": {"orden_conservacion": h("monumento")}}, self.contrato)
        self.assertIsNone(res["lote"]["orden_conservacion"]["valor"])
        self.assertEqual(res["lote"]["orden_conservacion"]["valor_leido"], "monumento")
        self.assertTrue(avisos[0].startswith("VALOR_SIN_FORMA: lote.orden_conservacion"))
        regla = {"id": "R", "version": 1, "tipo": "cuantitativa", "severidad": "bloqueante",
                 "aplica_si": "lote.orden_conservacion == 'tercer'", "condicion": "true"}
        self.assertEqual(evaluar_regla(regla, res, 0.85)["resultado"], "REQUIERE_REVISION")

    def test_si_no_y_numeros_escritos_como_texto(self):
        hechos = {"proyecto": {"obra_nueva": h("false"), "altura_m": h("12.60 m"), "patio_m2": h("149,52 m2")},
                  "lote": {"area_m2": h("1,500.5"), "frente_m": h("veinte")}}
        res, avisos = normalizar(hechos, self.contrato)
        self.assertIs(res["proyecto"]["obra_nueva"]["valor"], False)
        self.assertEqual(res["proyecto"]["altura_m"]["valor"], 12.6)
        self.assertEqual(res["proyecto"]["patio_m2"]["valor"], 149.52)
        self.assertEqual(res["lote"]["area_m2"]["valor"], 1500.5)
        self.assertIsNone(res["lote"]["frente_m"]["valor"])
        self.assertEqual(len(avisos), 5)

    def test_si_no_donde_va_un_numero(self):
        # El motor compara true como 1: con `rotura_cordon_m > 0` y `<= 7.5`, true salía CUMPLE sin medida.
        regla = {"id": "R", "version": 1, "tipo": "cuantitativa", "severidad": "bloqueante",
                 "aplica_si": "acceso_vehicular.rotura_cordon_m > 0", "condicion": "acceso_vehicular.rotura_cordon_m <= 7.5"}
        res, avisos = normalizar({"acceso_vehicular": {"rotura_cordon_m": h(True)}}, self.contrato)
        self.assertIsNone(res["acceso_vehicular"]["rotura_cordon_m"]["valor"])
        self.assertIs(res["acceso_vehicular"]["rotura_cordon_m"]["valor_leido"], True)
        self.assertIn("no dice cuánto", avisos[0])
        self.assertEqual(evaluar_regla(regla, res, 0.85)["resultado"], "REQUIERE_REVISION")
        for escrito in (False, "no", "false"):
            with self.subTest(escrito=escrito):
                res, avisos = normalizar({"proyecto": {"estacionamientos": {"cantidad": h(escrito)}}}, self.contrato)
                self.assertEqual(res["proyecto"]["estacionamientos"]["cantidad"]["valor"], 0)
                self.assertTrue(avisos[0].startswith("FORMA: proyecto.estacionamientos.cantidad"))
        res, avisos = normalizar({"lote": {"frente_m": h("sí")}}, self.contrato)
        self.assertIsNone(res["lote"]["frente_m"]["valor"])
        # Un sí/no donde va un sí/no no cambia.
        res, avisos = normalizar({"proyecto": {"obra_nueva": h(True)}}, self.contrato)
        self.assertIs(res["proyecto"]["obra_nueva"]["valor"], True)
        self.assertEqual(avisos, [])

    def test_no_toca_la_zona_ni_lo_definido_ni_la_entrada(self):
        hechos = {"lote": {"codigo_zona": h("1r2"), "orden_conservacion": {**h("monumento"), "definido": True}}}
        res, avisos = normalizar(hechos, self.contrato)
        self.assertEqual(res["lote"]["codigo_zona"]["valor"], "1r2")
        self.assertEqual(res["lote"]["orden_conservacion"]["valor"], "monumento")
        self.assertEqual(hechos["lote"]["orden_conservacion"]["valor"], "monumento")
        self.assertEqual(avisos, [])

    def test_no_toca_el_tramite_aunque_el_contrato_lo_declare_mal(self):
        contrato = {**self.contrato, "tramite": {"clave": "tramite", "tipo": "bool"}}
        res, avisos = normalizar({"tramite": h("RLA")}, contrato)
        self.assertEqual(res["tramite"]["valor"], "RLA")
        self.assertEqual(avisos, [])

    def test_es_idempotente(self):
        res, _ = normalizar({"lote": {"orden_conservacion": h("TERCER ORDEN"), "area_m2": h("733.14 m2")}}, self.contrato)
        otra, avisos = normalizar(res, self.contrato)
        self.assertEqual(otra, res)
        self.assertEqual(avisos, [])


if __name__ == "__main__":
    unittest.main()
