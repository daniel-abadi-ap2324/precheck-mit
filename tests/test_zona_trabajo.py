"""Zona de trabajo (precheck/motor/zona.py y precheck/planos/revisar.py, ADR-0016), con normas, reglas y familias
inventadas: una prueba por cada caso de «zona no clara»."""
import json
import tempfile
import unittest
from pathlib import Path

from precheck.motor.zona import zona_de_trabajo
from precheck.planos.revisar import evaluar, procedencia_de, reglas_distintas, revisar

N = "MIVIOT-AC-R160-2002"   # norma registrada; reglas y códigos inventados
OTRA = "PLOT-A61-2021"
L1, L2 = "MIVIOT-ML1", "MIVIOT-ML2"


def regla(rid, norma, codigos, condicion, severidad="bloqueante", tipo="cuantitativa"):
    return {"id": rid, "version": 1, "tipo": tipo, "titulo": rid, "severidad": severidad,
            "aplica_si": f"lote.norma_aplicable == '{norma}' and lote.codigo_zona in {codigos!r}",
            "condicion": condicion, "mensaje_no_cumple": f"{rid} no cumple"}


REGLAS = [
    regla("AC-A1-LOTE-AREA", N, ["A1", "a1"], "lote.area_m2 >= 600"),
    regla("AC-A1-ALTURA", N, ["A1", "a1"], "proyecto.altura_m <= 8"),
    regla("AC-A2-LOTE-AREA", N, ["A2", "a2"], "lote.area_m2 >= 300"),
    regla("AC-A2-ALTURA", N, ["A2", "a2"], "proyecto.altura_m <= 12"),
    regla("AC-B1-ALTURA", N, ["B1"], "proyecto.altura_m <= 40"),
    regla("AC-1Z3-ALTURA", N, ["1Z3"], "proyecto.altura_m <= 20"),
    regla("PLOT-Q3-ALTURA", OTRA, ["Q3"], "proyecto.altura_m <= 9"),
    regla("ML1-X1-ALTURA", L1, ["X1"], "proyecto.altura_m <= 30"),
    regla("ML2-X1-ALTURA", L2, ["X1"], "proyecto.altura_m <= 10"),
    {"id": "A110-GENERAL", "version": 1, "tipo": "cuantitativa", "titulo": "general", "severidad": "bloqueante",
     "condicion": "proyecto.altura_m > 0"},
]


def familia(codigo, norma, nombre, uso, densidad, dmax):
    return {"norma": norma, "codigo": codigo, "nombre": nombre, "uso": uso, "densidad": densidad, "densidad_max": dmax,
            "fuente": {"archivo": "texto.txt", "articulo": "Art. 1", "cita_nombre": nombre, "cita_densidad": str(dmax)}}


FAMILIAS = [
    familia("A1", N, "Residencial baja densidad uno", "residencial", "baja", 100),
    familia("A2", N, "Residencial baja densidad dos", "residencial", "baja", 200),
    familia("B1", N, "Residencial alta densidad", "residencial", "alta", 800),
    familia("Q3", OTRA, "Residencial de baja densidad", "residencial", "baja", 200),
]


def hechos(area=1000, altura=10, norma=N, conf_norma=0.95, metodo_norma="alcance"):
    return {"lote": {"norma_aplicable": {"valor": norma, "confianza": conf_norma, "fuente": {"metodo": metodo_norma}},
                     "area_m2": {"valor": area, "confianza": 0.95}},
            "proyecto": {"altura_m": {"valor": altura, "confianza": 0.95}}}


def f(procedencia, codigo, confianza=0.95, **extra):
    return {"procedencia": procedencia, "codigo": codigo, "confianza": confianza, **extra}


def zona(fuentes, h=None, norma=N, determinada=True):
    return zona_de_trabajo(fuentes, norma, REGLAS, h or hechos(), FAMILIAS, 0.85, determinada)


