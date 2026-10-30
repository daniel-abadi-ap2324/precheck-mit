"""scripts/diagnostico_variacion.py con datos sintéticos."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location("diagnostico_variacion", RAIZ / "scripts" / "diagnostico_variacion.py")
dv = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(dv)


class TestFunciones(unittest.TestCase):
    def test_hechos_de_recorre_el_lote_y_toma_valor_confianza_y_metodo(self):
        lote = {"tramite": {"valor": "RLA", "confianza": 1}, "proyecto": {"retiro_posterior_m": {"valor": 2.2, "confianza": 0.85, "fuente": {"metodo": "medicion"}}}}
        self.assertEqual(dv.hechos_de(lote), {"tramite": ("RLA", 1, None), "proyecto.retiro_posterior_m": (2.2, 0.85, "medicion")})

    def test_cv_y_numero(self):
        self.assertEqual(dv.numero("2.5"), 2.5)
        self.assertIsNone(dv.numero("n/a"))
        self.assertAlmostEqual(dv.cv([2, 2, 2]), 0.0)
        self.assertGreater(dv.cv([1, 2, 3]), 0.3)

    def test_nucleo_y_cola_agrupa_por_id_tipificado_y_por_palabras(self):
        def c(*h):
            return dict(hall=list(h))
        a = c(("HALLAZGO-LAMINAS-FALTANTES", "x", "NO_CUMPLE"), ("HALLAZGO-1", "Sin solución al drenaje pluvial", "NO_CUMPLE"))
        b = c(("HALLAZGO-LAMINAS-FALTANTES", "y", "NO_CUMPLE"), ("HALLAZGO-3", "Solución al drenaje pluvial dentro de la propiedad", "NO_CUMPLE"))
        g = dv.nucleo_y_cola([a, b, c(("HALLAZGO-X-SOLO", "otro", "OBSERVACION"))])
        self.assertEqual(sorted(len(x["corridas"]) for x in g), [1, 2, 2])


class TestGenerar(unittest.TestCase):
    def test_genera_las_siete_secciones_con_corridas_terminadas(self):
        with tempfile.TemporaryDirectory() as d:
            datos = Path(d)
            (datos / "proyectos").mkdir()
            (datos / "planos" / "plan-1").mkdir(parents=True)
            (datos / "planos" / "plan-1" / "extraccion.json").write_text(json.dumps({"hechos": [{"estado": "ok"}, {"estado": "no_encontrado"}], "paginas": [{"tipo": "escaneada"}]}), encoding="utf8")
            for i, retiro in enumerate((2.2, 2.6, 2.7)):
                pck = f"pck-{i}"
                (datos / "proyectos" / f"prj-web-{i}.json").write_text(json.dumps({"project": {"name": f"Plano X - prueba con Modelo {i}", "precheckId": pck}}), encoding="utf8")
                carpeta = datos / "prechecks" / pck
                carpeta.mkdir(parents=True)
                (carpeta / "estado.json").write_text(json.dumps({"planIds": ["plan-1"], "ia": {"status": "done"}}), encoding="utf8")
                (carpeta / "lote.json").write_text(json.dumps({"proyecto": {"retiro_posterior_m": {"valor": retiro, "confianza": 0.85}}}), encoding="utf8")
                (carpeta / "dictamen.json").write_text(json.dumps({"decisiones": [{"regla_id": "R-1", "decision": "CUMPLE" if i else "NO_CUMPLE"}, {"regla_id": "HALLAZGO-A", "titulo": "t", "decision": "NO_CUMPLE"}]}), encoding="utf8")
            texto = dv.generar(dv.cargar_corridas(datos))
            for seccion in ("## 1.", "## 2.", "## 3.", "## 4.", "## 5.", "## 6.", "## 7."):
                self.assertIn(seccion, texto)
            self.assertIn("| Plano X | `proyecto.retiro_posterior_m` | 3 | 2.2 | 2.6 | 2.7 |", texto)
            self.assertIn("| Plano X | `R-1` | CUMPLE: 2, NO_CUMPLE: 1 |", texto)
            self.assertIn("| Plano X | 1 | 3 | 1 | 1 | 0 |", texto)  # un hallazgo, en las 3 corridas: núcleo


if __name__ == "__main__":
    unittest.main()
