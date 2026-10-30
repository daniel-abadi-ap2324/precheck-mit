"""T13 — suspender y levantar normas con cuatro ojos (AC-20)."""
import unittest

from precheck.errores import ErrorPreCheck
from precheck.expediente import servicio as exp
from precheck.reglas import servicio as reglas
from tests.apoyo import Entorno, equipo, version_vigente
from tests.test_evaluar import CATALOGO, caso

RID = "PLOT-ZM6-LOTE-FRENTE"


class TestSuspension(unittest.TestCase):
    def setUp(self):
        self.e = equipo(Entorno())
        reglas.proponer(self.e.como("cuenta-0003"), CATALOGO)
        reglas.aprobar(self.e.como("cuenta-0001"), RID, version_vigente(RID))
        self.ev1 = exp.evaluar(self.e.como("cuenta-0004"), "EXP-TEST-0301", caso())
        self.ev2 = exp.evaluar(self.e.como("cuenta-0004"), "EXP-TEST-0302", caso())

    def tearDown(self):
        self.e.cerrar()

    def resultado(self, expediente):
        ev = exp.evaluar(self.e.como("cuenta-0004"), expediente, caso())
        return {r.regla_id: r for r in ev.resultados}[RID]

    def codigo(self, fn, *args):
        with self.assertRaises(ErrorPreCheck) as cm:
            fn(*args)
        return cm.exception.codigo

    def test_suspension_en_bloque_marca_afectados_sin_reescribir(self):
        # AC-20
        antes = list(self.e.repo.leer("expediente:EXP-TEST-0301"))
        prop = reglas.proponer_suspension(self.e.como("cuenta-0001"), "PLOT-A61-2021", "nulidad dictada por la CSJ")
        self.assertEqual(self.resultado("EXP-TEST-0399").resultado, "NO_CUMPLE")   # solo propuesta: no rige
        conf = reglas.confirmar(self.e.como("cuenta-0002"), prop.seq)
        self.assertEqual({a["expediente"] for a in conf.afectados}, {"EXP-TEST-0301", "EXP-TEST-0302", "EXP-TEST-0399"})
        despues = list(self.e.repo.leer("expediente:EXP-TEST-0301"))
        self.assertEqual(despues[:len(antes)], antes)
        self.assertEqual(despues[-1].tipo, "afectado_suspension")
        self.assertEqual(despues[-1].payload["norma"], "PLOT-A61-2021")
        r = self.resultado("EXP-TEST-0303")
        self.assertEqual((r.resultado, r.estado_regla), ("REQUIERE_REVISION", "suspendida"))

    def test_quien_propone_no_confirma(self):
        prop = reglas.proponer_suspension(self.e.como("cuenta-0001"), "PLOT-A61-2021", "nulidad")
        self.assertEqual(self.codigo(reglas.confirmar, self.e.como("cuenta-0001"), prop.seq),
                         "gobierno.sin_segunda_persona")
        self.assertEqual(self.codigo(reglas.confirmar, self.e.como("cuenta-0004"), prop.seq),
                         "gobierno.sin_designacion")

    def test_levantar_devuelve_el_resultado_oficial(self):
        prop = reglas.proponer_suspension(self.e.como("cuenta-0001"), "PLOT-A61-2021", "nulidad")
        reglas.confirmar(self.e.como("cuenta-0002"), prop.seq)
        lev = reglas.proponer_levantamiento(self.e.como("cuenta-0002"), "PLOT-A61-2021", "demanda desestimada")
        reglas.confirmar(self.e.como("cuenta-0001"), lev.seq)
        self.assertEqual(self.resultado("EXP-TEST-0304").resultado, "NO_CUMPLE")

    def test_errores(self):
        ctx = self.e.como("cuenta-0001")
        self.assertEqual(self.codigo(reglas.proponer_suspension, ctx, "NO-EXISTE", "m"), "gobierno.norma_desconocida")
        self.assertEqual(self.codigo(reglas.proponer_suspension, ctx, "PLOT-A61-2021", ""),
                         "gobierno.motivo_obligatorio")
        self.assertEqual(self.codigo(reglas.proponer_suspension, self.e.como("cuenta-0004"), "PLOT-A61-2021", "m"),
                         "gobierno.sin_designacion")


if __name__ == "__main__":
    unittest.main()


class TestAfectadosPrecisos(unittest.TestCase):
    """Review M5 y B2: solo se marcan resultados que usaron la norma; el marcado es reintentable."""

    def setUp(self):
        self.e = equipo(Entorno())
        reglas.proponer(self.e.como("cuenta-0003"), CATALOGO)
        reglas.aprobar(self.e.como("cuenta-0001"), RID, version_vigente(RID))
        self.ev = exp.evaluar(self.e.como("cuenta-0004"), "EXP-TEST-0901", caso())
        miviot = caso()
        miviot["lote"]["norma_aplicable"]["valor"] = "MIVIOT"
        exp.evaluar(self.e.como("cuenta-0004"), "EXP-TEST-0902", miviot)

    def tearDown(self):
        self.e.cerrar()

    def test_no_marca_expedientes_donde_la_norma_no_aplico(self):
        prop = reglas.proponer_suspension(self.e.como("cuenta-0001"), "PLOT-A61-2021", "nulidad")
        conf = reglas.confirmar(self.e.como("cuenta-0002"), prop.seq)
        self.assertEqual([a["expediente"] for a in conf.afectados], ["EXP-TEST-0901"])
        afectado = conf.afectados[0]
        self.assertEqual(afectado["evaluaciones"], {self.ev.seq: sorted(afectado["evaluaciones"][self.ev.seq])})
        self.assertIn(RID, afectado["evaluaciones"][self.ev.seq])
        self.assertEqual([e.tipo for e in self.e.repo.leer("expediente:EXP-TEST-0902")], ["evaluacion"])

    def test_marcado_interrumpido_se_completa_al_reintentar(self):
        otro = exp.evaluar(self.e.como("cuenta-0004"), "EXP-TEST-0903", caso())
        prop = reglas.proponer_suspension(self.e.como("cuenta-0001"), "PLOT-A61-2021", "nulidad")
        original = self.e.ctx.anexar
        llamadas = {"n": 0}

        def anexar_que_falla(cadena_id, tipo, *args, **kw):
            if tipo == "afectado_suspension":
                llamadas["n"] += 1
                if llamadas["n"] == 2:
                    raise OSError("base bloqueada")
            return original(cadena_id, tipo, *args, **kw)

        self.e.ctx.anexar = anexar_que_falla
        with self.assertRaises(OSError):
            reglas.confirmar(self.e.como("cuenta-0002"), prop.seq)
        self.e.ctx.anexar = original
        conf = reglas.confirmar(self.e.como("cuenta-0002"), prop.seq)      # reintento: completa, no duplica
        self.assertEqual({a["expediente"] for a in conf.afectados}, {"EXP-TEST-0901", "EXP-TEST-0903"})
        for exp_id in ("EXP-TEST-0901", "EXP-TEST-0903"):
            tipos = [e.tipo for e in self.e.repo.leer(f"expediente:{exp_id}")]
            self.assertEqual(tipos.count("afectado_suspension"), 1)
        self.assertIsNotNone(otro)
