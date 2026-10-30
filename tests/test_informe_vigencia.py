"""T7 — vigencia de las emisiones y resultados afectados (AC-14, AC-15, AC-16, AC-20).

La cadena de reglas se arma con los servicios reales (cuatro ojos) sobre una bitácora descartable y
un reloj controlado; `vigencia` es pura y recibe las listas de eventos.
"""
import dataclasses
import datetime as dt
import unittest
from unittest import mock

from precheck.auditoria.cadena import EventoNuevo, EventoRegistrado
from precheck.errores import ErrorPreCheck
from precheck.expediente import servicio as exp
from precheck.informe import vigencia as vg
from precheck.reglas import gobierno
from precheck.reglas import servicio as reglas
from tests.apoyo import Entorno, equipo, version_vigente
from tests.test_evaluar import CATALOGO, caso

EXP = "EXP-TEST-0700"
CADENA = f"expediente:{EXP}"
FRENTE = "PLOT-ZM6-LOTE-FRENTE"        # NO_CUMPLE oficial en el caso
DENSIDAD = "PLOT-ZM6-DENSIDAD"         # CUMPLE oficial (cumplimiento del resumen)
NO_APLICA = "PLOT-R1-ALTURA"           # aprobada, pero NO_APLICA en el caso
PLOT = "PLOT-A61-2021"


class Reloj:
    """Instantes estrictamente crecientes, un minuto entre eventos."""

    def __init__(self):
        self.t = dt.datetime(2026, 9, 1, 12, 0, tzinfo=dt.timezone.utc)

    def __call__(self):
        self.t += dt.timedelta(minutes=1)
        return self.t.isoformat().replace("+00:00", "Z")


class Base(unittest.TestCase):
    def setUp(self):
        self.e = equipo(Entorno())
        self.e.ctx.reloj = Reloj()
        reglas.proponer(self.e.como("cuenta-0003"), CATALOGO)
        for rid in (FRENTE, DENSIDAD, "PLOT-ZM6-ACERA", NO_APLICA):
            reglas.aprobar(self.e.como("cuenta-0001"), rid, version_vigente(rid))

    def tearDown(self):
        self.e.cerrar()

    def evaluar(self):
        return exp.evaluar(self.e.como("cuenta-0004"), EXP, caso()).seq

    def emitir(self, evaluacion, huella, actor="P-0004"):
        return self.e.ctx.anexar(CADENA, "informe_emitido", actor, "revisor_doyc", {
            "evaluacion_seq": evaluacion, "hash_evaluacion": "h", "version": "profesional", "huella": huella,
            "huella_encabezado": "he", "formato_informe": "1.0.0", "version_motor": "x"}).seq

    def eventos(self):
        return list(self.e.repo.leer(CADENA))

    def reglas_ev(self):
        return self.e.ctx.eventos_reglas()

    def estados(self):
        return {s.seq: s for s in vg.estados(self.eventos(), self.reglas_ev(), EXP)}

    def evaluacion(self, seq):
        return next(e for e in self.eventos() if e.seq == seq)

    def afectaciones(self, seq):
        return vg.afectaciones(self.evaluacion(seq), self.reglas_ev())

    def suspender(self, norma=PLOT):
        prop = reglas.proponer_suspension(self.e.como("cuenta-0001"), norma, "nulidad")
        return reglas.confirmar(self.e.como("cuenta-0002"), prop.seq).evento

    def levantar(self, norma=PLOT):
        prop = reglas.proponer_levantamiento(self.e.como("cuenta-0002"), norma, "desestimada")
        return reglas.confirmar(self.e.como("cuenta-0001"), prop.seq).evento

    def retirar(self, regla_id):
        return reglas.retirar(self.e.como("cuenta-0001"), regla_id, version_vigente(regla_id), "error en la cita").evento


