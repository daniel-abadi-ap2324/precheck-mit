"""Decisión de respaldo del motor (precheck/motor/respaldo.py, ADR-0016): ninguna regla vigente queda sin decidir."""
import unittest

from precheck.motor.evaluador import evaluar_regla
from precheck.motor.respaldo import decision_motor, es_externo


def regla(condicion="proyecto.altura_m <= 10", aplica_si=None, severidad="bloqueante", tipo="cuantitativa", **extra):
    r = {"id": "R-1", "version": 1, "titulo": "Altura máxima", "tipo": tipo, "condicion": condicion,
         "severidad": severidad, **extra}
    if aplica_si:
        r["aplica_si"] = aplica_si
    return r


def dato(valor, confianza=0.95):
    return {"valor": valor, "confianza": confianza, "fuente": {"pagina": 2}}


def decidir(r, hechos):
    return decision_motor(r, evaluar_regla(r, hechos, 0.85), hechos)


class TestRespaldo(unittest.TestCase):
    def test_resultado_final_no_lleva_respaldo(self):
        self.assertIsNone(decidir(regla(), {"proyecto": {"altura_m": dato(8)}}))

    def test_dato_dudoso_se_usa_y_lleva_el_supuesto(self):
        d = decidir(regla(), {"proyecto": {"altura_m": dato(12, 0.6)}})
        self.assertEqual(d["resultado"], "NO_CUMPLE")
        self.assertEqual(d["supuestos"], [{"tipo": "dato_dudoso", "campo": "proyecto.altura_m", "valor": 12,
                                           "confianza": 0.6, "fuente": {"pagina": 2}}])

    def test_dato_que_falta_en_el_plano_es_observacion_falta_en_el_plano(self):
        d = decidir(regla(), {})
        self.assertEqual((d["resultado"], d["motivo"]), ("OBSERVACION", "falta en el plano: proyecto.altura_m"))
        self.assertEqual(d["supuestos"], [])

    def test_dato_externo_es_informacion_requerida(self):
        for campo in ("registro_publico.area_lote_m2", "expediente.memorial.adjunto", "expediente.no_objecion_metro.presente",
                      "expediente.bcbrp.aprobacion", "profesional.idoneidad_jtia_vigente", "lote.sf_unidad_territorial"):
            with self.subTest(campo=campo):
                self.assertTrue(es_externo(campo))
                d = decidir(regla(condicion=f"{campo} == true"), {})
                self.assertEqual(d["resultado"], "INFORMACION_REQUERIDA")
        for campo in ("expediente.propiedad_arrendada", "lote.servidumbre_fluvial_o_pluvial", "rampa.sentidos",
                      "expediente.requiere_bcbrp", "proyecto.altura_m"):
            with self.subTest(campo=campo):
                self.assertFalse(es_externo(campo))

    def test_dato_externo_leido_con_duda_es_informacion_requerida(self):
        # ADR-0018: la vigencia de la idoneidad no sale del sello del plano; leída con duda sigue pedida.
        r = regla(condicion="profesional.idoneidad_jtia_vigente == true")
        d = decidir(r, {"profesional": {"idoneidad_jtia_vigente": dato(True, 0.6)}})
        self.assertEqual(d["resultado"], "INFORMACION_REQUERIDA")
        self.assertIn("profesional.idoneidad_jtia_vigente", d["motivo"])

    def test_dato_que_decide_si_aplica_en_regla_bloqueante_es_observacion(self):
        r = regla(aplica_si="expediente.propiedad_arrendada == true")
        d = decidir(r, {"proyecto": {"altura_m": dato(8)}})
        self.assertEqual(d["resultado"], "OBSERVACION")
        self.assertEqual(d["motivo"], "el plano no indica expediente.propiedad_arrendada; si existe, aplica: Altura máxima")
        self.assertEqual(d["supuestos"], [])

    def test_dato_que_decide_si_aplica_en_regla_no_bloqueante_es_no_aplica_con_supuesto(self):
        r = regla(aplica_si="lote.servidumbre_fluvial_o_pluvial == true", severidad="observacion")
        d = decidir(r, {"proyecto": {"altura_m": dato(8)}})
        self.assertEqual(d["resultado"], "NO_APLICA")
        self.assertEqual(d["supuestos"], [{"tipo": "no_indicado", "campo": "lote.servidumbre_fluvial_o_pluvial"}])

    def test_regla_de_criterio_la_decide_el_revisor(self):
        d = decidir(regla(tipo="criterio"), {})
        self.assertEqual((d["resultado"], d["motivo"]), ("OBSERVACION", "regla de criterio: la decide el revisor"))

    def test_valor_en_el_borde_se_decide_con_el_valor_leido(self):
        d = decidir(regla(tolerancia=0.2), {"proyecto": {"altura_m": dato(10.1)}})
        self.assertEqual(d["resultado"], "NO_CUMPLE")
        self.assertEqual(d["supuestos"], [{"tipo": "borde", "regla": "R-1"}])

    def test_zona_dudosa_sin_zona_de_trabajo_es_informacion_requerida(self):
        r = regla(aplica_si="lote.codigo_zona == 'A1'")
        d = decidir(r, {"lote": {"codigo_zona": dato("A1", 0.5)}, "proyecto": {"altura_m": dato(8)}})
        self.assertEqual(d["resultado"], "INFORMACION_REQUERIDA")
        res = {"resultado": "REQUIERE_REVISION", "grupo": "zona_por_confirmar"}
        self.assertEqual(decision_motor(r, res, {}, "la CEUS o la unidad territorial")["motivo"],
                         "depende de la zona del lote: falta la CEUS o la unidad territorial")

    def test_regla_que_no_se_puede_evaluar_es_observacion(self):
        d = decidir(regla(condicion="proyecto.altura_m <= 'diez'"), {"proyecto": {"altura_m": dato(8)}})
        self.assertEqual(d["resultado"], "OBSERVACION")
        self.assertIn("no se pudo evaluar", d["motivo"])

    def test_regla_condicionada_por_un_permiso(self):
        res = {"resultado": "REQUIERE_REVISION", "permiso": "PERM-1", "motivo": "permiso especial PERM-1: decidir con «…»"}
        self.assertEqual(decision_motor(regla(), res, {})["resultado"], "OBSERVACION")


if __name__ == "__main__":
    unittest.main()
