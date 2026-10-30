"""T10 — evaluar expediente (AC-01 a AC-06, AC-21)."""
import copy
import glob
import json
import time
import unittest

from precheck.errores import ErrorPreCheck
from precheck.expediente import servicio as exp
from precheck.reglas import servicio as reglas
from tests.apoyo import RAIZ, Entorno, equipo, version_vigente

CATALOGO = [r for f in sorted(glob.glob(str(RAIZ / "reglas/*.json"))) for r in json.load(open(f, encoding="utf-8"))]


def caso(nombre="plot_1zm6_excede", fecha="2025-06-01"):
    h = json.loads((RAIZ / f"tests/casos/{nombre}.json").read_text(encoding="utf-8"))
    if fecha:
        h["expediente"] = {"fecha_presentacion": {"valor": fecha, "confianza": 1.0,
                                                  "fuente": {"metodo": "declarado", "documento": "formulario"}}}
    return h


class TestEvaluar(unittest.TestCase):
    def setUp(self):
        self.e = equipo(Entorno())
        reglas.proponer(self.e.como("cuenta-0003"), CATALOGO)
        for rid in ("PLOT-ZM6-LOTE-FRENTE", "PLOT-ZM6-DENSIDAD", "PLOT-ZM6-ACERA"):
            reglas.aprobar(self.e.como("cuenta-0001"), rid, version_vigente(rid))
        self.revisor = self.e.como("cuenta-0004")

    def tearDown(self):
        self.e.cerrar()

    def por_regla(self, ev):
        return {r.regla_id: r for r in ev.resultados}

    def test_evaluacion_completa_registrada(self):
        # AC-01
        ev = exp.evaluar(self.revisor, "EXP-TEST-0001", caso())
        r = self.por_regla(ev)["PLOT-ZM6-LOTE-FRENTE"]
        self.assertEqual((r.resultado, r.indicativo, r.version, r.estado_regla), ("NO_CUMPLE", None, version_vigente("PLOT-ZM6-LOTE-FRENTE"), "aprobada"))
        self.assertTrue(r.cita_textual)
        self.assertEqual(r.valores_usados["lote.frente_m"]["valor"], 15.2)
        self.assertEqual(self.por_regla(ev)["PLOT-ZM6-DENSIDAD"].resultado, "CUMPLE")
        eventos = list(self.e.repo.leer("expediente:EXP-TEST-0001"))
        self.assertEqual([(x.tipo, x.actor, x.seq) for x in eventos], [("evaluacion", "P-0004", ev.seq)])
        self.assertEqual(eventos[0].hash, ev.hash)
        self.assertIn(("expediente:EXP-TEST-0001", ev.seq), self.e.repo.usos("PLOT-ZM6-LOTE-FRENTE", version_vigente("PLOT-ZM6-LOTE-FRENTE")))

    def test_version_a_la_fecha_de_presentacion(self):
        # AC-02: antes del inicio de vigencia (2021-09-15) la regla no rige
        ev = exp.evaluar(self.revisor, "EXP-TEST-0002", caso(fecha="2020-01-10"))
        self.assertNotIn("PLOT-ZM6-LOTE-FRENTE", self.por_regla(ev))
        self.assertEqual(ev.fecha_presentacion, "2020-01-10")

    def test_sin_fecha_de_presentacion_no_evalua(self):
        # AC-03
        with self.assertRaises(ErrorPreCheck) as cm:
            exp.evaluar(self.revisor, "EXP-TEST-0003", caso(fecha=None))
        self.assertEqual(cm.exception.codigo, "expediente.sin_fecha_presentacion")
        self.assertEqual(list(self.e.repo.leer("expediente:EXP-TEST-0003")), [])

    def test_ceus_prevalece_sobre_el_documento_grafico(self):
        # AC-04: el mapa dice 1R1, la CEUS dice 1ZM6
        h = caso()
        h["lote"]["codigo_zona"]["valor"] = "1R1"
        h["lote"]["ceus"] = {"valor": "1ZM6", "confianza": 1.0, "fuente": {"metodo": "ceus", "documento": "CEUS-TEST"}}
        ev = exp.evaluar(self.revisor, "EXP-TEST-0004", h)
        self.assertEqual(ev.zona, {"ceus": "1ZM6", "documento_grafico": "1R1", "usada": "1ZM6"})
        r = self.por_regla(ev)["PLOT-ZM6-LOTE-FRENTE"]
        self.assertEqual(r.resultado, "NO_CUMPLE")
        self.assertIn("discrepancia CEUS/Documento Gráfico", r.advertencias)
        payload = list(self.e.repo.leer("expediente:EXP-TEST-0004"))[0].payload
        self.assertEqual(payload["zona"]["documento_grafico"], "1R1")

    def test_sin_ceus_se_advierte(self):
        ev = exp.evaluar(self.revisor, "EXP-TEST-0005", caso())
        self.assertIn("sin CEUS", self.por_regla(ev)["PLOT-ZM6-LOTE-FRENTE"].advertencias)
        self.assertEqual(ev.zona["usada"], "1ZM6")

    def test_dato_con_confianza_baja_va_a_revision(self):
        # AC-05
        h = caso()
        h["lote"]["frente_m"]["confianza"] = 0.5
        r = self.por_regla(exp.evaluar(self.revisor, "EXP-TEST-0006", h))["PLOT-ZM6-LOTE-FRENTE"]
        self.assertEqual(r.resultado, "REQUIERE_REVISION")
        self.assertIn("confianza", r.motivo)

    def test_borrador_da_revision_con_indicativo(self):
        # AC-06: PLOT-ZM6-ALTURA sigue en borrador y 16 > 15 pisos
        r = self.por_regla(exp.evaluar(self.revisor, "EXP-TEST-0007", caso()))["PLOT-ZM6-ALTURA"]
        self.assertEqual((r.resultado, r.indicativo, r.estado_regla), ("REQUIERE_REVISION", "NO_CUMPLE", "borrador"))
        self.assertIn("no oficial", r.motivo)

    def test_cobertura_declara_lo_evaluado_y_lo_que_falta(self):
        # AC-21
        h = caso()
        h["lote"]["norma_aplicable"]["valor"] = "MIVIOT"
        ev = exp.evaluar(self.revisor, "EXP-TEST-0008", h)
        self.assertIn("MIVIOT", ev.cobertura.normas_sin_reglas)
        ev2 = exp.evaluar(self.revisor, "EXP-TEST-0009", caso())
        self.assertGreater(ev2.cobertura.normas_evaluadas["PLOT-A61-2021"], 0)
        self.assertGreater(ev2.cobertura.reglas_sin_aprobar, 0)
        self.assertEqual(ev2.cobertura.normas_sin_reglas, ())
        self.assertFalse(hasattr(ev2, "resultado_global"))

    def test_solo_un_revisor_evalua(self):
        with self.assertRaises(ErrorPreCheck) as cm:
            exp.evaluar(self.e.como("cuenta-0003"), "EXP-TEST-0010", caso())
        self.assertEqual(cm.exception.codigo, "identidad.sin_rol")

    def test_tiempo_por_expediente(self):
        t = time.perf_counter()
        exp.evaluar(self.revisor, "EXP-TEST-0011", copy.deepcopy(caso("sf_paitilla_ut7")))
        self.assertLessEqual(time.perf_counter() - t, 10.0)


