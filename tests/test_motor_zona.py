"""Zona del lote en `aplica_si` (precheck/motor/zona.py, ADR-0012): agrupar sin cambiar resultados y avisar del
código que la norma no reconoce."""
import unittest

from precheck.motor.evaluador import NO_APLICA, REVISION, evaluar_regla
from precheck.motor.zona import (
    GRUPO_ZONA,
    aviso_codigo_inexistente,
    clasificar,
    codigos_de_norma,
    codigos_de_regla,
    con_campos_confirmados,
    motivo_grupo,
)

N = "NORMA-PRUEBA"


def regla(rid, codigos, extra=""):
    aplica = f"lote.norma_aplicable == '{N}' and lote.codigo_zona in {codigos!r}" + (f" and {extra}" if extra else "")
    return {"id": rid, "version": 1, "tipo": "cuantitativa", "aplica_si": aplica, "entradas": ["lote.area_m2"],
            "condicion": "lote.area_m2 >= 300", "severidad": "bloqueante", "mensaje_no_cumple": "lote pequeño"}


def hechos(codigo, conf, **lote):
    h = {"lote": {"norma_aplicable": {"valor": N, "confianza": 0.95}, "codigo_zona": {"valor": codigo, "confianza": conf},
                  "area_m2": {"valor": 500, "confianza": 0.95}},
         "proyecto": {"obra_nueva": {"valor": False, "confianza": 0.95}}}
    for k, v in lote.items():
        h["lote"][k] = v
    return h


def clasificada(r, h, umbral=0.85):
    return clasificar(r, evaluar_regla(r, h, umbral), h, umbral)


class TestCodigos(unittest.TestCase):
    def test_lee_los_codigos_de_aplica_si(self):
        self.assertEqual(codigos_de_regla(regla("A", ["X1", "1X1"])), {"X1", "1X1"})
        self.assertEqual(codigos_de_regla({"aplica_si": "lote.codigo_zona == 'Y'"}), {"Y"})
        self.assertIsNone(codigos_de_regla({"aplica_si": "tramite == 'RLA'"}))
        self.assertIsNone(codigos_de_regla({"aplica_si": "lote.codigo_zona in ["}))   # ilegible: no se adivina

    def test_codigos_de_la_norma_solo_de_sus_reglas(self):
        otra = {"aplica_si": "lote.norma_aplicable == 'OTRA' and lote.codigo_zona in ['Z9']"}
        self.assertEqual(codigos_de_norma([regla("A", ["X1"]), regla("B", ["X2"]), otra], N), {"X1", "X2"})


class TestAvisoCodigoInexistente(unittest.TestCase):
    REGLAS = [regla("A", ["X1", "1X1"]), regla("B", ["RM-2*"])]

    def test_codigo_que_no_reconoce_ninguna_regla(self):
        aviso = aviso_codigo_inexistente(self.REGLAS, N, "R3")
        self.assertIn("'R3' no existe en la norma NORMA-PRUEBA", aviso)
        self.assertIn("se necesita la CEUS", aviso)

    def test_codigo_reconocido_tal_como_esta_escrito_no_avisa(self):
        self.assertIsNone(aviso_codigo_inexistente(self.REGLAS, N, "1X1"))
        self.assertIsNone(aviso_codigo_inexistente(self.REGLAS, N, "RM-2*"))

    def test_otra_grafia_sugiere_la_que_reconocen_las_reglas(self):
        aviso = aviso_codigo_inexistente(self.REGLAS, N, "RM2")
        self.assertIn("no lo reconoce, tal como está escrito", aviso)
        self.assertIn("RM-2*", aviso)

    def test_sin_norma_sin_codigo_o_sin_reglas_con_codigo_no_avisa(self):
        self.assertIsNone(aviso_codigo_inexistente(self.REGLAS, None, "R3"))
        self.assertIsNone(aviso_codigo_inexistente(self.REGLAS, N, None))
        self.assertIsNone(aviso_codigo_inexistente(self.REGLAS, "OTRA", "R3"))


