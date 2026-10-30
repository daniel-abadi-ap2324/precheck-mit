"""T1 — anexar_lote y cadenas en el puerto de bitácora; códigos informe.* (AC-17, precondición)."""
import unittest

from precheck.auditoria.cadena import EventoNuevo, verificar
from precheck.auditoria.puertos import RepositorioBitacora
from precheck.errores import CODIGOS, CadenaAvanzada, ErrorPreCheck
from tests.apoyo import Entorno

CODIGOS_INFORME = {
    "informe.expediente_pendiente":
        "La versión del profesional solo se emite con el expediente revisado; falta: {pendientes}.",
    "informe.sin_indicacion":
        "Toda observación necesita su indicación al profesional; faltan: {observaciones}.",
    "informe.resultados_afectados":
        "La evaluación tiene resultados afectados por un retiro o una suspensión ({afectaciones}); "
        "reevalúe el expediente.",
    "informe.indicacion_no_aplicable":
        "Solo se escriben indicaciones sobre observaciones de la evaluación vigente.",
    "informe.indicacion_vacia": "La indicación al profesional no puede estar vacía.",
    "informe.codigo_corto": "El código de huella debe tener al menos 16 caracteres.",
    "informe.emision_concurrente":
        "El expediente o las reglas cambiaron mientras se emitía; no se registró la emisión: vuelva a emitir.",
    "informe.archivo_no_verificable":
        "El archivo no es un documento ni una forma estructurada del PreCheck; verifíquelo con el código impreso.",
}


def ev(i, tipo="decision", actor="P-0004"):
    return EventoNuevo(tipo, actor, "revisor_doyc", f"2026-09-27T00:00:{i:02d}Z", {"n": i})


class TestAnexarLote(unittest.TestCase):
    def setUp(self):
        self.e = Entorno()
        self.repo = self.e.repo

    def tearDown(self):
        self.e.cerrar()

    def test_el_puerto_declara_anexar_lote_y_cadenas(self):
        for metodo in ("anexar_lote", "cadenas"):
            self.assertTrue(hasattr(RepositorioBitacora, metodo), metodo)
        self.assertIsInstance(self.repo, RepositorioBitacora)

    def test_lote_encadena_tras_la_cabeza_actual(self):
        previo = self.repo.anexar("expediente:E1", ev(1, "evaluacion"))
        lote = self.repo.anexar_lote("expediente:E1", [ev(2), ev(3, "indicacion_profesional")])
        self.assertEqual([r.seq for r in lote], [2, 3])
        self.assertEqual(lote[0].hash_previo, previo.hash)
        self.assertEqual(lote[1].hash_previo, lote[0].hash)
        eventos = list(self.repo.leer("expediente:E1"))
        self.assertEqual([e.tipo for e in eventos], ["evaluacion", "decision", "indicacion_profesional"])
        self.assertEqual(verificar(eventos), (True, None))
        self.assertEqual(self.repo.cabezas()["expediente:E1"], lote[-1].hash)

    def test_lote_en_cadena_nueva(self):
        lote = self.repo.anexar_lote("expediente:E2", [ev(1), ev(2)])
        self.assertEqual([r.seq for r in lote], [1, 2])
        self.assertEqual(lote[0].hash_previo, "")
        self.assertIn("expediente:E2", self.repo.cadenas())

    def test_si_falla_un_evento_no_queda_ninguno(self):
        previo = self.repo.anexar("expediente:E1", ev(1, "evaluacion"))
        malo = EventoNuevo("indicacion_profesional", "P-0004", "revisor_doyc", "2026-09-27T00:00:03Z",
                           {"no_serializable": object()})
        with self.assertRaises(TypeError):
            self.repo.anexar_lote("expediente:E1", [ev(2), malo])
        eventos = list(self.repo.leer("expediente:E1"))
        self.assertEqual([e.seq for e in eventos], [1])
        self.assertEqual(self.repo.cabezas()["expediente:E1"], previo.hash)
        # La bitácora sigue usable tras la reversión.
        self.assertEqual(self.repo.anexar("expediente:E1", ev(4)).seq, 2)

    def test_lote_vacio_no_escribe(self):
        self.assertEqual(self.repo.anexar_lote("expediente:E3", []), [])
        self.assertNotIn("expediente:E3", self.repo.cadenas())
        self.assertEqual(list(self.repo.leer("expediente:E3")), [])

    def test_cadenas_con_bitacora_nueva(self):
        self.assertIsInstance(self.repo.cadenas(), list)

    def test_anexar_con_cabezas_esperadas(self):
        # M6: la cabeza esperada se comprueba dentro de la transacción; si avanzó, no se anexa nada
        self.repo.anexar("expediente:E4", ev(1))
        self.repo.anexar("expediente:E4", ev(2), cabezas={"expediente:E4": 1, "reglas": 0})
        for cabezas in ({"expediente:E4": 1}, {"expediente:E4": 2, "reglas": 5}):
            with self.subTest(cabezas=cabezas), self.assertRaises(CadenaAvanzada):
                self.repo.anexar("expediente:E4", ev(3), cabezas=cabezas)
        self.assertEqual([e.seq for e in self.repo.leer("expediente:E4")], [1, 2])
        self.assertFalse(self.repo.con.in_transaction)


class TestContextoAnexarLote(unittest.TestCase):
    def setUp(self):
        self.e = Entorno()
        self.instantes = iter(["2026-09-27T10:00:00Z", "2026-09-27T11:00:00Z"])
        self.e.ctx.reloj = lambda: next(self.instantes)

    def tearDown(self):
        self.e.cerrar()

    def test_un_solo_instante_y_actor_por_evento(self):
        lote = self.e.ctx.anexar_lote("expediente:E1", [
            ("decision", "P-0004", "revisor_doyc", {"accion": "confirmar"}),
            ("indicacion_profesional", "P-0005", "revisor_doyc", {"texto": "Corrija el retiro."}),
        ])
        self.assertEqual([r.tipo for r in lote], ["decision", "indicacion_profesional"])
        self.assertEqual([r.actor for r in lote], ["P-0004", "P-0005"])
        self.assertEqual({r.ocurrido_en for r in lote}, {"2026-09-27T10:00:00Z"})
        self.assertEqual(lote[1].payload, {"texto": "Corrija el retiro."})
        self.assertEqual(verificar(list(self.e.repo.leer("expediente:E1"))), (True, None))


class TestCodigosInforme(unittest.TestCase):
    def test_los_codigos_con_su_mensaje(self):
        for codigo, mensaje in CODIGOS_INFORME.items():
            self.assertEqual(CODIGOS.get(codigo), mensaje, codigo)
            error = ErrorPreCheck(codigo, detalle="x")
            self.assertEqual((error.codigo, error.plantilla, error.detalles), (codigo, mensaje, {"detalle": "x"}))


if __name__ == "__main__":
    unittest.main()
