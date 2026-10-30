"""ErrorPreCheck rellena la plantilla de su mensaje con los detalles (hallazgo de integración de T12).

Lanzado desde la biblioteca, el mensaje no debe conservar marcadores como «{pendientes}»: la CLI ya no
es la única que los rellena. Datos ficticios.
"""
import unittest

from precheck.errores import CODIGOS, ErrorPreCheck


class TestMensajeConDetalles(unittest.TestCase):
    def test_rellena_la_plantilla_con_listas_unidas_por_comas(self):
        e = ErrorPreCheck("informe.expediente_pendiente", pendientes=["PLOT-ZM6-LOTE-FRENTE", "visto bueno"])
        self.assertEqual(e.mensaje, "La versión del profesional solo se emite con el expediente revisado; "
                                    "falta: PLOT-ZM6-LOTE-FRENTE, visto bueno.")
        self.assertEqual(str(e), f"informe.expediente_pendiente: {e.mensaje}")
        self.assertEqual(e.detalles, {"pendientes": ["PLOT-ZM6-LOTE-FRENTE", "visto bueno"]})
        e = ErrorPreCheck("informe.sin_indicacion", observaciones=("R-1",))
        self.assertTrue(e.mensaje.endswith("faltan: R-1."), e.mensaje)

    def test_sin_detalles_el_mensaje_sigue_legible(self):
        for codigo in ("informe.expediente_pendiente", "informe.sin_indicacion"):
            with self.subTest(codigo=codigo):
                e = ErrorPreCheck(codigo)
                self.assertNotIn("{", e.mensaje)
                self.assertNotIn("}", e.mensaje)
                self.assertTrue(e.mensaje.endswith(": sin detalle."), e.mensaje)
                self.assertEqual(e.plantilla, CODIGOS[codigo])

    def test_mensajes_sin_marcadores_no_cambian(self):
        e = ErrorPreCheck("informe.codigo_corto", caracteres=10)
        self.assertEqual(e.mensaje, CODIGOS["informe.codigo_corto"])


if __name__ == "__main__":
    unittest.main()
