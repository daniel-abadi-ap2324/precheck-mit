"""El tipo de cada dato del contrato (scripts/hechos_documentales.json) coincide con cómo lo usan las reglas (ADR-0019).

En la ronda 80, `lote.orden_conservacion` figuraba como sí/no sin lista de valores; las reglas de Casco Antiguo lo
comparan con 'tercer'. DeepSeek escribió «TERCER ORDEN» y dos reglas salieron «no aplica» sin aviso.
"""
import json
import re
import unittest
from collections import defaultdict
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
CLAVE = r"([a-z_]+(?:\.[a-z0-9_]+)+)"
USOS = {
    "bool": [re.compile(CLAVE + r"\s*(?:==|!=)\s*(?:true|false)\b")],
    "numero": [re.compile(CLAVE + r"\s*(?:<=|>=|<|>|\+|-|\*|/)\s*[\d(a-z]"), re.compile(r"(?:<=|>=|<|>|\+|\*|/)\s*" + CLAVE),
               re.compile(CLAVE + r"\s*(?:==|!=)\s*-?\d")],
    "texto": [re.compile(CLAVE + r"\s*(?:==|!=)\s*'"), re.compile(CLAVE + r"\s+(?:not\s+)?in\s+\['")],
}
IGUAL = re.compile(CLAVE + r"\s*(?:==|!=)\s*'([^']*)'")
EN = re.compile(CLAVE + r"\s+(?:not\s+)?in\s+\[([^\]]*)\]")


class TestContratoTipos(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.contrato = {d["clave"]: d for d in json.loads((RAIZ / "scripts" / "hechos_documentales.json").read_text(encoding="utf-8"))["datos"]}
        cls.usos, cls.literales = defaultdict(set), defaultdict(set)
        for f in (RAIZ / "reglas").glob("*.json"):
            for r in json.loads(f.read_text(encoding="utf-8")):
                for expr in (r.get("aplica_si") or "", r.get("condicion") or ""):
                    for tipo, patrones in USOS.items():
                        for p in patrones:
                            for k in p.findall(expr):
                                cls.usos[k].add(tipo)
                    for k, v in IGUAL.findall(expr):
                        cls.literales[k].add(v)
                    for k, lista in EN.findall(expr):
                        cls.literales[k].update(re.findall(r"'([^']*)'", lista))

    def test_el_tipo_del_contrato_es_el_que_usan_las_reglas(self):
        for clave, tipos in self.usos.items():
            if clave in self.contrato:
                with self.subTest(clave=clave):
                    self.assertEqual(tipos, {self.contrato[clave]["tipo"]})

    def test_los_valores_de_texto_cubren_lo_que_comparan_las_reglas(self):
        # El código de zona tiene su propia lectura y equivalencias (precheck/motor/zona.py).
        for clave, literales in self.literales.items():
            if clave in self.contrato and clave != "lote.codigo_zona":
                with self.subTest(clave=clave):
                    self.assertTrue(literales <= set(self.contrato[clave].get("valores") or []), sorted(literales))

    def test_el_tramite_no_es_un_dato_del_contrato(self):
        # Lo pone la plataforma ('RLA', 'RDP'…). Una entrada «tramite» sí/no copiada de otra regla hacía que el
        # normalizador lo descartara y todas las reglas quedaran sin aplicar.
        self.assertNotIn("tramite", self.contrato)
        self.assertTrue(all("." in clave for clave in self.contrato), [c for c in self.contrato if "." not in c])

    def test_sinonimos_y_lista_cerrada_bien_formados(self):
        for clave, d in self.contrato.items():
            with self.subTest(clave=clave):
                if d.get("cerrada") or d.get("sinonimos") or d.get("ruido"):
                    self.assertEqual(d["tipo"], "texto")
                    self.assertTrue(d.get("valores"))
                for destino in (d.get("sinonimos") or {}).values():
                    self.assertIn(destino, d["valores"])


if __name__ == "__main__":
    unittest.main()
