"""ADR-0017: reglas firmes (severidad, subsanación y fundamento literal). Datos ficticios salvo que se diga."""
import sys
import unittest

from precheck.motor.verificar_citas import norm
from precheck.reglas import firmeza
from tests.apoyo import RAIZ

sys.path.insert(0, str(RAIZ / "scripts"))
from aplicar_severidad_reglas import MARCA, aplicar_clasificacion, con_campos  # noqa: E402

ARCHIVO = "normativa/prueba/textos/norma.txt"
TEXTOS = {ARCHIVO: norm("Artículo 1. La altura máxima será de diez metros. Artículo 2. A juicio de la DOYC podrá "
                        "autorizarse un frente menor.")}


def regla(**cambios):
    r = {"id": "PRUEBA-ALTURA", "version": 3, "tipo": "cuantitativa", "severidad": "bloqueante",
         "subsanacion": "proyecto", "fundamento": {"criterio": "B1", "cita": "La altura máxima será de diez metros",
                                                    "archivo": ARCHIVO}}
    r.update(cambios)
    return r


class TestFirmeza(unittest.TestCase):
    def test_regla_firme_no_tiene_errores(self):
        self.assertEqual(firmeza.errores_de_firmeza(regla(), TEXTOS), [])

    def test_faltan_campos(self):
        r = regla()
        del r["subsanacion"], r["fundamento"]
        self.assertEqual(firmeza.errores_de_firmeza(r, TEXTOS), ["falta subsanacion", "falta fundamento"])

    def test_valores_no_permitidos(self):
        for cambio in ({"severidad": "grave"}, {"subsanacion": "otra"}, {"tipo": "mixta"},
                       {"fundamento": {"criterio": "O5", "cita": "x", "archivo": ARCHIVO}}):
            with self.subTest(cambio=cambio):
                self.assertTrue(firmeza.errores_de_valores(regla(**cambio)))

    def test_observacion_solo_con_informativa(self):
        self.assertTrue(firmeza.errores_de_invariantes(regla(severidad="observacion")))
        self.assertTrue(firmeza.errores_de_invariantes(regla(subsanacion="informativa")))
        f = {"criterio": "O1", "cita": "x", "archivo": ARCHIVO}
        self.assertEqual(firmeza.errores_de_invariantes(regla(severidad="observacion", subsanacion="informativa",
                                                              fundamento=f)), [])

    def test_criterio_y_severidad_concuerdan(self):
        f = {"criterio": "O2", "cita": "x", "archivo": ARCHIVO}
        self.assertIn("criterio O2 exige severidad observación", firmeza.errores_de_invariantes(regla(fundamento=f)))

    def test_documental_bloqueante_se_corrige_en_plano_o_documento(self):
        self.assertTrue(firmeza.errores_de_invariantes(regla(tipo="documental")))
        for sub in ("plano", "documento"):
            self.assertEqual(firmeza.errores_de_invariantes(regla(tipo="documental", subsanacion=sub)), [])

    def test_lote_minimo_es_bloqueante_y_decide_la_autoridad(self):
        for rid in ("PLOT-ZM6-LOTE-FRENTE", "SF-UT2-LOTE-AREA", "X-LOTE-FONDO-ESQUINA"):
            with self.subTest(rid=rid):
                self.assertTrue(firmeza.errores_de_invariantes(regla(id=rid)))
                self.assertEqual(firmeza.errores_de_invariantes(regla(id=rid, subsanacion="autoridad")), [])
        self.assertEqual(firmeza.errores_de_invariantes(regla(id="PLOT-ZM6-LOTE-AREACOMUN")), [])

    def test_fundamento_literal_en_su_archivo(self):
        f = dict(regla()["fundamento"], cita="La altura máxima será de veinte metros")
        self.assertEqual(firmeza.errores_de_fundamento(regla(fundamento=f), TEXTOS),
                         ["la cita del fundamento no está literal en su archivo"])
        f = dict(regla()["fundamento"], archivo="normativa/otra.txt")
        self.assertTrue(firmeza.errores_de_fundamento(regla(fundamento=f), TEXTOS))

    def test_cita_de_subsanacion_literal(self):
        f = dict(regla()["fundamento"], cita_subsanacion="A juicio de la DOYC podrá autorizarse")
        self.assertEqual(firmeza.errores_de_fundamento(regla(fundamento=f), TEXTOS), [])
        f["cita_subsanacion"] = "A juicio del MIVIOT"
        self.assertEqual(firmeza.errores_de_fundamento(regla(fundamento=f), TEXTOS),
                         ["la cita de la subsanación no está literal en normativa/"])

    def test_textos_reales_incluyen_las_fuentes_del_catalogo(self):
        textos = firmeza.cargar_textos(RAIZ)
        self.assertIn("normativa/acuerdo-110/texto-completo.md", textos)
        self.assertTrue(any(k.startswith("normativa/ley42-discapacidad/") for k in textos))