class TestClasificar(unittest.TestCase):
    def test_regla_de_otro_codigo_se_agrupa_sin_cambiar_el_resultado(self):
        r = clasificada(regla("B", ["X2"]), hechos("X1", 0.6))
        self.assertEqual(r["resultado"], REVISION)
        self.assertTrue(r["motivo"].startswith("no se puede determinar si aplica"))
        self.assertEqual(r["grupo"], GRUPO_ZONA)
        self.assertEqual(r["motivo_tipo"], GRUPO_ZONA)
        self.assertEqual(r["zona_regla"], {"lote.codigo_zona": ["X2"]})
        self.assertNotIn("si_se_confirma_zona", r)

    def test_regla_del_codigo_declarado_lleva_resultado_provisional(self):
        r = clasificada(regla("A", ["X1"]), hechos("X1", 0.6))
        self.assertEqual(r["resultado"], REVISION)   # sigue en revisión: el código no está confirmado
        self.assertNotIn("grupo", r)
        self.assertEqual(r["si_se_confirma_zona"]["resultado"], "CUMPLE")
        self.assertEqual(r["si_se_confirma_zona"]["declarado"], {"lote.codigo_zona": "X1"})

    def test_regla_del_codigo_declarado_que_no_aplica_por_otra_condicion_no_se_agrupa(self):
        r = clasificada(regla("C", ["X1"], "proyecto.obra_nueva == true"), hechos("X1", 0.6))
        self.assertEqual(r["resultado"], REVISION)
        self.assertNotIn("grupo", r)
        self.assertEqual(r["si_se_confirma_zona"]["resultado"], NO_APLICA)

    def test_grafia_comparable_no_se_esconde(self):
        # El evaluador compara el texto exacto («x-1» ≠ «X1»), pero la regla podría ser la del lote: se lista.
        r = clasificada(regla("A", ["X1"]), hechos("x-1", 0.6))
        self.assertNotIn("grupo", r)

    def test_con_codigo_confiable_no_cambia_nada(self):
        r = regla("B", ["X2"])
        h = hechos("X1", 0.95)
        self.assertEqual(clasificada(r, h), evaluar_regla(r, h, 0.85))
        self.assertEqual(clasificada(r, h)["resultado"], NO_APLICA)

    def test_otro_dato_dudoso_no_se_agrupa(self):
        h = hechos("X1", 0.95)
        h["lote"]["norma_aplicable"]["confianza"] = 0.6
        r = clasificada(regla("B", ["X2"]), h)
        self.assertEqual(r["resultado"], REVISION)
        self.assertNotIn("grupo", r)
        self.assertNotIn("si_se_confirma_zona", r)

    def test_umbral_de_la_regla_se_respeta(self):
        r = regla("B", ["X2"])
        r["umbral_confianza"] = 0.95
        self.assertEqual(clasificada(r, hechos("X1", 0.9))["grupo"], GRUPO_ZONA)

    def test_sector_de_san_francisco(self):
        sf = {"id": "S", "aplica_si": f"lote.norma_aplicable == '{N}' and lote.sf_sector == 'Paitilla' and "
                                     "lote.sf_unidad_territorial == 1 and lote.codigo_zona in ['ZM7']",
              "entradas": [], "condicion": "true", "severidad": "bloqueante"}
        otro_sector = hechos("ZM7", 0.95, sf_sector={"valor": "Centro", "confianza": 0.7})
        r = clasificada(sf, otro_sector)
        self.assertEqual(r["grupo"], GRUPO_ZONA)
        self.assertEqual(r["zona_regla"], {"lote.sf_sector": ["Paitilla"]})
        # Mismo sector y unidad territorial faltante: no se rellena ni se agrupa.
        mismo = hechos("ZM7", 0.95, sf_sector={"valor": "Paitilla", "confianza": 0.7})
        r = clasificada(sf, mismo)
        self.assertEqual(r["resultado"], REVISION)
        self.assertNotIn("grupo", r)
        self.assertIn("falta lote.sf_unidad_territorial", r["motivo"])

    def test_mismo_sector_otro_codigo_se_agrupa_aunque_falte_la_unidad_territorial(self):
        # Sector y código dudosos, sin unidad territorial: el evaluador se detiene en la unidad territorial y
        # nunca lee el código, pero el código declarado ya basta para que la regla no aplique.
        def sf(rid, ut, codigos, conector="and"):
            return {"id": rid, "entradas": [], "condicion": "true", "severidad": "bloqueante",
                    "aplica_si": f"lote.norma_aplicable == '{N}' and lote.sf_sector == 'Centro' and "
                                 f"lote.sf_unidad_territorial == {ut} {conector} lote.codigo_zona in {codigos!r}"}
        h = hechos("1ZM7", 0.7, sf_sector={"valor": "Centro", "confianza": 0.75})
        otro_codigo = sf("UT1-ZM5", 1, ["ZM5", "1ZM5"])
        r = clasificada(otro_codigo, h)
        sin_clasificar = evaluar_regla(otro_codigo, h, 0.85)
        self.assertEqual(r["resultado"], REVISION)
        self.assertEqual(r["motivo"], sin_clasificar["motivo"])   # el resultado y el motivo no cambian
        self.assertEqual(r["valores_usados"], sin_clasificar["valores_usados"])
        self.assertIn("falta lote.sf_unidad_territorial", r["motivo"])
        self.assertEqual(r["grupo"], GRUPO_ZONA)
        self.assertEqual(r["motivo_tipo"], GRUPO_ZONA)
        self.assertEqual(r["zona_regla"], {"lote.codigo_zona": ["1ZM5", "ZM5"]})
        self.assertNotIn("si_se_confirma_zona", r)
        # El código declarado, en cualquier unidad territorial del sector, sigue en detalle.
        for regla_del_lote in (sf("UT3-ZM7", 3, ["ZM7", "1ZM7"]), sf("UT5-MIXTA", 5, ["ZM6", "1ZM6", "ZM7"]),
                               sf("UT6-GRAFIA", 6, ["zm-7"])):
            r = clasificada(regla_del_lote, h)
            self.assertNotIn("grupo", r, regla_del_lote["id"])
            self.assertEqual(r["si_se_confirma_zona"]["resultado"], REVISION)
        # Si el código no es una condición de la raíz (unida con «and»), no se puede afirmar que excluya.
        self.assertNotIn("grupo", clasificada(sf("UT1-OR", 1, ["ZM5"], "or"), h))
        # Con el código confiable no es «zona por confirmar»: falta la unidad territorial y eso se revisa.
        confiable = hechos("1ZM7", 0.95, sf_sector={"valor": "Centro", "confianza": 0.75})
        self.assertNotIn("grupo", clasificada(otro_codigo, confiable))

    def test_confirmar_no_rellena_ni_toca_el_original(self):
        h = hechos("X1", 0.6)
        c = con_campos_confirmados(h)
        self.assertEqual(c["lote"]["codigo_zona"], {"valor": "X1", "confianza": 1.0})
        self.assertEqual(h["lote"]["codigo_zona"]["confianza"], 0.6)
        self.assertNotIn("sf_sector", c["lote"])

    def test_motivo_nombra_los_campos(self):
        self.assertIn("confirmar el código de zona:", motivo_grupo(["lote.codigo_zona"]))
        self.assertIn("el código de zona y el sector", motivo_grupo(["lote.sf_sector", "lote.codigo_zona"]))


if __name__ == "__main__":
    unittest.main()