class TestVigencia(Base):
    """AC-15 y la parte de entregas de AC-16."""

    def test_emision_unica_vigente_con_sus_datos(self):
        ev = self.evaluar()
        seq = self.emitir(ev, "a" * 64)
        s = self.estados()[seq]
        emitido = self.evaluacion(seq)
        self.assertEqual((s.expediente_id, s.evaluacion, s.huella, s.formato_informe), (EXP, ev, "a" * 64, "1.0.0"))
        self.assertEqual((s.emitido_por, s.emitido_en), ("P-0004", emitido.ocurrido_en))
        self.assertEqual((s.vigencia, s.sustituida_por, s.reemplazado_por, s.afectaciones),
                         ("vigente", None, None, ()))

    def test_evaluacion_posterior_reemplaza(self):
        ev1 = self.evaluar()
        seq = self.emitir(ev1, "a" * 64)
        ev2 = self.evaluar()
        s = self.estados()[seq]
        self.assertEqual((s.vigencia, s.reemplazado_por, s.sustituida_por), ("reemplazado", ev2, None))

    def test_emision_posterior_con_otra_huella_sustituye(self):
        ev = self.evaluar()
        primera = self.emitir(ev, "a" * 64)
        segunda = self.emitir(ev, "b" * 64)
        estados = self.estados()
        self.assertEqual((estados[primera].vigencia, estados[primera].sustituida_por), ("sustituida", segunda))
        self.assertEqual((estados[segunda].vigencia, estados[segunda].sustituida_por), ("vigente", None))

    def test_misma_huella_es_otra_entrega_sin_marca(self):
        # AC-16: cada emisión es una entrega distinta; la misma huella no marca nada.
        ev = self.evaluar()
        primera = self.emitir(ev, "a" * 64)
        segunda = self.emitir(ev, "a" * 64, actor="P-0001")
        estados = self.estados()
        self.assertEqual(set(estados), {primera, segunda})
        self.assertEqual([estados[s].vigencia for s in (primera, segunda)], ["vigente", "vigente"])
        self.assertEqual([estados[s].emitido_por for s in (primera, segunda)], ["P-0004", "P-0001"])

    def test_reemplazado_prevalece_sobre_sustituida(self):
        ev1 = self.evaluar()
        primera = self.emitir(ev1, "a" * 64)
        self.emitir(ev1, "b" * 64)
        ev2 = self.evaluar()
        s = self.estados()[primera]
        self.assertEqual((s.vigencia, s.reemplazado_por), ("reemplazado", ev2))

    def test_sin_emisiones(self):
        self.evaluar()
        self.assertEqual(vg.estados(self.eventos(), self.reglas_ev(), EXP), ())


class TestAfectaciones(Base):
    """AC-14."""

    def test_retiro_posterior_afecta_una_observacion(self):
        ev = self.evaluar()
        seq = self.emitir(ev, "a" * 64)
        antes = self.eventos()
        retiro = self.retirar(FRENTE)
        s = self.estados()[seq]
        self.assertEqual(s.afectaciones, (vg.Afectacion("retiro", f"{FRENTE} v{version_vigente(FRENTE)}", retiro.ocurrido_en, None),))
        self.assertEqual(s.vigencia, "vigente")
        self.assertEqual(self.eventos(), antes)       # el informe emitido no se altera

    def test_retiro_que_toca_un_cumplimiento_afecta(self):
        ev = self.evaluar()
        self.retirar(DENSIDAD)
        self.assertEqual([a.referencia for a in self.afectaciones(ev)], [f"{DENSIDAD} v{version_vigente(DENSIDAD)}"])

    def test_retiro_anterior_a_la_evaluacion_no_afecta(self):
        self.retirar(FRENTE)
        ev = self.evaluar()
        self.assertEqual(self.afectaciones(ev), ())

    def test_retiro_de_una_regla_no_aplica_no_afecta(self):
        ev = self.evaluar()
        self.retirar(NO_APLICA)
        self.assertEqual(self.afectaciones(ev), ())

    def test_suspension_propuesta_sin_confirmar_no_afecta(self):
        ev = self.evaluar()
        reglas.proponer_suspension(self.e.como("cuenta-0001"), PLOT, "nulidad")
        self.assertEqual(self.afectaciones(ev), ())

    def test_confirmacion_que_el_gobierno_ignora_no_afecta(self):
        ev = self.evaluar()
        prop = reglas.proponer_suspension(self.e.como("cuenta-0001"), PLOT, "nulidad")
        # Confirmación de la misma persona que propuso, escrita por fuera del servicio: cuatro ojos la ignora.
        self.e.repo.anexar("reglas", EventoNuevo("suspension_confirmada", prop.actor, "aprobador",
                                                 self.e.ctx.reloj(), {"propuesta_seq": prop.seq}))
        self.assertEqual(self.afectaciones(ev), ())

    def test_suspension_posterior_afecta_y_al_levantarse_conserva_el_periodo(self):
        ev = self.evaluar()
        seq = self.emitir(ev, "a" * 64)
        conf = self.suspender()
        self.assertEqual(self.estados()[seq].afectaciones, (vg.Afectacion("suspension", PLOT, conf.ocurrido_en, None),))
        lev = self.levantar()
        self.assertEqual(self.estados()[seq].afectaciones,
                         (vg.Afectacion("suspension", PLOT, conf.ocurrido_en, lev.ocurrido_en),))

    def test_suspension_anterior_levantada_despues_no_afecta(self):
        self.suspender()
        ev = self.evaluar()
        self.levantar()
        self.assertEqual(self.afectaciones(ev), ())

    def test_suspension_de_una_norma_del_linaje(self):
        ev = self.evaluacion(self.evaluar())
        # Resultado de San Francisco (norma derivada de PLOT-A61-2021) en una evaluación armada en memoria.
        sf = dict(ev.payload["resultados"][0], regla_id="SF-TEST-ALTURA", version=1, resultado="CUMPLE")
        solo_sf = dataclasses.replace(ev, payload=dict(ev.payload, resultados=[sf]))
        conf = self.suspender(PLOT)
        self.assertEqual(vg.afectaciones(solo_sf, self.reglas_ev()),
                         (vg.Afectacion("suspension", PLOT, conf.ocurrido_en, None),))

    def test_suspension_de_otra_norma_no_afecta(self):
        ev = self.evaluacion(self.evaluar())
        solo_plot = dataclasses.replace(ev, payload=dict(ev.payload, resultados=[
            r for r in ev.payload["resultados"] if r["regla_id"].startswith("PLOT-")]))
        self.suspender("A110-2025")
        self.assertEqual(vg.afectaciones(solo_plot, self.reglas_ev()), ())


