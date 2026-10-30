"""T11 — decidir, visto bueno y estado del expediente (AC-13 a AC-16)."""
import unittest

from precheck.errores import ErrorPreCheck
from precheck.expediente import servicio as exp
from precheck.reglas import servicio as reglas
from tests.apoyo import Entorno, equipo, version_vigente
from tests.test_evaluar import CATALOGO, caso

EXP = "EXP-TEST-0100"


class TestDecisiones(unittest.TestCase):
    def setUp(self):
        self.e = equipo(Entorno())
        reglas.proponer(self.e.como("cuenta-0003"), CATALOGO)
        for rid in ("PLOT-ZM6-LOTE-FRENTE", "PLOT-ZM6-DENSIDAD"):
            reglas.aprobar(self.e.como("cuenta-0001"), rid, version_vigente(rid))
        self.rev = self.e.como("cuenta-0004")
        self.ev = exp.evaluar(self.rev, EXP, caso())
        self.res = {r.regla_id: r for r in self.ev.resultados}

    def tearDown(self):
        self.e.cerrar()

    def codigo(self, fn, *args, **kw):
        with self.assertRaises(ErrorPreCheck) as cm:
            fn(*args, **kw)
        return cm.exception.codigo

    def pendientes_de_decision(self):
        return [r for r in self.ev.resultados
                if (r.resultado == "NO_CUMPLE" and r.severidad == "bloqueante") or r.resultado == "REQUIERE_REVISION"]

    def test_confirmar_no_cumple_bloqueante_queda_enlazado(self):
        # AC-13
        self.assertEqual(self.res["PLOT-ZM6-LOTE-FRENTE"].severidad, "bloqueante")
        d = exp.decidir(self.rev, EXP, self.ev.seq, "PLOT-ZM6-LOTE-FRENTE", "confirmar", "frente medido 15.2 m")
        self.assertEqual((d.tipo, d.actor), ("decision", "P-0004"))
        self.assertEqual(d.payload["evaluacion_seq"], self.ev.seq)
        self.assertEqual(d.payload["hash_evaluacion"], self.ev.hash)
        self.assertEqual(d.payload["resultado_original"], "NO_CUMPLE")
        original = list(self.e.repo.leer(f"expediente:{EXP}"))[0]
        self.assertEqual(original.hash, self.ev.hash)

    def test_descartar_sin_motivo_se_rechaza(self):
        # AC-14
        for motivo in ("", "   "):
            self.assertEqual(self.codigo(exp.decidir, self.rev, EXP, self.ev.seq, "PLOT-ZM6-LOTE-FRENTE",
                                         "descartar", motivo), "decision.motivo_obligatorio")
        self.assertEqual(len(list(self.e.repo.leer(f"expediente:{EXP}"))), 1)

    def test_veredicto_humano_sobre_requiere_revision(self):
        d = exp.decidir(self.rev, EXP, self.ev.seq, "PLOT-ZM6-ALTURA", "veredicto", "16 pisos > 15",
                        veredicto="NO_CUMPLE")
        self.assertEqual(d.payload["veredicto"], "NO_CUMPLE")
        self.assertEqual(self.codigo(exp.decidir, self.rev, EXP, self.ev.seq, "PLOT-ZM6-ALTURA", "confirmar", "m"),
                         "decision.accion_no_aplicable")
        self.assertEqual(self.codigo(exp.decidir, self.rev, EXP, self.ev.seq, "PLOT-ZM6-DENSIDAD", "descartar", "m"),
                         "decision.accion_no_aplicable")

    def test_visto_bueno_lista_cumple_y_observaciones_con_sus_datos(self):
        # AC-15
        lista = exp.listar_visto_bueno(self.rev, EXP, self.ev.seq)
        ids = {r.regla_id for r in lista}
        self.assertIn("PLOT-ZM6-DENSIDAD", ids)
        self.assertTrue(all(r.resultado == "CUMPLE" or (r.resultado == "NO_CUMPLE" and r.severidad == "observacion")
                            for r in lista))
        self.assertTrue(all(r.valores_usados for r in lista))
        vb = exp.dar_visto_bueno(self.rev, EXP, self.ev.seq, confirmar_sin_ceus=True)
        self.assertEqual((vb.tipo, vb.actor), ("visto_bueno", "P-0004"))
        self.assertEqual(set(vb.payload["reglas"]), ids)

    def test_estado_pendiente_hasta_que_todo_tiene_decision(self):
        # AC-16
        est = exp.estado(self.rev, EXP)
        self.assertEqual(est.estado, "pendiente")
        self.assertIn("visto bueno", est.pendientes)
        for r in self.pendientes_de_decision():
            accion, ver = ("veredicto", "NO_CUMPLE") if r.resultado == "REQUIERE_REVISION" else ("confirmar", None)
            exp.decidir(self.rev, EXP, self.ev.seq, r.regla_id, accion, "revisado en pruebas", veredicto=ver)
        self.assertEqual(exp.estado(self.rev, EXP).estado, "pendiente")
        exp.dar_visto_bueno(self.rev, EXP, self.ev.seq, confirmar_sin_ceus=True)
        final = exp.estado(self.rev, EXP)
        self.assertEqual((final.estado, final.pendientes), ("revisado", ()))
        self.assertNotIn("aprobado", repr(final))

    def test_nueva_evaluacion_vuelve_a_pendiente_y_bloquea_la_anterior(self):
        exp.dar_visto_bueno(self.rev, EXP, self.ev.seq, confirmar_sin_ceus=True)
        nueva = exp.evaluar(self.rev, EXP, caso())
        self.assertEqual(exp.estado(self.rev, EXP).evaluacion, nueva.seq)
        self.assertEqual(self.codigo(exp.dar_visto_bueno, self.rev, EXP, self.ev.seq),
                         "expediente.evaluacion_no_vigente")
        self.assertEqual(self.codigo(exp.decidir, self.rev, EXP, 99, "PLOT-ZM6-ALTURA", "veredicto", "m",
                                     veredicto="CUMPLE"), "expediente.evaluacion_inexistente")

    def test_solo_un_revisor_decide(self):
        self.assertEqual(self.codigo(exp.decidir, self.e.como("cuenta-0003"), EXP, self.ev.seq,
                                     "PLOT-ZM6-LOTE-FRENTE", "descartar", "m"), "identidad.sin_rol")


