"""T7 — proponer versiones con verificación de cita (AC-07, AC-08, AC-12)."""
import json
import unittest

from precheck.errores import ErrorPreCheck
from precheck.reglas import servicio as reglas
from tests.apoyo import RAIZ, Entorno, equipo

A110 = json.loads((RAIZ / "reglas/reglas_a110_borrador.json").read_text(encoding="utf-8"))
V0 = A110[0]["version"]   # la versión del catálogo (sube con cada revisión: ADR-0017)


class TestProponer(unittest.TestCase):
    def setUp(self):
        self.e = equipo(Entorno())
        self.redactor = self.e.como("cuenta-0003")

    def tearDown(self):
        self.e.cerrar()

    def test_registra_el_catalogo_como_borrador(self):
        # AC-07
        res = reglas.proponer(self.redactor, A110)
        self.assertEqual([r.estado for r in res], ["registrada"] * len(A110))
        est = self.e.ctx.estado_reglas()
        self.assertEqual(est.estado("A110-PDC-ACERA-ANCHO", V0), "borrador")
        self.assertEqual(est.versiones[("A110-PDC-ACERA-ANCHO", V0)]["redactor"], "P-0003")
        self.assertEqual(est.versiones[("A110-PDC-ACERA-ANCHO", V0)]["norma"], "A110-2025")

    def test_version_nueva_deja_intactas_las_anteriores(self):
        # AC-07
        reglas.proponer(self.redactor, A110[:1])
        v2 = dict(A110[0], version=V0 + 1, condicion="uso_acera.ancho_m <= 1.10")
        self.assertEqual(reglas.proponer(self.redactor, [v2])[0].estado, "registrada")
        est = self.e.ctx.estado_reglas()
        self.assertEqual(est.versiones[("A110-PDC-ACERA-ANCHO", V0)]["hash"],
                         reglas.proponer(self.redactor, A110[:1])[0].hash)

    def test_reproponer_igual_es_sin_cambios(self):
        reglas.proponer(self.redactor, A110)
        self.assertEqual({r.estado for r in reglas.proponer(self.redactor, A110)}, {"sin_cambios"})

    def test_el_estado_informativo_del_json_no_cambia_el_contenido(self):
        reglas.proponer(self.redactor, A110[:1])
        marcada = dict(A110[0], estado_revision="aprobada", aprobada_por="alguien")
        self.assertEqual(reglas.proponer(self.redactor, [marcada])[0].estado, "sin_cambios")

    def test_cita_inexistente_se_rechaza(self):
        # AC-08
        mala = dict(A110[0], id="A110-TEST-MALA", fuente=dict(A110[0]["fuente"], cita_textual="texto inventado xyz"))
        r = reglas.proponer(self.redactor, [mala, A110[1]])
        self.assertEqual((r[0].estado, r[0].codigo), ("error", "regla.cita_no_encontrada"))
        self.assertEqual(r[1].estado, "registrada")
        self.assertIsNone(self.e.ctx.estado_reglas().estado("A110-TEST-MALA", V0))

    def test_misma_version_con_otro_contenido_se_rechaza(self):
        # AC-12
        reglas.proponer(self.redactor, A110[:1])
        editada = dict(A110[0], condicion="uso_acera.ancho_m <= 9")
        r = reglas.proponer(self.redactor, [editada])[0]
        self.assertEqual((r.estado, r.codigo), ("error", "regla.inmutable"))

    def test_solo_un_redactor_propone(self):
        with self.assertRaises(ErrorPreCheck) as cm:
            reglas.proponer(self.e.como("cuenta-0004"), A110[:1])
        self.assertEqual(cm.exception.codigo, "identidad.sin_rol")


if __name__ == "__main__":
    unittest.main()


class TestClasificacionFirme(unittest.TestCase):
    """ADR-0017: severidad, subsanación y fundamento se validan al proponer (solo los campos presentes)."""

    def setUp(self):
        self.e = equipo(Entorno())
        self.redactor = self.e.como("cuenta-0003")
        base = A110[0]
        self.firme = dict(base, id="A110-TEST-FIRME", severidad="bloqueante", subsanacion="proyecto", fundamento={
            "criterio": "B1", "cita": base["fuente"]["cita_textual"], "archivo": "normativa/acuerdo-110/texto-completo.md"})

    def tearDown(self):
        self.e.cerrar()

    def proponer(self, regla):
        return reglas.proponer(self.redactor, [regla])[0]

    def test_regla_firme_se_registra(self):
        self.assertEqual(self.proponer(self.firme).estado, "registrada")

    def test_valor_no_permitido_se_rechaza(self):
        for campo, valor in (("severidad", "grave"), ("subsanacion", "otra"),
                             ("fundamento", dict(self.firme["fundamento"], criterio="O5"))):
            with self.subTest(campo=campo):
                r = self.proponer(dict(self.firme, **{campo: valor}))
                self.assertEqual((r.estado, r.codigo), ("error", "regla.valor_no_permitido"))

    def test_clasificacion_incoherente_se_rechaza(self):
        r = self.proponer(dict(self.firme, severidad="observacion"))
        self.assertEqual((r.estado, r.codigo), ("error", "regla.clasificacion_incoherente"))

    def test_fundamento_inventado_se_rechaza(self):
        r = self.proponer(dict(self.firme, fundamento=dict(self.firme["fundamento"], cita="texto inventado xyz")))
        self.assertEqual((r.estado, r.codigo), ("error", "regla.fundamento_no_encontrado"))
        self.assertIsNone(self.e.ctx.estado_reglas().estado("A110-TEST-FIRME", V0))


class TestGramatica(unittest.TestCase):
    def test_expresion_invalida_no_se_registra(self):
        # review A3: una regla mal escrita no entra al catálogo
        e = equipo(Entorno())
        try:
            mala = dict(A110[0], id="A110-TEST-SINTAXIS", condicion="uso_acera.ancho_m <=")
            r = reglas.proponer(e.como("cuenta-0003"), [mala])[0]
            self.assertEqual((r.estado, r.codigo), ("error", "regla.expresion_invalida"))
        finally:
            e.cerrar()
