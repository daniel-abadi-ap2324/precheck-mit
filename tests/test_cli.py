"""T15 — fachada PreCheck y CLI `python3 -m precheck` (contrato: AC-03, AC-14, AC-16)."""
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import unittest

import precheck
from precheck.personas import servicio as per
from precheck.reglas import servicio as reglas
from tests.apoyo import NORMATIVA, RAIZ, ResolutorFalso, version_vigente
from tests.test_evaluar import CATALOGO, caso

if sys.platform == "win32":                  # Windows: sin pwd; el resolutor usa GetUserNameW
    from precheck.personas.registro import ResolutorCuentaSO
    YO = ResolutorCuentaSO().cuenta_actual()
else:
    import pwd
    YO = pwd.getpwuid(os.geteuid()).pw_name  # la CLI resuelve la identidad desde la cuenta real del sistema


def preparar(ruta, rol_de_yo="revisor_doyc"):
    """Con la biblioteca: equipo de prueba donde la cuenta real del sistema es la persona P-0004."""
    res = ResolutorFalso("cuenta-0001")
    pc = precheck.abrir(ruta, NORMATIVA, resolutor=res)
    per.inicializar(pc.ctx, "P-0001", "Test User 1", "P-0002", "Test User 2", "cuenta-0002")
    for n, cuenta, rol in (("0003", "cuenta-0003", "redactor"), ("0004", YO, rol_de_yo)):
        res.cuenta = "cuenta-0001"
        seq = per.vincular_cuenta(pc.ctx, f"P-{n}", f"Test User {n}", cuenta).seq
        res.cuenta = cuenta
        per.confirmar(pc.ctx, seq)
        res.cuenta = "cuenta-0001"
        seq = per.designar(pc.ctx, f"P-{n}", rol, "alta en pruebas").seq
        res.cuenta = "cuenta-0002"
        per.confirmar(pc.ctx, seq)
    res.cuenta = "cuenta-0003"
    reglas.proponer(pc.ctx, CATALOGO)
    res.cuenta = "cuenta-0001"
    reglas.aprobar(pc.ctx, "PLOT-ZM6-LOTE-FRENTE", version_vigente("PLOT-ZM6-LOTE-FRENTE"))
    pc.cerrar()


def cli(ruta, *args, json_=False):
    cmd = [sys.executable, "-m", "precheck", "--bitacora", str(ruta)] + (["--json"] if json_ else []) + list(args)
    return subprocess.run(cmd, capture_output=True, text=True, cwd=RAIZ)


class TestCli(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.ruta = pathlib.Path(self.dir.name) / "bitacora.sqlite3"
        preparar(self.ruta)
        self.hechos = pathlib.Path(self.dir.name) / "hechos.json"
        self.hechos.write_text(json.dumps(caso()), encoding="utf-8")

    def tearDown(self):
        self.dir.cleanup()

    def test_fachada_abrir_expone_los_metodos_del_contrato(self):
        pc = precheck.abrir(self.ruta, NORMATIVA, resolutor=ResolutorFalso(YO))
        for m in ("evaluar", "decidir", "listar_visto_bueno", "dar_visto_bueno", "estado", "reproducir",
                  "verificar", "sellar", "proponer", "aprobar", "rechazar", "retirar", "proponer_suspension",
                  "proponer_levantamiento", "confirmar", "inicializar", "vincular_cuenta", "designar", "estado_regla"):
            self.assertTrue(callable(getattr(pc, m)), m)
        self.assertEqual(pc.estado_regla("PLOT-ZM6-LOTE-FRENTE", version_vigente("PLOT-ZM6-LOTE-FRENTE")), "aprobada")
        pc.cerrar()

    def test_evaluar_en_texto_y_en_json(self):
        r = cli(self.ruta, "evaluar", "--expediente", "EXP-TEST-0500", "--hechos", str(self.hechos))
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("pendiente de revisión", r.stdout)
        self.assertIn("PLOT-ZM6-LOTE-FRENTE", r.stdout)
        j = cli(self.ruta, "evaluar", "--expediente", "EXP-TEST-0501", "--hechos", str(self.hechos), json_=True)
        d = json.loads(j.stdout)
        self.assertEqual(d["expediente_id"], "EXP-TEST-0501")
        self.assertIn("cobertura", d)

    def test_sin_fecha_sale_con_rechazo_de_negocio(self):
        # AC-03 en el contrato: salida 2 y código en stderr
        sin_fecha = caso(fecha=None)
        self.hechos.write_text(json.dumps(sin_fecha), encoding="utf-8")
        r = cli(self.ruta, "evaluar", "--expediente", "EXP-TEST-0502", "--hechos", str(self.hechos))
        self.assertEqual(r.returncode, 2)
        self.assertIn("ERROR expediente.sin_fecha_presentacion: Falta la fecha de presentación", r.stderr)

    def test_descartar_sin_motivo(self):
        # AC-14 en el contrato
        cli(self.ruta, "evaluar", "--expediente", "EXP-TEST-0503", "--hechos", str(self.hechos))
        r = cli(self.ruta, "decidir", "--expediente", "EXP-TEST-0503", "--evaluacion", "1",
                "--regla", "PLOT-ZM6-LOTE-FRENTE", "--descartar", "--motivo", " ", json_=True)
        self.assertEqual(r.returncode, 2)
        self.assertEqual(json.loads(r.stderr)["codigo"], "decision.motivo_obligatorio")

    def test_estado_nunca_dice_aprobado(self):
        # AC-16 en el contrato
        cli(self.ruta, "evaluar", "--expediente", "EXP-TEST-0504", "--hechos", str(self.hechos))
        r = cli(self.ruta, "estado", "--expediente", "EXP-TEST-0504")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("pendiente", r.stdout)
        self.assertNotIn("aprobado", r.stdout.lower())

    def test_error_de_uso_sale_con_1(self):
        self.assertEqual(cli(self.ruta, "evaluar").returncode, 1)

    def test_verificar_y_sellar(self):
        with tempfile.TemporaryDirectory() as anclas:
            self.assertEqual(cli(self.ruta, "sellar", "--destino", anclas).returncode, 0)
            r = cli(self.ruta, "verificar", "--todo", "--sello", str(next(pathlib.Path(anclas).glob("sello-*.json"))))
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
            self.assertIn("íntegra", r.stdout)


if __name__ == "__main__":
    unittest.main()


class TestCliMotivo(unittest.TestCase):
    """Review M4: sin --motivo el error es de negocio (salida 2), no de uso."""

    def test_decidir_sin_motivo(self):
        with tempfile.TemporaryDirectory() as d:
            ruta = pathlib.Path(d) / "b.sqlite3"
            preparar(ruta)
            hechos = pathlib.Path(d) / "h.json"
            hechos.write_text(json.dumps(caso()), encoding="utf-8")
            cli(ruta, "evaluar", "--expediente", "EXP-TEST-0950", "--hechos", str(hechos))
            r = cli(ruta, "decidir", "--expediente", "EXP-TEST-0950", "--evaluacion", "1",
                    "--regla", "PLOT-ZM6-LOTE-FRENTE", "--descartar", json_=True)
            self.assertEqual(r.returncode, 2, r.stderr)
            self.assertEqual(json.loads(r.stderr)["codigo"], "decision.motivo_obligatorio")
