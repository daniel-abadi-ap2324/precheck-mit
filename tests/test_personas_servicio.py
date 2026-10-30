"""T9 — inicializar, vincular cuenta, designar y confirmar (AC-11 de punta a punta)."""
import unittest

from precheck.errores import ErrorPreCheck
from precheck.personas import servicio as per
from tests.apoyo import Entorno, equipo


class TestPersonasServicio(unittest.TestCase):
    def setUp(self):
        self.e = Entorno()

    def tearDown(self):
        self.e.cerrar()

    def codigo(self, fn, *args):
        with self.assertRaises(ErrorPreCheck) as cm:
            fn(*args)
        return cm.exception.codigo

    def test_inicializar_una_sola_vez(self):
        ev = per.inicializar(self.e.como("cuenta-0001"), "P-0001", "Test User 1", "P-0002", "Test User 2", "cuenta-0002")
        self.assertEqual((ev.tipo, ev.actor), ("designacion_genesis", "P-0001"))
        self.assertEqual(self.e.ctx.registro().roles("P-0002"), {"aprobador"})
        self.assertEqual(self.codigo(per.inicializar, self.e.ctx, "P-0009", "Otro", "P-0010", "Otro 2", "c10"),
                         "gobierno.ya_inicializado")

    def test_equipo_completo_con_cuatro_ojos(self):
        equipo(self.e)
        reg = self.e.ctx.registro()
        self.assertEqual(reg.roles("P-0002"), {"aprobador"})
        self.assertEqual(reg.roles("P-0003"), {"redactor"})
        self.assertEqual(reg.persona_de_cuenta("cuenta-0004"), "P-0004")

    def test_confirmar_la_propia_propuesta_se_impide(self):
        per.inicializar(self.e.como("cuenta-0001"), "P-0001", "Test User 1", "P-0002", "Test User 2", "cuenta-0002")
        seq = per.vincular_cuenta(self.e.ctx, "P-0005", "Test User 5", "cuenta-0005").seq
        self.assertEqual(self.codigo(per.confirmar, self.e.ctx, seq), "gobierno.sin_segunda_persona")

    def test_sin_designacion_no_propone(self):
        # AC-11: una persona sin designación de aprobador no puede designar
        equipo(self.e)
        self.assertEqual(self.codigo(per.designar, self.e.como("cuenta-0003"), "P-0004", "aprobador", "m"),
                         "gobierno.sin_designacion")

    def test_confirmacion_de_un_tercero_sin_rol_se_impide(self):
        equipo(self.e)
        seq = per.designar(self.e.como("cuenta-0001"), "P-0004", "redactor", "m").seq
        self.assertEqual(self.codigo(per.confirmar, self.e.como("cuenta-0003"), seq), "gobierno.sin_designacion")

    def test_errores_de_propuesta(self):
        equipo(self.e)
        ctx = self.e.como("cuenta-0001")
        self.assertEqual(self.codigo(per.vincular_cuenta, ctx, "P-0009", "X", "cuenta-0002"),
                         "identidad.cuenta_ya_vinculada")
        self.assertEqual(self.codigo(per.designar, ctx, "P-0004", "redactor", " "), "gobierno.motivo_obligatorio")
        self.assertEqual(self.codigo(per.confirmar, ctx, 999), "gobierno.propuesta_inexistente")
        seq = per.designar(ctx, "P-0004", "redactor", "m").seq
        per.confirmar(self.e.como("cuenta-0002"), seq)
        self.assertEqual(self.codigo(per.confirmar, self.e.como("cuenta-0004"), seq),
                         "gobierno.propuesta_ya_resuelta")

    def test_cuenta_sin_vinculo(self):
        per.inicializar(self.e.como("cuenta-0001"), "P-0001", "Test User 1", "P-0002", "Test User 2", "cuenta-0002")
        self.assertEqual(self.codigo(per.designar, self.e.como("cuenta-9999"), "P-0001", "redactor", "m"),
                         "identidad.cuenta_no_vinculada")


if __name__ == "__main__":
    unittest.main()
