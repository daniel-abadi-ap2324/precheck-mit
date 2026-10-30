"""scripts/reporte_estabilidad.py: solapamiento de hallazgos y acuerdo en el catálogo, con dictámenes sintéticos."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location("reporte_estabilidad", RAIZ / "scripts" / "reporte_estabilidad.py")
reporte = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(reporte)


def corrida(cat, hall, modelo="m"):
    return dict(modelo=modelo, ronda=1, repeticion=1, decisiones=len(cat) + len(hall), cat=cat, hall=hall, marcas=0, aviso=None)


class TestMedicion(unittest.TestCase):
    def test_hallazgos_tipificados_coinciden_por_id_y_numericos_por_palabras(self):
        a = corrida({"R-1": "CUMPLE", "R-2": "NO_CUMPLE"}, [("HALLAZGO-LAMINAS-FALTANTES", "A", "NO_CUMPLE"), ("HALLAZGO-1", "Linderos sin rumbos", "NO_CUMPLE")])
        b = corrida({"R-1": "CUMPLE", "R-2": "OBSERVACION"}, [("HALLAZGO-LAMINAS-FALTANTES", "B distinto", "NO_CUMPLE"), ("HALLAZGO-4", "Localización general: linderos sin rumbos", "NO_CUMPLE"), ("HALLAZGO-5", "Drenaje pluvial", "NO_CUMPLE")])
        sol, acu = reporte.medir([a, b])
        self.assertAlmostEqual(sol, 2 / 3)  # 2 coinciden de 3 distintos
        self.assertAlmostEqual(acu, 0.5)  # R-1 igual, R-2 distinta

    def test_un_tipificado_no_se_empareja_con_uno_numerico(self):
        self.assertFalse(reporte.mismo_hallazgo(("HALLAZGO-SIN-ACABADOS", "Sin acabados generales de los ambientes", "x"), ("HALLAZGO-3", "Sin acabados generales de los ambientes", "x")))

    def test_entre_repeticiones_solo_cuenta_los_pares_del_mismo_modelo(self):
        a, b, c = corrida({"R-1": "CUMPLE"}, [], "Opus"), corrida({"R-1": "CUMPLE"}, [], "Opus"), corrida({"R-1": "NO_CUMPLE"}, [], "Sonnet")
        self.assertAlmostEqual(reporte.medir([a, b, c])[1], 1 / 3)
        self.assertEqual(reporte.medir([a, b, c], mismo_modelo=True)[1], 1.0)
        self.assertEqual(reporte.medir([a, c], mismo_modelo=True), (None, None))

    def test_con_una_sola_corrida_no_hay_medida(self):
        self.assertEqual(reporte.medir([corrida({"R-1": "CUMPLE"}, [])]), (None, None))


class TestCarga(unittest.TestCase):
    def test_solo_cuenta_corridas_con_la_ia_terminada_y_agrupa_por_plano_y_grupo_de_rondas(self):
        with tempfile.TemporaryDirectory() as d:
            datos = Path(d)
            (datos / "proyectos").mkdir()
            (datos / "prechecks").mkdir()

            def proyecto(i, nombre, estado):
                pck = f"pck-{i}"
                (datos / "proyectos" / f"prj-web-{i}.json").write_text(json.dumps({"project": {"name": nombre, "precheckId": pck}}), encoding="utf8")
                (datos / "prechecks" / pck).mkdir()
                (datos / "prechecks" / pck / "dictamen.json").write_text(json.dumps({"decisiones": [{"regla_id": "R-1", "decision": "CUMPLE"}, {"regla_id": "HALLAZGO-X", "titulo": "t", "decision": "NO_CUMPLE"}]}), encoding="utf8")
                (datos / "prechecks" / pck / "estado.json").write_text(json.dumps({"ia": {"status": estado}}), encoding="utf8")

            proyecto("a1", "Casco Antiguo - prueba con Sonnet 5.5", "done")
            proyecto("a2", "Casco Antiguo - prueba con Opus 5.5", "done")
            proyecto("a3", "Casco Antiguo - prueba 2 con Opus 5.5", "done")
            proyecto("a4", "Casco Antiguo - prueba con Fable 5.1", "failed")
            proyecto("a5", "Casco antigua prueba", "done")  # no sigue el formato: se ignora
            proyecto("a6", "Casco Antiguo - prueba 2 con Opus 5.5 (2)", "done")
            rondas = reporte.cargar(datos)
            self.assertEqual(sorted((k, len(v)) for k, v in rondas.items()), [(("Casco Antiguo", (1,)), 2), (("Casco Antiguo", (2,)), 2)])
            self.assertEqual(sorted(c["repeticion"] for c in rondas[("Casco Antiguo", (2,))]), [1, 2])
            # Con el grupo 1–2 del catálogo, las cuatro corridas se miden juntas.
            juntas = reporte.cargar(datos, {1: (1, 2), 2: (1, 2)})
            self.assertEqual([(k, len(v)) for k, v in juntas.items()], [(("Casco Antiguo", (1, 2)), 4)])
            self.assertEqual(reporte.etiqueta_grupo((1, 2)), "1–2")


if __name__ == "__main__":
    unittest.main()
