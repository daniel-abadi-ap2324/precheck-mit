"""T8 — aprobar, rechazar y retirar versiones con cuatro ojos (AC-09, AC-10, AC-11, AC-20b)."""
import json
import unittest

from precheck.errores import ErrorPreCheck
from precheck.motor.seleccion import seleccionar
from precheck.reglas import servicio as reglas
from tests.apoyo import RAIZ, Entorno, equipo, version_vigente

A110 = json.loads((RAIZ / "reglas/reglas_a110_borrador.json").read_text(encoding="utf-8"))
RID = "A110-PDC-ACERA-ANCHO"
V = version_vigente(RID)  # versión del catálogo: sube con cada cambio aplicado (p. ej. ADR-0017)


class TestGobierno(unittest.TestCase):
    def setUp(self):
        self.e = equipo(Entorno())
        reglas.proponer(self.e.como("cuenta-0003"), A110)
        self.aprob = self.e.como("cuenta-0001")

    def tearDown(self):
        self.e.cerrar()

    def codigo(self, fn, *args):
        with self.assertRaises(ErrorPreCheck) as cm:
            fn(*args)
        return cm.exception.codigo

    def test_aprobar_version_ajena_la_vuelve_oficial(self):
        # AC-09
        ev = reglas.aprobar(self.aprob, RID, version_vigente(RID))
        self.assertEqual((ev.tipo, ev.actor), ("aprobacion", "P-0001"))
        self.assertTrue(ev.ocurrido_en)
        est = self.e.ctx.estado_reglas()
        self.assertEqual(est.estado(RID, V), "aprobada")
        self.assertEqual(seleccionar(RID, est, "2025-06-01").modo, "oficial")

    def test_nadie_aprueba_lo_que_redacto(self):
        # AC-10: P-0002 es aprobador y además redacta; no puede aprobar su propia versión
        reglas_ctx = self.e.como("cuenta-0001")
        from precheck.personas import servicio as per
        # un tercer aprobador confirma, porque ni el proponente ni el sujeto pueden
        seq = per.vincular_cuenta(reglas_ctx, "P-0005", "Test User 5", "cuenta-0005").seq
        per.confirmar(self.e.como("cuenta-0005"), seq)
        seq = per.designar(self.e.como("cuenta-0001"), "P-0005", "aprobador", "tercer aprobador").seq
        per.confirmar(self.e.como("cuenta-0002"), seq)
        seq = per.designar(self.e.como("cuenta-0001"), "P-0002", "redactor", "doble rol").seq
        per.confirmar(self.e.como("cuenta-0005"), seq)
        propia = dict(A110[0], version=V + 1, condicion="uso_acera.ancho_m <= 1.10")
        reglas.proponer(self.e.como("cuenta-0002"), [propia])
        self.assertEqual(self.codigo(reglas.aprobar, self.e.como("cuenta-0002"), RID, V + 1), "gobierno.auto_aprobacion")
        self.assertEqual(self.e.ctx.estado_reglas().estado(RID, V + 1), "borrador")

    def test_sin_designacion_no_aprueba(self):
        # AC-11
        for cuenta in ("cuenta-0003", "cuenta-0004"):
            with self.subTest(cuenta=cuenta):
                self.assertEqual(self.codigo(reglas.aprobar, self.e.como(cuenta), RID, V), "gobierno.sin_designacion")

    def test_rechazar_exige_motivo_y_deja_estado_final(self):
        self.assertEqual(self.codigo(reglas.rechazar, self.aprob, RID, V, ""), "gobierno.motivo_obligatorio")
        reglas.rechazar(self.aprob, RID, V, "cita mal interpretada")
        self.assertEqual(self.e.ctx.estado_reglas().estado(RID, V), "rechazada")
        self.assertEqual(self.codigo(reglas.aprobar, self.aprob, RID, V), "regla.estado_invalido")

    def test_retirar_conserva_historia_y_lista_dependientes(self):
        # AC-20b
        reglas.aprobar(self.aprob, RID, version_vigente(RID))
        self.e.ctx.anexar("expediente:E1", "evaluacion", "P-0004", "revisor_doyc", {"n": 1}, usos=[(RID, V)])
        r = reglas.retirar(self.aprob, RID, version_vigente(RID), "interpretación errónea")
        self.assertEqual(r.usos, [("expediente:E1", 1)])
        est = self.e.ctx.estado_reglas()
        self.assertEqual(est.estado(RID, V), "retirada")
        self.assertEqual(seleccionar(RID, est, "2025-06-01").modo, "sin_oficial")
        self.assertIn(("aprobacion", RID), [(e.tipo, e.payload.get("regla_id")) for e in self.e.ctx.eventos_reglas()])

    def test_errores_de_estado(self):
        self.assertEqual(self.codigo(reglas.retirar, self.aprob, RID, V, "m"), "regla.estado_invalido")
        self.assertEqual(self.codigo(reglas.aprobar, self.aprob, RID, V + 50), "regla.version_inexistente")


if __name__ == "__main__":
    unittest.main()
