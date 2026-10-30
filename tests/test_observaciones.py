"""Predicados compartidos de observaciones (review B6): un solo lugar para «necesita decisión» y
«admite indicación», usado por expediente.servicio, informe.servicio e informe.modelo sin importar
nombres privados entre módulos."""
import ast
import pathlib
import unittest

from precheck.expediente import observaciones as obs

RAIZ = pathlib.Path(__file__).resolve().parent.parent


def r(resultado, severidad="bloqueante", regla="R-1"):
    return {"regla_id": regla, "resultado": resultado, "severidad": severidad}


def d(accion, veredicto=None):
    return {"accion": accion, "veredicto": veredicto}


class TestPredicados(unittest.TestCase):
    def test_necesita_decision(self):
        self.assertTrue(obs.necesita_decision(r("NO_CUMPLE")))
        self.assertTrue(obs.necesita_decision(r("REQUIERE_REVISION", None)))
        self.assertFalse(obs.necesita_decision(r("NO_CUMPLE", "observacion")))
        self.assertFalse(obs.necesita_decision(r("CUMPLE")))

    def test_admite_indicacion(self):
        casos = [
            (r("NO_CUMPLE"), d("confirmar"), None, True),
            (r("NO_CUMPLE"), d("descartar"), None, False),
            (r("NO_CUMPLE"), None, None, False),
            (r("REQUIERE_REVISION"), d("veredicto", "NO_CUMPLE"), None, True),
            (r("REQUIERE_REVISION"), d("veredicto", "CUMPLE"), None, False),
            (None, d("veredicto", "NO_CUMPLE"), None, True),           # norma sin reglas decidida en contra
            (None, d("veredicto", "CUMPLE"), None, False),
            (None, None, None, False),
            (r("NO_CUMPLE", "observacion"), None, None, True),
            (r("NO_CUMPLE", "observacion"), None, {"R-1"}, True),       # cubierta por el visto bueno
            (r("NO_CUMPLE", "observacion"), None, set(), False),
            (r("CUMPLE"), None, None, False),
            (r("NO_APLICA"), None, None, False),
        ]
        for resultado, decision, cubiertas, esperado in casos:
            with self.subTest(resultado=resultado, decision=decision, cubiertas=cubiertas):
                self.assertIs(obs.admite_indicacion(resultado, decision, cubiertas), esperado)

    def test_payload_y_texto_de_la_indicacion(self):
        class Ev:
            seq, hash = 3, "h3"
        self.assertEqual(obs.payload_indicacion(Ev, "R-1", "Amplíe."),
                         {"evaluacion_seq": 3, "hash_evaluacion": "h3", "regla_id": "R-1", "texto": "Amplíe."})
        self.assertEqual(obs.texto_indicacion("  Amplíe.  "), "Amplíe.")


class TestSinImportacionesPrivadas(unittest.TestCase):
    def test_informe_y_expediente_no_importan_nombres_privados(self):
        privados = []
        for ruta in sorted([*(RAIZ / "precheck/informe").rglob("*.py"), *(RAIZ / "precheck/expediente").rglob("*.py")]):
            for nodo in ast.walk(ast.parse(ruta.read_text(encoding="utf-8"))):
                if isinstance(nodo, ast.ImportFrom) and (nodo.module or "").startswith("precheck"):
                    privados += [f"{ruta.relative_to(RAIZ)}: {nodo.module}.{a.name}" for a in nodo.names
                                 if a.name.startswith("_") and a.name != "__version__"]
        self.assertEqual(privados, [])

    def test_los_tres_modulos_usan_el_modulo_neutro(self):
        for modulo in ("precheck/expediente/servicio.py", "precheck/informe/servicio.py", "precheck/informe/modelo.py"):
            with self.subTest(modulo=modulo):
                texto = (RAIZ / modulo).read_text(encoding="utf-8")
                self.assertIn("precheck.expediente.observaciones", texto)
                self.assertNotIn("def es_observacion", texto)
                self.assertNotIn("def _es_observacion", texto)


if __name__ == "__main__":
    unittest.main()
