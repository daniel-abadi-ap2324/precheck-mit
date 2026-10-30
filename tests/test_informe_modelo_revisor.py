"""T4 — modelo de la versión del revisor con corte temporal (AC-01, AC-02, AC-22)."""
import json
import unittest

from precheck.errores import ErrorExpediente
from precheck.informe.modelo import FORMATO_INFORME, Encabezado, proyectar
from tests.apoyo_informe import Bitacora, estado_reglas, resultado, valor

CLAVES = {"version", "formato_informe", "expediente", "evaluacion", "encabezado", "estado", "aviso_no_vigente",
          "observaciones", "resultados", "cumplimientos", "alcance", "cobertura", "normas_consultadas",
          "version_motor", "nota_preliminar"}


def resultados_mixtos():
    """Reglas aprobadas y no aprobadas, un NO_APLICA y un resultado que depende de la zona sin CEUS."""
    return [
        resultado("PLOT-ZM6-LOTE-FRENTE", "NO_CUMPLE",
                  valores={"lote.frente_m": valor(15.2, 0.95, metodo="declarado", documento="cuadro de áreas"),
                           "lote.codigo_zona": valor("1ZM6", 0.97, metodo="gis", documento="hoja 5-6G")},
                  advertencias=["sin CEUS"]),
        resultado("PLOT-ZM6-DENSIDAD", "CUMPLE"),
        resultado("PLOT-ZM6-ALTURA", "REQUIERE_REVISION", estado="borrador", indicativo="NO_CUMPLE",
                  motivo="regla en borrador: resultado no oficial (condición evaluada)"),
        resultado("A110-PDC-ACERA-ANCHO", "NO_APLICA", estado="borrador", valores={},
                  motivo="condición aplica_si falsa; regla no aprobada"),
    ]