if __name__ == "__main__":
    unittest.main()


class TestFechaYCeus(unittest.TestCase):
    """Review M6 y M8."""

    def setUp(self):
        self.e = equipo(Entorno())
        reglas.proponer(self.e.como("cuenta-0003"), CATALOGO)
        reglas.aprobar(self.e.como("cuenta-0001"), "PLOT-ZM6-LOTE-FRENTE", version_vigente("PLOT-ZM6-LOTE-FRENTE"))
        self.rev = self.e.como("cuenta-0004")

    def tearDown(self):
        self.e.cerrar()

    def test_fecha_con_formato_o_confianza_invalidos_se_rechaza(self):
        for i, (valor, confianza) in enumerate([("2026-5-1", 1.0), ("01/05/2026", 1.0),
                                                 ("2026-05-01T10:00:00-05:00", 1.0), ("2025-06-01", 0.4)]):
            h = caso()
            h["expediente"]["fecha_presentacion"].update(valor=valor, confianza=confianza)
            with self.subTest(valor=valor, confianza=confianza), self.assertRaises(ErrorPreCheck) as cm:
                exp.evaluar(self.rev, f"EXP-TEST-07{i:02d}", h)
            self.assertEqual(cm.exception.codigo, "expediente.fecha_invalida")

    def test_ceus_conserva_su_confianza(self):
        h = caso()
        h["lote"]["ceus"] = {"valor": "1ZM6", "confianza": 0.4, "fuente": {"metodo": "ocr", "documento": "CEUS-TEST"}}
        ev = exp.evaluar(self.rev, "EXP-TEST-0710", h)
        r = {x.regla_id: x for x in ev.resultados}["PLOT-ZM6-LOTE-FRENTE"]
        self.assertEqual(r.resultado, "REQUIERE_REVISION")
        self.assertEqual(r.valores_usados["lote.codigo_zona"]["confianza"], 0.4)
