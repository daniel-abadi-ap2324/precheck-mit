"""Correcciones del catálogo tras el análisis de anteproyectos: finca y área del lote (A110),
estacionamientos y área verde de las fichas del PLOT y densidad mínima de San Francisco."""
import json
import pathlib
import unittest

from precheck.motor.evaluador import CUMPLE, NO_APLICA, NO_CUMPLE, REVISION, evaluar_regla, validar_expresion

RAIZ = pathlib.Path(__file__).resolve().parent.parent


def catalogo(nombre):
    return {r["id"]: r for r in json.loads((RAIZ / "reglas" / nombre).read_text(encoding="utf-8"))}


def resultado(regla, hechos):
    return evaluar_regla(regla, hechos, 0.85)["resultado"]


class TestA110FincaYArea(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.a110 = catalogo("reglas_a110_borrador.json")
        cls.una = cls.a110["A110-AIV-FINCA-COINCIDE"]
        cls.varias = cls.a110["A110-AIV-FINCAS-COINCIDEN"]

    def test_usa_los_hechos_de_la_extraccion(self):
        texto = json.dumps([(r.get("aplica_si"), r.get("condicion"), r.get("entradas")) for r in self.a110.values()])
        self.assertNotIn("plano.finca", texto)
        self.assertNotIn("plano.area_lote_m2", texto)
        self.assertEqual(self.una["entradas"], ["lote.finca", "registro_publico.finca"])
        self.assertIn("lote.area_m2", self.a110["A110-AIV-AREA-LOTE"]["entradas"])
        for r in self.a110.values():
            for campo in ("aplica_si", "condicion"):
                if r.get(campo):
                    validar_expresion(r[campo])

    def test_una_finca_sigue_siendo_documental(self):
        base = {"tramite": "RDP", "registro_publico": {"finca": "123"}}
        self.assertEqual(resultado(self.una, {**base, "lote": {"finca": "123"}}), CUMPLE)
        self.assertEqual(resultado(self.una, {**base, "lote": {"finca": "999"}}), NO_CUMPLE)
        self.assertEqual(resultado(self.una, {**base, "lote": {"finca": "123", "fincas": ["123"]}}), CUMPLE)
        self.assertEqual(resultado(self.una, {**base, "lote": {}}), REVISION)
        self.assertEqual(resultado(self.varias, {**base, "lote": {"finca": "123"}}), NO_APLICA)

    def test_varias_fincas_van_a_revision_sin_falso_no_cumple(self):
        for hechos in ({"lote": {"fincas": ["071091", "071122"]}, "registro_publico": {"fincas": ["071122", "071091"]}},
                       {"lote": {"finca": "071091"}, "registro_publico": {"fincas": ["071091", "071122"]}}):
            hechos = {"tramite": "RLA", **hechos}
            with self.subTest(hechos=hechos):
                self.assertEqual(resultado(self.una, hechos), NO_APLICA)
                self.assertEqual(resultado(self.varias, hechos), REVISION)

    def test_una_finca_con_confianza_baja_no_saca_la_regla_de_varias(self):
        """Casco Antiguo (0.80) y Ancón solo con la extracción (0.82): lote.fincas trae una finca con dígitos dudosos,
        pero lote.cantidad_fincas dice con confianza propia que es una sola. FINCAS-COINCIDEN (v2) decide con la
        cantidad y da NO_APLICA; FINCA-COINCIDE sigue en revisión por la confianza de la finca."""
        for conf in (0.57, 0.80, 0.82):
            lote = {"finca": {"valor": "078850", "confianza": conf}, "fincas": {"valor": ["078850"], "confianza": conf},
                    "cantidad_fincas": {"valor": 1, "confianza": 0.9}}
            hechos = {"tramite": "RLA", "lote": lote, "registro_publico": {"finca": "078850"}}
            with self.subTest(confianza=conf):
                self.assertEqual(resultado(self.varias, hechos), NO_APLICA)
                r = evaluar_regla(self.una, hechos, 0.85)
                self.assertEqual(r["resultado"], REVISION)
                self.assertIn("lote.finca", r["motivo"])
                self.assertNotIn("no se puede determinar si aplica", r["motivo"])

    def test_cantidad_dudosa_deja_las_dos_reglas_en_revision(self):
        """Panamá Norte: el bloque de datos lista 5 fincas que pueden ser las del desarrollo (cantidad 0.4). Ninguna de
        las dos reglas sale del expediente: la de una finca no puede determinar si aplica y la de varias es de criterio."""
        lote = {"fincas": {"valor": ["083337", "30002", "083338", "30004", "30005"], "confianza": 0.89},
                "cantidad_fincas": {"valor": 5, "confianza": 0.4}}
        hechos = {"tramite": "RLA", "lote": lote}
        r = evaluar_regla(self.una, hechos, 0.85)
        self.assertEqual(r["resultado"], REVISION)
        self.assertIn("no se puede determinar si aplica", r["motivo"])
        self.assertIn("lote.cantidad_fincas", r["motivo"])
        self.assertEqual(resultado(self.varias, hechos), REVISION)
        # una finca con la cantidad dudosa: la de varias tampoco sale
        dudosa = {"tramite": "RLA", "lote": {"finca": "078850", "cantidad_fincas": {"valor": 1, "confianza": 0.5}}}
        self.assertIn("no se puede determinar si aplica", evaluar_regla(self.varias, dudosa, 0.85)["motivo"])

    def test_varias_fincas_con_la_cantidad(self):
        sf = {"tramite": "RLA", "lote": {"fincas": {"valor": ["071122", "081326", "006806", "073164"], "confianza": 0.89},
                                          "cantidad_fincas": {"valor": 4, "confianza": 0.9}}}
        self.assertEqual(resultado(self.varias, sf), REVISION)
        self.assertEqual(resultado(self.una, sf), NO_APLICA)
        # el Registro Público con varias fincas manda aunque el plano diga una
        rp = {"tramite": "RLA", "lote": {"finca": "071122", "cantidad_fincas": {"valor": 1, "confianza": 0.9}},
              "registro_publico": {"fincas": ["071122", "081326"]}}
        self.assertEqual(resultado(self.una, rp), NO_APLICA)
        self.assertEqual(resultado(self.varias, rp), REVISION)

    def test_sin_cantidad_decide_con_la_lista_como_antes(self):
        """Hechos sin lote.cantidad_fincas (otro productor, lote.json antiguo): las reglas deciden con len(lote.fincas),
        como las versiones anteriores, y una finca con confianza baja sigue sin poder sacar la regla de varias."""
        for conf, esperado in ((0.80, REVISION), (0.9, NO_APLICA)):
            lote = {"finca": {"valor": "078850", "confianza": conf}, "fincas": {"valor": ["078850"], "confianza": conf}}
            with self.subTest(confianza=conf):
                self.assertEqual(resultado(self.varias, {"tramite": "RLA", "lote": lote}), esperado)
        self.assertEqual(resultado(self.una, {"tramite": "RLA", "lote": {}}), REVISION)
        self.assertEqual(resultado(self.varias, {"tramite": "RLA", "lote": {}}), NO_APLICA)

    def test_area_del_lote(self):
        r = self.a110["A110-AIV-AREA-LOTE"]
        base = {"tramite": "RDP", "registro_publico": {"area_lote_m2": 1000}}
        self.assertEqual(resultado(r, {**base, "lote": {"area_m2": 1005}}), CUMPLE)
        self.assertEqual(resultado(r, {**base, "lote": {"area_m2": 1100}}), NO_CUMPLE)

    def test_correcciones_con_version_nueva(self):
        for rid, version in (("A110-AIV-FINCA-COINCIDE", 3), ("A110-AIV-AREA-LOTE", 2), ("A110-AIV-FINCAS-COINCIDEN", 2)):
            # Versiones posteriores (severidad del 16-oct) conservan la corrección.
            self.assertGreaterEqual(self.a110[rid]["version"], version)
            self.assertIn(f"Versión {version}", self.a110[rid]["nota"])
        # la cantidad de fincas decide si aplican; la cita no cambia
        self.assertIn("lote.cantidad_fincas == 1", self.una["aplica_si"])
        self.assertIn("lote.cantidad_fincas > 1", self.varias["aplica_si"])
        cita = ("Finca, Tomo, Folio, o su equivalente y el número de lote que concuerden con los datos de la "
                "Certificación de Propiedad emitida por el Registro Público.")
        self.assertEqual({self.una["fuente"]["cita_textual"], self.varias["fuente"]["cita_textual"]}, {cita})


def hechos_plot(codigo, norma="PLOT-A61-2021", **proyecto):
    lote = {"norma_aplicable": norma, "codigo_zona": codigo, "area_m2": proyecto.pop("area_m2", 1000)}
    lote.update(proyecto.pop("lote", {}))
    return {"lote": lote, "proyecto": proyecto}


class TestEstacionamientosYAreaVerdePLOT(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.plot = catalogo("reglas_plot_borrador.json")

    def test_cada_ficha_con_minimo_tiene_regla(self):
        # R5, RE y ZM1 no tienen mínimo («0» o «Libre»): su regla «>= 0» siempre se cumplía y se retiró en la revisión
        # definitiva de anteproyecto (reglas_retiradas/).
        for ficha in ("R1", "R2", "R3", "R4", "R6", "RM", "RM-1", "RM-2", "RM-3", "ZM2", "ZM3",
                      "ZM4", "ZM5", "ZM6", "ZM7", "ZM8", "ZM9", "CV", "CU", "PM", "P", "IT", "IM", "IA"):
            self.assertIn(f"PLOT-{ficha}-ESTACIONAMIENTOS", self.plot)
        for ficha in ("R1", "R2", "R3", "R4", "R5", "RE"):
            self.assertIn(f"PLOT-{ficha}-AREA-VERDE", self.plot)
        for r in self.plot.values():
            if "ESTACIONAMIENTOS" in r["id"] or "AREA-VERDE" in r["id"]:
                with self.subTest(r["id"]):
                    self.assertEqual(r["estado_revision"], "borrador")
                    validar_expresion(r["aplica_si"])
                    if r["tipo"] == "cuantitativa":
                        validar_expresion(r["condicion"])
                        for e in r["entradas"]:
                            self.assertIn(e, r["condicion"])

    def test_zm6_medio_espacio_por_vivienda(self):
        r = self.plot["PLOT-ZM6-ESTACIONAMIENTOS"]
        self.assertIn("Unidad de vivienda 0.5", r["fuente"]["cita_textual"])
        self.assertEqual(resultado(r, hechos_plot("1ZM6", estacionamientos=11, unidades_vivienda=20)), CUMPLE)
        self.assertEqual(resultado(r, hechos_plot("ZM6", estacionamientos=6, unidades_vivienda=20)), NO_CUMPLE)
        # media plaza del mínimo: el redondeo no lo fija la norma
        self.assertEqual(resultado(r, hechos_plot("ZM6", estacionamientos=2, unidades_vivienda=5)), REVISION)
        self.assertEqual(resultado(r, hechos_plot("ZM6", estacionamientos=10)), REVISION)
        mixto = hechos_plot("ZM6", estacionamientos=10, unidades_vivienda=20, uso_combinado=True)
        self.assertEqual(resultado(r, mixto), NO_APLICA)
        self.assertEqual(resultado(self.plot["PLOT-ZM6-ESTACIONAMIENTOS-OTROS-USOS"], mixto), REVISION)

    def test_re_y_r5_no_exigen_estacionamientos(self):
        # Sin mínimo en la ficha no hay obligación que verificar: la regla está retirada, no en el catálogo.
        retiradas = {r["id"] for r in json.loads((RAIZ / "reglas_retiradas" / "reglas_plot_borrador.json").read_text(encoding="utf-8"))}
        for i in ("PLOT-RE-ESTACIONAMIENTOS", "PLOT-R5-ESTACIONAMIENTOS", "PLOT-ZM1-ESTACIONAMIENTOS"):
            self.assertNotIn(i, self.plot)
            self.assertIn(i, retiradas)

    def test_r2_dos_por_vivienda(self):
        r = self.plot["PLOT-R2-ESTACIONAMIENTOS"]
        self.assertEqual(resultado(r, hechos_plot("1R2", estacionamientos=4, unidades_vivienda=2)), CUMPLE)
        self.assertEqual(resultado(r, hechos_plot("1R2", estacionamientos=3, unidades_vivienda=2)), NO_CUMPLE)

    def test_industrial_por_area_de_lote(self):
        r = self.plot["PLOT-IT-ESTACIONAMIENTOS"]
        self.assertEqual(resultado(r, hechos_plot("IT", area_m2=2000, estacionamientos=12)), CUMPLE)
        self.assertEqual(resultado(r, hechos_plot("IT", area_m2=2000, estacionamientos=7)), NO_CUMPLE)
        self.assertEqual(resultado(r, hechos_plot("IT", area_m2=2000, estacionamientos=10)), REVISION)

    def test_area_verde_re(self):
        r = self.plot["PLOT-RE-AREA-VERDE"]
        self.assertIn("20% del Área Libre", r["fuente"]["cita_textual"])
        self.assertEqual(resultado(r, hechos_plot("RE", area_verde_pct=10, area_libre_pct=30)), CUMPLE)
        self.assertEqual(resultado(r, hechos_plot("RE", area_verde_pct=3, area_libre_pct=30)), NO_CUMPLE)
        self.assertEqual(resultado(r, hechos_plot("RE", area_libre_pct=30)), REVISION)
        self.assertEqual(resultado(self.plot["PLOT-R1-AREA-VERDE"],
                                   hechos_plot("R1", area_verde_pct=20, area_libre_pct=50)), NO_CUMPLE)


class TestSanFrancisco(unittest.TestCase):
    NORMA = "PLOT-A61-2021+A270-2025"

    @classmethod
    def setUpClass(cls):
        cls.sf = catalogo("reglas_sf_borrador.json")

    def sf_hechos(self, sector, ut, codigo, **proyecto):
        return hechos_plot(codigo, norma=self.NORMA, lote={"sf_sector": sector, "sf_unidad_territorial": ut},
                           **proyecto)

    def test_densidad_minima_en_ut3_ut6_ut7_de_san_francisco_centro(self):
        for ut, pagina in ((3, 64), (6, 71), (7, 72)):
            with self.subTest(ut=ut):
                r = self.sf[f"SF-SAN-FRANCISCO-CENTRO-UT{ut}-DENSIDAD-MINIMA"]
                self.assertEqual(r["fuente"]["pagina_pdf"], pagina)
                self.assertIn("densidad mínima de 200 pers/hect.", r["fuente"]["cita_textual"])
                mixto = dict(uso_combinado=True)
                self.assertEqual(resultado(r, self.sf_hechos("San Francisco Centro", ut, "1ZM7", densidad_pers_ha=450,
                                                             **mixto)), CUMPLE)
                self.assertEqual(resultado(r, self.sf_hechos("San Francisco Centro", ut, "ZM7", densidad_pers_ha=120,
                                                             **mixto)), NO_CUMPLE)
                self.assertEqual(resultado(r, self.sf_hechos("San Francisco Centro", ut, "ZM7", densidad_pers_ha=120,
                                                             uso_combinado=False)), NO_APLICA)
                self.assertEqual(resultado(r, self.sf_hechos("San Francisco Centro", ut, "ZM7",
                                                             densidad_pers_ha=120)), REVISION)

    def test_densidad_minima_en_todas_las_ut_que_la_traen(self):
        con_frase = [rid for rid in self.sf if rid.endswith("-DENSIDAD-MINIMA")]
        self.assertEqual(len(con_frase), 26)
        self.assertIn("SF-VILLA-LILLA-UT4-DENSIDAD-MINIMA", con_frase)
        self.assertNotIn("SF-VILLA-LILLA-UT1-DENSIDAD-MINIMA", con_frase)

    def test_remodelacion_exenta_va_a_revision(self):
        nueva = self.sf["SF-SAN-FRANCISCO-CENTRO-UT1-DENSIDAD-MINIMA"]
        remodelacion = self.sf["SF-SAN-FRANCISCO-CENTRO-UT1-DENSIDAD-MINIMA-REMODELACION"]
        h = self.sf_hechos("San Francisco Centro", 1, "ZM5", densidad_pers_ha=50, uso_combinado=True, obra_nueva=False)
        self.assertEqual(resultado(nueva, h), NO_APLICA)
        self.assertEqual(resultado(remodelacion, h), REVISION)
        h["proyecto"]["obra_nueva"] = True
        self.assertEqual(resultado(nueva, h), NO_CUMPLE)
        self.assertEqual(resultado(remodelacion, h), NO_APLICA)

    def test_estacionamientos_y_area_verde_por_unidad_territorial(self):
        r = self.sf["SF-PAITILLA-UT7-ZM7-ESTACIONAMIENTOS"]
        self.assertEqual(resultado(r, self.sf_hechos("Paitilla", 7, "1ZM7", estacionamientos=30,
                                                     unidades_vivienda=80)), NO_CUMPLE)
        self.assertEqual(resultado(r, self.sf_hechos("Coco del Mar", 7, "1ZM7", estacionamientos=30,
                                                     unidades_vivienda=80)), NO_APLICA)
        verde = self.sf["SF-VILLA-LILLA-UT2-R3-AREA-VERDE"]
        self.assertEqual(resultado(verde, self.sf_hechos("Villa Lilla", 2, "R3", area_verde_pct=10,
                                                         area_libre_pct=40)), CUMPLE)
        self.assertEqual(resultado(verde, self.sf_hechos("Villa Lilla", 2, "R3", area_verde_pct=5,
                                                         area_libre_pct=40)), NO_CUMPLE)


if __name__ == "__main__":
    unittest.main()
