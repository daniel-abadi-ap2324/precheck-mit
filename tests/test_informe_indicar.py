"""T3 — indicación al profesional: al decidir y después, como complemento (AC-17, AC-21).

Contra la bitácora real (SQLite descartable). La evaluación se anexa armada a mano para cubrir
todos los tipos de resultado (el catálogo no trae reglas con severidad «observacion").
Datos ficticios: EXP-TEST-*, P-000*.
"""
import unittest

from precheck.errores import ErrorPreCheck
from precheck.expediente import servicio as exp
from precheck.informe import servicio as inf
from precheck.personas import servicio as per
from tests.apoyo import Entorno, equipo
from tests.apoyo_informe import cobertura, resultado

EXP = "EXP-TEST-0900"
CADENA = f"expediente:{EXP}"

BLOQ = "PLOT-ZM6-LOTE-FRENTE"          # NO_CUMPLE bloqueante
BLOQ2 = "PLOT-ZM6-LOTE-AREA"           # NO_CUMPLE bloqueante (para descartar)
REV = "PLOT-ZM6-ALTURA"                # REQUIERE_REVISION
REV2 = "PLOT-ZM6-OCUPACION"            # REQUIERE_REVISION (para veredicto CUMPLE)
OBS = "PLOT-ZM6-ACERA"                 # NO_CUMPLE observacion oficial
CUMPLE = "PLOT-ZM6-DENSIDAD"           # CUMPLE
NOAP = "PLOT-ZM6-AREA-LIBRE"           # NO_APLICA
NORMA = "norma:MIVIOT"


def resultados():
    return [resultado(BLOQ, "NO_CUMPLE"), resultado(BLOQ2, "NO_CUMPLE"),
            resultado(REV, "REQUIERE_REVISION", estado="borrador", indicativo="NO_CUMPLE"),
            resultado(REV2, "REQUIERE_REVISION", estado="borrador", indicativo="CUMPLE"),
            resultado(OBS, "NO_CUMPLE", severidad="observacion"), resultado(CUMPLE, "CUMPLE"),
            resultado(NOAP, "NO_APLICA")]


