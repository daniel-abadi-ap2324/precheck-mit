"""Re-revisión — arreglos incompletos de B2, M2, M3, B4, B5 y la resolución de identidad."""
import datetime as dt
import json
import pathlib
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

import precheck
from precheck.auditoria import sello
from precheck.auditoria.canonico import hash_contenido
from precheck.errores import ErrorPreCheck
from precheck.expediente import servicio as exp
from precheck.reglas import servicio as reglas
from tests.apoyo import RAIZ, Entorno, equipo, version_vigente
from tests.test_evaluar import CATALOGO, caso

RID = "PLOT-ZM6-LOTE-FRENTE"
V = version_vigente(RID)   # versión de la regla en el catálogo (sube con cada corrección)


class TestRerevision(unittest.TestCase):
    def setUp(self):
        self.e = equipo(Entorno())
        reglas.proponer(self.e.como("cuenta-0003"), CATALOGO)
        reglas.aprobar(self.e.como("cuenta-0001"), RID, V)

    def tearDown(self):
        self.e.cerrar()

    def suspender(self):
        prop = reglas.proponer_suspension(self.e.como("cuenta-0001"), "PLOT-A61-2021", "nulidad")
        reglas.confirmar(self.e.como("cuenta-0002"), prop.seq)
        return prop

    def test_reintento_de_confirmar_exige_identidad_y_no_remarca_tras_levantar(self):
        prop = self.suspender()
        lev = reglas.proponer_levantamiento(self.e.como("cuenta-0002"), "PLOT-A61-2021", "desestimada")
        reglas.confirmar(self.e.como("cuenta-0001"), lev.seq)
        exp.evaluar(self.e.como("cuenta-0004"), "EXP-NUEVO", caso())
        with self.assertRaises(ErrorPreCheck) as cm:
            reglas.confirmar(self.e.como("cuenta-extrana"), prop.seq)
        self.assertEqual(cm.exception.codigo, "identidad.cuenta_no_vinculada")
        conf = reglas.confirmar(self.e.como("cuenta-0001"), prop.seq)
        self.assertNotIn("EXP-NUEVO", [a["expediente"] for a in conf.afectados])
        self.assertEqual([e.tipo for e in self.e.repo.leer("expediente:EXP-NUEVO")], ["evaluacion"])

    def test_aprobar_con_norma_suspendida_no_informa_error_falso(self):
        self.suspender()
        ev = reglas.aprobar(self.e.como("cuenta-0001"), "PLOT-R1-DENSIDAD", version_vigente("PLOT-R1-DENSIDAD"))
        self.assertEqual(ev.tipo, "aprobacion")
        self.assertEqual(self.e.ctx.estado_reglas().estado("PLOT-R1-DENSIDAD", version_vigente("PLOT-R1-DENSIDAD")), "suspendida")

    def test_verificar_detecta_contenido_reemplazado_con_hash_recalculado_y_filas_borradas(self):
        con = self.e.repo.con
        for t in ("contenido_regla_sin_update", "contenido_regla_sin_delete"):
            con.execute(f"DROP TRIGGER {t}")
        con.execute("PRAGMA foreign_keys = OFF")
        fila = json.loads(con.execute("SELECT contenido FROM contenido_regla WHERE regla_id=?", (RID,)).fetchone()[0])
        falso = dict(fila, condicion="lote.frente_m >= 1")
        con.execute("UPDATE contenido_regla SET contenido=?, hash=? WHERE regla_id=?",
                    (json.dumps(falso), hash_contenido(falso), RID))
        con.execute("DELETE FROM contenido_regla WHERE regla_id='PLOT-ZM6-ALTURA'")
        v = sello.verificar(self.e.ctx)
        self.assertFalse(v.integra)
        self.assertIn((RID, V), v.contenido_alterado)
        self.assertIn(("PLOT-ZM6-ALTURA", version_vigente("PLOT-ZM6-ALTURA")), v.contenido_alterado)

    def test_estado_regla_con_una_fecha_civil(self):
        pc = precheck.PreCheck(self.e.ctx)
        hoy = dt.datetime.now(dt.timezone.utc).date()
        self.assertEqual(pc.estado_regla(RID, V, en=hoy), "aprobada")
        self.assertEqual(pc.estado_regla(RID, V, en=hoy.isoformat()), "aprobada")
        self.assertIsNone(pc.estado_regla(RID, V, en=dt.date(2000, 1, 1)))


