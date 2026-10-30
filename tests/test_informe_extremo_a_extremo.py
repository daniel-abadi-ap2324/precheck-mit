"""T12 — informe de punta a punta por la entrada real `python3 -m precheck` (AC-07, AC-16 y bordes del test-plan).

La CLI resuelve la identidad desde la cuenta real del sistema (persona P-0004, Revisor DOYC); la segunda
Revisora DOYC (P-0005) y los aprobadores actúan por la biblioteca con el resolutor de pruebas sobre la
misma bitácora SQLite descartable. Datos ficticios: EXP-TEST-*, P-000*, Test User *.
"""
import contextlib
import json
import pathlib
import re
import sqlite3
import tempfile
import unicodedata
import unittest

import precheck
from precheck.errores import ErrorPreCheck
from precheck.informe import html
from precheck.informe import huella as hu
from precheck.personas import servicio as per
from precheck.reglas.gobierno import cubre
from tests.apoyo import NORMATIVA, ResolutorFalso, version_vigente
from tests.test_cli import YO, cli, preparar
from tests.test_evaluar import CATALOGO, caso

FRENTE = "PLOT-ZM6-LOTE-FRENTE"          # NO_CUMPLE bloqueante oficial con el caso «excede»
ATAQUE = '<script>alert("x")</script> & "comillas"'
INDICACION = f"Amplíe el frente del lote a 16 m. {ATAQUE}"
ENCABEZADO = {"tramite": "RDP", "proyecto": f"Edificio Peña {ATAQUE}", "profesional": "José Núñez"}


@contextlib.contextmanager
def biblioteca(ruta, cuenta):
    pc = precheck.abrir(ruta, NORMATIVA, resolutor=ResolutorFalso(cuenta))
    try:
        yield pc
    finally:
        pc.cerrar()


def escenario(ruta, rol_de_yo="revisor_doyc"):
    """Bitácora de `preparar` (catálogo completo propuesto, frente aprobada) + Revisora DOYC P-0005."""
    preparar(ruta, rol_de_yo)
    res = ResolutorFalso("cuenta-0001")
    pc = precheck.abrir(ruta, NORMATIVA, resolutor=res)
    try:
        seq = per.vincular_cuenta(pc.ctx, "P-0005", "Test User 0005", "cuenta-0005").seq
        res.cuenta = "cuenta-0005"
        per.confirmar(pc.ctx, seq)
        res.cuenta = "cuenta-0001"
        seq = per.designar(pc.ctx, "P-0005", "revisor_doyc", "alta en pruebas").seq
        res.cuenta = "cuenta-0002"
        per.confirmar(pc.ctx, seq)
    finally:
        pc.cerrar()


def decidir_resto(ruta, expediente, ev, cuenta="cuenta-0005"):
    """La segunda revisora decide cada REQUIERE_REVISION y cada norma sin reglas (el NO_CUMPLE queda a la CLI)."""
    with biblioteca(ruta, cuenta) as pc:
        for r in ev["resultados"]:
            if r["resultado"] == "REQUIERE_REVISION":
                pc.decidir(expediente, ev["seq"], r["regla_id"], "veredicto", "revisado a mano", veredicto="CUMPLE")
        for n in ev["cobertura"]["normas_sin_reglas"]:
            pc.decidir(expediente, ev["seq"], f"norma:{n}", "veredicto", "revisado", veredicto="CUMPLE")


def eventos(ruta, expediente):
    with biblioteca(ruta, YO) as pc:
        return list(pc.ctx.repo.leer(f"expediente:{expediente}"))


