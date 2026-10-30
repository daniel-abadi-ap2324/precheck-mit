"""T11 — fachada y CLI del informe (contracts/cli.md, contracts/public-api.md; AC-07).

La CLI se invoca como subproceso contra una bitácora SQLite descartable; la cuenta real del sistema
es la persona P-0004. Datos ficticios: EXP-TEST-*, P-000*, Test User *.
"""
import contextlib
import io
import json
import os
import pathlib
import sqlite3
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from unittest import mock

import precheck
from precheck import cli as cli_mod
from precheck.informe import huella as hu
from precheck.personas import servicio as per
from tests.apoyo import NORMATIVA, ResolutorFalso, version_vigente
from tests.test_cli import YO, cli, preparar
from tests.test_evaluar import caso

EXP = "EXP-TEST-0970"
FRENTE = "PLOT-ZM6-LOTE-FRENTE"


def abrir(ruta, cuenta=YO):
    return precheck.abrir(ruta, NORMATIVA, resolutor=ResolutorFalso(cuenta))


def revisar(pc, ev, indicar=True):
    for r in ev.resultados:
        if r.resultado == "REQUIERE_REVISION":
            pc.decidir(EXP, ev.seq, r.regla_id, "veredicto", "revisado a mano", veredicto="CUMPLE")
        elif r.resultado == "NO_CUMPLE" and r.severidad == "bloqueante":
            pc.decidir(EXP, ev.seq, r.regla_id, "confirmar", "MOTIVO-INTERNO",
                       indicacion="Amplíe el frente del lote." if indicar else None)
    pc.dar_visto_bueno(EXP, ev.seq, confirmar_sin_ceus=True)


