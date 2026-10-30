"""Review M1, M2, M3 — el estado derivado revalida, el contenido está cubierto y verificar no miente."""
import json
import os
import subprocess
import sys
import tempfile
import unittest

from precheck.auditoria import sello
from precheck.expediente import servicio as exp
from precheck.reglas import servicio as reglas
from tests.apoyo import RAIZ, Entorno, equipo, version_vigente
from tests.test_evaluar import CATALOGO, caso

RID = "PLOT-ZM6-LOTE-FRENTE"
V = version_vigente(RID)   # versión de la regla en el catálogo (sube con cada corrección)


class TestEstadoRevalidado(unittest.TestCase):
    def setUp(self):
        self.e = equipo(Entorno())
        reglas.proponer(self.e.como("cuenta-0003"), CATALOGO)

    def tearDown(self):
        self.e.cerrar()

    def forjar(self, tipo, actor, payload):
        return self.e.ctx.anexar("reglas", tipo, actor, "aprobador", payload)

    def test_aprobacion_de_quien_no_es_aprobador_se_ignora(self):
        self.forjar("aprobacion", "P-0004", {"regla_id": RID, "version": V})
        self.assertEqual(self.e.ctx.estado_reglas().estado(RID, V), "borrador")

    def test_aprobacion_del_propio_redactor_se_ignora(self):
        self.forjar("aprobacion", "P-0003", {"regla_id": RID, "version": V})
        self.assertEqual(self.e.ctx.estado_reglas().estado(RID, V), "borrador")

    def test_aprobaciones_solapadas_la_segunda_se_ignora_y_el_servicio_lo_informa(self):
        v2 = dict(next(r for r in CATALOGO if r["id"] == RID), version=V + 1, condicion="lote.frente_m >= 15")
        reglas.proponer(self.e.como("cuenta-0003"), [v2])
        self.forjar("aprobacion", "P-0001", {"regla_id": RID, "version": V})
        self.forjar("aprobacion", "P-0002", {"regla_id": RID, "version": V + 1})     # carrera: ambas «pasaron»
        est = self.e.ctx.estado_reglas()
        self.assertEqual((est.estado(RID, V), est.estado(RID, V + 1)), ("aprobada", "borrador"))

    def test_rol_se_evalua_en_el_momento_del_evento(self):
        # una aprobación anterior a la designación del aprobador no vale aunque después lo designen
        from precheck.personas import servicio as per
        self.forjar("aprobacion", "P-0004", {"regla_id": RID, "version": V})
        seq = per.designar(self.e.como("cuenta-0001"), "P-0004", "aprobador", "m").seq
        per.confirmar(self.e.como("cuenta-0002"), seq)
        self.assertEqual(self.e.ctx.estado_reglas().estado(RID, V), "borrador")


class TestContenidoCubierto(unittest.TestCase):
    def setUp(self):
        self.e = equipo(Entorno())
        reglas.proponer(self.e.como("cuenta-0003"), CATALOGO)
        reglas.aprobar(self.e.como("cuenta-0001"), RID, V)
        con = self.e.repo.con
        con.execute("DROP TRIGGER contenido_regla_sin_update")
        fila = con.execute("SELECT contenido FROM contenido_regla WHERE regla_id=?", (RID,)).fetchone()
        alterado = dict(json.loads(fila[0]), condicion="lote.frente_m >= 1")
        con.execute("UPDATE contenido_regla SET contenido=? WHERE regla_id=?", (json.dumps(alterado), RID))

    def tearDown(self):
        self.e.cerrar()

    def test_evaluar_no_usa_contenido_alterado(self):
        r = {x.regla_id: x for x in exp.evaluar(self.e.como("cuenta-0004"), "EXP-TEST-0800", caso()).resultados}[RID]
        self.assertEqual(r.resultado, "REQUIERE_REVISION")
        self.assertIn("contenido de la regla alterado", r.motivo)

    def test_verificar_detecta_contenido_alterado(self):
        v = sello.verificar(self.e.ctx)
        self.assertFalse(v.integra)
        self.assertIn((RID, V), v.contenido_alterado)


class TestVerificarConSello(unittest.TestCase):
    def setUp(self):
        self.e = Entorno()
        self.anclas = tempfile.TemporaryDirectory()
        self.e.ctx.destino_anclaje = sello.DestinoArchivo(self.anclas.name)
        self.e.ctx.anexar("expediente:E1", "evaluacion", "P-0004", "revisor_doyc", {"n": 1})

    def tearDown(self):
        self.e.cerrar()
        self.anclas.cleanup()

    def test_cadena_fuera_del_sello_no_coincide_por_defecto(self):
        s = sello.sellar(self.e.ctx)
        self.e.ctx.anexar("expediente:E2", "evaluacion", "P-0004", "revisor_doyc", {"n": 2})
        self.assertIsNone(sello.verificar(self.e.ctx, "expediente:E2", s).coincide_sello)
        self.assertIsNone(sello.verificar(self.e.ctx, "expediente:NOEXISTE", s).coincide_sello)
        self.assertTrue(sello.verificar(self.e.ctx, "expediente:E1", s).coincide_sello)

    def test_verificacion_informa_la_cadena_que_no_coincide(self):
        s = sello.sellar(self.e.ctx)
        falso = sello.Sello(s.fecha, dict(s.cabezas, **{"expediente:E1": "f" * 64}), "")
        falso = sello.Sello(falso.fecha, falso.cabezas, sello.calcular("", {"fecha": falso.fecha, "cabezas": falso.cabezas}))
        v = sello.verificar(self.e.ctx, sello=falso)
        self.assertEqual(v.cadenas_sin_coincidir, ("expediente:E1",))

    def test_cli_sin_sello_ni_destino_con_sellos_registrados_no_da_por_buena(self):
        sello.sellar(self.e.ctx)
        env = {k: v for k, v in os.environ.items() if k != "PRECHECK_ANCLAJE"}
        r = subprocess.run([sys.executable, "-m", "precheck", "--bitacora", str(self.e.repo.ruta), "verificar", "--todo"],
                           capture_output=True, text=True, cwd=RAIZ, env=env)
        self.assertEqual(r.returncode, 3, r.stdout + r.stderr)
        env["PRECHECK_ANCLAJE"] = self.anclas.name
        r = subprocess.run([sys.executable, "-m", "precheck", "--bitacora", str(self.e.repo.ruta), "verificar", "--todo"],
                           capture_output=True, text=True, cwd=RAIZ, env=env)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("coincide con el sello", r.stdout)


if __name__ == "__main__":
    unittest.main()