class BaseCli(unittest.TestCase):
    ruta: pathlib.Path
    base: pathlib.Path

    def cli(self, *args, json_=False):
        return cli(self.ruta, *args, json_=json_)

    def ok(self, *args, json_=False):
        r = self.cli(*args, json_=json_)
        self.assertEqual(r.returncode, 0, f"{args}: {r.stdout}{r.stderr}")
        return json.loads(r.stdout) if json_ else r

    def salida(self, codigo, *args, json_=False):
        r = self.cli(*args, json_=json_)
        self.assertEqual(r.returncode, codigo, f"{args}: {r.stdout}{r.stderr}")
        return r

    def archivo(self, nombre, contenido):
        ruta = self.base / nombre
        ruta.write_text(contenido, encoding="utf-8")
        return str(ruta)

    def evaluar(self, expediente):
        hechos = self.archivo(f"hechos-{expediente}.json", json.dumps(caso()))
        return self.ok("evaluar", "--expediente", expediente, "--hechos", hechos, json_=True)

    def revisar(self, expediente, ev, texto=INDICACION):
        """Segunda revisora por biblioteca; el NO_CUMPLE con indicación y el visto bueno por la CLI."""
        decidir_resto(self.ruta, expediente, ev)
        seq = str(ev["seq"])
        for r in ev["resultados"]:
            if r["resultado"] == "NO_CUMPLE" and r["severidad"] == "bloqueante":
                self.ok("decidir", "--expediente", expediente, "--evaluacion", seq, "--regla", r["regla_id"],
                        "--confirmar", "--motivo", "MOTIVO-INTERNO", "--indicacion", texto)
        self.ok("visto-bueno", "--expediente", expediente, "--evaluacion", seq, "--dar", "--confirmar-sin-ceus")

    def emitir(self, expediente, seq, directorio, encabezado=None):
        extra = ["--encabezado", encabezado] if encabezado else []
        return self.ok("emitir", "--expediente", expediente, "--evaluacion", str(seq), "--salida", str(directorio),
                       *extra, json_=True)