class TestAfectadosVigentes(Base):
    """AC-20: detección que usa la emisión para rechazar; reevaluar desbloquea."""

    def test_retiro_bloquea_y_reevaluar_desbloquea(self):
        ev1 = self.evaluar()
        self.retirar(FRENTE)
        vigentes = vg.afectados_vigentes(self.evaluacion(ev1), self.reglas_ev())
        self.assertEqual([(a.tipo, a.referencia) for a in vigentes], [("retiro", f"{FRENTE} v{version_vigente(FRENTE)}")])
        ev2 = self.evaluar()
        self.assertEqual(vg.afectados_vigentes(self.evaluacion(ev2), self.reglas_ev()), ())

    def test_suspension_levantada_ya_no_bloquea(self):
        ev = self.evaluar()
        self.suspender()
        self.assertEqual(len(vg.afectados_vigentes(self.evaluacion(ev), self.reglas_ev())), 1)
        self.levantar()
        self.assertEqual(vg.afectados_vigentes(self.evaluacion(ev), self.reglas_ev()), ())


class RelojFijo:
    """Todo en el mismo segundo: la resolución real de `ocurrido_en` (A2)."""

    def __call__(self):
        return "2026-09-01T12:00:00Z"


class TestMismoSegundo(Base):
    """A2: la afectación se decide con la instantánea de la evaluación, no con el reloj."""

    def setUp(self):
        super().setUp()
        self.e.ctx.reloj = RelojFijo()

    def test_retiro_en_el_mismo_segundo_afecta(self):
        ev = self.evaluar()
        retiro = self.retirar(FRENTE)
        self.assertEqual(retiro.ocurrido_en, self.evaluacion(ev).ocurrido_en)
        self.assertEqual(vg.afectados_vigentes(self.evaluacion(ev), self.reglas_ev()),
                         (vg.Afectacion("retiro", f"{FRENTE} v{version_vigente(FRENTE)}", retiro.ocurrido_en, None),))

    def test_suspension_en_el_mismo_segundo_afecta_y_el_levantamiento_cierra(self):
        ev = self.evaluar()
        conf = self.suspender()
        self.assertEqual([(a.tipo, a.referencia, a.hasta) for a in self.afectaciones(ev)],
                         [("suspension", PLOT, None)])
        lev = self.levantar()
        self.assertEqual(self.afectaciones(ev), (vg.Afectacion("suspension", PLOT, conf.ocurrido_en, lev.ocurrido_en),))

    def test_retiro_o_suspension_ya_en_la_instantanea_no_afectan(self):
        self.retirar(FRENTE)
        self.suspender()
        ev = self.evaluar()
        estados = {r["regla_id"]: r["estado_regla"] for r in self.evaluacion(ev).payload["resultados"]}
        self.assertEqual((estados[FRENTE], estados[DENSIDAD]), ("retirada", "suspendida"))
        self.assertEqual(self.afectaciones(ev), ())


class TestUnaPasada(Base):
    """B7: la cadena de reglas se recorre una sola vez por evaluación."""

    def test_afectaciones_aplica_cada_evento_una_vez(self):
        ev = self.evaluar()
        for rid in (FRENTE, DENSIDAD):
            self.retirar(rid)
        self.suspender()
        self.levantar()
        eventos_reglas = self.reglas_ev()
        with mock.patch.object(gobierno, "_aplicar", wraps=gobierno._aplicar) as aplicar:
            self.assertEqual(len(vg.afectaciones(self.evaluacion(ev), eventos_reglas)), 3)
        self.assertEqual(aplicar.call_count, len(eventos_reglas))