class TestOrden(unittest.TestCase):
    def test_documento_oficial_gana_y_es_firme(self):
        # CASO-A: el arquitecto definió un código antiguo; la nota DPU dice el vigente.
        z = zona([f("arquitecto", "A2-X", 1.0), f("plano", "A2-X"), f("oficial", "A2", 1.0)])
        self.assertEqual((z["codigo"], z["procedencia"], z["firme"]), ("A2", "oficial", True))
        self.assertIn("A2-X", z["explicacion"])

    def test_zona_del_plano_que_existe_sin_conflicto_es_firme(self):
        z = zona([f("plano", "A1"), f("usuario", "A1", 1.0)])
        self.assertEqual((z["codigo"], z["procedencia"], z["modo"], z["firme"]), ("A1", "plano", "exacto", True))
        self.assertEqual(z["descartadas"], [])

    def test_solo_cambia_la_grafia_se_usa_la_de_las_reglas_y_es_firme(self):
        for escrito, esperado in [("a-1", "A1"), ("Z3", "1Z3"), ("1Z-3", "1Z3")]:
            with self.subTest(escrito=escrito):
                z = zona([f("plano", escrito)])
                self.assertEqual((z["codigo"], z["modo"], z["firme"]), (esperado, "grafia", True))

    def test_codigo_leido_con_confianza_baja_es_supuesto(self):
        z = zona([f("plano", "A1", 0.6)])
        self.assertEqual(z["codigo"], "A1")
        self.assertFalse(z["firme"])
        self.assertTrue(zona([f("plano", "A1", 0.6), f("usuario", "A1", 0.7)])["firme"])   # confirmado por otra fuente

    def test_plano_y_usuario_no_coinciden_gana_el_plano_como_supuesto(self):
        # ZONA_DISCREPANTE: el usuario dice A1 y el plano A2.
        z = zona([f("usuario", "A1", 1.0), f("plano", "A2")])
        self.assertEqual((z["codigo"], z["firme"]), ("A2", False))
        self.assertEqual([(d["codigo"], d["procedencia"]) for d in z["descartadas"]], [("A1", "usuario")])

    def test_documento_grafico_con_coordenadas_gana_al_plano(self):
        z = zona([f("plano", "A2"), f("documento_grafico", "A1", 0.9)])
        self.assertEqual((z["codigo"], z["procedencia"], z["firme"]), ("A1", "documento_grafico", False))
        self.assertEqual([d["codigo"] for d in z["descartadas"]], ["A2"])

    def test_zona_del_mapa_sin_coordenadas_no_gana_al_plano(self):
        z = zona([f("ia", "A1", 0.9), f("plano", "A2")])
        self.assertEqual((z["codigo"], z["procedencia"]), ("A2", "plano"))
        self.assertEqual([d["codigo"] for d in z["descartadas"]], ["A1"])

    def test_codigo_inexistente_de_otra_fuente_quita_la_firmeza_y_avisa(self):
        z = zona([f("usuario", "A1", 1.0), f("plano", "RM9-C9")])
        self.assertEqual((z["codigo"], z["firme"]), ("A1", False))
        self.assertTrue(any("RM9-C9" in a for a in z["avisos"]))


class TestOtraNorma(unittest.TestCase):
    def test_codigo_de_otra_norma_se_reemplaza_por_la_familia_que_encaja_con_el_lote(self):
        # Ancón: Q3 («Residencial de baja densidad», de otra norma); el lote de 400 m² solo encaja en A2.
        z = zona([f("plano", "Q3", nombre="Residencial de baja densidad")], hechos(area=400))
        self.assertEqual((z["codigo"], z["modo"], z["firme"]), ("A2", "familia", False))
        self.assertEqual([d["codigo"] for d in z["descartadas"]], ["A1"])
        self.assertIn("no encaja", z["descartadas"][0]["motivo"])
        self.assertNotIn("B1", z["explicacion"])   # otra densidad: no es candidata

    def test_si_siguen_empatadas_gana_la_mas_restrictiva(self):
        z = zona([f("plano", "Q3", nombre="Residencial de baja densidad")], hechos(area=1000))
        self.assertEqual(z["codigo"], "A1")   # densidad máxima 100 < 200
        self.assertIn("más restrictiva", z["explicacion"])

    def test_sin_nombre_en_el_plano_usa_el_nombre_del_codigo_en_su_norma(self):
        z = zona([f("plano", "Q3")], hechos(area=1000))
        self.assertEqual(z["codigo"], "A1")
        self.assertIn("Residencial de baja densidad", z["explicacion"])

    def test_codigo_sin_familia_conocida_no_inventa_una_zona(self):
        # San Francisco sin unidad territorial: nada del plano permite elegir.
        z = zona([f("plano", "RM9-C9")])
        self.assertIsNone(z["codigo"])
        self.assertIn("CEUS", z["explicacion"])

    def test_norma_solo_declarada_por_el_usuario_se_evalua_con_la_norma_del_plano(self):
        # Tocumen sin IA: X1 no existe en la norma indicada, pero sí en ML1 y ML2.
        z = zona([f("plano", "X1")], hechos(altura=15), determinada=False)
        self.assertEqual((z["codigo"], z["modo"], z["firme"]), ("X1", "norma_del_plano", False))
        self.assertEqual(z["norma"], L2)   # con la altura de 15 m, ML2 es la más restrictiva (1 NO_CUMPLE bloqueante)
        self.assertEqual([(d["codigo"], d["norma"]) for d in z["descartadas"]], [("X1", L1)])
        self.assertTrue(any("norma del plano" in a for a in z["avisos"]))
        # Con la norma determinada por la ubicación no se cambia de norma.
        self.assertIsNone(zona([f("plano", "X1")], determinada=True)["codigo"])

    def test_sin_norma_o_sin_codigo_no_hay_zona(self):
        self.assertIsNone(zona([f("plano", "A1")], norma=None)["codigo"])
        self.assertIsNone(zona([])["codigo"])


