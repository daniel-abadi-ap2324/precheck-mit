"""T9 — versión del revisor y emisión de la versión del profesional (AC-01, AC-03–AC-06, AC-16, AC-18, AC-20).

Contra la bitácora real (SQLite descartable) y el catálogo real de reglas, con dos revisores DOYC.
Datos ficticios: EXP-TEST-*, P-000*, Test User *.
"""
import datetime as dt
import itertools
import json
import unicodedata
import unittest
from unittest import mock

from precheck.auditoria.cadena import EventoNuevo
from precheck.auditoria.sqlite_repo import RepositorioSQLite
from precheck.errores import ErrorPreCheck
from precheck.expediente import servicio as exp
from precheck.informe import html
from precheck.informe import huella as hu
from precheck.informe import servicio as inf
from precheck.informe.modelo import FORMATO_INFORME, Encabezado
from precheck.motor.version import VERSION_MOTOR
from precheck.personas import servicio as per
from precheck.reglas import servicio as reglas
from tests.apoyo import Entorno, equipo, version_vigente
from tests.test_evaluar import CATALOGO, caso

EXP = "EXP-TEST-0950"
CADENA = f"expediente:{EXP}"
FRENTE = "PLOT-ZM6-LOTE-FRENTE"        # NO_CUMPLE bloqueante oficial con el caso «excede»
CAMPOS_EVENTO = {"evaluacion_seq", "hash_evaluacion", "version", "huella", "huella_encabezado", "formato_informe",
                 "version_motor"}


def reloj_que_avanza(inicio=dt.datetime(2026, 9, 1, 12, 0, tzinfo=dt.timezone.utc)):
    """Un segundo por evento: el orden temporal entre cadenas (retiro posterior a la evaluación) es nítido."""
    pasos = itertools.count()
    return lambda: (inicio + dt.timedelta(seconds=next(pasos))).isoformat().replace("+00:00", "Z")


def alta_revisor(e, n="0005"):
    seq = per.vincular_cuenta(e.como("cuenta-0001"), f"P-{n}", f"Test User {n}", f"cuenta-{n}").seq
    per.confirmar(e.como(f"cuenta-{n}"), seq)
    seq = per.designar(e.como("cuenta-0001"), f"P-{n}", "revisor_doyc", "alta en pruebas").seq
    per.confirmar(e.como("cuenta-0002"), seq)


class BaseInforme(unittest.TestCase):
    """Escenario común: catálogo propuesto, frente y densidad aprobadas, una evaluación registrada."""

    def setUp(self):
        entorno = Entorno()
        entorno.ctx.reloj = reloj_que_avanza()
        self.e = equipo(entorno)
        alta_revisor(self.e)
        reglas.proponer(self.e.como("cuenta-0003"), CATALOGO)
        for rid in (FRENTE, "PLOT-ZM6-DENSIDAD"):
            reglas.aprobar(self.e.como("cuenta-0001"), rid, version_vigente(rid))
        self.ev = self.evaluar()

    def tearDown(self):
        self.e.cerrar()

    def rev(self, cuenta="cuenta-0004"):
        return self.e.como(cuenta)

    def evaluar(self, expediente=EXP):
        return exp.evaluar(self.rev(), expediente, caso())

    def revisar(self, ev=None, indicar=True, expediente=EXP):
        """Decide todo lo pendiente, con indicación en cada NO_CUMPLE confirmado, y da el visto bueno."""
        ev = ev or self.ev
        for r in ev.resultados:
            if r.resultado == "REQUIERE_REVISION":
                exp.decidir(self.rev(), expediente, ev.seq, r.regla_id, "veredicto", "revisado a mano",
                            veredicto="CUMPLE")
            elif r.resultado == "NO_CUMPLE" and r.severidad == "bloqueante":
                exp.decidir(self.rev(), expediente, ev.seq, r.regla_id, "confirmar", "MOTIVO-INTERNO",
                            indicacion="Amplíe el frente del lote." if indicar else None)
        for n in ev.cobertura.normas_sin_reglas:
            exp.decidir(self.rev(), expediente, ev.seq, f"norma:{n}", "veredicto", "revisado", veredicto="CUMPLE")
        exp.dar_visto_bueno(self.rev(), expediente, ev.seq, confirmar_sin_ceus=True)

    def eventos(self, cadena=CADENA):
        return list(self.e.repo.leer(cadena))

    def rechazo(self, fn, *args, **kw):
        """Código y detalles del rechazo; comprueba que no se anexó nada en ninguna cadena."""
        antes = {c: len(self.eventos(c)) for c in self.e.repo.cadenas()}
        with self.assertRaises(ErrorPreCheck) as cm:
            fn(*args, **kw)
        self.assertEqual({c: len(self.eventos(c)) for c in self.e.repo.cadenas()}, antes, "un rechazo no registra nada")
        return cm.exception


