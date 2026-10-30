"""Reglas de los Anexos III y IV del Acuerdo 110 (reglas/reglas_a110_anexos_iii_iv_borrador.json) y su contrato de datos."""
import json
import re
import unittest
from pathlib import Path

from precheck.motor.verificar_citas import cita_en_normativa, norm

RAIZ = Path(__file__).resolve().parent.parent
ARCHIVO = RAIZ / "reglas" / "reglas_a110_anexos_iii_iv_borrador.json"
HECHOS = RAIZ / "scripts" / "hechos_documentales.json"
CLAVE = re.compile(r"(?:plano|expediente|lote|proyecto|rampa)\.[a-z_0-9.]+")


class TestReglasAnexosIIIyIV(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.reglas = json.loads(ARCHIVO.read_text(encoding="utf-8"))
        cls.contrato = {d["clave"]: d for d in json.loads(HECHOS.read_text(encoding="utf-8"))["datos"]}

    def test_son_90_borradores_con_id_unico_y_vigencia(self):
        self.assertEqual(len(self.reglas), 90)
        self.assertEqual(len({r["id"] for r in self.reglas}), 90)
        for r in self.reglas:
            with self.subTest(r=r["id"]):
                self.assertEqual(r["estado_revision"], "borrador")
                self.assertTrue(r["vigencia"]["desde"])
                self.assertIn(r["aplica_si"].split("'")[1] if "'" in r["aplica_si"] else "", ("RLA", "RDP", ""))

    def test_cada_cita_esta_literal_en_el_acuerdo_110(self):
        texto = norm((RAIZ / "normativa" / "acuerdo-110" / "texto-completo.md").read_text(encoding="utf-8"))
        for r in self.reglas:
            with self.subTest(r=r["id"]):
                self.assertTrue(cita_en_normativa(r["fuente"]["cita_textual"], texto))

    def test_cada_dato_provisional_esta_en_el_contrato_de_datos(self):
        for r in self.reglas:
            usados = set(r.get("entradas", [])) | set(CLAVE.findall(r.get("aplica_si", "")))
            for clave in usados:
                with self.subTest(r=r["id"], clave=clave):
                    self.assertIn(clave, self.contrato)
                    self.assertIn(r["id"], self.contrato[clave]["reglas"])

    def test_el_contrato_no_menciona_reglas_que_no_existen(self):
        # Las reglas del contrato pueden ser de cualquier archivo de reglas/ (las ampliaciones también están en borrador).
        ids = {r["id"] for f in (RAIZ / "reglas").glob("*.json") for r in json.loads(f.read_text(encoding="utf-8"))}
        for clave, d in self.contrato.items():
            with self.subTest(clave=clave):
                self.assertTrue(set(d["reglas"]) <= ids)
                self.assertIn(d["tipo"], ("bool", "numero", "texto"))
                self.assertTrue(d["definicion"])


if __name__ == "__main__":
    unittest.main()
