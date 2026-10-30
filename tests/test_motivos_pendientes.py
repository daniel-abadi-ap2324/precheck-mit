"""Los textos con que el motor deja una regla en revisión (resultado.json -> motivo) siguen siendo los que reconoce
web/src/server/ia/pendientes.ts para la segunda pasada dirigida. Si cambias la redacción en precheck/motor/evaluador.py,
esta prueba falla y hay que actualizar `CLAVE_EN_MOTIVO` de pendientes.ts (y los casos de pendientes.test.ts)."""
import re
import unittest

from precheck.planos.revisar import evaluar

# La misma expresión que CLAVE_EN_MOTIVO en web/src/server/ia/pendientes.ts.
CLAVE_EN_MOTIVO = re.compile(r"(?:dato faltante: |falta |la confianza de )([A-Za-z_][\w.]*)")


def regla(id_, aplica_si, entradas, condicion, tipo="cuantitativa"):
    r = {"id": id_, "version": 1, "titulo": id_, "fuente": {"norma": "N", "articulo": "1", "pagina_pdf": 1, "cita_textual": "c"},
         "tipo": tipo, "aplica_si": aplica_si, "entradas": entradas, "severidad": "bloqueante",
         "vigencia": {"desde": "2025-01-01", "hasta": None}, "estado_revision": "borrador"}
    if condicion:
        r["condicion"] = condicion
    return r


def hecho(valor, confianza=1.0):
    return {"valor": valor, "confianza": confianza, "fuente": {"metodo": "vision"}}


HECHOS = {"tramite": hecho("RLA"), "proyecto": {"altura_m": hecho(9.0, 0.7), "pisos_totales": hecho(3)}}


class TestMotivosDeRevision(unittest.TestCase):
    def motivo(self, r):
        res = evaluar(HECHOS, [r], "2026-10-01")
        self.assertEqual(len(res["resultados"]), 1, res["resultados"])
        out = res["resultados"][0]
        self.assertEqual(out["resultado"], "REQUIERE_REVISION")
        return out["motivo"]

    def test_dato_faltante(self):
        m = self.motivo(regla("R-A", "tramite == 'RLA'", ["proyecto.ocupacion_pct"], "proyecto.ocupacion_pct <= 80"))
        self.assertEqual(CLAVE_EN_MOTIVO.findall(m), ["proyecto.ocupacion_pct"], m)
        self.assertIn("dato faltante", m)

    def test_confianza_bajo_el_minimo(self):
        m = self.motivo(regla("R-B", "tramite == 'RLA'", ["proyecto.altura_m"], "proyecto.altura_m <= 10"))
        self.assertEqual(CLAVE_EN_MOTIVO.findall(m), ["proyecto.altura_m"], m)
        self.assertIn("bajo el mínimo", m)

    def test_no_se_sabe_si_aplica_por_dato_faltante(self):
        m = self.motivo(regla("R-C", "lote.servidumbre_otra_entidad == true", ["proyecto.pisos_totales"], "proyecto.pisos_totales <= 5"))
        self.assertEqual(CLAVE_EN_MOTIVO.findall(m), ["lote.servidumbre_otra_entidad"], m)
        self.assertIn("no se puede determinar si aplica", m)

    def test_regla_de_criterio(self):
        m = self.motivo(regla("R-D", "tramite == 'RLA'", [], None, tipo="criterio"))
        self.assertTrue(m.startswith("regla de criterio"), m)
        self.assertEqual(CLAVE_EN_MOTIVO.findall(m), [])


if __name__ == "__main__":
    unittest.main()