class TestVersionRevisor(BaseInforme):
    def test_version_del_revisor_completa_y_sin_registrar(self):
        # AC-01
        exp.decidir(self.rev(), EXP, self.ev.seq, FRENTE, "confirmar", "MOTIVO-INTERNO")
        antes = self.eventos()
        inf_rev = inf.informe_revisor(self.rev(), EXP, self.ev.seq)
        self.assertEqual(self.eventos(), antes, "la versión del revisor no se registra")
        self.assertIsInstance(inf_rev, inf.Informe)
        self.assertEqual((inf_rev.version, inf_rev.expediente_id, inf_rev.evaluacion, inf_rev.formato_informe),
                         ("revisor", EXP, self.ev.seq, FORMATO_INFORME))
        m = inf_rev.modelo
        self.assertEqual(inf_rev.huella, hu.huella(m))
        self.assertEqual(m["evaluacion"]["hash"], self.ev.hash)
        self.assertEqual(len(m["resultados"]), len(self.ev.resultados))
        por_regla = {r["regla_id"]: r for r in m["resultados"]}
        self.assertTrue(any(r["resultado"] == "NO_APLICA" for r in m["resultados"]))
        frente = por_regla[FRENTE]
        self.assertTrue(frente["cita_textual"])
        self.assertEqual(frente["version"], version_vigente(FRENTE))   # la del catálogo (v2 desde el catálogo definitivo)
        self.assertEqual(frente["valores_usados"]["lote.frente_m"]["valor"], 15.2)
        self.assertIn("sin CEUS", frente["advertencias"])
        self.assertEqual(frente["decisiones"][0]["motivo"], "MOTIVO-INTERNO")
        self.assertTrue(any(r.get("indicativo") and r["indicativo"].endswith("(no oficial)") for r in m["resultados"]))
        self.assertEqual(m["estado"]["estado"], "pendiente de revisión humana")
        self.assertIn("Uso interno", inf_rev.documento)
        self.assertEqual(html.extraer(inf_rev.documento), (m, None))
        self.assertEqual(html.extraer(inf_rev.estructurada), (m, None))
        self.assertEqual(json.loads(inf_rev.estructurada)["modelo"], m)

    def test_el_limite_sale_del_contenido_de_la_regla_en_la_bitacora(self):
        # los contenidos de las versiones usadas se leen del almacén de contenidos
        exp.decidir(self.rev(), EXP, self.ev.seq, FRENTE, "confirmar", "m")
        obs = {o["clave"]: o for o in inf.informe_revisor(self.rev(), EXP, self.ev.seq).modelo["observaciones"]}
        self.assertEqual(obs[FRENTE]["que"], "valor declarado: 15.2 m; límite de la norma: mínimo 16 m")

    def test_evaluacion_antigua_lleva_aviso(self):
        nueva = self.evaluar()
        m = inf.informe_revisor(self.rev(), EXP, self.ev.seq).modelo
        self.assertEqual(m["aviso_no_vigente"]["vigente"], nueva.seq)

    def test_expediente_o_evaluacion_inexistentes(self):
        # AC-03 (B2): el mensaje dice si falta el expediente o la evaluación
        casos = (("EXP-TEST-NO-EXISTE", 1, "informe.expediente_inexistente",
                  "El expediente EXP-TEST-NO-EXISTE no está registrado en la bitácora"),
                 (EXP, 999, "informe.evaluacion_inexistente",
                  f"La evaluación 999 no está registrada en el expediente {EXP}."))
        for expediente, seq, codigo, mensaje in casos:
            for fn in (inf.informe_revisor, inf.emitir):
                with self.subTest(fn=fn.__name__, expediente=expediente, seq=seq):
                    err = self.rechazo(fn, self.rev(), expediente, seq)
                    self.assertEqual(err.codigo, codigo)
                    self.assertIn(mensaje, err.mensaje)

    def test_sin_rol_o_sin_cuenta_no_lee_el_expediente(self):
        for cuenta, codigo in (("cuenta-0003", "identidad.sin_rol"), ("cuenta-9999", "identidad.cuenta_no_vinculada")):
            for fn in (inf.informe_revisor, inf.emitir):
                with self.subTest(cuenta=cuenta, fn=fn.__name__):
                    self.assertEqual(self.rechazo(fn, self.rev(cuenta), EXP, self.ev.seq).codigo, codigo)


