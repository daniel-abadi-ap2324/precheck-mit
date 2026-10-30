"""Aprendizaje controlado del agente revisor-planos (lecciones, criterios computables y propuestas de reglas)."""
import json
import pathlib
import tempfile
import unittest

from precheck import aprendizaje as ap

CITA = "El retiro lateral será de 3.50 mts en lateral libre"


def criterio_nuevo(**extra):
    c = {"nuevo": True, "interpretacion": "evaluar cada lateral libre", "reglas": ["AC-R1*-RETIRO-LATERAL"],
         "algoritmo": "para cada lateral libre: retiro >= 3.50",
         "fundamento": {"norma": "MIVIOT-AC-R160-2002", "articulo": "Art. 11", "cita_textual": CITA,
                        "texto": "normativa/norma.txt"}}
    c.update(extra)
    return c


def vigentes(kb):
    """Sección de criterios vigentes del contexto (lo que el agente aplica)."""
    texto = ap.contexto(kb)
    return texto.split("## Criterios computables vigentes")[1].split("\n\n## ")[0]


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        raiz = pathlib.Path(self.tmp.name)
        (raiz / "normativa").mkdir()
        (raiz / "normativa" / "norma.txt").write_text(f"Artículo 11. {CITA}, salvo adosamiento.", encoding="utf-8")
        self.exp = raiz / "expedientes"
        self.exp.mkdir()
        self.kb = ap.Conocimiento(raiz / "conocimiento", raiz=raiz)

    def tearDown(self):
        self.tmp.cleanup()

    def expediente(self, nombre, aprendizaje, reglas=()):
        d = self.exp / nombre
        d.mkdir(exist_ok=True)
        dic = {"fecha": "2026-10-01", "decisiones": [{"regla_id": r, "decision": "CUMPLE"} for r in reglas],
               "aprendizaje": aprendizaje}
        (d / "dictamen.json").write_text(json.dumps(dic), encoding="utf-8")
        return d


class TestLecciones(Base):
    def test_leccion_nueva_queda_vigente_y_se_cuenta_por_expediente(self):
        self.kb.registrar(self.expediente("A", {"lecciones": [{"nuevo": True, "texto": "el extractor trunca la finca",
                                                                "ambito": "extractor"}]}))
        [l] = self.kb.lecciones
        self.assertEqual((l["id"], l["estado"]), ("L-0001", "vigente"))
        self.kb.registrar(self.expediente("B", {"lecciones": [{"id": "L-0001"}]}))
        self.kb.registrar(self.expediente("B", {"lecciones": [{"id": "L-0001"}]}))  # idempotente
        self.assertEqual(self.kb.lecciones[0]["ocurrencias"], ["A", "B"])

    def test_retirar_leccion_conserva_historial(self):
        self.kb.registrar(self.expediente("A", {"lecciones": [{"nuevo": True, "texto": "x", "ambito": "paso 4"}]}))
        self.kb.registrar(self.expediente("B", {"lecciones": [{"retira": "L-0001", "motivo": "ya no pasa"}]}))
        l = self.kb.lecciones[0]
        self.assertEqual(l["estado"], "retirada")
        self.assertEqual(l["historial"][-1]["evento"], "retirada")