class BaseCli(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.base = pathlib.Path(self.dir.name)
        self.ruta = self.base / "bitacora.sqlite3"
        self.salida = self.base / "salida"
        self.salida.mkdir()
        preparar(self.ruta)
        pc = abrir(self.ruta)
        self.ev = pc.evaluar(EXP, caso())
        pc.cerrar()

    def tearDown(self):
        self.dir.cleanup()

    def revisar(self, indicar=True):
        pc = abrir(self.ruta)
        revisar(pc, self.ev, indicar)
        pc.cerrar()

    def eventos(self):
        pc = abrir(self.ruta)
        try:
            return list(pc.ctx.repo.leer(f"expediente:{EXP}"))
        finally:
            pc.cerrar()

    def cli(self, *args, json_=False):
        return cli(self.ruta, *args, json_=json_)

    def emitir(self, *extra, json_=False):
        return self.cli("emitir", "--expediente", EXP, "--evaluacion", str(self.ev.seq), "--salida", str(self.salida),
                        *extra, json_=json_)

    def archivo(self, nombre, contenido):
        ruta = self.base / nombre
        ruta.write_text(contenido, encoding="utf-8")
        return str(ruta)


class TestFachada(BaseCli):
    def test_metodos_y_tipos_del_contrato(self):
        for tipo in ("Encabezado", "Informe", "Emision", "EstadoEmision", "Afectacion", "VerificacionInforme"):
            self.assertTrue(hasattr(precheck, tipo), tipo)
        self.revisar(indicar=False)
        pc = abrir(self.ruta)
        try:
            ind = pc.indicar(EXP, self.ev.seq, FRENTE, "Amplíe el frente.")
            self.assertEqual(ind.tipo, "indicacion")
            rev = pc.informe_revisor(EXP, self.ev.seq, precheck.Encabezado(finca="F-1"))
            self.assertEqual((type(rev).__name__, rev.version), ("Informe", "revisor"))
            em = pc.emitir(EXP, self.ev.seq)
            self.assertIsInstance(em, precheck.Emision)
            self.assertEqual(pc.verificar_informe(em.informe.documento).resultado, "coincide")
            self.assertEqual(pc.verificar_codigo(EXP, em.codigo).resultado, "coincide")
            self.assertEqual([e.seq for e in pc.emitidos(EXP)], [em.evento.seq])
        finally:
            pc.cerrar()

    def test_decidir_con_indicacion_en_la_fachada(self):
        pc = abrir(self.ruta)
        try:
            d = pc.decidir(EXP, self.ev.seq, FRENTE, "confirmar", "m", indicacion="Amplíe el frente.")
        finally:
            pc.cerrar()
        self.assertEqual([e.tipo for e in self.eventos()[-2:]], ["decision", "indicacion"])
        self.assertEqual(d.tipo, "decision")


class TestInformeYEmitir(BaseCli):
    def test_informe_escribe_la_version_del_revisor_sin_registrar(self):
        antes = self.eventos()
        r = self.cli("informe", "--expediente", EXP, "--evaluacion", str(self.ev.seq), "--salida", str(self.salida))
        self.assertEqual(r.returncode, 0, r.stderr)
        doc = self.salida / f"informe-revisor-{EXP}-{self.ev.seq}.html"
        est = self.salida / f"informe-revisor-{EXP}-{self.ev.seq}.json"
        self.assertTrue(doc.exists() and est.exists())
        self.assertIn("Uso interno", doc.read_text(encoding="utf-8"))
        self.assertEqual(json.loads(est.read_text(encoding="utf-8"))["modelo"]["version"], "revisor")
        self.assertIn(doc.name, r.stdout)
        self.assertEqual(self.eventos(), antes)
        rj = self.cli("informe", "--expediente", EXP, "--evaluacion", str(self.ev.seq), "--salida", str(self.salida),
                      json_=True)
        datos = json.loads(rj.stdout)
        self.assertEqual((datos["version"], datos["evaluacion"]), ("revisor", self.ev.seq))
        self.assertEqual(datos["codigo"], hu.codigo(datos["huella"]))
        self.assertEqual(sorted(pathlib.Path(p).name for p in datos["archivos"]), sorted([doc.name, est.name]))

    def test_informe_de_evaluacion_inexistente(self):
        r = self.cli("informe", "--expediente", EXP, "--evaluacion", "999", "--salida", str(self.salida))
        self.assertEqual(r.returncode, 2)
        self.assertIn(f"ERROR informe.evaluacion_inexistente: La evaluación 999 no está registrada en el expediente "
                      f"{EXP}.", r.stderr)
        self.assertEqual(list(self.salida.iterdir()), [])

    def test_errores_de_uso(self):
        malos = {"invalido.json": "{no es json", "lista.json": "[1, 2]", "clave.json": '{"otra": "x"}',
                 "tipo.json": '{"finca": 12}'}
        base = ["informe", "--expediente", EXP, "--evaluacion", str(self.ev.seq)]
        for nombre, contenido in malos.items():
            with self.subTest(encabezado=nombre):
                r = self.cli(*base, "--salida", str(self.salida), "--encabezado", self.archivo(nombre, contenido))
                self.assertEqual(r.returncode, 1, r.stderr)
        self.assertEqual(self.cli(*base, "--salida", str(self.salida), "--encabezado",
                                  str(self.base / "no-existe.json")).returncode, 1)
        self.assertEqual(self.cli(*base, "--salida", str(self.base / "no-existe")).returncode, 1)
        antes = self.eventos()
        self.revisar()
        n = len(self.eventos())
        self.assertEqual(self.emitir("--salida", str(self.base / "no-existe")).returncode, 1)
        self.assertEqual(len(self.eventos()), n, "sin directorio de salida no se registra la emisión")
        self.assertNotEqual(antes, self.eventos())

    def test_emitir_pendiente_sale_con_2_y_enumera(self):
        r = self.emitir()
        self.assertEqual(r.returncode, 2)
        self.assertTrue(r.stderr.startswith("ERROR informe.expediente_pendiente: La versión del profesional solo "
                                            "se emite con el expediente revisado; falta: "), r.stderr)
        self.assertIn(FRENTE, r.stderr)
        self.assertIn("visto bueno.", r.stderr)
        self.assertEqual(r.stdout, "")
        rj = self.emitir(json_=True)
        err = json.loads(rj.stderr)
        self.assertEqual(err["codigo"], "informe.expediente_pendiente")
        self.assertIn("visto bueno", err["detalles"]["pendientes"])

    def test_emitir_sin_indicacion(self):
        self.revisar(indicar=False)
        r = self.emitir()
        self.assertEqual(r.returncode, 2)
        self.assertIn(f"ERROR informe.sin_indicacion: Toda observación necesita su indicación al profesional; "
                      f"faltan: {FRENTE}.", r.stderr)

    def test_emitir_con_resultados_afectados_dice_que_cambio(self):
        # AC-20 (M2): el mensaje en texto nombra la regla retirada y la fecha
        self.revisar()
        pc = abrir(self.ruta, "cuenta-0001")
        retiro = pc.retirar(FRENTE, version_vigente(FRENTE), "retiro posterior").evento
        pc.cerrar()
        r = self.emitir()
        self.assertEqual(r.returncode, 2)
        self.assertTrue(r.stderr.startswith("ERROR informe.resultados_afectados: "), r.stderr)
        self.assertIn(f"retiro {FRENTE} v{version_vigente(FRENTE)} desde {retiro.ocurrido_en}", r.stderr)
        self.assertIn("reevalúe el expediente", r.stderr)

    def test_emitir_escribe_registra_e_imprime_el_codigo(self):
        self.revisar()
        enc = self.archivo("enc.json", json.dumps({"tramite": "RDP", "finca": "FINCA-777"}))
        r = self.emitir("--encabezado", enc)
        self.assertEqual(r.returncode, 0, r.stderr)
        em = self.eventos()[-1]
        self.assertEqual(em.tipo, "informe_emitido")
        huella = em.payload["huella"]
        doc = self.salida / f"informe-profesional-{EXP}-{self.ev.seq}-{huella[:8]}.html"
        est = self.salida / f"informe-profesional-{EXP}-{self.ev.seq}-{huella[:8]}.json"
        self.assertTrue(doc.exists() and est.exists())
        self.assertIn("FINCA-777", doc.read_text(encoding="utf-8"))
        self.assertIn(f"Emitido: evento {em.seq} · {doc.name}", r.stdout)
        self.assertIn(f"Código: {hu.codigo(huella)}", r.stdout)
        rj = self.emitir("--encabezado", enc, json_=True)
        datos = json.loads(rj.stdout)
        self.assertEqual((rj.returncode, datos["huella"], datos["codigo"]), (0, huella, hu.codigo(huella)))
        self.assertEqual(datos["evento"]["seq"], em.seq + 1)
        self.assertEqual(datos["evento"]["tipo"], "informe_emitido")
        self.assertNotIn("documento", json.dumps(datos))

    def test_bitacora_bloqueada_sale_con_6(self):
        # B8: bloqueo real, con otra conexión que retiene la bitácora en exclusiva
        self.revisar()
        antes = self.eventos()
        otra = sqlite3.connect(str(self.ruta), isolation_level=None)
        try:
            otra.execute("BEGIN EXCLUSIVE")
            r = self.emitir()
        finally:
            otra.execute("ROLLBACK")
            otra.close()
        self.assertEqual(r.returncode, 6, r.stderr)
        self.assertIn("no está disponible", r.stderr)
        self.assertEqual(self.eventos(), antes)
        self.assertEqual(list(self.salida.iterdir()), [])

    @unittest.skipIf(hasattr(os, "geteuid") and os.geteuid() == 0, "root escribe en cualquier directorio")
    @unittest.skipIf(os.name == "nt", "chmod no impide escribir en un directorio en Windows")
    def test_directorio_sin_permiso_de_escritura_no_registra(self):
        # M4: el destino se valida antes de llamar al servicio
        self.revisar()
        antes = self.eventos()
        self.salida.chmod(0o500)
        try:
            r = self.emitir()
        finally:
            self.salida.chmod(0o700)
        self.assertEqual(r.returncode, 1, r.stderr)
        self.assertIn("no se puede escribir", r.stderr)
        self.assertEqual(self.eventos(), antes)

    def test_fallo_al_escribir_despues_de_registrar_sale_con_7(self):
        # M4: la escritura es atómica (temporal + os.replace); si falla con la emisión ya registrada, lo dice
        self.revisar()
        n = len(self.eventos())
        with mock.patch.object(cli_mod.os, "replace", side_effect=OSError("disco lleno")), \
                redirect_stderr(io.StringIO()) as err, redirect_stdout(io.StringIO()) as out:
            codigo = cli_mod.main(["--bitacora", str(self.ruta), "emitir", "--expediente", EXP, "--evaluacion",
                                   str(self.ev.seq), "--salida", str(self.salida)])
        em = self.eventos()[-1]
        self.assertEqual((len(self.eventos()), em.tipo), (n + 1, "informe_emitido"))
        self.assertEqual(codigo, 7, err.getvalue())
        self.assertEqual(out.getvalue(), "")
        self.assertIn(f"la emisión {em.seq} quedó registrada", err.getvalue())
        self.assertIn("misma huella", err.getvalue())
        self.assertIn("disco lleno", err.getvalue())
        self.assertEqual(list(self.salida.iterdir()), [], "sin archivos a medias ni temporales")

    def _falla_en_la_segunda(self, objeto, nombre):
        real = getattr(objeto, nombre)
        llamadas = []

        def segunda_falla(*a, **k):
            llamadas.append(a)
            if len(llamadas) == 2:
                raise OSError("disco lleno")
            return real(*a, **k)
        return mock.patch.object(objeto, nombre, side_effect=segunda_falla)

    def test_si_falla_el_segundo_archivo_no_queda_ninguno(self):
        # N4 (re-revisión): el HTML quedaba escrito aunque el JSON fallara, y el mensaje decía lo contrario
        self.revisar()
        for nombre, parche in (("escritura", self._falla_en_la_segunda(cli_mod.tempfile, "mkstemp")),
                               ("renombre", self._falla_en_la_segunda(cli_mod.os, "replace"))):
            with self.subTest(falla=nombre), parche, redirect_stderr(io.StringIO()) as err, \
                    redirect_stdout(io.StringIO()):
                codigo = cli_mod.main(["--bitacora", str(self.ruta), "emitir", "--expediente", EXP, "--evaluacion",
                                       str(self.ev.seq), "--salida", str(self.salida)])
                self.assertEqual(codigo, 7, err.getvalue())
                self.assertEqual(list(self.salida.iterdir()), [], "ni el HTML ni temporales")
                self.assertIn("no quedó ningún archivo", err.getvalue())

    def _con_reloj(self, instante):
        """Abre la bitácora con un reloj fijo, para que la reemisión difiera en contenido de la primera."""
        real = cli_mod.abrir

        def abrir_con_reloj(*a, **k):
            pc = real(*a, **k)
            pc.ctx.reloj = lambda: instante
            return pc
        return mock.patch.object(cli_mod, "abrir", side_effect=abrir_con_reloj)

    def test_reescritura_fallida_deja_el_par_previo_intacto(self):
        # N4-bis: con destinos que ya existían, si fallaba el segundo renombre quedaba un par MEZCLADO
        # (HTML nuevo + JSON viejo) y el mensaje los listaba como si fueran un par. La reescritura debe
        # dejar el directorio exactamente como estaba, aunque el contenido nuevo sea distinto.
        self.revisar()
        enc = self.base / "otro-encabezado.json"
        enc.write_text(json.dumps({"proyecto": "Proyecto de prueba distinto"}), encoding="utf-8")
        comun = ["--expediente", EXP, "--evaluacion", str(self.ev.seq), "--salida", str(self.salida)]
        casos = {
            # emitir: misma huella (mismo nombre) pero otro instante de emisión → otro contenido
            "emitir": (["emitir", *comun], [], self._con_reloj("2030-01-01T00:00:00Z"), 7),
            # informe del revisor: mismo nombre, otro encabezado → otro contenido
            "informe": (["informe", *comun], ["--encabezado", str(enc)], contextlib.nullcontext(), 1),
        }
        for orden, (args, extra, reloj, salida) in casos.items():
            with self.subTest(orden=orden):
                for p in self.salida.iterdir():
                    p.unlink()
                argv = ["--bitacora", str(self.ruta), *args]
                with redirect_stderr(io.StringIO()), redirect_stdout(io.StringIO()):
                    self.assertEqual(cli_mod.main(argv), 0)
                previos = {p.name: p.read_bytes() for p in self.salida.iterdir()}
                self.assertEqual(len(previos), 2)
                with reloj, self._falla_en_la_segunda(cli_mod.os, "replace"), \
                        redirect_stderr(io.StringIO()) as err, redirect_stdout(io.StringIO()):
                    codigo = cli_mod.main(argv + extra)
                self.assertEqual(codigo, salida, err.getvalue())
                self.assertEqual({p.name: p.read_bytes() for p in self.salida.iterdir()}, previos,
                                 "el par previo, byte a byte, sin temporales ni respaldos")
                self.assertIn("se conservan sin cambios los archivos previos", err.getvalue())
                self.assertNotIn("quedaron:", err.getvalue())
                # control: sin la falla, la reescritura sí cambia el contenido (la prueba no es trivial)
                with reloj, redirect_stderr(io.StringIO()), redirect_stdout(io.StringIO()):
                    self.assertEqual(cli_mod.main(argv + extra), 0)
                self.assertNotEqual({p.name: p.read_bytes() for p in self.salida.iterdir()}, previos)

    def test_informe_del_revisor_tampoco_deja_archivos_a_medias(self):
        with self._falla_en_la_segunda(cli_mod.os, "replace"), redirect_stderr(io.StringIO()) as err, \
                redirect_stdout(io.StringIO()):
            codigo = cli_mod.main(["--bitacora", str(self.ruta), "informe", "--expediente", EXP, "--evaluacion",
                                   str(self.ev.seq), "--salida", str(self.salida)])
        self.assertEqual(codigo, 1, err.getvalue())
        self.assertEqual(list(self.salida.iterdir()), [])
        self.assertIn("no quedó ningún archivo", err.getvalue())


class TestNombresDeArchivo(unittest.TestCase):
    """M4: el id del expediente no puede sacar los archivos del directorio de salida."""

    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.base = pathlib.Path(self.dir.name)
        self.ruta = self.base / "bitacora.sqlite3"
        self.salida = self.base / "a" / "salida"
        self.salida.mkdir(parents=True)
        preparar(self.ruta)

    def tearDown(self):
        self.dir.cleanup()

    def preparar_expediente(self, expediente):
        pc = abrir(self.ruta)
        try:
            ev = pc.evaluar(expediente, caso())
            for r in ev.resultados:
                if r.resultado == "REQUIERE_REVISION":
                    pc.decidir(expediente, ev.seq, r.regla_id, "veredicto", "m", veredicto="CUMPLE")
                elif r.resultado == "NO_CUMPLE" and r.severidad == "bloqueante":
                    pc.decidir(expediente, ev.seq, r.regla_id, "confirmar", "m", indicacion="Amplíe el frente.")
            pc.dar_visto_bueno(expediente, ev.seq, confirmar_sin_ceus=True)
            return ev
        finally:
            pc.cerrar()

    def test_id_con_separadores_se_sanea_dentro_del_directorio(self):
        for expediente in ("../fuera", "RDP/2026-7", "EXP 1\\x"):
            with self.subTest(expediente=expediente):
                ev = self.preparar_expediente(expediente)
                antes = set(self.salida.iterdir())
                r = cli(self.ruta, "emitir", "--expediente", expediente, "--evaluacion", str(ev.seq), "--salida",
                        str(self.salida), json_=True)
                self.assertEqual(r.returncode, 0, r.stderr)
                nuevos = sorted(set(self.salida.iterdir()) - antes)
                self.assertEqual(len(nuevos), 2, nuevos)
                self.assertEqual(sorted(p.name for p in self.base.rglob("informe-*")),
                                 sorted(p.name for p in self.salida.iterdir()), "nada fuera de --salida")
                nombre = cli_mod.nombre_de_archivo(expediente)
                self.assertRegex(nombre, r"^[A-Za-z0-9._-]+$")
                self.assertEqual(nombre, cli_mod.nombre_de_archivo(expediente), "saneado determinista")
                self.assertTrue(all(p.name.startswith(f"informe-profesional-{nombre}-{ev.seq}-") for p in nuevos))
                self.assertEqual(sorted(json.loads(r.stdout)["archivos"]), sorted(map(str, nuevos)))

    def test_id_largo_se_acota_y_emite_una_sola_vez(self):
        # N2 (re-revisión): un id largo registraba la emisión y fallaba al escribir (Errno 36, salida 7)
        for expediente in ("A" * 300, "ñ" * 200):
            with self.subTest(expediente=expediente[:3]):
                ev = self.preparar_expediente(expediente)
                antes = set(self.salida.iterdir())
                r = cli(self.ruta, "emitir", "--expediente", expediente, "--evaluacion", str(ev.seq), "--salida",
                        str(self.salida), json_=True)
                self.assertEqual(r.returncode, 0, r.stderr)
                nuevos = sorted(set(self.salida.iterdir()) - antes)
                self.assertEqual(len(nuevos), 2, nuevos)
                limite = os.pathconf(self.salida, "PC_NAME_MAX") if hasattr(os, "pathconf") else 255   # Windows: 255
                self.assertTrue(all(len(p.name.encode("utf-8")) <= limite for p in nuevos))
                nombre = cli_mod.nombre_de_archivo(expediente)
                self.assertLessEqual(len(nombre.encode("utf-8")), 100 + 9)
                self.assertRegex(nombre, r"-[0-9a-f]{8}$", "acotado siempre lleva el sufijo SHA-256")
                pc = abrir(self.ruta)
                try:
                    tipos = [e.tipo for e in pc.ctx.repo.leer(f"expediente:{expediente}")]
                finally:
                    pc.cerrar()
                self.assertEqual(tipos.count("informe_emitido"), 1)

    def test_ids_largos_acotados_no_chocan(self):
        self.assertNotEqual(cli_mod.nombre_de_archivo("A" * 300), cli_mod.nombre_de_archivo("A" * 301))
        self.assertEqual(cli_mod.nombre_de_archivo("A" * 100), "A" * 100)

    def test_nombre_que_no_cabe_sale_con_1_sin_registrar(self):
        # N2: se comprueba contra PC_NAME_MAX antes de emitir
        ev = self.preparar_expediente("EXP-TEST-0971")
        cadena = "expediente:EXP-TEST-0971"
        pc = abrir(self.ruta)
        antes = list(pc.ctx.repo.leer(cadena))
        pc.cerrar()
        with mock.patch.object(cli_mod.os, "pathconf", return_value=40, create=True), \
                redirect_stderr(io.StringIO()) as err, redirect_stdout(io.StringIO()):
            codigo = cli_mod.main(["--bitacora", str(self.ruta), "emitir", "--expediente", "EXP-TEST-0971",
                                   "--evaluacion", str(ev.seq), "--salida", str(self.salida)])
        self.assertEqual(codigo, 1, err.getvalue())
        self.assertIn("nombre de archivo", err.getvalue())
        pc = abrir(self.ruta)
        try:
            self.assertEqual(list(pc.ctx.repo.leer(cadena)), antes)
        finally:
            pc.cerrar()
        self.assertEqual(list(self.salida.iterdir()), [])

    def test_id_valido_no_cambia_y_saneados_distintos_no_chocan(self):
        self.assertEqual(cli_mod.nombre_de_archivo("EXP-TEST-0970.v2_a"), "EXP-TEST-0970.v2_a")
        self.assertNotEqual(cli_mod.nombre_de_archivo("RDP/2026-7"), cli_mod.nombre_de_archivo("RDP:2026-7"))


class TestEstadoPendiente(BaseCli):
    def test_un_solo_termino_para_el_estado_pendiente(self):
        # AC-02 (B4): la CLI y el informe muestran «pendiente de revisión humana»; el valor interno sigue «pendiente»
        r = self.cli("estado", "--expediente", EXP)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn(f"evaluación #{self.ev.seq} · pendiente de revisión humana · pendiente:", r.stdout)
        self.assertEqual(json.loads(self.cli("estado", "--expediente", EXP, json_=True).stdout)["estado"], "pendiente")
        r = self.cli("informe", "--expediente", EXP, "--evaluacion", str(self.ev.seq), "--salida", str(self.salida),
                     json_=True)
        doc = pathlib.Path(next(p for p in json.loads(r.stdout)["archivos"] if p.endswith(".html")))
        self.assertIn("pendiente de revisión humana", doc.read_text(encoding="utf-8"))
        hechos = self.archivo("hechos.json", json.dumps(caso()))
        r = self.cli("evaluar", "--expediente", "EXP-TEST-0971", "--hechos", hechos)
        self.assertIn("pendiente de revisión humana", r.stdout)


class TestIndicarYDecidir(BaseCli):
    def test_indicar(self):
        r = self.cli("decidir", "--expediente", EXP, "--evaluacion", str(self.ev.seq), "--regla", FRENTE,
                     "--confirmar", "--motivo", "m")
        self.assertEqual(r.returncode, 0, r.stderr)
        r = self.cli("indicar", "--expediente", EXP, "--evaluacion", str(self.ev.seq), "--regla", FRENTE,
                     "--texto", "Amplíe el frente.")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("indicacion", r.stdout)
        self.assertEqual(self.eventos()[-1].payload["texto"], "Amplíe el frente.")
        r = self.cli("indicar", "--expediente", EXP, "--evaluacion", str(self.ev.seq), "--regla", FRENTE,
                     "--texto", "   ")
        self.assertEqual(r.returncode, 2)
        self.assertIn("ERROR informe.indicacion_vacia:", r.stderr)
        self.assertEqual(self.cli("indicar", "--expediente", EXP, "--evaluacion", str(self.ev.seq),
                                  "--regla", FRENTE).returncode, 1)

    def test_decidir_con_indicacion(self):
        base = ["decidir", "--expediente", EXP, "--evaluacion", str(self.ev.seq), "--regla", FRENTE, "--motivo", "m"]
        r = self.cli(*base, "--descartar", "--indicacion", "Haga algo.")
        self.assertEqual(r.returncode, 2)
        self.assertIn("ERROR informe.indicacion_no_aplicable:", r.stderr)
        self.assertEqual(len(self.eventos()), 1)
        r = self.cli(*base, "--confirmar", "--indicacion", "Amplíe el frente.")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual([e.tipo for e in self.eventos()[-2:]], ["decision", "indicacion"])


class TestVerificarYEmitidos(BaseCli):
    def setUp(self):
        super().setUp()
        self.revisar()
        r = self.emitir()
        self.assertEqual(r.returncode, 0, r.stderr)
        self.em = self.eventos()[-1]
        self.doc = next(self.salida.glob("informe-profesional-*.html"))
        self.codigo = hu.codigo(self.em.payload["huella"])

    def verificar(self, *args, json_=False):
        return self.cli("verificar-informe", *args, json_=json_)

    def test_por_archivo_coincide(self):
        r = self.verificar("--archivo", str(self.doc))
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn(f"coincide · emisión {self.em.seq} · evaluación {self.ev.seq} · {self.em.actor} · "
                      f"{self.em.ocurrido_en} · vigente", r.stdout)
        rj = self.verificar("--archivo", str(self.doc.with_suffix(".json")), json_=True)
        datos = json.loads(rj.stdout)
        self.assertEqual((rj.returncode, datos["resultado"], datos["trazabilidad_coincide"]), (0, "coincide", True))
        self.assertEqual(datos["emisiones"][0]["expediente_id"], EXP)

    def test_por_archivo_alterado_o_trazabilidad_distinta_sale_con_3(self):
        texto = self.doc.read_text(encoding="utf-8")
        alterado = self.archivo("alterado.html", texto.replace("Amplíe el frente del lote.", "Nada.", 1))
        r = self.verificar("--archivo", alterado)
        self.assertEqual(r.returncode, 3)
        self.assertIn("no_coincide", r.stdout)
        otra = self.archivo("traz.html", texto.replace(self.em.ocurrido_en, "2020-01-01T00:00:00Z"))
        r = self.verificar("--archivo", otra)
        self.assertEqual(r.returncode, 3)
        self.assertIn("coincide", r.stdout)
        self.assertIn("trazabilidad no coincide", r.stdout)

    def test_archivo_no_verificable_y_otro_formato(self):
        r = self.verificar("--archivo", self.archivo("convertido.html", "<html><body>copia</body></html>"))
        self.assertEqual(r.returncode, 2)
        self.assertIn("ERROR informe.archivo_no_verificable:", r.stderr)
        datos = json.loads(self.doc.with_suffix(".json").read_text(encoding="utf-8"))
        datos["modelo"]["formato_informe"] = "0.9.0"
        viejo = self.archivo("viejo.json", json.dumps(datos))
        r = self.verificar("--archivo", viejo)
        self.assertEqual(r.returncode, 3, r.stdout + r.stderr)          # M5: sin emisión con esa huella
        self.assertIn("no_coincide", r.stdout)
        pc = abrir(self.ruta)
        pc.ctx.anexar(f"expediente:{EXP}", "informe_emitido", "P-0004", "revisor_doyc",
                      {**self.em.payload, "formato_informe": "0.9.0", "huella": hu.huella(datos["modelo"])})
        pc.cerrar()
        r = self.verificar("--archivo", viejo)
        self.assertEqual(r.returncode, 5, r.stdout + r.stderr)
        self.assertIn("no_verificable_version", r.stdout)

    def test_por_codigo_con_salida(self):
        r = self.verificar("--expediente", EXP, "--codigo", " ".join(self.codigo.split()[:4]),
                           "--salida", str(self.salida))
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("Aviso: El código prueba que la emisión existe, no que la copia esté íntegra.", r.stdout)
        regenerado = self.salida / f"regenerado-{EXP}-{self.em.seq}.html"
        self.assertTrue(regenerado.exists())
        self.assertIn("no conservado", regenerado.read_text(encoding="utf-8"))
        self.assertEqual(self.verificar("--expediente", EXP, "--codigo", "0" * 20).returncode, 3)
        r = self.verificar("--expediente", EXP, "--codigo", self.codigo[:10])
        self.assertEqual(r.returncode, 2)
        self.assertIn("ERROR informe.codigo_corto:", r.stderr)

    def test_verificar_uso_invalido(self):
        for args in ((), ("--archivo", str(self.doc), "--expediente", EXP, "--codigo", self.codigo),
                     ("--codigo", self.codigo), ("--expediente", EXP),
                     ("--archivo", str(self.base / "no-existe.html")),
                     ("--expediente", EXP, "--codigo", self.codigo, "--salida", str(self.base / "no-existe"))):
            with self.subTest(args=args):
                self.assertEqual(self.verificar(*args).returncode, 1)

    def test_emitidos_y_reemplazada_sale_con_0(self):
        r = self.cli("emitidos", "--expediente", EXP)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn(f"emisión {self.em.seq} · evaluación {self.ev.seq}", r.stdout)
        self.assertIn("vigente", r.stdout)
        pc = abrir(self.ruta, "cuenta-0001")
        pc.retirar(FRENTE, version_vigente(FRENTE), "retiro posterior")
        pc.cerrar()
        pc = abrir(self.ruta)
        nueva = pc.evaluar(EXP, caso())
        pc.cerrar()
        rj = self.cli("emitidos", "--expediente", EXP, json_=True)
        (e,) = json.loads(rj.stdout)
        self.assertEqual((e["vigencia"], e["reemplazado_por"]), ("reemplazado", nueva.seq))
        self.assertEqual(e["afectaciones"][0]["referencia"], f"{FRENTE} v{version_vigente(FRENTE)}")
        r = self.cli("emitidos", "--expediente", EXP)
        self.assertIn("reemplazado", r.stdout)
        self.assertIn(f"retiro {FRENTE} v{version_vigente(FRENTE)}", r.stdout)
        r = self.verificar("--archivo", str(self.doc))
        self.assertEqual(r.returncode, 0)
        self.assertIn("reemplazado", r.stdout)


class TestEmitidosTexto(BaseCli):
    def test_suspension_levantada_se_rotula_estuvo_afectada(self):
        # B3: el período levantado no se muestra como «afectada»
        self.revisar()
        self.assertEqual(self.emitir().returncode, 0)
        pc = abrir(self.ruta, "cuenta-0001")
        prop = pc.proponer_suspension("PLOT-A61-2021", "nulidad")
        pc.cerrar()
        pc = abrir(self.ruta, "cuenta-0002")
        conf = pc.confirmar(prop.seq).evento
        lev = pc.proponer_levantamiento("PLOT-A61-2021", "desestimada")
        pc.cerrar()
        pc = abrir(self.ruta, "cuenta-0001")
        levc = pc.confirmar(lev.seq).evento
        pc.cerrar()
        r = self.cli("emitidos", "--expediente", EXP)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn(f"estuvo afectada (levantada {levc.ocurrido_en}): suspension PLOT-A61-2021 desde "
                      f"{conf.ocurrido_en}", r.stdout)
        self.assertNotIn("    afectada:", r.stdout)


class TestAutorizacion(unittest.TestCase):
    """AC-07 desde fuera: sin el rol o sin persona vinculada, salida 2 y nada del expediente."""

    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.base = pathlib.Path(self.dir.name)
        self.doc = self.base / "doc.html"
        self.doc.write_text("<html></html>", encoding="utf-8")

    def tearDown(self):
        self.dir.cleanup()

    def comandos(self):
        comunes = ["--expediente", EXP, "--evaluacion", "1"]
        return {
            "informe": ["informe", *comunes, "--salida", str(self.base)],
            "emitir": ["emitir", *comunes, "--salida", str(self.base)],
            "indicar": ["indicar", *comunes, "--regla", FRENTE, "--texto", "x"],
            "verificar-archivo": ["verificar-informe", "--archivo", str(self.doc)],
            "verificar-codigo": ["verificar-informe", "--expediente", EXP, "--codigo", "0" * 16],
            "emitidos": ["emitidos", "--expediente", EXP],
            "decidir": ["decidir", *comunes, "--regla", FRENTE, "--confirmar", "--motivo", "m", "--indicacion", "x"],
        }

    def comprobar(self, ruta, codigo):
        for nombre, args in self.comandos().items():
            with self.subTest(comando=nombre):
                r = cli(ruta, *args)
                self.assertEqual(r.returncode, 2, r.stderr)
                self.assertTrue(r.stderr.startswith(f"ERROR {codigo}:"), r.stderr)
                self.assertEqual(r.stdout, "")
                self.assertNotIn(FRENTE, r.stderr)

    def test_redactor_sin_rol(self):
        ruta = self.base / "b1.sqlite3"
        preparar(ruta, rol_de_yo="redactor")
        self.comprobar(ruta, "identidad.sin_rol")

    def test_cuenta_sin_persona(self):
        ruta = self.base / "b2.sqlite3"
        pc = precheck.abrir(ruta, NORMATIVA, resolutor=ResolutorFalso("cuenta-0001"))
        per.inicializar(pc.ctx, "P-0001", "Test User 1", "P-0002", "Test User 2", "cuenta-0002")
        pc.cerrar()
        self.comprobar(ruta, "identidad.cuenta_no_vinculada")


if __name__ == "__main__":
    unittest.main()