class TestEmitir(BaseInforme):
    def test_emitir_registra_la_emision_y_devuelve_la_huella(self):
        # AC-04
        self.revisar()
        enc = Encabezado(tramite="RDP", proyecto="Edificio Prueba", finca="FINCA-044444", profesional="Test User 9",
                         idoneidad="IDO-0000")
        em = inf.emitir(self.rev(), EXP, self.ev.seq, enc)
        self.assertIsInstance(em, inf.Emision)
        ev = em.evento
        self.assertEqual((ev.tipo, ev.actor, ev.rol, ev.cadena_id), ("informe_emitido", "P-0004", "revisor_doyc", CADENA))
        self.assertEqual(self.eventos()[-1].hash, ev.hash)
        self.assertEqual(set(ev.payload), CAMPOS_EVENTO)
        self.assertEqual(ev.payload, {
            "evaluacion_seq": self.ev.seq, "hash_evaluacion": self.ev.hash, "version": "profesional",
            "huella": em.informe.huella, "huella_encabezado": hu.huella_encabezado(enc),
            "formato_informe": FORMATO_INFORME, "version_motor": VERSION_MOTOR})
        crudo = json.dumps(ev.payload, ensure_ascii=False)
        for dato in ("RDP", "Edificio Prueba", "FINCA-044444", "Test User 9", "IDO-0000"):
            self.assertNotIn(dato, crudo, "el encabezado nunca entra en la bitácora (ADR-0005)")
        inf_pro = em.informe
        self.assertEqual((inf_pro.version, inf_pro.expediente_id, inf_pro.evaluacion), ("profesional", EXP, self.ev.seq))
        self.assertEqual(inf_pro.huella, hu.huella(inf_pro.modelo))
        self.assertEqual(em.codigo, hu.codigo(inf_pro.huella))
        self.assertEqual(inf_pro.modelo["encabezado"]["finca"], "FINCA-044444")
        self.assertNotIn("resultados", inf_pro.modelo)
        self.assertNotIn("MOTIVO-INTERNO", inf_pro.documento)
        traz = {"emitido_por": "P-0004", "nombre": "Test User 0004", "emitido_en": ev.ocurrido_en}
        self.assertEqual(html.extraer(inf_pro.documento), (inf_pro.modelo, traz))
        self.assertEqual(html.extraer(inf_pro.estructurada), (inf_pro.modelo, traz))
        self.assertIn(em.codigo, inf_pro.documento)

    def test_encabezado_ausente_sale_no_consta(self):
        self.revisar()
        em = inf.emitir(self.rev(), EXP, self.ev.seq)
        self.assertEqual(set(em.informe.modelo["encabezado"].values()), {"no consta"})
        self.assertEqual(em.evento.payload["huella_encabezado"], hu.huella_encabezado(None))

    def test_expediente_pendiente_no_se_emite(self):
        # AC-05
        err = self.rechazo(inf.emitir, self.rev(), EXP, self.ev.seq)
        self.assertEqual(err.codigo, "informe.expediente_pendiente")
        self.assertIn(FRENTE, err.detalles["pendientes"])
        self.assertIn("visto bueno", err.detalles["pendientes"])

    def test_solo_se_emite_la_evaluacion_vigente(self):
        # AC-06
        self.revisar()
        exp.reproducir(self.rev(), EXP, self.ev.seq)       # una reproducción no es una evaluación nueva
        self.assertEqual(inf.emitir(self.rev(), EXP, self.ev.seq).evento.tipo, "informe_emitido")
        nueva = self.evaluar()
        err = self.rechazo(inf.emitir, self.rev(), EXP, self.ev.seq)
        self.assertEqual((err.codigo, err.detalles.get("vigente")), ("informe.evaluacion_no_vigente", nueva.seq))
        self.assertIn(f"La evaluación {self.ev.seq} no es la vigente del expediente {EXP}", err.mensaje)   # B2
        self.assertIn(f"la evaluación vigente, la {nueva.seq}", err.mensaje)
        self.assertNotIn("decida", err.mensaje)

    def test_misma_emision_misma_huella_y_entregas_distintas(self):
        # AC-16
        self.revisar()
        normal = Encabezado(tramite="RDP", proyecto="Edificio Peña", profesional="José Núñez")
        nfd = Encabezado(tramite="  RDP ", proyecto=unicodedata.normalize("NFD", "Edificio   Peña"),
                         profesional=unicodedata.normalize("NFD", " José  Núñez "))
        a = inf.emitir(self.rev(), EXP, self.ev.seq, normal)
        b = inf.emitir(self.rev("cuenta-0005"), EXP, self.ev.seq, nfd)
        self.assertEqual(a.informe.huella, b.informe.huella)
        self.assertEqual(a.evento.payload["huella_encabezado"], b.evento.payload["huella_encabezado"])
        self.assertNotEqual(a.evento.seq, b.evento.seq)
        self.assertEqual((a.evento.actor, b.evento.actor), ("P-0004", "P-0005"))
        self.assertEqual([e.seq for e in self.eventos() if e.tipo == "informe_emitido"], [a.evento.seq, b.evento.seq])
        inf.indicar(self.rev(), EXP, self.ev.seq, FRENTE, "Amplíe el frente del lote a 16 m.")
        c = inf.emitir(self.rev(), EXP, self.ev.seq, normal)
        self.assertNotEqual(c.informe.huella, a.informe.huella)

    def test_observacion_sin_indicacion_no_se_emite(self):
        # AC-18
        self.revisar(indicar=False)
        err = self.rechazo(inf.emitir, self.rev(), EXP, self.ev.seq)
        self.assertEqual((err.codigo, list(err.detalles["observaciones"])), ("informe.sin_indicacion", [FRENTE]))

    def test_retiro_posterior_bloquea_y_reevaluar_desbloquea(self):
        # AC-20 (retiro)
        self.revisar()
        reglas.retirar(self.e.como("cuenta-0001"), FRENTE, version_vigente(FRENTE), "error de transcripción")
        err = self.rechazo(inf.emitir, self.rev(), EXP, self.ev.seq)
        self.assertEqual(err.codigo, "informe.resultados_afectados")
        self.assertEqual([(a["tipo"], a["referencia"]) for a in err.detalles["afectaciones"]],
                         [("retiro", f"{FRENTE} v{version_vigente(FRENTE)}")])
        desde = err.detalles["afectaciones"][0]["desde"]
        self.assertIn(f"retiro {FRENTE} v{version_vigente(FRENTE)} desde {desde}", err.mensaje)          # M2: dice qué cambió y cuándo
        nueva = self.evaluar()
        self.revisar(nueva)
        self.assertEqual(inf.emitir(self.rev(), EXP, nueva.seq).evento.payload["evaluacion_seq"], nueva.seq)

    def test_retiro_en_el_mismo_segundo_bloquea(self):
        # A2: con la resolución real del reloj (segundos) el retiro cae en el mismo segundo que la evaluación
        self.e.ctx.reloj = lambda: "2026-09-01T12:00:00Z"
        ev = self.evaluar()
        self.revisar(ev)
        reglas.retirar(self.e.como("cuenta-0001"), FRENTE, version_vigente(FRENTE), "error de transcripción")
        err = self.rechazo(inf.emitir, self.rev(), EXP, ev.seq)
        self.assertEqual(err.codigo, "informe.resultados_afectados")

    def emitir_con_escritura_ajena(self, escribir):
        """Emite con otra conexión que escribe después de validar y antes de registrar (M6)."""
        self.revisar()
        huella_real = hu.huella

        def huella_y_escritura_ajena(modelo):
            otro = RepositorioSQLite(self.e.repo.ruta)
            try:
                escribir(otro)
            finally:
                otro.cerrar()
            return huella_real(modelo)

        with mock.patch.object(inf.hu, "huella", side_effect=huella_y_escritura_ajena), \
                self.assertRaises(ErrorPreCheck) as cm:
            inf.emitir(self.rev(), EXP, self.ev.seq)
        self.assertEqual(cm.exception.codigo, "informe.emision_concurrente")
        self.assertNotIn("informe_emitido", [e.tipo for e in self.eventos()])

    def test_evaluacion_concurrente_entre_validar_y_registrar_aborta(self):
        payload = dict(next(e for e in self.eventos() if e.seq == self.ev.seq).payload)
        self.emitir_con_escritura_ajena(lambda otro: otro.anexar(CADENA, EventoNuevo(
            "evaluacion", "P-0004", "revisor_doyc", "2026-09-01T13:00:00Z", payload)))
        self.assertEqual(self.eventos()[-1].tipo, "evaluacion")

    def test_retiro_concurrente_entre_validar_y_registrar_aborta(self):
        self.emitir_con_escritura_ajena(lambda otro: otro.anexar("reglas", EventoNuevo(
            "retiro", "P-0001", "aprobador", "2026-09-01T13:00:00Z",
            {"regla_id": FRENTE, "version": 1, "motivo": "retiro concurrente"})))

    def test_suspension_vigente_bloquea_y_levantada_no(self):
        # AC-20 (suspensión) y borde: suspensión levantada antes de emitir
        self.revisar()
        prop = reglas.proponer_suspension(self.e.como("cuenta-0001"), "PLOT-A61-2021", "nulidad")
        reglas.confirmar(self.e.como("cuenta-0002"), prop.seq)
        err = self.rechazo(inf.emitir, self.rev(), EXP, self.ev.seq)
        self.assertEqual(err.codigo, "informe.resultados_afectados")
        self.assertEqual([(a["tipo"], a["referencia"]) for a in err.detalles["afectaciones"]],
                         [("suspension", "PLOT-A61-2021")])
        lev = reglas.proponer_levantamiento(self.e.como("cuenta-0002"), "PLOT-A61-2021", "desestimada")
        reglas.confirmar(self.e.como("cuenta-0001"), lev.seq)
        em = inf.emitir(self.rev(), EXP, self.ev.seq)
        self.assertEqual(em.evento.tipo, "informe_emitido")
        (estado,) = inf.emitidos(self.rev(), EXP)
        self.assertEqual(estado.afectaciones, (), "B3: una suspensión levantada antes de emitir no se lista")


if __name__ == "__main__":
    unittest.main()