class TestCatalogoFirme(unittest.TestCase):
    """El catálogo real: cada regla tiene severidad, subsanación y fundamento válidos y literales (datos reales)."""

    def test_todas_las_reglas_son_firmes(self):
        import json
        textos = firmeza.cargar_textos(RAIZ)
        errores = [f"{r['id']}: {e}" for p in sorted((RAIZ / "reglas").glob("*.json"))
                   for r in json.loads(p.read_text(encoding="utf-8")) for e in firmeza.errores_de_firmeza(r, textos)]
        self.assertEqual(errores, [], "\n".join(errores[:20]))

    @unittest.skipUnless((RAIZ / "docs" / "revision-catalogo" / "adr0017" / "preclasificacion.json").exists(), "los datos de revisión del catálogo no vienen en esta copia pública")
    def test_aplicar_otra_vez_no_cambia_nada(self):
        from consolidar_severidad import consolidar
        from consolidar_severidad import reglas_por_id
        firmes, disputas, _ = consolidar()
        self.assertEqual(disputas, [])
        reglas = reglas_por_id()
        estados = {aplicar_clasificacion(reglas[c["id"]], c)[1] for c in firmes}
        self.assertEqual(estados, {"ya_aplicada"})


class TestAplicar(unittest.TestCase):
    def setUp(self):
        self.original = {"id": "PRUEBA-ALTURA", "version": 3, "tipo": "cuantitativa", "severidad": "observacion",
                         "condicion": "altura_m <= 10", "nota": "Versión 3 (2026-10-09): ajuste."}
        self.c = {"id": "PRUEBA-ALTURA", "version": 3, **{k: regla()[k] for k in ("severidad", "subsanacion", "fundamento")}}

    def test_aplica_una_version_nueva_con_nota(self):
        r, estado = aplicar_clasificacion(self.original, self.c)
        self.assertEqual(estado, "aplicada")
        self.assertEqual((r["version"], r["severidad"], r["subsanacion"]), (4, "bloqueante", "proyecto"))
        self.assertIn(f"Versión 4 {MARCA}", r["nota"])
        self.assertTrue(r["nota"].startswith("Versión 3 (2026-10-09): ajuste. | "))
        self.assertEqual(list(r)[:6], ["id", "version", "tipo", "severidad", "subsanacion", "fundamento"])

    def test_corrige_el_tipo_si_la_revision_lo_pide(self):
        r, _ = aplicar_clasificacion(dict(self.original, tipo="documental"), dict(self.c, tipo="cuantitativa"))
        self.assertEqual(r["tipo"], "cuantitativa")
        self.assertIn("tipo «documental» corregido a «cuantitativa»", r["nota"])

    def test_es_idempotente(self):
        r, _ = aplicar_clasificacion(self.original, self.c)
        otra, estado = aplicar_clasificacion(r, self.c)
        self.assertEqual((otra, estado), (r, "ya_aplicada"))

    def test_rechaza_otra_version(self):
        _, estado = aplicar_clasificacion(dict(self.original, version=5), self.c)
        self.assertIn("versión 5", estado)

    def test_reemplaza_campos_que_ya_existian(self):
        previa = con_campos(dict(self.original, subsanacion="plano", fundamento={}), self.c)
        self.assertEqual(list(previa).count("subsanacion"), 1)
        self.assertEqual(previa["subsanacion"], "proyecto")


if __name__ == "__main__":
    unittest.main()