if __name__ == "__main__":
    unittest.main()


class TestEstadoEstricto(unittest.TestCase):
    """Review A4 y M7: nada queda «revisado» sin acción humana; «sin CEUS» exige confirmación explícita."""

    def setUp(self):
        self.e = equipo(Entorno())
        reglas.proponer(self.e.como("cuenta-0003"), CATALOGO)
        self.rev = self.e.como("cuenta-0004")

    def tearDown(self):
        self.e.cerrar()

    def decidir_reglas(self, expediente, ev):
        for r in ev.resultados:
            if r.resultado == "REQUIERE_REVISION":
                exp.decidir(self.rev, expediente, ev.seq, r.regla_id, "veredicto", "revisado", veredicto="CUMPLE")
            elif r.resultado == "NO_CUMPLE" and r.severidad == "bloqueante":
                exp.decidir(self.rev, expediente, ev.seq, r.regla_id, "confirmar", "revisado")

    def test_expediente_miviot_exige_decision_sobre_la_norma_sin_reglas(self):
        h = caso()
        h["lote"]["norma_aplicable"]["valor"] = "MIVIOT"
        ev = exp.evaluar(self.rev, "EXP-TEST-0600", h)
        est = exp.estado(self.rev, "EXP-TEST-0600")
        self.assertEqual(est.estado, "pendiente")
        self.assertIn("norma:MIVIOT", est.pendientes)
        self.assertIn("visto bueno", est.pendientes)
        self.decidir_reglas("EXP-TEST-0600", ev)
        self.assertEqual(exp.estado(self.rev, "EXP-TEST-0600").pendientes, ("norma:MIVIOT", "visto bueno"))
        exp.decidir(self.rev, "EXP-TEST-0600", ev.seq, "norma:MIVIOT", "veredicto", "revisado con la norma MIVIOT",
                    veredicto="NO_CUMPLE")
        exp.dar_visto_bueno(self.rev, "EXP-TEST-0600", ev.seq, confirmar_sin_ceus=True)
        self.assertEqual(exp.estado(self.rev, "EXP-TEST-0600").estado, "revisado")

    def test_sin_resultados_aplicables_igual_exige_visto_bueno(self):
        h = caso()
        h["lote"]["norma_aplicable"]["valor"] = "PLOT-A61-2021"
        h["lote"]["codigo_zona"]["valor"] = "1NOEXISTE"
        ev = exp.evaluar(self.rev, "EXP-TEST-0601", h)
        # Ninguna regla de ficha de zona aplica; las de artículos del PLOT (PLOT-ART…) valen en todas las zonas.
        self.assertFalse(any(r.regla_id.startswith("PLOT-") and not r.regla_id.startswith("PLOT-ART")
                             and r.resultado != "NO_APLICA" for r in ev.resultados))
        self.decidir_reglas("EXP-TEST-0601", ev)
        self.assertEqual(exp.estado(self.rev, "EXP-TEST-0601").pendientes, ("visto bueno",))

    def test_visto_bueno_sin_ceus_exige_confirmacion_explicita(self):
        reglas.aprobar(self.e.como("cuenta-0001"), "PLOT-ZM6-DENSIDAD", version_vigente("PLOT-ZM6-DENSIDAD"))
        ev = exp.evaluar(self.e.como("cuenta-0004"), "EXP-TEST-0602", caso())
        with self.assertRaises(ErrorPreCheck) as cm:
            exp.dar_visto_bueno(self.rev, "EXP-TEST-0602", ev.seq)
        self.assertEqual(cm.exception.codigo, "decision.confirmacion_sin_ceus")
        vb = exp.dar_visto_bueno(self.rev, "EXP-TEST-0602", ev.seq, confirmar_sin_ceus=True)
        self.assertTrue(vb.payload["confirmar_sin_ceus"])