class TestModeloRevisor(unittest.TestCase):
    def setUp(self):
        self.b = Bitacora()
        self.res = resultados_mixtos()
        self.ev = self.b.evaluar(self.res, normas_sin_reglas=["MIVIOT"])
        self.est = estado_reglas(self.res)

    def modelo(self, seq=None, eventos=None, encabezado=None):
        return proyectar(eventos if eventos is not None else self.b.eventos, self.est,
                         seq or self.ev, "revisor", encabezado)

    def por_regla(self, m):
        return {r["regla_id"]: r for r in m["resultados"]}

    def test_todos_los_resultados_con_su_respaldo(self):
        # AC-01
        self.b.decidir(self.ev, "PLOT-ZM6-LOTE-FRENTE", "confirmar", "frente medido 15.2 m en sitio")
        m = self.modelo()
        self.assertEqual(set(m), CLAVES)
        self.assertEqual((m["version"], m["formato_informe"], m["expediente"]), ("revisor", FORMATO_INFORME,
                                                                                 self.b.expediente))
        self.assertTrue(any("uso interno" in p for p in m["nota_preliminar"]))
        r = self.por_regla(m)
        self.assertEqual(set(r), {x["regla_id"] for x in self.res} | {"norma:MIVIOT"})
        self.assertEqual(r["A110-PDC-ACERA-ANCHO"]["resultado"], "NO_APLICA")
        frente = r["PLOT-ZM6-LOTE-FRENTE"]
        self.assertEqual((frente["version"], frente["cita_textual"], frente["oficial"]),
                         (1, "cita literal de PLOT-ZM6-LOTE-FRENTE", "oficial"))
        usado = frente["valores_usados"]["lote.frente_m"]
        self.assertEqual((usado["valor"], usado["confianza"], usado["fuente"]["documento"]),
                         (15.2, 0.95, "cuadro de áreas"))
        self.assertIn("sin CEUS", frente["advertencias"])
        altura = r["PLOT-ZM6-ALTURA"]
        self.assertEqual(altura["oficial"], "no oficial")
        self.assertEqual(altura["indicativo"], "NO_CUMPLE (no oficial)")
        self.assertEqual([(d["accion"], d["motivo"], d["actor"]) for d in frente["decisiones"]],
                         [("confirmar", "frente medido 15.2 m en sitio", "P-0004")])
        self.assertEqual(m["cobertura"]["normas_sin_reglas"], ["MIVIOT"])
        self.assertEqual(m["cobertura"]["reglas_sin_aprobar"], 1)
        self.assertEqual(m["evaluacion"]["seq"], self.ev)
        self.assertEqual(m["evaluacion"]["hash"], self.b.evaluacion(self.ev).hash)
        self.assertEqual(m["version_motor"], "1.0.0")

    def test_sin_reglas_aprobadas_todo_sale_como_no_oficial(self):
        res = [resultado("PLOT-ZM6-ALTURA", "REQUIERE_REVISION", estado="borrador", indicativo="CUMPLE"),
               resultado("PLOT-ZM6-DENSIDAD", "REQUIERE_REVISION", estado="borrador", indicativo="NO_CUMPLE")]
        b = Bitacora()
        seq = b.evaluar(res)
        m = proyectar(b.eventos, estado_reglas(res), seq, "revisor", None)
        self.assertEqual(len(m["resultados"]), 2)
        for r in m["resultados"]:
            self.assertEqual(r["oficial"], "no oficial")
            self.assertIn("(no oficial)", r["indicativo"])

    def test_pendiente_enumera_lo_que_falta(self):
        # AC-02
        res = [resultado("PLOT-ZM6-LOTE-FRENTE", "NO_CUMPLE"),
               resultado("PLOT-ZM6-ALTURA", "REQUIERE_REVISION", estado="borrador", indicativo="NO_CUMPLE"),
               resultado("PLOT-ZM6-ACERA", "NO_CUMPLE", severidad="observacion"),
               resultado("PLOT-ZM6-DENSIDAD", "CUMPLE")]
        b = Bitacora()
        seq = b.evaluar(res, normas_sin_reglas=["MIVIOT"])
        m = proyectar(b.eventos, estado_reglas(res), seq, "revisor", None)
        self.assertEqual(m["estado"]["estado"], "pendiente de revisión humana")
        f = m["estado"]["faltantes"]
        self.assertEqual(f["decisiones"], ["PLOT-ZM6-ALTURA", "PLOT-ZM6-LOTE-FRENTE"])
        self.assertEqual(f["normas_sin_reglas"], ["norma:MIVIOT"])
        self.assertTrue(f["visto_bueno"])
        self.assertEqual(f["indicaciones"], ["PLOT-ZM6-ACERA"])

    def test_revisado_sin_faltantes(self):
        res = [resultado("PLOT-ZM6-LOTE-FRENTE", "NO_CUMPLE"), resultado("PLOT-ZM6-DENSIDAD", "CUMPLE")]
        b = Bitacora()
        seq = b.evaluar(res, normas_sin_reglas=["MIVIOT"])
        b.decidir(seq, "PLOT-ZM6-LOTE-FRENTE", "confirmar", "medido")
        b.decidir(seq, "norma:MIVIOT", "veredicto", "revisado a mano", veredicto="CUMPLE")
        b.visto_bueno(seq)
        b.indicar(seq, "PLOT-ZM6-LOTE-FRENTE", "Amplíe el frente a 16 m.")
        m = proyectar(b.eventos, estado_reglas(res), seq, "revisor", None)
        self.assertEqual(m["estado"], {"estado": "revisado", "faltantes": {
            "decisiones": [], "normas_sin_reglas": [], "visto_bueno": False, "indicaciones": []}})
        self.assertEqual(self.por_regla(m)["norma:MIVIOT"]["decisiones"][0]["motivo"], "revisado a mano")

    def test_evaluacion_anterior_avisa_que_no_es_la_vigente(self):
        # AC-22
        self.b.decidir(self.ev, "PLOT-ZM6-LOTE-FRENTE", "confirmar", "decisión sobre la primera")
        nueva = self.b.evaluar(self.res)
        m = self.modelo(self.ev)
        self.assertEqual(m["aviso_no_vigente"]["vigente"], nueva)
        self.assertIn(str(nueva), m["aviso_no_vigente"]["texto"])
        self.assertEqual(m["evaluacion"]["seq"], self.ev)
        self.assertEqual(self.por_regla(m)["PLOT-ZM6-LOTE-FRENTE"]["decisiones"][0]["motivo"],
                         "decisión sobre la primera")
        self.assertNotIn("PLOT-ZM6-LOTE-FRENTE", m["estado"]["faltantes"]["decisiones"])
        self.assertIsNone(self.modelo(nueva)["aviso_no_vigente"])
        self.assertIn("PLOT-ZM6-LOTE-FRENTE", self.modelo(nueva)["estado"]["faltantes"]["decisiones"])

    def test_corte_temporal_ignora_eventos_posteriores(self):
        cortados = list(self.b.eventos)
        self.b.decidir(self.ev, "PLOT-ZM6-LOTE-FRENTE", "confirmar", "posterior al corte")
        self.b.evaluar(self.res)
        m = self.modelo(eventos=cortados)
        self.assertEqual(self.por_regla(m)["PLOT-ZM6-LOTE-FRENTE"]["decisiones"], [])
        self.assertIsNone(m["aviso_no_vigente"])
        self.assertNotIn("posterior al corte", json.dumps(m, ensure_ascii=False))

    def test_encabezado_ausente_dice_no_consta(self):
        m = self.modelo()
        self.assertEqual(m["encabezado"], dict.fromkeys(
            ("tramite", "proyecto", "finca", "profesional", "idoneidad"), "no consta"))
        m = self.modelo(encabezado=Encabezado(tramite="RDP", profesional="Test User 9"))
        self.assertEqual((m["encabezado"]["tramite"], m["encabezado"]["profesional"], m["encabezado"]["finca"]),
                         ("RDP", "Test User 9", "no consta"))

    def test_funcion_pura_y_serializable(self):
        a, b = self.modelo(), self.modelo()
        self.assertEqual(a, b)
        texto = json.dumps(a, ensure_ascii=False, sort_keys=True)
        self.assertNotIn("aprobado", texto.lower())

    def test_evaluacion_inexistente(self):
        with self.assertRaises(ErrorExpediente) as cm:
            self.modelo(seq=99)
        self.assertEqual(cm.exception.codigo, "expediente.evaluacion_inexistente")