class TestEvaluarConZonaDeTrabajo(unittest.TestCase):
    def evaluar(self, fuentes, h=None, **kw):
        return evaluar(h or hechos(), REGLAS, "2026-09-01", fuentes_zona=fuentes, familias=FAMILIAS, **kw)

    def por_id(self, res):
        return {r["regla_id"]: r for r in res["resultados"]}

    def test_zona_firme_decide_en_firme_sin_supuestos(self):
        res = self.evaluar([f("plano", "A1"), f("usuario", "A1", 1.0)], hechos(altura=10))
        r = self.por_id(res)
        self.assertEqual(r["AC-A1-ALTURA"]["resultado"], "NO_CUMPLE")
        self.assertNotIn("decision_motor", r["AC-A1-ALTURA"])
        self.assertNotIn("AC-A2-ALTURA", r)   # otra zona: NO_APLICA
        self.assertEqual(res["supuestos"], [])
        self.assertTrue(res["zona_trabajo"]["firme"])

    def test_zona_supuesta_deja_sus_reglas_a_la_ia_con_la_decision_del_motor(self):
        res = self.evaluar([f("plano", "Q3", nombre="Residencial de baja densidad")], hechos(area=400, altura=13))
        r = self.por_id(res)
        self.assertEqual(res["codigo_zona"], "A2")
        altura = r["AC-A2-ALTURA"]
        self.assertEqual(altura["resultado"], "REQUIERE_REVISION")   # la IA la puede cambiar (C-JERARQUIA)
        self.assertEqual(altura["decision_motor"], {"resultado": "NO_CUMPLE", "motivo": "AC-A2-ALTURA no cumple",
                                                    "con_supuesto": ["S1"], "mensaje": "AC-A2-ALTURA no cumple"})
        s1 = res["supuestos"][0]
        self.assertEqual((s1["id"], s1["tipo"], s1["codigo"]), ("S1", "zona", "A2"))
        self.assertEqual(sorted(s1["reglas"]), ["AC-A2-ALTURA", "AC-A2-LOTE-AREA"])
        self.assertIn("CEUS", s1["accion"])
        # La regla general no depende de la zona: se decide en firme.
        self.assertEqual(r["A110-GENERAL"]["resultado"], "CUMPLE")
        self.assertTrue(any(a.startswith("ZONA_TRABAJO") and "S1" in a for a in res["avisos"]))

    def test_cada_candidata_descartada_dice_que_reglas_habrian_cambiado(self):
        res = self.evaluar([f("plano", "Q3", nombre="Residencial de baja densidad")], hechos(area=1000, altura=10))
        self.assertEqual(res["codigo_zona"], "A1")
        a2 = res["zona_trabajo"]["descartadas"][0]
        self.assertEqual(a2["codigo"], "A2")
        # Altura 10 m: NO_CUMPLE con A1 (máx. 8) y CUMPLE con A2 (máx. 12). El área cumple con las dos.
        self.assertEqual(a2["reglas_distintas"], [{"regla_id": "AC-A1-ALTURA", "regla_candidata": "AC-A2-ALTURA",
                                                   "con_zona_de_trabajo": "NO_CUMPLE", "con_candidata": "CUMPLE"}])
        self.assertEqual(res["supuestos"][0]["descartadas"][0]["total_distintas"], 1)

    def test_la_cuenta_cierra_sin_reglas_en_revision(self):
        h = hechos(area=400, altura=13)
        h["proyecto"]["altura_m"]["confianza"] = 0.6   # dato dudoso
        res = self.evaluar([f("plano", "Q3", nombre="Residencial de baja densidad")], h)
        finales = res["final"]["por_decision"]
        self.assertNotIn("REQUIERE_REVISION", finales)
        self.assertEqual(sum(finales.values()), len(res["resultados"]))
        dudoso = next(s for s in res["supuestos"] if s["tipo"] == "dato_dudoso")
        self.assertEqual((dudoso["campo"], dudoso["valor"]), ("proyecto.altura_m", 13))
        self.assertIn("A110-GENERAL", dudoso["reglas"])
        self.assertEqual(self.por_id(res)["AC-A2-ALTURA"]["decision_motor"]["con_supuesto"], ["S1", dudoso["id"]])

    def test_sin_zona_razonable_las_reglas_de_zona_son_informacion_requerida(self):
        h = hechos()
        h["lote"]["codigo_zona"] = {"valor": "RM9-C9", "confianza": 1.0}
        res = self.evaluar([f("plano", "RM9-C9")], h)
        self.assertIsNone(res["zona_trabajo"]["codigo"])
        zona = [r for r in res["resultados"] if r["regla_id"].startswith("AC-")]
        self.assertTrue(zona)
        self.assertTrue(all(r["decision_motor"]["resultado"] == "INFORMACION_REQUERIDA" for r in zona))
        self.assertEqual(res["supuestos"][0]["tipo"], "sin_zona")
        self.assertTrue(any("RM9-C9" in a and "no existe" in a for a in res["avisos"]))

    def test_norma_del_plano_cambia_la_norma_evaluada(self):
        h = hechos(norma=OTRA, metodo_norma="declarado", altura=15)
        res = self.evaluar([f("usuario", "X1", 1.0)], h)
        self.assertEqual((res["norma_aplicable"], res["codigo_zona"]), (L2, "X1"))
        self.assertEqual(self.por_id(res)["ML2-X1-ALTURA"]["decision_motor"]["resultado"], "NO_CUMPLE")

    def test_norma_leida_con_confianza_baja_vuelve_supuesta_la_zona(self):
        res = self.evaluar([f("plano", "A1"), f("usuario", "A1", 1.0)], hechos(conf_norma=0.6))
        self.assertFalse(res["zona_trabajo"]["firme"])
        self.assertEqual(res["supuestos"][0]["tipo"], "zona")


