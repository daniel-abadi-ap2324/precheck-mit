"""T2 — huella del modelo y código impreso en bloques (AC-12, AC-16)."""
import hashlib
import unicodedata
import unittest
from dataclasses import dataclass

from precheck.auditoria.canonico import canonico
from precheck.errores import ErrorPreCheck
from precheck.informe import huella as hu


def modelo(**cambios):
    base = {
        "version": "profesional",
        "formato_informe": "1.0.0",
        "expediente": "E-0001",
        "evaluacion": 3,
        "encabezado": {"tramite": "RDP", "proyecto": "Edificio Pérez", "finca": "070819",
                       "profesional": "Juan Pérez", "idoneidad": "00303-337-337"},
        "observaciones": [{"regla_id": "A110-ART-1", "que_hacer": "Corrija la línea de construcción."}],
    }
    base.update(cambios)
    return base


def nfd(texto):
    return unicodedata.normalize("NFD", texto)


class TestHuella(unittest.TestCase):
    def test_es_sha256_del_canonico(self):
        m = modelo()
        self.assertEqual(hu.huella(m), hashlib.sha256(canonico(m).encode("utf-8")).hexdigest())
        self.assertRegex(hu.huella(m), r"^[0-9a-f]{64}$")

    def test_tilde_compuesta_y_precompuesta_dan_la_misma_huella(self):
        m = modelo()
        compuesto = modelo(encabezado=dict(m["encabezado"], profesional=nfd("Juan Pérez")),
                           observaciones=[{"regla_id": "A110-ART-1",
                                           "que_hacer": nfd("Corrija la línea de construcción.")}])
        self.assertNotEqual(canonico(compuesto), canonico(m))
        self.assertEqual(hu.huella(compuesto), hu.huella(m))

    def test_nfc_tambien_en_las_claves(self):
        self.assertEqual(hu.huella({nfd("línea"): 1}), hu.huella({"línea": 1}))

    def test_espacios_del_encabezado_no_cambian_la_huella(self):
        m = modelo()
        espaciado = modelo(encabezado=dict(m["encabezado"], profesional="  Juan   Pérez ", finca=" 070819"))
        self.assertEqual(hu.huella(espaciado), hu.huella(m))

    def test_espacios_fuera_del_encabezado_si_cuentan(self):
        m = modelo()
        otro = modelo(observaciones=[{"regla_id": "A110-ART-1", "que_hacer": "Corrija  la línea de construcción."}])
        self.assertNotEqual(hu.huella(otro), hu.huella(m))

    def test_orden_de_claves_no_importa(self):
        m = modelo()
        invertido = dict(reversed(list(m.items())))
        self.assertEqual(hu.huella(invertido), hu.huella(m))

    def test_un_caracter_distinto_cambia_la_huella(self):
        m = modelo()
        for alterado in (modelo(expediente="E-0002"),
                         modelo(encabezado=dict(m["encabezado"], finca="070815")),
                         modelo(observaciones=[{"regla_id": "A110-ART-1",
                                                "que_hacer": "Corrija la línea de construcción!"}])):
            self.assertNotEqual(hu.huella(alterado), hu.huella(m))

    def test_una_indicacion_mas_cambia_la_huella(self):
        m = modelo()
        con_otra = modelo(observaciones=m["observaciones"] + [{"regla_id": "A110-ART-2", "que_hacer": "Otra."}])
        self.assertNotEqual(hu.huella(con_otra), hu.huella(m))

    def test_normalizar_no_altera_el_original(self):
        m = modelo(encabezado={"profesional": "  Juan  "})
        hu.normalizar(m)
        self.assertEqual(m["encabezado"]["profesional"], "  Juan  ")


class TestHuellaEncabezado(unittest.TestCase):
    def test_ausentes_valen_none_y_se_normaliza(self):
        completo = {"tramite": "RDP", "proyecto": None, "finca": None, "profesional": "Juan Pérez", "idoneidad": None}
        self.assertEqual(hu.huella_encabezado({"tramite": " RDP", "profesional": nfd("Juan  Pérez")}),
                         hu.huella_encabezado(completo))
        self.assertEqual(hu.huella_encabezado(None), hu.huella_encabezado({}))
        self.assertNotEqual(hu.huella_encabezado({"finca": "1"}), hu.huella_encabezado({}))

    def test_acepta_un_objeto_con_atributos(self):
        @dataclass(frozen=True)
        class Enc:
            tramite: str | None = None
            proyecto: str | None = None
            finca: str | None = None
            profesional: str | None = None
            idoneidad: str | None = None
        self.assertEqual(hu.huella_encabezado(Enc(tramite="ATC")), hu.huella_encabezado({"tramite": "ATC"}))


class TestCodigo(unittest.TestCase):
    H = hashlib.sha256(b"x").hexdigest()

    def test_bloques_de_cuatro_con_la_huella_completa(self):
        codigo = hu.codigo(self.H)
        bloques = codigo.split(" ")
        self.assertEqual(len(bloques), 16)
        self.assertTrue(all(len(b) == 4 for b in bloques))
        self.assertEqual("".join(bloques), self.H)

    def test_normalizar_codigo(self):
        self.assertEqual(hu.normalizar_codigo(" AB12-cd34 ef56 "), "ab12cd34ef56")
        self.assertEqual(hu.normalizar_codigo(hu.codigo(self.H)), self.H)

    def test_prefijo_de_16_o_mas(self):
        self.assertTrue(hu.coincide_prefijo(self.H, hu.codigo(self.H)))
        self.assertTrue(hu.coincide_prefijo(self.H, hu.codigo(self.H)[:19]))       # 16 hex + 3 espacios
        self.assertTrue(hu.coincide_prefijo(self.H, self.H[:16].upper()))
        self.assertFalse(hu.coincide_prefijo(self.H, "0" * 16 if not self.H.startswith("0" * 16) else "f" * 16))

    def test_prefijo_corto_es_error(self):
        for corto in (self.H[:15], "-".join(self.H[:15][i:i + 4] for i in range(0, 15, 4)) + " - "):
            with self.assertRaises(ErrorPreCheck) as cm:
                hu.coincide_prefijo(self.H, corto)
            self.assertEqual(cm.exception.codigo, "informe.codigo_corto")


if __name__ == "__main__":
    unittest.main()
