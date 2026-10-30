"""T4 — estado de reglas derivado y selección de versión (AC-02, AC-06, AC-12)."""
import unittest

from precheck.auditoria.cadena import EventoNuevo, encadenar
from precheck.errores import ErrorRegla
from precheck.motor.seleccion import seleccionar
from precheck.reglas import gobierno

GEN = ("designacion_genesis", "P-1", {"personas": [{"persona_id": "P-1", "nombre": "Test User", "cuenta": "c1"},
                                                   {"persona_id": "P-2", "nombre": "Test User 2", "cuenta": "c2"}]})
# relleno neutro para conservar los números de secuencia de las pruebas (propuestas sin confirmar)
VIN2 = [("vinculo_propuesto", "P-1", {"persona_id": f"P-X{i}", "nombre": "X", "cuenta": f"cx{i}"}) for i in range(4)]


def cadena(*eventos):
    res = []
    for tipo, actor, payload in eventos:
        res.append(encadenar("reglas", res[-1] if res else None,
                             EventoNuevo(tipo, actor, "x", "2026-09-27T00:00:00Z", payload)))
    return res


def prop(v, desde, hasta=None, rid="PLOT-ZM6-LOTE-FRENTE", h=None):
    return ("propuesta", "P-3", {"regla_id": rid, "version": v, "hash_contenido": h or f"{v:064d}",
                                 "vigencia": {"desde": desde, "hasta": hasta}, "norma": "PLOT-A61-2021"})


def aprob(v, rid="PLOT-ZM6-LOTE-FRENTE"):
    return ("aprobacion", "P-1", {"regla_id": rid, "version": v})


class TestSeleccion(unittest.TestCase):
    def test_version_por_fecha_de_presentacion_no_la_de_hoy(self):
        # AC-02
        est = gobierno.estado_de_reglas(cadena(GEN, prop(1, "2021-09-15", "2024-12-31"), aprob(1),
                                               prop(2, "2025-01-01"), aprob(2)))
        s = seleccionar("PLOT-ZM6-LOTE-FRENTE", est, "2024-06-01")
        self.assertEqual((s.version, s.modo), (1, "oficial"))
        self.assertEqual(seleccionar("PLOT-ZM6-LOTE-FRENTE", est, "2026-09-27").version, 2)

    def test_borrador_da_indicativo(self):
        # AC-06
        est = gobierno.estado_de_reglas(cadena(GEN, prop(1, "2021-09-15")))
        s = seleccionar("PLOT-ZM6-LOTE-FRENTE", est, "2025-06-01")
        self.assertEqual((s.version, s.estado, s.modo), (1, "borrador", "indicativo"))

    def test_borrador_nuevo_no_quita_la_oficial(self):
        est = gobierno.estado_de_reglas(cadena(GEN, prop(1, "2021-09-15"), aprob(1), prop(2, "2025-01-01")))
        s = seleccionar("PLOT-ZM6-LOTE-FRENTE", est, "2025-06-01")
        self.assertEqual((s.version, s.modo), (1, "oficial"))
        self.assertEqual(s.borrador_version, 2)

    def test_retirada_da_revision_sin_volver_a_la_anterior(self):
        est = gobierno.estado_de_reglas(cadena(GEN, prop(1, "2021-09-15"), aprob(1), prop(2, "2021-09-15"),
                                               ("retiro", "P-1", {"regla_id": "PLOT-ZM6-LOTE-FRENTE", "version": 1,
                                                                  "motivo": "m"})))
        s = seleccionar("PLOT-ZM6-LOTE-FRENTE", est, "2025-06-01")
        self.assertEqual(s.modo, "indicativo")      # queda el borrador v2 como pista, no la v1 retirada
        est2 = gobierno.estado_de_reglas(cadena(GEN, prop(1, "2021-09-15"), aprob(1),
                                                ("retiro", "P-1", {"regla_id": "PLOT-ZM6-LOTE-FRENTE", "version": 1,
                                                                   "motivo": "m"})))
        s2 = seleccionar("PLOT-ZM6-LOTE-FRENTE", est2, "2025-06-01")
        self.assertEqual((s2.version, s2.estado, s2.modo), (1, "retirada", "sin_oficial"))

    def test_rechazada_no_se_evalua(self):
        est = gobierno.estado_de_reglas(cadena(GEN, prop(1, "2021-09-15"),
                                               ("rechazo", "P-1", {"regla_id": "PLOT-ZM6-LOTE-FRENTE", "version": 1,
                                                                   "motivo": "m"})))
        self.assertIsNone(seleccionar("PLOT-ZM6-LOTE-FRENTE", est, "2025-06-01"))

    def test_suspension_confirmada_y_levantada(self):
        base = [GEN, *VIN2, prop(1, "2021-09-15"), aprob(1),
                ("suspension_propuesta", "P-1", {"norma": "PLOT-A61-2021", "motivo": "nulidad"})]
        solo_propuesta = gobierno.estado_de_reglas(cadena(*base))
        self.assertEqual(seleccionar("PLOT-ZM6-LOTE-FRENTE", solo_propuesta, "2025-06-01").modo, "oficial")
        base.append(("suspension_confirmada", "P-2", {"propuesta_seq": 8}))
        susp = gobierno.estado_de_reglas(cadena(*base))
        s = seleccionar("PLOT-ZM6-LOTE-FRENTE", susp, "2025-06-01")
        self.assertEqual((s.estado, s.modo), ("suspendida", "sin_oficial"))
        base += [("levantamiento_propuesto", "P-2", {"norma": "PLOT-A61-2021", "motivo": "desestimada"}),
                 ("levantamiento_confirmado", "P-1", {"propuesta_seq": 10})]
        self.assertEqual(seleccionar("PLOT-ZM6-LOTE-FRENTE", gobierno.estado_de_reglas(cadena(*base)),
                                     "2025-06-01").modo, "oficial")

    def test_suspension_abarca_normas_derivadas(self):
        est = gobierno.estado_de_reglas(cadena(
            GEN, *VIN2, ("propuesta", "P-3", {"regla_id": "SF-X", "version": 1, "hash_contenido": "1" * 64,
                                              "vigencia": {"desde": "2025-01-01"}, "norma": "PLOT-A61-2021+A270-2025"}),
            aprob(1, "SF-X"),
            ("suspension_propuesta", "P-1", {"norma": "PLOT-A61-2021", "motivo": "nulidad"}),
            ("suspension_confirmada", "P-2", {"propuesta_seq": 8})))
        self.assertEqual(seleccionar("SF-X", est, "2025-06-01").estado, "suspendida")

    def test_suspension_confirmada_por_el_mismo_no_rige(self):
        est = gobierno.estado_de_reglas(cadena(
            GEN, *VIN2, prop(1, "2021-09-15"), aprob(1),
            ("suspension_propuesta", "P-1", {"norma": "PLOT-A61-2021", "motivo": "m"}),
            ("suspension_confirmada", "P-1", {"propuesta_seq": 8})))
        self.assertEqual(seleccionar("PLOT-ZM6-LOTE-FRENTE", est, "2025-06-01").modo, "oficial")