class TestProcedencia(unittest.TestCase):
    def test_procedencia_por_la_fuente(self):
        casos = [
            ({"definido": True}, "arquitecto"),
            ({"fuente": {"origen": "permiso"}}, "oficial"),
            ({"fuente": {"documento": "nota.pdf"}}, "oficial"),
            ({"fuente": {"metodo": "documento_grafico", "coordenadas": [652872.2, 997101.1]}}, "documento_grafico"),
            ({"fuente": {"metodo": "punto_en_poligono", "detalle": "con las coordenadas UTM del plano"}}, "documento_grafico"),
            ({"fuente": {"metodo": "documento_grafico", "detalle": "vecino rotulado 1ZM7"}}, "ia"),
            ({"fuente": {"metodo": "declarado"}}, "usuario"),
            ({"fuente": {"documento": "plano", "metodo": "lectura"}}, "plano"),
        ]
        for nodo, esperado in casos:
            with self.subTest(nodo=nodo):
                self.assertEqual(procedencia_de(nodo, {"nota.pdf"}), esperado)

    def test_reglas_distintas_empareja_homologas(self):
        con_a1 = {"AC-A1-ALTURA": "NO_CUMPLE", "AC-A2-ALTURA": "NO_APLICA", "AC-COMUN": "CUMPLE"}
        con_a2 = {"AC-A1-ALTURA": "NO_APLICA", "AC-A2-ALTURA": "CUMPLE", "AC-COMUN": "CUMPLE"}
        self.assertEqual(reglas_distintas(con_a1, con_a2, "A1", "A2"),
                         [{"regla_id": "AC-A1-ALTURA", "regla_candidata": "AC-A2-ALTURA",
                           "con_zona_de_trabajo": "NO_CUMPLE", "con_candidata": "CUMPLE"}])


class TestDocumentoOficial(unittest.TestCase):
    def test_la_nota_dpu_del_expediente_fija_la_zona_sobre_la_definida(self):
        try:
            import pymupdf
        except ImportError:
            self.skipTest("pymupdf no está instalado")
        with tempfile.TemporaryDirectory() as d:
            carpeta = Path(d)
            doc = pymupdf.open()
            doc.new_page().insert_text((50, 80), "Nota de la DPU: la urbanizacion estaba en zonificacion A2-X")
            doc[0].insert_text((50, 100), "y pasa a la nueva normativa A2 del plan.")
            doc.save(carpeta / "complementario-1.pdf")
            (carpeta / "documentos.json").write_text(json.dumps([{"archivo": "complementario-1.pdf", "nombre": "nota.pdf"}]), encoding="utf-8")
            (carpeta / "definidas.json").write_text(json.dumps({"valores": {"lote.codigo_zona": "A2-X"}}), encoding="utf-8")
            lote = carpeta / "lote.json"
            lote.write_text(json.dumps(hechos(area=400, altura=11)), encoding="utf-8")
            res = revisar(None, None, str(lote), str(carpeta), "2026-09-01", reglas=REGLAS)
        self.assertEqual((res["codigo_zona"], res["zona_trabajo"]["procedencia"], res["zona_trabajo"]["firme"]), ("A2", "oficial", True))
        self.assertEqual(res["zona_trabajo"]["fuente"]["pagina"], 1)
        self.assertEqual({r["regla_id"]: r["resultado"] for r in res["resultados"]}["AC-A2-ALTURA"], "CUMPLE")


if __name__ == "__main__":
    unittest.main()