class TestEmitidosAfectaciones(Base):
    """B3: una afectación cerrada antes de la emisión no se lista para esa emisión."""

    def test_suspension_levantada_antes_de_emitir_no_se_lista(self):
        ev = self.evaluar()
        self.suspender()
        self.levantar()
        seq = self.emitir(ev, "a" * 64)
        self.assertEqual(self.estados()[seq].afectaciones, ())

    def test_suspension_posterior_a_la_emision_levantada_se_lista_con_su_periodo(self):
        ev = self.evaluar()
        seq = self.emitir(ev, "a" * 64)
        conf, lev = self.suspender(), self.levantar()
        self.assertEqual(self.estados()[seq].afectaciones,
                         (vg.Afectacion("suspension", PLOT, conf.ocurrido_en, lev.ocurrido_en),))


class TestCarreraEvaluar(Base):
    """N1 (re-revisión): una suspensión confirmada mientras `evaluar` calcula cae en un segundo anterior al
    de la evaluación, pero la instantánea dice `aprobada`: no puede quedar sin bloquear la emisión."""

    def _durante_evaluar(self, accion):
        real = exp.evaluar_con

        def con_cambio(*a, **k):
            r = real(*a, **k)
            accion()                      # otra sesión escribe en la cadena de reglas mientras se calcula
            return r
        return mock.patch.object(exp, "evaluar_con", side_effect=con_cambio)

    def test_suspension_durante_evaluar_no_registra_la_evaluacion(self):
        with self._durante_evaluar(self.suspender), self.assertRaises(ErrorPreCheck) as cm:
            self.evaluar()
        self.assertEqual(cm.exception.codigo, "expediente.evaluacion_concurrente")
        self.assertEqual([e for e in self.eventos() if e.tipo == "evaluacion"], [])
        self.assertEqual(self.evaluacion(self.evaluar()).tipo, "evaluacion")   # reintentar funciona

    def test_retiro_durante_evaluar_no_registra_la_evaluacion(self):
        with self._durante_evaluar(lambda: self.retirar(FRENTE)), self.assertRaises(ErrorPreCheck) as cm:
            self.evaluar()
        self.assertEqual(cm.exception.codigo, "expediente.evaluacion_concurrente")

    def test_cualquier_escritura_en_la_cadena_de_reglas_aborta_con_mensaje_neutro(self):
        # N7: no solo un retiro o una suspensión; también una mera propuesta (o personas, o sello) aborta,
        # y el mensaje no puede afirmar que «las reglas cambiaron»
        proponer = lambda: reglas.proponer_suspension(self.e.como("cuenta-0001"), PLOT, "nulidad")  # noqa: E731
        with self._durante_evaluar(proponer), self.assertRaises(ErrorPreCheck) as cm:
            self.evaluar()
        self.assertEqual(cm.exception.codigo, "expediente.evaluacion_concurrente")
        self.assertIn("La cadena de reglas cambió mientras se evaluaba", str(cm.exception))
        self.assertIn("(gobierno de reglas, personas o sello)", str(cm.exception))

    def test_suspension_abierta_anterior_con_instantanea_aprobada_afecta(self):
        ev = self.evaluacion(self.evaluar())
        conf = self.suspender()
        tarde = dataclasses.replace(ev, ocurrido_en=self.e.ctx.reloj())
        self.assertLess(conf.ocurrido_en, tarde.ocurrido_en)
        self.assertEqual(vg.afectados_vigentes(tarde, self.reglas_ev()),
                         (vg.Afectacion("suspension", PLOT, conf.ocurrido_en, None),))

    def test_suspension_anterior_levantada_antes_de_la_evaluacion_no_afecta(self):
        ev = self.evaluacion(self.evaluar())
        self.suspender()
        self.levantar()
        tarde = dataclasses.replace(ev, ocurrido_en=self.e.ctx.reloj())
        self.assertEqual(vg.afectaciones(tarde, self.reglas_ev()), ())


class TestTipos(unittest.TestCase):
    def test_estado_emision_y_afectacion_son_inmutables(self):
        a = vg.Afectacion("retiro", "X v1", "2026-09-01T00:00:00Z", None)
        with self.assertRaises(dataclasses.FrozenInstanceError):
            a.hasta = "x"  # type: ignore[misc]
        self.assertEqual([f.name for f in dataclasses.fields(vg.EstadoEmision)],
                         ["expediente_id", "evaluacion", "seq", "huella", "formato_informe", "emitido_por",
                          "emitido_en", "vigencia", "sustituida_por", "reemplazado_por", "afectaciones"])

    def test_emision_sin_evaluacion_de_origen_no_rompe(self):
        emitido = EventoRegistrado(CADENA, 1, "informe_emitido", "P-0004", "revisor_doyc", "2026-09-01T00:00:00Z",
                                   {"evaluacion_seq": 99, "huella": "a", "formato_informe": "1.0.0"}, "", "h1")
        (s,) = vg.estados([emitido], [], EXP)
        self.assertEqual((s.vigencia, s.afectaciones), ("vigente", ()))


if __name__ == "__main__":
    unittest.main()
