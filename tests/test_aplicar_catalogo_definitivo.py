"""Pruebas de scripts/aplicar_catalogo_definitivo.py con un catálogo sintético."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location("aplicar_catalogo_definitivo", RAIZ / "scripts" / "aplicar_catalogo_definitivo.py")
ap = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ap)

TEXTO = "Área mínima de lote: 600.00 M2\nFrente mínimo de lote: 20.00 ML.\nRetiro lateral: 1.50 m"


def regla(id_, **kw):
    r = {"id": id_, "version": 1, "titulo": "t", "tipo": "cuantitativa", "severidad": "bloqueante", "mensaje_no_cumple": "m",
         "aplica_si": "lote.codigo_zona == 'X'", "entradas": ["lote.area_m2"], "condicion": "lote.area_m2 >= 600",
         "fuente": {"norma": "N", "articulo": "1", "pagina_pdf": 1, "cita_textual": "Área mínima de lote: 600.00 M2"}}
    r.update(kw)
    return r


class TestAplicar(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.r = Path(self.tmp.name)
        (self.r / "normativa" / "acuerdo-110").mkdir(parents=True)
        (self.r / "normativa" / "acuerdo-110" / "texto-completo.md").write_text(TEXTO, encoding="utf-8")
        (self.r / "reglas").mkdir()
        (self.r / "scripts").mkdir()
        (self.r / "scripts" / "hechos_documentales.json").write_text(json.dumps({"descripcion": "", "datos": []}), encoding="utf-8")
        reglas = [regla("A"), regla("B", condicion="lote.area_m2 >= 800"), regla("C"), regla("D", tipo="criterio", condicion=None, entradas=[])]
        (self.r / "reglas" / "r.json").write_text(json.dumps(reglas, ensure_ascii=False, indent=1), encoding="utf-8")

    def tearDown(self):
        self.tmp.cleanup()

    def plan(self, decisiones):
        return ap.planificar(self.r, decisiones)

    def test_corregir_sube_version_y_cambia_campos(self):
        nuevos, _, errores, resumen = self.plan([{"id": "B", "veredicto": "CORREGIR", "condicion_final": "lote.area_m2 >= 600", "motivo": "valor de otra zona"}])
        self.assertEqual(errores, [])
        b = next(x for x in list(nuevos.values())[0][0] if x["id"] == "B")
        self.assertEqual((b["version"], b["condicion"]), (2, "lote.area_m2 >= 600"))
        self.assertIn("valor de otra zona", b["nota"])
        self.assertEqual(resumen["CORREGIR"], 1)

    def test_eliminar_y_fusionar_salen_del_catalogo(self):
        nuevos, retiradas, errores, resumen = self.plan([{"id": "B", "veredicto": "ELIMINAR", "motivo": "x"}, {"id": "C", "veredicto": "FUSIONAR_EN:A", "motivo": "y"}])
        self.assertEqual(errores, [])
        self.assertEqual([x["id"] for x in list(nuevos.values())[0][0]], ["A", "D"])
        self.assertEqual(retiradas["r.json"][1]["retirada"]["fusionada_en"], "A")

    def test_criterio_convertida_y_entradas_completas(self):
        nuevos, _, errores, _ = self.plan([{"id": "D", "veredicto": "CORREGIR", "tipo_final": "cuantitativa", "condicion_final": "proyecto.retiro_lateral_m >= 1.5",
                                            "cita_final": "Retiro lateral: 1.50 m", "motivo": "computable"}])
        self.assertEqual(errores, [])
        d = next(x for x in list(nuevos.values())[0][0] if x["id"] == "D")
        self.assertEqual(d["entradas"], ["proyecto.retiro_lateral_m"])

    def test_errores_bloquean(self):
        _, _, errores, _ = self.plan([
            {"id": "A", "veredicto": "CORREGIR", "cita_final": "texto que no está en la norma", "motivo": ""},
            {"id": "B", "veredicto": "CORREGIR", "condicion_final": "__import__('os')", "motivo": ""},
            {"id": "C", "veredicto": "CORREGIR", "tipo_final": "cuantitativa", "condicion_final": None, "motivo": ""},
            {"id": "Z", "veredicto": "MANTENER", "motivo": ""},
        ])
        textos = " | ".join(f"{i}: {e}" for i, e in errores)
        self.assertIn("A: la cita no está literal", textos)
        self.assertIn("B: condicion", textos)
        self.assertIn("Z: la decisión no corresponde", textos)

    def test_main_no_escribe_si_hay_errores(self):
        original = (self.r / "reglas" / "r.json").read_text(encoding="utf-8")
        dec = self.r / "dec.json"
        dec.write_text(json.dumps([{"id": "A", "veredicto": "CORREGIR", "cita_final": "no está", "motivo": ""}]), encoding="utf-8")
        viejo = ap.RAIZ
        ap.RAIZ = self.r
        try:
            self.assertEqual(ap.main(["--decisiones", str(dec)]), 1)
        finally:
            ap.RAIZ = viejo
        self.assertEqual((self.r / "reglas" / "r.json").read_text(encoding="utf-8"), original)


if __name__ == "__main__":
    unittest.main()
