"""Review A2 — nadie se apropia de otra persona ni se fabrica una segunda para aprobarse a sí mismo."""
import unittest

from precheck.errores import ErrorPreCheck
from precheck.personas import servicio as per
from precheck.reglas import servicio as reglas
from tests.apoyo import Entorno, equipo
from tests.test_proponer import A110


class TestCuatroOjos(unittest.TestCase):
    def setUp(self):
        self.e = equipo(Entorno())

    def tearDown(self):
        self.e.cerrar()

    def codigo(self, fn, *args):
        with self.assertRaises(ErrorPreCheck) as cm:
            fn(*args)
        return cm.exception.codigo

    def test_no_se_apropia_de_una_persona_existente(self):
        # P-0001 vincula una cuenta suya a P-0002 (aprobador existente) y confirma desde esa cuenta
        seq = per.vincular_cuenta(self.e.como("cuenta-0001"), "P-0002", "Test User 2", "cuenta-maligna").seq
        self.assertEqual(self.codigo(per.confirmar, self.e.como("cuenta-maligna"), seq),
                         "identidad.cuenta_no_vinculada")
        self.assertIsNone(self.e.ctx.registro().persona_de_cuenta("cuenta-maligna"))

    def test_una_persona_fabricada_no_se_confirma_su_propio_rol(self):
        seq = per.vincular_cuenta(self.e.como("cuenta-0001"), "P-FALSA", "Falsa", "cuenta-falsa").seq
        per.confirmar(self.e.como("cuenta-falsa"), seq)            # aceptar el vínculo de una persona nueva: sí
        seq = per.designar(self.e.como("cuenta-0001"), "P-FALSA", "aprobador", "m").seq
        self.assertEqual(self.codigo(per.confirmar, self.e.como("cuenta-falsa"), seq),
                         "gobierno.sin_segunda_persona")
        self.assertNotIn("aprobador", self.e.ctx.registro().roles("P-FALSA"))

    def test_el_registro_ignora_eventos_forjados(self):
        # alguien anexa por fuera del servicio una designación confirmada por el propio sujeto
        prop = self.e.ctx.anexar("reglas", "designacion_propuesta", "P-0001", "aprobador",
                                 {"persona_id": "P-0003", "rol": "aprobador", "motivo": "m"})
        self.e.ctx.anexar("reglas", "designacion_confirmada", "P-0003", "designado",
                          {"propuesta_seq": prop.seq, "cuenta": "cuenta-0003"})
        self.assertNotIn("aprobador", self.e.ctx.registro().roles("P-0003"))

    def test_ataque_completo_del_revisor_ya_no_aprueba(self):
        # P-0001 intenta: fabricar P-FALSA, hacerla redactora, redactar como ella y aprobar
        seq = per.vincular_cuenta(self.e.como("cuenta-0001"), "P-FALSA", "Falsa", "cuenta-falsa").seq
        per.confirmar(self.e.como("cuenta-falsa"), seq)
        seq = per.designar(self.e.como("cuenta-0001"), "P-FALSA", "redactor", "m").seq
        self.codigo(per.confirmar, self.e.como("cuenta-falsa"), seq)
        self.assertEqual(self.codigo(reglas.proponer, self.e.como("cuenta-falsa"), A110[:1]), "identidad.sin_rol")

    def test_inicializar_exige_dos_personas_distintas(self):
        e = Entorno()
        try:
            self.assertEqual(self.codigo(per.inicializar, e.como("cuenta-0001"), "P-0001", "A", "P-0001", "B",
                                         "cuenta-0002"), "gobierno.sin_segunda_persona")
            self.assertEqual(self.codigo(per.inicializar, e.como("cuenta-0001"), "P-0001", "A", "P-0002", "B",
                                         "cuenta-0001"), "gobierno.sin_segunda_persona")
        finally:
            e.cerrar()


if __name__ == "__main__":
    unittest.main()