class TestCriterios(Base):
    def test_criterio_nuevo_es_candidato_y_no_se_aplica(self):
        self.kb.registrar(self.expediente("A", {"criterios": [criterio_nuevo()]}))
        [c] = self.kb.criterios
        self.assertEqual((c["id"], c["version"], c["estado"]), ("CC-0001", 1, "candidato"))
        self.assertNotIn("CC-0001", vigentes(self.kb))
        self.assertIn("CC-0001 v1 [candidato]", ap.contexto(self.kb))

    def test_promueve_con_dos_expedientes_cita_literal_y_pruebas_sin_contradiccion(self):
        self.kb.registrar(self.expediente("A", {"criterios": [criterio_nuevo()]}, ["AC-R1D1-RETIRO-LATERAL"]))
        self.kb.registrar(self.expediente("B", {"criterios": [{"id": "CC-0001"}]}, ["AC-R1D2-RETIRO-LATERAL"]))
        self.assertEqual(self.kb.promover(self.exp), [])  # faltan pruebas en A y B
        self.assertIn("sin prueba", " ".join(self.kb.pendientes(self.exp)["CC-0001"]))
        self.kb.registrar(self.expediente("B", {"criterios": [{"id": "CC-0001"}], "pruebas": [
            {"criterio": "CC-0001", "resultado": "consistente"},
            {"criterio": "CC-0001", "expediente": "A", "resultado": "consistente"}]}, ["AC-R1D2-RETIRO-LATERAL"]))
        self.assertEqual(self.kb.promover(self.exp), ["CC-0001"])
        self.assertEqual(self.kb.criterios[0]["estado"], "vigente")
        self.assertIn("CC-0001 v1", vigentes(self.kb))

    def test_no_promueve_con_un_solo_expediente(self):
        self.kb.registrar(self.expediente("A", {"criterios": [criterio_nuevo()], "pruebas": [
            {"criterio": "CC-0001", "resultado": "consistente"}]}, ["AC-R1D1-RETIRO-LATERAL"]))
        self.assertEqual(self.kb.promover(self.exp), [])

    def test_no_promueve_si_la_cita_no_es_literal(self):
        malo = criterio_nuevo(fundamento={"norma": "N", "articulo": "1", "cita_textual": "texto inventado",
                                          "texto": "normativa/norma.txt"})
        self.kb.registrar(self.expediente("A", {"criterios": [malo], "pruebas": [
            {"criterio": "CC-0001", "resultado": "consistente"}]}))
        self.kb.registrar(self.expediente("B", {"criterios": [{"id": "CC-0001"}], "pruebas": [
            {"criterio": "CC-0001", "resultado": "consistente"}]}))
        self.assertEqual(self.kb.promover(self.exp), [])
        self.assertIn("cita", " ".join(self.kb.pendientes(self.exp)["CC-0001"]))

    def test_contradiccion_suspende_un_criterio_vigente(self):
        prueba = [{"criterio": "CC-0001", "resultado": "consistente"}]
        self.kb.registrar(self.expediente("A", {"criterios": [criterio_nuevo()], "pruebas": prueba}))
        self.kb.registrar(self.expediente("B", {"criterios": [{"id": "CC-0001"}], "pruebas": prueba}))
        self.assertEqual(self.kb.promover(self.exp), ["CC-0001"])
        self.kb.registrar(self.expediente("C", {"pruebas": [
            {"criterio": "CC-0001", "resultado": "contradice", "nota": "el lateral está adosado"}]}))
        c = self.kb.criterios[0]
        self.assertEqual(c["estado"], "suspendido")
        self.assertEqual(c["historial"][-1]["evento"], "suspendido")
        self.assertNotIn("CC-0001", vigentes(self.kb))

    def test_modificar_crea_version_nueva_candidata(self):
        prueba = [{"criterio": "CC-0001", "resultado": "consistente"}]
        self.kb.registrar(self.expediente("A", {"criterios": [criterio_nuevo()], "pruebas": prueba}))
        self.kb.registrar(self.expediente("B", {"criterios": [{"id": "CC-0001"}], "pruebas": prueba}))
        self.kb.promover(self.exp)
        self.kb.registrar(self.expediente("C", {"criterios": [
            {"modifica": "CC-0001", "interpretacion": "evaluar cada lateral libre; adosados exentos"}]}))
        c = self.kb.criterios[0]
        self.assertEqual((c["version"], c["estado"], c["ocurrencias"]), (2, "candidato", ["C"]))
        self.assertEqual(c["historial"][-1]["anterior"]["interpretacion"], "evaluar cada lateral libre")