class TestRecorridoCompleto(BaseCli):
    """evaluar → decidir con indicación → visto bueno → emitir (dos revisoras) → verificar → indicar → emitir →
    retirar la regla → emitidos afectado → emitir rechaza → reevaluar → emitir → la primera queda reemplazada."""

    EXP = "EXP-TEST-1200"

    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.base = pathlib.Path(self.dir.name)
        self.ruta = self.base / "bitacora.sqlite3"
        self.inf = self.base / "informes"
        self.inf.mkdir()
        escenario(self.ruta)

    def tearDown(self):
        self.dir.cleanup()

    def test_recorrido_por_la_cli(self):
        exp_, enc = self.EXP, self.archivo("enc.json", json.dumps(ENCABEZADO))
        ev = self.evaluar(exp_)
        seq = str(ev["seq"])
        # El catálogo completo seleccionado para la fecha: un resultado por cada regla de reglas/ con una versión vigente el
        # 2025-06-01. Antes era un número fijo (547 el 9 de octubre) que dejaba de cuadrar con cada regla nueva del catálogo.
        vigentes = {r["id"] for r in CATALOGO if cubre(r.get("vigencia") or {}, "2025-06-01")}
        self.assertEqual({r["regla_id"] for r in ev["resultados"]}, vigentes)
        self.assertEqual(len(ev["resultados"]), len(vigentes))

        # versión del revisor antes de revisar: pendiente, uso interno, nada registrado
        n = len(eventos(self.ruta, exp_))
        rev = self.ok("informe", "--expediente", exp_, "--evaluacion", seq, "--salida", str(self.inf), json_=True)
        doc_rev = pathlib.Path(next(p for p in rev["archivos"] if p.endswith(".html"))).read_text(encoding="utf-8")
        self.assertIn("Uso interno", doc_rev)
        self.assertEqual(len(eventos(self.ruta, exp_)), n)
        r = self.salida(2, "emitir", "--expediente", exp_, "--evaluacion", seq, "--salida", str(self.inf))
        self.assertIn("ERROR informe.expediente_pendiente:", r.stderr)
        self.assertIn("visto bueno", r.stderr)

        # decidir con indicación (P-0004 por CLI; P-0005 decide el resto) y visto bueno
        self.revisar(exp_, ev)
        self.assertEqual([e.tipo for e in eventos(self.ruta, exp_)[-3:]], ["decision", "indicacion", "visto_bueno"])

        # emitir (P-0004 por CLI) y la misma emisión por P-0005 con el encabezado escrito distinto (AC-16)
        em1 = self.emitir(exp_, seq, self.inf, enc)
        nfd = {k: unicodedata.normalize("NFD", f"  {v} ") for k, v in ENCABEZADO.items()}
        with biblioteca(self.ruta, "cuenta-0005") as pc:
            em2 = pc.emitir(exp_, ev["seq"], precheck.Encabezado(**nfd))
        self.assertEqual(em2.informe.huella, em1["huella"])
        self.assertNotEqual(em2.evento.seq, em1["evento"]["seq"])
        self.assertEqual((em1["evento"]["actor"], em2.evento.actor), ("P-0004", "P-0005"))
        doc1 = pathlib.Path(next(p for p in em1["archivos"] if p.endswith(".html")))
        est1 = pathlib.Path(next(p for p in em1["archivos"] if p.endswith(".json")))

        # verificar por archivo (documento y forma estructurada) y por código
        for archivo in (doc1, est1):
            v = self.ok("verificar-informe", "--archivo", str(archivo), json_=True)
            self.assertEqual((v["resultado"], v["trazabilidad_coincide"]), ("coincide", True))
            self.assertEqual([e["seq"] for e in v["emisiones"]], [em1["evento"]["seq"], em2.evento.seq])
            self.assertEqual({e["expediente_id"] for e in v["emisiones"]}, {exp_})
        r = self.ok("verificar-informe", "--expediente", exp_, "--codigo", em1["codigo"])
        self.assertIn("coincide · emisión", r.stdout)
        self.assertIn("no que la copia esté íntegra", r.stdout)

        # una indicación nueva cambia la huella de la emisión siguiente (AC-16)
        self.ok("indicar", "--expediente", exp_, "--evaluacion", seq, "--regla", FRENTE,
                "--texto", "Amplíe el frente a 16 m y adjunte el levantamiento.")
        em3 = self.emitir(exp_, seq, self.inf, enc)
        self.assertNotEqual(em3["huella"], em1["huella"])
        vig = {e["seq"]: e["vigencia"] for e in self.ok("emitidos", "--expediente", exp_, json_=True)}
        self.assertEqual(vig, {em1["evento"]["seq"]: "sustituida", em2.evento.seq: "sustituida",
                               em3["evento"]["seq"]: "vigente"})

        # retiro de la versión usada: el redactor no puede; un aprobador distinto del redactor sí
        with biblioteca(self.ruta, "cuenta-0003") as pc, self.assertRaises(ErrorPreCheck) as rechazo:
            pc.retirar(FRENTE, version_vigente(FRENTE), "error de transcripción")
        self.assertEqual(rechazo.exception.codigo, "gobierno.sin_designacion")
        with biblioteca(self.ruta, "cuenta-0002") as pc:
            pc.retirar(FRENTE, version_vigente(FRENTE), "error de transcripción")
        r = self.ok("emitidos", "--expediente", exp_)
        self.assertIn(f"afectada: retiro {FRENTE} v{version_vigente(FRENTE)} desde", r.stdout)
        r = self.salida(2, "emitir", "--expediente", exp_, "--evaluacion", seq, "--salida", str(self.inf))
        self.assertTrue(r.stderr.startswith("ERROR informe.resultados_afectados:"), r.stderr)

        # reevaluar, revisar y emitir de nuevo: otra huella; las anteriores quedan reemplazadas
        nueva = self.evaluar(exp_)
        self.revisar(exp_, nueva)
        em4 = self.emitir(exp_, nueva["seq"], self.inf, enc)
        self.assertNotIn(em4["huella"], (em1["huella"], em3["huella"]))
        estados = {e["seq"]: e for e in self.ok("emitidos", "--expediente", exp_, json_=True)}
        self.assertEqual(estados[em4["evento"]["seq"]]["vigencia"], "vigente")
        self.assertEqual((estados[em3["evento"]["seq"]]["vigencia"], estados[em3["evento"]["seq"]]["reemplazado_por"]),
                         ("reemplazado", nueva["seq"]))
        r = self.ok("emitidos", "--expediente", exp_)
        self.assertIn(f"reemplazado por la evaluación {nueva['seq']}", r.stdout)
        v = self.ok("verificar-informe", "--archivo", str(doc1), json_=True)      # sigue coincidiendo: es información
        self.assertEqual(v["resultado"], "coincide")
        self.assertEqual({(e["vigencia"], e["reemplazado_por"]) for e in v["emisiones"]},
                         {("reemplazado", nueva["seq"])})                            # el reemplazo prevalece
        self.assertIn(f"{exp_}: {em4['evento']['seq']}", v["aviso"])