class TestValidaciones(unittest.TestCase):
    def test_version_registrada_no_se_edita(self):
        # AC-12
        est = gobierno.estado_de_reglas(cadena(GEN, prop(1, "2021-09-15", h="a" * 64), aprob(1)))
        with self.assertRaises(ErrorRegla) as cm:
            gobierno.validar_propuesta(est, "PLOT-ZM6-LOTE-FRENTE", 1, "b" * 64)
        self.assertEqual(cm.exception.codigo, "regla.inmutable")
        self.assertEqual(gobierno.validar_propuesta(est, "PLOT-ZM6-LOTE-FRENTE", 1, "a" * 64), "sin_cambios")
        self.assertEqual(gobierno.validar_propuesta(est, "PLOT-ZM6-LOTE-FRENTE", 2, "b" * 64), "nueva")

    def test_aprobadas_no_se_solapan(self):
        est = gobierno.estado_de_reglas(cadena(GEN, prop(1, "2021-09-15"), aprob(1), prop(2, "2025-01-01")))
        with self.assertRaises(ErrorRegla) as cm:
            gobierno.validar_aprobacion(est, "PLOT-ZM6-LOTE-FRENTE", 2)
        self.assertEqual(cm.exception.codigo, "regla.vigencia_solapada")

    def test_estado_invalido_e_inexistente(self):
        est = gobierno.estado_de_reglas(cadena(GEN, prop(1, "2021-09-15"), aprob(1)))
        for fn, args, codigo in [(gobierno.validar_aprobacion, (1,), "regla.estado_invalido"),
                                 (gobierno.validar_aprobacion, (9,), "regla.version_inexistente"),
                                 (gobierno.validar_retiro, (1,), None)]:
            with self.subTest(fn=fn.__name__, args=args):
                if codigo:
                    with self.assertRaises(ErrorRegla) as cm:
                        fn(est, "PLOT-ZM6-LOTE-FRENTE", *args)
                    self.assertEqual(cm.exception.codigo, codigo)
                else:
                    fn(est, "PLOT-ZM6-LOTE-FRENTE", *args)

    def test_norma_por_prefijo(self):
        self.assertEqual(gobierno.norma_de("A110-PDC-ACERA-ANCHO"), "A110-2025")
        self.assertEqual(gobierno.norma_de("SF-PAITILLA-UT7-ZM7-ALTURA"), "PLOT-A61-2021+A270-2025")
        self.assertEqual(gobierno.norma_de("PLOT-ZM6-ALTURA"), "PLOT-A61-2021")


if __name__ == "__main__":
    unittest.main()