class TestProyeccion(Base):
    def test_el_alta_recibe_su_id_en_el_dictamen_y_corregirla_no_duplica(self):
        d = self.expediente("A", {"lecciones": [{"nuevo": True, "texto": "x", "ambito": "y"}]})
        self.kb.registrar(d)
        guardado = json.loads((d / "dictamen.json").read_text())
        self.assertEqual(guardado["aprendizaje"]["lecciones"][0]["id"], "L-0001")
        guardado["aprendizaje"]["lecciones"][0]["texto"] = "x corregida"
        (d / "dictamen.json").write_text(json.dumps(guardado))
        self.kb.registrar(d)
        self.assertEqual([l["texto"] for l in self.kb.lecciones], ["x corregida"])

    def test_quitar_una_referencia_quita_la_ocurrencia(self):
        self.kb.registrar(self.expediente("A", {"lecciones": [{"nuevo": True, "texto": "x", "ambito": "y"}]}))
        self.kb.registrar(self.expediente("B", {"lecciones": [{"id": "L-0001"}]}))
        self.kb.registrar(self.expediente("B", {"lecciones": []}))
        self.assertEqual(self.kb.lecciones[0]["ocurrencias"], ["A"])

    def test_quitar_un_alta_del_dictamen_que_la_creo_la_retira(self):
        self.kb.registrar(self.expediente("A", {"criterios": [criterio_nuevo()]}))
        self.kb.registrar(self.expediente("A", {"criterios": []}))
        self.assertEqual(self.kb.criterios[0]["estado"], "retirado")

    def test_prueba_no_aplica_no_cuenta_y_no_aplica_no_decide(self):
        prueba = lambda r: [{"criterio": "CC-0001", "resultado": r}]
        self.kb.registrar(self.expediente("A", {"criterios": [criterio_nuevo()], "pruebas": prueba("consistente")},
                                          ["AC-R1D1-RETIRO-LATERAL"]))
        self.kb.registrar(self.expediente("B", {"criterios": [{"id": "CC-0001"}], "pruebas": prueba("no_aplica")},
                                          ["AC-R1D2-RETIRO-LATERAL"]))
        self.assertIn("sin prueba consistente en B", " ".join(self.kb.pendientes(self.exp)["CC-0001"]))
        # Un expediente que solo tiene la regla en NO_APLICA no la decide: no hace falta probarlo.
        d = self.exp / "C"
        d.mkdir()
        (d / "dictamen.json").write_text(json.dumps({"decisiones": [
            {"regla_id": "AC-R1D3-RETIRO-LATERAL", "decision": "NO_APLICA"}]}))
        self.assertNotIn("C", " ".join(self.kb.pendientes(self.exp)["CC-0001"]))

    def test_valida_reglas_del_catalogo_y_expedientes_de_las_pruebas(self):
        (self.kb.raiz / "reglas").mkdir()
        (self.kb.raiz / "reglas" / "r.json").write_text(json.dumps([{"id": "AC-R1D1-RETIRO-LATERAL"}]))
        with self.assertRaises(ap.ErrorAprendizaje):
            self.kb.registrar(self.expediente("A", {"criterios": [criterio_nuevo(reglas=["NO-EXISTE-*"])]}))
        self.kb.registrar(self.expediente("A", {"criterios": [criterio_nuevo()]}))
        with self.assertRaises(ap.ErrorAprendizaje):
            self.kb.registrar(self.expediente("B", {"pruebas": [
                {"criterio": "CC-0001", "expediente": "Z", "resultado": "consistente"}]}))

    def test_modifica_de_otro_expediente_sobrevive_al_re_registro_del_creador(self):
        a = self.expediente("A", {"lecciones": [{"nuevo": True, "texto": "x", "ambito": "y"}]})
        self.kb.registrar(a)
        self.kb.registrar(self.expediente("B", {"lecciones": [{"modifica": "L-0001", "texto": "x ampliada"}]}))
        self.kb.registrar(a)
        l = self.kb.lecciones[0]
        self.assertEqual((l["texto"], l["version"], sorted(l["ocurrencias"])), ("x ampliada", 2, ["A", "B"]))

    def test_prueba_consistente_cuenta_como_aparicion(self):
        self.expediente("B", None, ["AC-R1D2-RETIRO-LATERAL"])
        self.kb.registrar(self.expediente("A", {"criterios": [criterio_nuevo()], "pruebas": [
            {"criterio": "CC-0001", "resultado": "consistente"},
            {"criterio": "CC-0001", "expediente": "B", "resultado": "consistente"}]}, ["AC-R1D1-RETIRO-LATERAL"]))
        self.assertEqual(self.kb.promover(self.exp), ["CC-0001"])

    def test_propuestas_de_herramienta(self):
        self.kb.registrar(self.expediente("A", {"herramienta": [{"nuevo": True, "componente": "motor",
                                                                  "descripcion": "varias normas por expediente"}]}))
        self.assertEqual((self.kb.herramienta[0]["id"], self.kb.herramienta[0]["estado"]), ("PH-0001", "propuesta"))


class TestReglasYPersistencia(Base):
    def test_propuesta_de_regla_nunca_se_promueve(self):
        r = {"nuevo": True, "descripcion": "Anexo III, 11: número de hojas", "fundamento": {"norma": "A110"}}
        self.kb.registrar(self.expediente("A", {"reglas": [r]}))
        self.kb.registrar(self.expediente("B", {"reglas": [{"id": "PR-0001"}]}))
        self.kb.promover(self.exp)
        self.assertEqual((self.kb.reglas[0]["estado"], self.kb.reglas[0]["ocurrencias"]), ("propuesta", ["A", "B"]))

    def test_guardar_y_cargar(self):
        self.kb.registrar(self.expediente("A", {"lecciones": [{"nuevo": True, "texto": "x", "ambito": "y"}]}))
        self.kb.guardar()
        otra = ap.Conocimiento(self.kb.dir, raiz=self.kb.raiz)
        self.assertEqual(otra.lecciones[0]["id"], "L-0001")

    def test_referencia_inexistente_es_error(self):
        with self.assertRaises(ap.ErrorAprendizaje):
            self.kb.registrar(self.expediente("A", {"criterios": [{"id": "CC-0099"}]}))

    def test_dictamen_sin_aprendizaje_no_hace_nada(self):
        self.kb.registrar(self.expediente("A", None))
        self.assertEqual((self.kb.lecciones, self.kb.criterios, self.kb.reglas, self.kb.herramienta), ([], [], [], []))


if __name__ == "__main__":
    unittest.main()
