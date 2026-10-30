"""Reglas de las ampliaciones del catálogo (reglas/reglas_ampliacion_*_borrador.json): borrador, ids únicos, citas y datos documentados."""
import json
import unittest
from pathlib import Path

from precheck.motor.verificar_citas import cita_en_normativa, norm

RAIZ = Path(__file__).resolve().parent.parent
ARCHIVOS = sorted((RAIZ / "reglas").glob("reglas_ampliacion_*_borrador.json"))


def texto_de_normativa() -> str:
    return norm("".join(f.read_text(encoding="utf-8", errors="ignore") for f in sorted((RAIZ / "normativa").rglob("*")) if f.suffix in (".md", ".txt")))


class TestAmpliaciones(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.reglas = [(f.name, r) for f in ARCHIVOS for r in json.loads(f.read_text(encoding="utf-8"))]
        cls.contrato = {d["clave"]: d for d in json.loads((RAIZ / "scripts" / "hechos_documentales.json").read_text(encoding="utf-8"))["datos"]}
        cls.normativa = texto_de_normativa()

    def test_hay_ampliaciones_y_son_borradores_con_vigencia(self):
        self.assertGreaterEqual(len(ARCHIVOS), 16)
        self.assertEqual(len(self.reglas), 367)  # 376 menos las retiradas en la revisión definitiva de anteproyecto
        for nombre, r in self.reglas:
            with self.subTest(r=r["id"]):
                self.assertEqual(r["estado_revision"], "borrador")
                self.assertTrue(r["vigencia"]["desde"])
                self.assertNotIn("PROPUESTA no aprobada", r.get("nota", ""))

    def test_ids_unicos_en_todo_el_catalogo(self):
        todos = [r["id"] for f in (RAIZ / "reglas").glob("*.json") for r in json.loads(f.read_text(encoding="utf-8"))]
        self.assertEqual(len(todos), len(set(todos)))

    def test_cada_cita_esta_literal_en_algun_texto_de_la_normativa(self):
        for nombre, r in self.reglas:
            with self.subTest(r=r["id"], archivo=nombre):
                self.assertTrue(cita_en_normativa(r["fuente"]["cita_textual"], self.normativa))

    def test_los_datos_provisionales_estan_en_el_contrato(self):
        for nombre, r in self.reglas:
            for clave in r.get("entradas", []):
                with self.subTest(r=r["id"], clave=clave):
                    # El trámite lo pone la plataforma ('RLA', 'RDP'…): no es un dato del contrato (ADR-0019).
                    if clave in ("lote.norma_aplicable", "lote.codigo_zona", "tramite"):
                        continue
                    self.assertIn(clave, self.contrato)


if __name__ == "__main__":
    unittest.main()