class TestCliOperacion(unittest.TestCase):
    def setUp(self):
        self.e = Entorno()
        self.e.ctx.anexar("expediente:E1", "evaluacion", "P-0004", "revisor_doyc", {"n": 1})
        self.anclas = tempfile.TemporaryDirectory()
        self.e.ctx.destino_anclaje = sello.DestinoArchivo(self.anclas.name)
        sello.sellar(self.e.ctx)

    def tearDown(self):
        self.e.cerrar()
        self.anclas.cleanup()

    def cli(self, *args):
        return subprocess.run([sys.executable, "-m", "precheck", "--bitacora", str(self.e.repo.ruta), *args],
                              capture_output=True, text=True, cwd=RAIZ)

    def test_destino_mal_escrito_no_da_por_buena_la_bitacora(self):
        errata = pathlib.Path(self.anclas.name).with_name(pathlib.Path(self.anclas.name).name + "-errata")
        r = self.cli("verificar", "--todo", "--destino", str(errata))
        self.assertEqual(r.returncode, 3, r.stdout + r.stderr)
        self.assertFalse(errata.exists())

    def test_base_bloqueada_no_es_alarma_de_integridad(self):
        from precheck import cli
        with mock.patch("precheck.cli._ejecutar", side_effect=sqlite3.OperationalError("database is locked")), \
                mock.patch("sys.stderr"):
            self.assertEqual(cli.main(["--bitacora", str(self.e.repo.ruta), "estado", "--expediente", "E1"]), 6)


class TestIdentidadSinPasswd(unittest.TestCase):
    @unittest.skipIf(sys.platform == "win32", "pwd solo existe en POSIX")
    def test_uid_sin_entrada_en_passwd(self):
        from precheck.personas.registro import ResolutorCuentaSO
        with mock.patch("pwd.getpwuid", side_effect=KeyError("uid")), self.assertRaises(ErrorPreCheck) as cm:
            ResolutorCuentaSO().cuenta_actual()
        self.assertEqual(cm.exception.codigo, "identidad.cuenta_no_vinculada")


if __name__ == "__main__":
    unittest.main()


class TestRerevisionFinal(unittest.TestCase):
    """Re-revisión de cf6a81c."""

    def setUp(self):
        self.e = equipo(Entorno())
        reglas.proponer(self.e.como("cuenta-0003"), CATALOGO)
        reglas.aprobar(self.e.como("cuenta-0001"), RID, V)

    def tearDown(self):
        self.e.cerrar()

    def suspender(self):
        prop = reglas.proponer_suspension(self.e.como("cuenta-0001"), "PLOT-A61-2021", "nulidad")
        reglas.confirmar(self.e.como("cuenta-0002"), prop.seq)
        return prop

    def test_reintentar_una_suspension_levantada_y_vuelta_a_suspender_no_marca_nada(self):
        exp.evaluar(self.e.como("cuenta-0004"), "E-ANTES", caso())
        a = self.suspender()
        lev = reglas.proponer_levantamiento(self.e.como("cuenta-0002"), "PLOT-A61-2021", "desestimada")
        reglas.confirmar(self.e.como("cuenta-0001"), lev.seq)
        exp.evaluar(self.e.como("cuenta-0004"), "E-ENTRE", caso())
        self.suspender()                                        # suspensión B
        antes = {c: len(list(self.e.repo.leer(f"expediente:{c}"))) for c in ("E-ANTES", "E-ENTRE")}
        self.assertEqual(reglas.confirmar(self.e.como("cuenta-0001"), a.seq).afectados, ())
        despues = {c: len(list(self.e.repo.leer(f"expediente:{c}"))) for c in ("E-ANTES", "E-ENTRE")}
        self.assertEqual(antes, despues)

    def test_payload_de_propuesta_alterado_da_alarma_no_traza(self):
        con = self.e.repo.con
        con.execute("DROP TRIGGER evento_sin_update")
        con.execute("UPDATE evento SET payload='{\"regla_id\":\"X\"}' WHERE cadena_id='reglas' AND tipo='propuesta' "
                    "AND seq=(SELECT min(seq) FROM evento WHERE cadena_id='reglas' AND tipo='propuesta')")
        v = sello.verificar(self.e.ctx)
        self.assertFalse(v.integra)
        self.assertEqual(v.rota_en[0], "reglas")

    def test_estado_reglas_normaliza_datetime_y_desfases(self):
        ahora = dt.datetime.now(dt.timezone.utc)
        esperado = self.e.ctx.estado_reglas().estado(RID, V)
        self.assertEqual(self.e.ctx.estado_reglas(ahora).estado(RID, V), esperado)
        panama = ahora.astimezone(dt.timezone(dt.timedelta(hours=-5))).isoformat()
        self.assertEqual(self.e.ctx.estado_reglas(panama).estado(RID, V), esperado)
        with self.assertRaises(ValueError):
            self.e.ctx.estado_reglas("2026-9-27")


class TestCliBloqueoAlAbrir(unittest.TestCase):
    def test_bloqueo_al_abrir_sale_con_6_y_json(self):
        from precheck import cli
        with tempfile.TemporaryDirectory() as d, \
                mock.patch("precheck.cli.abrir", side_effect=sqlite3.OperationalError("database is locked")), \
                mock.patch("sys.stderr", new_callable=__import__("io").StringIO) as err:
            codigo = cli.main(["--bitacora", f"{d}/b.sqlite3", "--json", "estado", "--expediente", "E1"])
        self.assertEqual(codigo, 6)
        self.assertEqual(json.loads(err.getvalue())["codigo"], "operacion.bitacora_no_disponible")
