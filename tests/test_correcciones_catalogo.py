"""Correcciones de la revisión del 9-oct-2026 (scripts/aplicar_correcciones_reglas.py, docs/revision-catalogo/CORRECCIONES-APLICADAS.md)."""
import json
import pathlib
import sys
import tempfile
import unittest

from precheck.motor.evaluador import evaluar_regla

RAIZ = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "scripts"))
import aplicar_correcciones_reglas as corr  # noqa: E402
import datos_pedidos  # noqa: E402
from aplicar_catalogo_definitivo import variables  # noqa: E402

CUMPLE, NO_CUMPLE, NO_APLICA, REVISION = "CUMPLE", "NO_CUMPLE", "NO_APLICA", "REQUIERE_REVISION"


def catalogo():
    return {r["id"]: r for f in sorted((RAIZ / "reglas").glob("*.json"))
            for r in json.loads(f.read_text(encoding="utf-8"))}


class TestTodoElCatalogo(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.reglas = catalogo()

    def test_claves_de_la_condicion_declaradas(self):
        # Hallazgo 12: lo que la condición lee está en entradas o, si solo se lee en una rama de un «o», en entradas_opcionales.
        for rid, r in self.reglas.items():
            if r.get("condicion"):
                with self.subTest(rid):
                    declaradas = set(r.get("entradas") or []) | set(r.get("entradas_opcionales") or [])
                    self.assertEqual(variables(r["condicion"]) - declaradas, set())

    def test_version_nueva_dice_que_cambio(self):
        # Convención del repositorio (CLAUDE.md, principio 4): versión > 1 con «Versión N» en la nota.
        for rid, r in self.reglas.items():
            if int(r["version"]) > 1:
                with self.subTest(rid):
                    self.assertIn(f"Versión {r['version']}", r.get("nota", ""))

    def test_sin_notas_en_formato_viejo(self):
        for rid, r in self.reglas.items():
            with self.subTest(rid):
                self.assertIsNone(corr.NOTA_DEFINITIVA.search(r.get("nota") or ""))

    def test_el_script_es_idempotente(self):
        archivos, _, errores = corr.planificar()
        self.assertEqual(errores, [])
        por_id = {c["id"]: c for c in corr.CORRECCIONES}
        for datos, _ in archivos.values():   # una segunda pasada sobre lo que escribiría no cambia nada
            for r in datos:
                if r["id"] in por_id:
                    nueva, estado = corr.aplicar_correccion(r, por_id[r["id"]])
                    self.assertEqual((estado, nueva), ("ya_aplicada", r))

    def test_todas_las_correcciones_estan_aplicadas(self):
        archivos, resumen, errores = corr.planificar()
        self.assertEqual((errores, archivos, resumen["aplicada"]), ([], {}, []))
        self.assertEqual(len(resumen["ya_aplicada"]), len(corr.CORRECCIONES))
        self.assertEqual(corr.actualizar_contrato(escribir_archivo=False), [])

    def test_rehusa_una_regla_en_otra_version(self):
        regla = {"id": "X", "version": 3, "nota": ""}
        _, estado = corr.aplicar_correccion(regla, {"id": "X", "version": 1, "nota": "algo", "aplica_si": "true"})
        self.assertIn("no se toca", estado)


class TestHallazgo12(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.reglas = catalogo()

    def test_las_claves_van_a_entradas_opcionales(self):
        for rid, (_, claves) in corr.H12.items():
            with self.subTest(rid):
                r = self.reglas[rid]
                self.assertTrue(set(claves) <= set(r["entradas_opcionales"]))
                self.assertFalse(set(claves) & set(r.get("entradas") or []))

    def test_la_rama_sin_el_dato_sigue_decidiendo(self):
        # PLOT-R1-RETIROS: sin línea establecida basta el frontal de 5 m; lote.lc_oficial_desde_lp_m no hace falta.
        hechos = {"lote": {"norma_aplicable": "PLOT-A61-2021", "codigo_zona": "1R1", "lc_oficial_establecida": False},
                  "proyecto": {"retiro_frontal_m": 6, "retiro_lateral_m": 3, "retiro_posterior_m": 5}}
        self.assertEqual(evaluar_regla(self.reglas["PLOT-R1-RETIROS"], hechos, 0.85)["resultado"], CUMPLE)
        # PLOT-R4-RETIROS en hilera: sin frontal ni lateral, decide el posterior.
        hechos = {"lote": {"norma_aplicable": "PLOT-A61-2021", "codigo_zona": "1R4"},
                  "proyecto": {"tipologia_vivienda": "hilera", "retiro_posterior_m": 2}}
        self.assertEqual(evaluar_regla(self.reglas["PLOT-R4-RETIROS"], hechos, 0.85)["resultado"], NO_CUMPLE)

    def test_datos_pedidos_las_pide(self):
        with tempfile.TemporaryDirectory() as d:
            caso = pathlib.Path(d)
            (caso / "resultado.json").write_text(json.dumps({"resultados": [{"regla_id": i} for i in corr.H12]}), encoding="utf-8")
            pedidas = {k for k, _, _ in datos_pedidos.datos_pedidos(caso, RAIZ / "reglas", universales=False)}
        for clave in ("lote.lc_oficial_desde_lp_m", "proyecto.unidades_vivienda", "anteproyecto.revalidado", "atc.vigente",
                      "proyecto.cumple_condiciones_pisos_adicionales", "proyecto.retiro_lateral_m"):
            self.assertIn(clave, pedidas)


class TestHallazgo15(unittest.TestCase):
    def test_fuente_acuerdo_270_y_cita_literal_en_ese_texto(self):
        from precheck.motor.verificar_citas import cita_en_normativa, norm
        reglas = catalogo()
        texto = norm((RAIZ / "normativa/zonificacion/textos/acuerdo270_sf_y_anexo2.txt").read_text(encoding="utf-8"))
        for rid, sector, ut, pagina, _ in corr.H15:
            with self.subTest(rid):
                f = reglas[rid]["fuente"]
                self.assertEqual((f["norma"], f["articulo"], f["pagina_pdf"]),
                                 (corr.A270, f"Anexo 2, {sector}, Unidad Territorial {ut}", pagina))
                self.assertTrue(cita_en_normativa(f["cita_textual"], texto))


class TestHallazgo19(unittest.TestCase):
    def test_sin_grafias_inexistentes(self):
        from precheck.motor.zona import codigos_de_regla
        reglas = catalogo()
        self.assertFalse({"RM2", "1RM2"} & codigos_de_regla(reglas["PLOT-ART89-EQUIPARACION-SF"]))
        self.assertIn("1RM-2", codigos_de_regla(reglas["PLOT-ART89-EQUIPARACION-SF"]))
        self.assertEqual(codigos_de_regla(reglas["PLOT-ART54-4AA-DISTANCIA-30M"]), {"4A-A"})


class TestHallazgo20(unittest.TestCase):
    def test_cerca_temporal_solo_en_obras_menores(self):
        reglas = catalogo()
        for rid, campo, limite in (("A110-CERCA-TEMP-LATERAL", "altura_lateral_m", 2.40),
                                   ("A110-CERCA-TEMP-FRONTAL", "altura_frontal_m", 2.10)):
            with self.subTest(rid):
                alta = {"cerca_temporal": {campo: limite + 0.5}}
                self.assertEqual(evaluar_regla(reglas[rid], {**alta, "tramite": "RDP"}, 0.85)["resultado"], NO_APLICA)
                self.assertEqual(evaluar_regla(reglas[rid], {**alta, "tramite": "OBRAS_MENORES"}, 0.85)["resultado"], NO_CUMPLE)
                # sin el dato de la cerca no aplica, aunque falte el trámite
                self.assertEqual(evaluar_regla(reglas[rid], {}, 0.85)["resultado"], NO_APLICA)


class TestHallazgo8(unittest.TestCase):
    def test_reglamento_de_copropietarios_solo_en_adiciones_y_mejoras(self):
        r = catalogo()["A110-ART21-PH-REGLAMENTO-COPROPIETARIOS"]
        sin_docs = {"reglamento_copropietarios": {"adjunto": False}, "aprobacion_administracion_ph": {"adjunto": False}}
        # anteproyecto de un edificio PH nuevo: no aplica (no hay reglamento todavía)
        nuevo = {"tramite": "RLA", "expediente": {"propiedad_horizontal": True, "adiciones_mejoras_edificacion_ph": False, **sin_docs}}
        self.assertEqual(evaluar_regla(r, nuevo, 0.85)["resultado"], NO_APLICA)
        adicion = {"tramite": "OBRAS_MENORES", "expediente": {"adiciones_mejoras_edificacion_ph": True, **sin_docs}}
        self.assertEqual(evaluar_regla(r, adicion, 0.85)["resultado"], NO_CUMPLE)
        # fotovoltaico (Art. 96, num. 6): sigue bastando que la edificación esté en PH
        fv = {"tramite": "FOTOVOLTAICO", "expediente": {"propiedad_horizontal": True, **sin_docs}}
        self.assertEqual(evaluar_regla(r, fv, 0.85)["resultado"], NO_CUMPLE)
        # sin saber si es adición o mejora, no se decide solo
        duda = {"tramite": "PDC", "expediente": {"propiedad_horizontal": True, **sin_docs}}
        self.assertEqual(evaluar_regla(r, duda, 0.85)["resultado"], REVISION)

    def test_hecho_nuevo_en_el_contrato(self):
        contrato = json.loads((RAIZ / "scripts/hechos_documentales.json").read_text(encoding="utf-8"))
        d = next(x for x in contrato["datos"] if x["clave"] == "expediente.adiciones_mejoras_edificacion_ph")
        self.assertEqual(d["reglas"], ["A110-ART21-PH-REGLAMENTO-COPROPIETARIOS"])


class TestHallazgo14(unittest.TestCase):
    """Las reglas del Anexo III creadas el 9-oct (reglas_definitivo_nuevas_borrador.json): cita, condición y contrato."""

    ANEXO_III = {"A110-AIII-4-ESCALA-REGIONAL": "plano.localizacion_regional.escala_1_5000",
                 "A110-AIII-5-LINDEROS-RUMBOS": "plano.localizacion_general.linderos_con_rumbos",
                 "A110-AIII-5-USO-COLINDANTES": "plano.localizacion_general.uso_colindantes",
                 "A110-AIII-5-ESTAC-DISCAPACIDAD": "plano.estacionamientos.discapacidad_contemplados",
                 "A110-AIII-5-OCUPACION-INDICADA": "plano.localizacion_general.ocupacion_maxima_indicada",
                 "A110-AIII-8-SECCIONES": "plano.secciones.transversal_y_longitudinal"}

    def test_reglas_y_contrato(self):
        from precheck.motor.verificar_citas import cita_en_normativa, norm
        reglas = catalogo()
        texto = norm((RAIZ / "normativa/acuerdo-110/texto-completo.md").read_text(encoding="utf-8"))
        contrato = {d["clave"]: d for d in json.loads((RAIZ / "scripts/hechos_documentales.json").read_text(encoding="utf-8"))["datos"]}
        for rid, hecho in self.ANEXO_III.items():
            with self.subTest(rid):
                r = reglas[rid]
                self.assertTrue(cita_en_normativa(r["fuente"]["cita_textual"], texto))
                self.assertEqual((r["entradas"], r["condicion"]), ([hecho], f"{hecho} == true"))
                self.assertIn("tramite == 'RLA'", r["aplica_si"])
                self.assertIn(rid, contrato[hecho]["reglas"])
                self.assertIn("cita:", contrato[hecho]["definicion"])
        self.assertIn("A110-AIII-5-ESTAC-DISCAPACIDAD", contrato["proyecto.estacionamientos"]["reglas"])
