"""scripts/equivalencias_reglas.py: grupos de reglas repetidas por unidad territorial."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location("equivalencias_reglas", RAIZ / "scripts" / "equivalencias_reglas.py")
eq = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(eq)


def regla(id_, condicion="x >= 1", cita="cita"):
    return {"id": id_, "condicion": condicion, "tipo": "cuantitativa", "severidad": "bloqueante", "entradas": ["x"], "fuente": {"cita_textual": cita}}


class TestAgrupar(unittest.TestCase):
    def grupos(self, reglas):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "a.json").write_text(json.dumps(reglas), encoding="utf8")
            return eq.equivalencias(Path(d))

    def test_junta_la_misma_regla_de_varias_ut_y_no_las_que_cambian(self):
        g = self.grupos([
            regla("SF-CENTRO-UT3-ZM7-ALTURA"), regla("SF-COCO-UT1-ZM7-ALTURA"),           # idénticas
            regla("SF-CENTRO-UT3-ZM7-USOS", None, cita="a"), regla("SF-COCO-UT1-ZM7-USOS", None, cita="b"),  # sin condición: la cita las distingue
            regla("SF-CENTRO-UT3-ZM7-AREA", cita="UT3 Área 600 m2"), regla("SF-COCO-UT1-ZM7-AREA", cita="UT1 Área 600 m2"),  # misma condición, cita con rótulo de la UT
            regla("SF-CENTRO-UT3-ZM7-ACERA", "x >= 2"), regla("SF-COCO-UT1-ZM7-ACERA", "x >= 3"),  # otro límite
            regla("SF-CENTRO-UT3-ZM7-SOLA"),                                               # sin pareja
            regla("A110-AIV-OTRA"),                                                        # sin patrón de UT
        ])
        self.assertEqual(g, {"SF-CENTRO-UT3-ZM7-ALTURA": "SF-UT*-ZM7-ALTURA", "SF-COCO-UT1-ZM7-ALTURA": "SF-UT*-ZM7-ALTURA",
                             "SF-CENTRO-UT3-ZM7-AREA": "SF-UT*-ZM7-AREA", "SF-COCO-UT1-ZM7-AREA": "SF-UT*-ZM7-AREA"})

    def test_con_varios_contenidos_cada_uno_es_un_grupo_aparte(self):
        g = self.grupos([regla("SF-A-UT1-D"), regla("SF-B-UT2-D"), regla("SF-C-UT3-D", "x >= 9"), regla("SF-D-UT4-D", "x >= 9")])
        self.assertEqual(g["SF-A-UT1-D"], g["SF-B-UT2-D"])
        self.assertEqual(g["SF-C-UT3-D"], g["SF-D-UT4-D"])
        self.assertNotEqual(g["SF-A-UT1-D"], g["SF-C-UT3-D"])


class TestCatalogoReal(unittest.TestCase):
    def test_el_json_de_la_web_esta_al_dia_con_el_catalogo(self):
        self.assertEqual(eq.main(["--comprobar"]), 0, "ejecute: python scripts/equivalencias_reglas.py")

    def test_la_altura_zm7_es_una_sola_regla_en_las_ut_candidatas_y_los_usos_prohibidos_de_coco_del_mar_no(self):
        g = json.loads(eq.SALIDA.read_text(encoding="utf8"))
        ids = ["SF-SAN-FRANCISCO-CENTRO-UT3-ZM7-ALTURA", "SF-SAN-FRANCISCO-CENTRO-UT6-ZM7-ALTURA", "SF-SAN-FRANCISCO-CENTRO-UT7-ZM7-ALTURA", "SF-COCO-DEL-MAR-UT1-ZM7-ALTURA"]
        self.assertEqual({g[i] for i in ids}, {"SF-UT*-ZM7-ALTURA"})
        self.assertNotIn("SF-COCO-DEL-MAR-UT1-ZM7-USOS-PROHIBIDOS", g)


if __name__ == "__main__":
    unittest.main()
