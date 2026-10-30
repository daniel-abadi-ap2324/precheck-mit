"""Comprobaciones previas a lanzar revisiones con IA (scripts/preflight_ia.py)."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "scripts"))
import preflight_ia  # noqa: E402


class TestFormatoDeAgentes(unittest.TestCase):
    def raiz_con(self, contenido: bytes) -> Path:
        d = Path(tempfile.mkdtemp())
        (d / ".claude" / "agents").mkdir(parents=True)
        (d / ".claude" / "agents" / "revisor.md").write_bytes(contenido)
        return d

    def test_el_repositorio_actual_cumple(self):
        self.assertEqual(preflight_ia.problemas_de_formato(RAIZ), [])

    def test_lf_y_guiones_en_la_primera_linea_es_valido(self):
        self.assertEqual(preflight_ia.problemas_de_formato(self.raiz_con(b"---\nname: x\n---\ncuerpo\n")), [])

    def test_crlf_se_detecta(self):
        p = preflight_ia.problemas_de_formato(self.raiz_con(b"---\r\nname: x\r\n---\r\ncuerpo\r\n"))
        self.assertEqual(len(p), 1)
        self.assertIn("revisor.md", p[0])

    def test_sin_guiones_al_inicio_se_detecta(self):
        self.assertEqual(len(preflight_ia.problemas_de_formato(self.raiz_con(b"name: x\n---\n"))), 1)

    def test_un_cr_solo_en_el_cuerpo_tambien_se_detecta(self):
        self.assertEqual(len(preflight_ia.problemas_de_formato(self.raiz_con(b"---\nname: x\n---\nlinea\r\n"))), 1)


class TestAvisosDeZona(unittest.TestCase):
    def carpeta(self, avisos):
        d = Path(tempfile.mkdtemp())
        (d / "resultado.json").write_text(json.dumps({"avisos": avisos}), encoding="utf-8")
        return d

    def test_zona_discrepante_bloquea_y_codigo_inexistente_solo_advierte(self):
        bloqueos, adv = preflight_ia.avisos_de_zona(self.carpeta([
            "ZONA_DISCREPANTE: el usuario indicó la zona '1ZM7' pero el plano declara 'RM3-C2'.",
            "El código de zona 'RM3-C2' no existe en la norma X (...): se necesita la CEUS.",
        ]))
        self.assertEqual(len(bloqueos), 1)
        self.assertEqual(len(adv), 1)

    def test_sin_avisos_no_hay_nada(self):
        self.assertEqual(preflight_ia.avisos_de_zona(self.carpeta([])), ([], []))

    def test_sin_resultado_json_advierte_sin_bloquear(self):
        bloqueos, adv = preflight_ia.avisos_de_zona(Path(tempfile.mkdtemp()))
        self.assertEqual(bloqueos, [])
        self.assertEqual(len(adv), 1)


if __name__ == "__main__":
    unittest.main()
