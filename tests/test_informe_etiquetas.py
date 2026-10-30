"""Etiquetas legibles: ninguna clave del informe real llega al documento con su nombre interno."""
import unittest
from unittest import mock

from precheck.informe import html as ht
from precheck.informe.modelo import Encabezado, proyectar
from tests.apoyo_informe import Bitacora, estado_reglas, resultado

EXP = "EXP-TEST-0900"
TRAZ = {"emitido_por": "P-0004", "nombre": "Ana Revisora", "emitido_en": "2026-09-27T12:00:00Z"}


def claves_sin_etiqueta(modelo, **kw):
    faltan = set()
    original = ht._nombre

    def espia(clave):
        # Las claves que son datos (una norma, un hecho, «norma:MIVIOT») no llevan etiqueta: salen tal cual.
        if ht.es_campo(str(clave)) and str(clave) not in ht.ETIQUETAS:
            faltan.add(str(clave))
        return original(clave)

    with mock.patch.object(ht, "_nombre", espia):
        ht.render(modelo, **kw)
    return faltan


class TestEtiquetasLegibles(unittest.TestCase):
    def modelos(self):
        """Informe con todas las secciones: incumplimiento con indicación, revisión humana, cumplimientos,
        normas sin reglas y visto bueno."""
        b = Bitacora(EXP)
        res = [
            resultado("PLOT-ZM6-LOTE-FRENTE", "NO_CUMPLE"),
            resultado("PLOT-ZM6-DENSIDAD", "CUMPLE"),
            resultado("PLOT-ZM6-ALTURA", "REQUIERE_REVISION", estado="borrador", indicativo="NO_CUMPLE"),
        ]
        ev = b.evaluar(res, normas_sin_reglas=["MIVIOT"])
        b.decidir(ev, "PLOT-ZM6-ALTURA", "veredicto", veredicto="CUMPLE")
        b.decidir(ev, "norma:MIVIOT", "veredicto", veredicto="CUMPLE")
        b.decidir(ev, "PLOT-ZM6-LOTE-FRENTE", "confirmar")
        b.indicar(ev, "PLOT-ZM6-LOTE-FRENTE", "Amplíe el frente del lote.")
        b.visto_bueno(ev)
        enc = Encabezado(tramite="RDP", proyecto="Edificio Prueba", finca="083076", profesional="Test User")
        return {v: proyectar(b.eventos, estado_reglas(res), ev, v, enc) for v in ("revisor", "profesional")}

    def test_ninguna_clave_sale_con_su_nombre_interno(self):
        for version, m in self.modelos().items():
            with self.subTest(version=version):
                self.assertEqual(claves_sin_etiqueta(m, trazabilidad=TRAZ), set())

    def test_nombres_pedidos_en_el_changelog(self):
        doc = ht.texto_visible(ht.render(self.modelos()["revisor"], trazabilidad=TRAZ))
        for interno in ("Fecha presentacion", "Seq", "Documento grafico"):
            self.assertNotIn(interno, doc)
        # Los datos usados como clave salen tal cual, sin cambiar mayúsculas ni guiones bajos.
        for dato in ("PLOT-A61-2021 3", "lote.frente_m"):
            self.assertIn(dato, doc)
        self.assertNotIn("Plot-a61-2021", doc)


if __name__ == "__main__":
    unittest.main()