class TestModeloRevisorConPayloadReal(unittest.TestCase):
    """AC-01 sobre el payload que registra `expediente.servicio.evaluar`, con reglas aprobadas y no aprobadas."""

    @classmethod
    def setUpClass(cls):
        from precheck.expediente import servicio as exp
        from precheck.reglas import servicio as reglas
        from tests.apoyo import Entorno, equipo, version_vigente
        from tests.test_evaluar import CATALOGO, caso
        e = equipo(Entorno())
        try:
            reglas.proponer(e.como("cuenta-0003"), CATALOGO)
            reglas.aprobar(e.como("cuenta-0001"), "PLOT-ZM6-LOTE-FRENTE", version_vigente("PLOT-ZM6-LOTE-FRENTE"))
            cls.ev = exp.evaluar(e.como("cuenta-0004"), "EXP-TEST-0501", caso())
            cls.eventos = list(e.repo.leer("expediente:EXP-TEST-0501"))
            cls.est = e.ctx.estado_reglas()
        finally:
            e.cerrar()

    def test_payload_real(self):
        m = proyectar(self.eventos, self.est, self.ev.seq, "revisor", None)
        self.assertEqual(len(m["resultados"]), len(self.ev.resultados))
        por = {r["regla_id"]: r for r in m["resultados"]}
        self.assertEqual(por["PLOT-ZM6-LOTE-FRENTE"]["oficial"], "oficial")
        self.assertTrue(any(r["resultado"] == "NO_APLICA" for r in m["resultados"]))
        for r in m["resultados"]:
            if r["estado_regla"] != "aprobada":
                self.assertEqual(r["oficial"], "no oficial")
        self.assertEqual(m["evaluacion"]["hash"], self.ev.hash)
        json.dumps(m)


if __name__ == "__main__":
    unittest.main()