class TestBordesCli(BaseCli):
    """Bordes del test-plan sobre una sola emisión preparada para toda la clase (las pruebas no escriben)."""

    EXP = "EXP-TEST-1201"

    @classmethod
    def setUpClass(cls):
        cls.dir = tempfile.TemporaryDirectory()
        cls.base = pathlib.Path(cls.dir.name)
        cls.ruta = cls.base / "bitacora.sqlite3"
        cls.inf = cls.base / "informes"
        cls.inf.mkdir()
        escenario(cls.ruta)
        yo = cls("test_codigo_corto_y_con_espacios_o_guiones")
        yo.setUp()
        cls.ev = yo.evaluar(cls.EXP)
        yo.revisar(cls.EXP, cls.ev)
        cls.em = yo.emitir(cls.EXP, cls.ev["seq"], cls.inf, yo.archivo("enc.json", json.dumps(ENCABEZADO)))
        cls.doc = pathlib.Path(next(p for p in cls.em["archivos"] if p.endswith(".html")))
        cls.est = cls.doc.with_suffix(".json")
        cls.texto = cls.doc.read_text(encoding="utf-8")

    @classmethod
    def tearDownClass(cls):
        cls.dir.cleanup()

    def verificar(self, codigo, *args):
        return self.salida(codigo, "verificar-informe", *args)

    def test_codigo_corto_y_con_espacios_o_guiones(self):
        compacto = hu.normalizar_codigo(self.em["codigo"])
        r = self.verificar(2, "--expediente", self.EXP, "--codigo", compacto[:15])
        self.assertTrue(r.stderr.startswith("ERROR informe.codigo_corto:"), r.stderr)
        self.assertEqual(r.stdout, "")
        con_guiones = "-".join(compacto[i:i + 4] for i in range(0, 16, 4))
        con_espacios = " " + " ".join(compacto[i:i + 2] for i in range(0, 20, 2)) + " "
        for codigo in (con_guiones, con_espacios, con_guiones.upper()):
            with self.subTest(codigo=codigo):
                r = self.verificar(0, "--expediente", self.EXP, "--codigo", codigo)
                self.assertIn(f"coincide · emisión {self.em['evento']['seq']}", r.stdout)

    def test_texto_visible_editado_con_el_modelo_intacto_no_coincide(self):
        inicio = self.texto.index("<main")               # el cuerpo va antes del bloque de datos embebido
        i = self.texto.index("Amplíe el frente", inicio)
        editado = self.texto[:i] + "Reduzca el frente" + self.texto[i + len("Amplíe el frente"):]
        self.assertEqual(html.extraer(editado), html.extraer(self.texto))          # modelo embebido intacto
        r = self.verificar(3, "--archivo", self.archivo("visible.html", editado))
        self.assertTrue(r.stdout.startswith("no_coincide"), r.stdout)
        self.assertIn("Contenido alterado", r.stdout)

    def test_trazabilidad_editada_sale_con_3_y_avisa(self):
        cuando = self.em["evento"]["ocurrido_en"]
        self.assertIn(cuando, self.texto)
        r = self.verificar(3, "--archivo", self.archivo("traz.html", self.texto.replace(cuando, "2020-01-01T00:00:00Z")))
        self.assertTrue(r.stdout.startswith("coincide"), r.stdout)
        self.assertIn("la trazabilidad no coincide", r.stdout)
        datos = json.loads(self.est.read_text(encoding="utf-8"))
        datos["trazabilidad"]["emitido_por"] = "P-0005"
        r = self.salida(3, "verificar-informe", "--archivo", self.archivo("traz.json", json.dumps(datos)), json_=True)
        v = json.loads(r.stdout)
        self.assertEqual((v["resultado"], v["trazabilidad_coincide"]), ("coincide", False))

    def test_formato_alterado_sin_emision_sale_con_3(self):
        # M5: sin emisión registrada con esa huella, «no coincide» aunque el formato sea otro
        datos = json.loads(self.est.read_text(encoding="utf-8"))
        datos["modelo"]["formato_informe"] = "0.9.0"
        r = self.verificar(3, "--archivo", self.archivo("viejo.json", json.dumps(datos)))
        self.assertTrue(r.stdout.startswith("no_coincide"), r.stdout)
        self.assertNotIn("no_verificable_version", r.stdout)

    def test_script_en_indicacion_y_encabezado_escapado(self):
        self.assertEqual(re.findall(r"<script\b[^>]*>", self.texto, re.I),
                         ['<script type="application/json" id="precheck-informe-modelo">'])
        self.assertEqual(self.texto.count("</script>"), 1)
        self.assertIsNone(re.search(r"\b(src|href)\s*=", self.texto, re.I))
        self.assertNotRegex(self.texto, r"\son[a-z]+\s*=")
        visible = html.texto_visible(self.texto)
        self.assertIn(INDICACION, visible)
        self.assertIn(ENCABEZADO["proyecto"], visible)
        self.assertIn("&lt;script&gt;alert(", self.texto)
        modelo, _ = html.extraer(self.texto)
        self.assertEqual(modelo["encabezado"]["proyecto"], ENCABEZADO["proyecto"])

    def test_bitacora_bloqueada_sale_con_6_sin_evento_a_medias(self):
        antes = eventos(self.ruta, self.EXP)
        vacio = self.base / "bloqueada"
        vacio.mkdir()
        otra = sqlite3.connect(str(self.ruta), isolation_level=None)
        try:
            otra.execute("BEGIN IMMEDIATE")          # otro escritor retiene la bitácora
            r = self.salida(6, "emitir", "--expediente", self.EXP, "--evaluacion", str(self.ev["seq"]),
                            "--salida", str(vacio))
        finally:
            otra.execute("ROLLBACK")
            otra.close()
        self.assertTrue(r.stderr.startswith("ERROR operación: La bitácora no está disponible"), r.stderr)
        self.assertEqual(r.stdout, "")
        self.assertEqual(eventos(self.ruta, self.EXP), antes)
        self.assertEqual(list(vacio.iterdir()), [])