class TestIndicar(unittest.TestCase):
    def setUp(self):
        self.e = equipo(Entorno())
        seq = per.vincular_cuenta(self.e.como("cuenta-0001"), "P-0005", "Test User 5", "cuenta-0005").seq
        per.confirmar(self.e.como("cuenta-0005"), seq)
        seq = per.designar(self.e.como("cuenta-0001"), "P-0005", "revisor_doyc", "alta en pruebas").seq
        per.confirmar(self.e.como("cuenta-0002"), seq)
        self.ev = self.evaluar()

    def tearDown(self):
        self.e.cerrar()

    def evaluar(self):
        rs = resultados()
        return self.e.como("cuenta-0004").anexar(CADENA, "evaluacion", "P-0004", "revisor_doyc", {
            "expediente_id": EXP, "fecha_presentacion": "2025-06-01", "norma_aplicable": "MIVIOT",
            "zona": {"ceus": None, "documento_grafico": "1ZM6", "usada": "1ZM6"}, "umbral": 0.85,
            "version_motor": "1.0.0", "commit": "0000000", "hechos": {}, "resultados": rs,
            "cobertura": cobertura(rs, ("MIVIOT",))})

    def rev(self, cuenta="cuenta-0004"):
        return self.e.como(cuenta)

    def eventos(self):
        return list(self.e.repo.leer(CADENA))

    def codigo(self, fn, *args, **kw):
        n = len(self.eventos())
        with self.assertRaises(ErrorPreCheck) as cm:
            fn(*args, **kw)
        self.assertEqual(len(self.eventos()), n, "un rechazo no registra nada")
        return cm.exception.codigo

    # --- AC-17: después, como complemento ------------------------------------------------------

    def test_indicar_sobre_bloqueante_confirmado(self):
        d = exp.decidir(self.rev(), EXP, self.ev.seq, BLOQ, "confirmar", "criterio interno")
        ind = inf.indicar(self.rev(), EXP, self.ev.seq, BLOQ, "  Amplíe el frente del lote a 16 m.  ")
        self.assertEqual((ind.tipo, ind.actor, ind.rol), ("indicacion", "P-0004", "revisor_doyc"))
        self.assertEqual(ind.payload, {"evaluacion_seq": self.ev.seq, "hash_evaluacion": self.ev.hash,
                                       "regla_id": BLOQ, "texto": "Amplíe el frente del lote a 16 m."})
        guardada = next(e for e in self.eventos() if e.seq == d.seq)
        self.assertEqual((guardada.hash, guardada.payload["motivo"]), (d.hash, "criterio interno"))

    def test_indicar_sobre_veredicto_desfavorable(self):
        exp.decidir(self.rev(), EXP, self.ev.seq, REV, "veredicto", "16 > 15", veredicto="NO_CUMPLE")
        self.assertEqual(inf.indicar(self.rev(), EXP, self.ev.seq, REV, "Reduzca a 15 pisos.").tipo, "indicacion")

    def test_indicar_sobre_observacion_con_y_sin_visto_bueno(self):
        inf.indicar(self.rev(), EXP, self.ev.seq, OBS, "Ajuste la acera.")
        exp.dar_visto_bueno(self.rev(), EXP, self.ev.seq, confirmar_sin_ceus=True)
        inf.indicar(self.rev(), EXP, self.ev.seq, OBS, "Ajuste la acera a 2.5 m.")
        textos = [e.payload["texto"] for e in self.eventos() if e.tipo == "indicacion"]
        self.assertEqual(textos, ["Ajuste la acera.", "Ajuste la acera a 2.5 m."])

    def test_indicar_sobre_norma_sin_reglas_decidida_en_contra(self):
        exp.decidir(self.rev(), EXP, self.ev.seq, NORMA, "veredicto", "revisado", veredicto="NO_CUMPLE")
        self.assertEqual(inf.indicar(self.rev(), EXP, self.ev.seq, NORMA, "Cumpla MIVIOT.").payload["regla_id"],
                         NORMA)

    def test_otro_revisor_puede_indicar_y_queda_atribuido(self):
        exp.decidir(self.rev(), EXP, self.ev.seq, BLOQ, "confirmar", "criterio interno")
        ind = inf.indicar(self.rev("cuenta-0005"), EXP, self.ev.seq, BLOQ, "Otra indicación.")
        self.assertEqual(ind.actor, "P-0005")

    # --- AC-17: al decidir ---------------------------------------------------------------------

    def test_decidir_con_indicacion_anexa_ambos_en_una_transaccion(self):
        d = exp.decidir(self.rev(), EXP, self.ev.seq, BLOQ, "confirmar", "criterio interno",
                        indicacion="Amplíe el frente.")
        self.assertEqual((d.tipo, d.payload["motivo"], d.payload["accion"]), ("decision", "criterio interno", "confirmar"))
        dec, ind = self.eventos()[-2:]
        self.assertEqual((dec.seq, dec.hash), (d.seq, d.hash))
        self.assertEqual(dec.ocurrido_en, ind.ocurrido_en)
        self.assertEqual((ind.tipo, ind.actor), ("indicacion", "P-0004"))
        self.assertEqual(ind.payload, {"evaluacion_seq": self.ev.seq, "hash_evaluacion": self.ev.hash,
                                       "regla_id": BLOQ, "texto": "Amplíe el frente."})
        self.assertNotIn("indicacion", dec.payload)

    def test_decidir_veredicto_desfavorable_con_indicacion(self):
        exp.decidir(self.rev(), EXP, self.ev.seq, REV, "veredicto", "m", veredicto="NO_CUMPLE", indicacion="Baje.")
        exp.decidir(self.rev(), EXP, self.ev.seq, NORMA, "veredicto", "m", veredicto="NO_CUMPLE", indicacion="MIVIOT.")
        self.assertEqual([e.tipo for e in self.eventos()[-4:]], ["decision", "indicacion", "decision", "indicacion"])

    def test_decidir_sin_indicacion_igual_que_antes(self):
        exp.decidir(self.rev(), EXP, self.ev.seq, BLOQ, "confirmar", "m")
        self.assertEqual(self.eventos()[-1].tipo, "decision")

    def test_decidir_con_indicacion_no_aplicable_no_registra_nada(self):
        casos = [(BLOQ2, "descartar", None), (REV2, "veredicto", "CUMPLE"), (NORMA, "veredicto", "CUMPLE")]
        for regla, accion, veredicto in casos:
            with self.subTest(regla=regla, accion=accion):
                self.assertEqual(self.codigo(exp.decidir, self.rev(), EXP, self.ev.seq, regla, accion, "m",
                                             veredicto=veredicto, indicacion="Haga algo."),
                                 "informe.indicacion_no_aplicable")

    def test_decidir_con_indicacion_vacia(self):
        self.assertEqual(self.codigo(exp.decidir, self.rev(), EXP, self.ev.seq, BLOQ, "confirmar", "m",
                                     indicacion="   "), "informe.indicacion_vacia")

    # --- AC-21: rechazos -----------------------------------------------------------------------

    def test_indicacion_vacia(self):
        exp.decidir(self.rev(), EXP, self.ev.seq, BLOQ, "confirmar", "m")
        for texto in ("", "   ", None):
            with self.subTest(texto=texto):
                self.assertEqual(self.codigo(inf.indicar, self.rev(), EXP, self.ev.seq, BLOQ, texto),
                                 "informe.indicacion_vacia")

    def test_no_aplicable(self):
        exp.decidir(self.rev(), EXP, self.ev.seq, BLOQ2, "descartar", "m")
        exp.decidir(self.rev(), EXP, self.ev.seq, REV2, "veredicto", "m", veredicto="CUMPLE")
        for regla in (CUMPLE, NOAP, BLOQ2, REV2, BLOQ, REV, NORMA, "PLOT-NO-EXISTE", "norma:OTRA"):
            with self.subTest(regla=regla):
                self.assertEqual(self.codigo(inf.indicar, self.rev(), EXP, self.ev.seq, regla, "Haga algo."),
                                 "informe.indicacion_no_aplicable")

    def test_norma_decidida_favorable_no_aplica(self):
        exp.decidir(self.rev(), EXP, self.ev.seq, NORMA, "veredicto", "m", veredicto="CUMPLE")
        self.assertEqual(self.codigo(inf.indicar, self.rev(), EXP, self.ev.seq, NORMA, "x"),
                         "informe.indicacion_no_aplicable")

    def test_evaluacion_no_vigente_o_inexistente(self):
        exp.decidir(self.rev(), EXP, self.ev.seq, BLOQ, "confirmar", "m")
        self.evaluar()
        self.assertEqual(self.codigo(inf.indicar, self.rev(), EXP, self.ev.seq, BLOQ, "x"),
                         "informe.evaluacion_no_vigente")
        self.assertEqual(self.codigo(inf.indicar, self.rev(), EXP, 999, BLOQ, "x"),
                         "informe.evaluacion_inexistente")
        self.assertEqual(self.codigo(inf.indicar, self.rev(), "EXP-TEST-NO-EXISTE", 1, BLOQ, "x"),
                         "informe.expediente_inexistente")

    def test_decision_de_otra_evaluacion_no_cuenta(self):
        exp.decidir(self.rev(), EXP, self.ev.seq, BLOQ, "confirmar", "m")
        nueva = self.evaluar()
        self.assertEqual(self.codigo(inf.indicar, self.rev(), EXP, nueva.seq, BLOQ, "x"),
                         "informe.indicacion_no_aplicable")

    def test_sin_rol_o_sin_cuenta(self):
        self.assertEqual(self.codigo(inf.indicar, self.rev("cuenta-0003"), EXP, self.ev.seq, OBS, "x"),
                         "identidad.sin_rol")
        self.assertEqual(self.codigo(inf.indicar, self.rev("cuenta-9999"), EXP, self.ev.seq, OBS, "x"),
                         "identidad.cuenta_no_vinculada")


if __name__ == "__main__":
    unittest.main()
