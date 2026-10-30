"""T12 — reproducir una evaluación registrada (AC-17, AC-18)."""
import json
import unittest
from unittest import mock

from precheck.expediente import servicio as exp
from precheck.reglas import servicio as reglas
from tests.apoyo import Entorno, equipo, version_vigente
from tests.test_evaluar import CATALOGO, caso

EXP = "EXP-TEST-0200"


class TestReproducir(unittest.TestCase):
    def setUp(self):
        self.e = equipo(Entorno())
        reglas.proponer(self.e.como("cuenta-0003"), CATALOGO)
        reglas.aprobar(self.e.como("cuenta-0001"), "PLOT-ZM6-LOTE-FRENTE", version_vigente("PLOT-ZM6-LOTE-FRENTE"))
        self.rev = self.e.como("cuenta-0004")
        self.ev = exp.evaluar(self.rev, EXP, caso())

    def tearDown(self):
        self.e.cerrar()

    def test_reproducir_sin_cambios_coincide_y_queda_registrado(self):
        # AC-17
        r = exp.reproducir(self.rev, EXP, self.ev.seq)
        self.assertEqual((r.resultado, r.discrepancias), ("coincide", ()))
        self.assertEqual((r.evento.tipo, r.evento.payload["evaluacion_seq"]), ("reproduccion", self.ev.seq))

    def test_usa_el_estado_de_entonces_no_el_actual(self):
        # aprobar después no genera una discrepancia falsa
        reglas.aprobar(self.e.como("cuenta-0001"), "PLOT-ZM6-ALTURA", version_vigente("PLOT-ZM6-ALTURA"))
        self.assertEqual(exp.reproducir(self.e.como("cuenta-0004"), EXP, self.ev.seq).resultado, "coincide")

    def test_motor_distinto_senala_discrepancias_sin_tocar_el_original(self):
        # AC-18: el motor cambió de comportamiento sin cambiar de versión
        original = list(self.e.repo.leer(f"expediente:{EXP}"))[0]

        def motor_cambiado(regla, hechos, umbral):
            from precheck.motor.evaluador import evaluar_regla
            r = evaluar_regla(regla, hechos, umbral)
            if regla["id"] == "PLOT-ZM6-LOTE-FRENTE":
                r["resultado"] = "CUMPLE"
            return r

        with mock.patch("precheck.expediente.servicio.evaluar_regla", motor_cambiado):
            r = exp.reproducir(self.rev, EXP, self.ev.seq)
        self.assertEqual(r.resultado, "discrepancias")
        self.assertIn(("PLOT-ZM6-LOTE-FRENTE", "NO_CUMPLE", "CUMPLE"), r.discrepancias)
        self.assertEqual(r.evento.payload["discrepancias"][0]["regla_id"], "PLOT-ZM6-LOTE-FRENTE")
        self.assertEqual(list(self.e.repo.leer(f"expediente:{EXP}"))[0], original)

    def test_contenido_alterado_fuera_de_banda_se_senala(self):
        con = self.e.repo.con
        con.execute("DROP TRIGGER contenido_regla_sin_update")
        fila = con.execute("SELECT contenido FROM contenido_regla WHERE regla_id='PLOT-ZM6-LOTE-FRENTE'").fetchone()
        alterado = json.loads(fila[0])
        alterado["condicion"] = "lote.frente_m >= 1"
        con.execute("UPDATE contenido_regla SET contenido=? WHERE regla_id='PLOT-ZM6-LOTE-FRENTE'",
                    (json.dumps(alterado),))
        r = exp.reproducir(self.rev, EXP, self.ev.seq)
        self.assertEqual(r.resultado, "discrepancias")
        self.assertIn("PLOT-ZM6-LOTE-FRENTE", [d[0] for d in r.discrepancias])

    def test_otra_version_del_motor_no_compara(self):
        with mock.patch("precheck.expediente.servicio.VERSION_MOTOR", "9.0.0"):
            r = exp.reproducir(self.rev, EXP, self.ev.seq)
        self.assertEqual((r.resultado, r.discrepancias), ("no_reproducible_version", ()))
        self.assertEqual(r.evento.payload["version_registrada"], self.ev.version_motor)


if __name__ == "__main__":
    unittest.main()