class TestAutorizacionConExpedienteReal(BaseCli):
    """AC-07: la cuenta real es Redactora; el expediente existe y tiene una emisión de P-0005. Las siete
    operaciones del informe se deniegan con salida 2 y el mensaje no revela nada del expediente."""

    EXP = "EXP-TEST-1202"

    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.base = pathlib.Path(self.dir.name)
        self.ruta = self.base / "bitacora.sqlite3"
        escenario(self.ruta, rol_de_yo="redactor")
        with biblioteca(self.ruta, "cuenta-0005") as pc:
            ev = pc.evaluar(self.EXP, caso())
            for r in ev.resultados:
                if r.resultado == "REQUIERE_REVISION":
                    pc.decidir(self.EXP, ev.seq, r.regla_id, "veredicto", "revisado a mano", veredicto="CUMPLE")
                elif r.resultado == "NO_CUMPLE":
                    pc.decidir(self.EXP, ev.seq, r.regla_id, "confirmar", "MOTIVO-INTERNO", indicacion=INDICACION)
            pc.dar_visto_bueno(self.EXP, ev.seq, confirmar_sin_ceus=True)
            self.em = pc.emitir(self.EXP, ev.seq)
        self.seq = str(ev.seq)
        self.doc = self.archivo("emitido.html", self.em.informe.documento)

    def tearDown(self):
        self.dir.cleanup()

    def test_redactor_denegado_en_cada_operacion_del_informe(self):
        comunes = ["--expediente", self.EXP, "--evaluacion", self.seq]
        comandos = {
            "informe": ["informe", *comunes, "--salida", str(self.base)],
            "emitir": ["emitir", *comunes, "--salida", str(self.base)],
            "indicar": ["indicar", *comunes, "--regla", FRENTE, "--texto", "x"],
            "decidir-con-indicacion": ["decidir", *comunes, "--regla", FRENTE, "--confirmar", "--motivo", "m",
                                       "--indicacion", "x"],
            "verificar-archivo": ["verificar-informe", "--archivo", self.doc],
            "verificar-codigo": ["verificar-informe", "--expediente", self.EXP, "--codigo", self.em.codigo],
            "emitidos": ["emitidos", "--expediente", self.EXP],
        }
        antes = eventos(self.ruta, self.EXP)
        archivos = sorted(self.base.iterdir())
        for nombre, args in comandos.items():
            with self.subTest(operacion=nombre):
                r = self.salida(2, *args)
                self.assertTrue(r.stderr.startswith("ERROR identidad.sin_rol:"), r.stderr)
                self.assertEqual(r.stdout, "")
                for secreto in (FRENTE, "MOTIVO-INTERNO", "Amplíe", self.em.informe.huella[:16], "P-0005"):
                    self.assertNotIn(secreto, r.stderr)
        self.assertEqual(eventos(self.ruta, self.EXP), antes)
        self.assertEqual(sorted(self.base.iterdir()), archivos)


if __name__ == "__main__":
    unittest.main()
