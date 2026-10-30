"""Verificación de las citas que escribe la IA en sus hallazgos (scripts/verificar_citas_ia.py)."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "scripts"))
import verificar_citas_ia as v  # noqa: E402

NORMA = v.normalizar("""**ANEXO III** 5. Localización general con escalas entre 1:100 y 1:500 de acuerdo con el tamaño de la finca,
indicando lo siguiente: - Código de zonificación - Orientación magnética. - Altura máxima""")


class TestCitas(unittest.TestCase):
    def test_cita_literal_se_verifica_aunque_cambien_espacios_tildes_y_mayusculas(self):
        self.assertEqual(v.estado_de("Acuerdo 110, Anexo III, num. 5: «LOCALIZACION GENERAL con escalas entre 1:100 y 1:500»", NORMA)[0], "VERIFICADA")

    def test_puntos_suspensivos_parten_la_cita_y_cada_parte_debe_aparecer(self):
        self.assertEqual(v.estado_de("«Localización general con escalas entre 1:100 y 1:500 de acuerdo con el tamaño de la finca […] Orientación magnética.»", NORMA)[0], "VERIFICADA")
        estado, faltan = v.estado_de("«Localización general con escalas entre 1:100 y 1:500 … Escalera de incendios exterior obligatoria»", NORMA)
        self.assertEqual(estado, "NO_ENCONTRADA")
        self.assertEqual(len(faltan), 1)

    def test_texto_inventado_no_se_encuentra(self):
        self.assertEqual(v.estado_de("«Toda edificación debe tener una escalera de incendios exterior»", NORMA)[0], "NO_ENCONTRADA")

    def test_referencia_sin_texto_entre_comillas_no_se_puede_comprobar(self):
        self.assertEqual(v.estado_de("Acuerdo 110 de 2025, Anexo III, num. 3", NORMA)[0], "SIN_TEXTO_LITERAL")
        self.assertEqual(v.estado_de("«corto»", NORMA)[0], "SIN_TEXTO_LITERAL")   # menos de 15 caracteres

    def test_sin_cita(self):
        self.assertEqual(v.estado_de("", NORMA)[0], "SIN_CITA")
        self.assertEqual(v.estado_de(None, NORMA)[0], "SIN_CITA")


class TestRevisarDictamenes(unittest.TestCase):
    def test_solo_revisa_los_hallazgos_propios_y_cuenta_cada_estado(self):
        datos = Path(tempfile.mkdtemp())
        (datos / "proyectos").mkdir()
        (datos / "prechecks" / "pck-1").mkdir(parents=True)
        (datos / "proyectos" / "prj-web-1.json").write_text(json.dumps({"project": {"name": "Plano - prueba 1 con Opus 5.5", "precheckId": "pck-1"}}), encoding="utf-8")
        decisiones = [
            {"regla_id": "A110-AIV-AREA-LOTE", "cita": "«no se revisa porque es del catálogo»"},
            {"regla_id": "HALLAZGO-1", "cita": "«Código de zonificación - Orientación magnética»"},
            {"regla_id": "HALLAZGO-SIN-ACABADOS", "cita": "«Acabados generales de todos los ambientes del proyecto»"},
            {"regla_id": "HALLAZGO-2", "cita": "Anexo III num. 3"},
        ]
        (datos / "prechecks" / "pck-1" / "dictamen.json").write_text(json.dumps({"decisiones": decisiones}), encoding="utf-8")
        filas = v.revisar(datos, NORMA)
        self.assertEqual([f["estado"] for f in filas], ["VERIFICADA", "NO_ENCONTRADA", "SIN_TEXTO_LITERAL"])
        md = v.informe(filas)
        self.assertIn("3 hallazgos propios", md)
        self.assertIn("HALLAZGO-SIN-ACABADOS", md)


if __name__ == "__main__":
    unittest.main()
