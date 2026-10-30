"""T16 — punta a punta por la fachada + NFR de spec §6 (AC-17, AC-19b, AC-21).

Guion: equipo con cuatro ojos → catálogo completo → aprobaciones → 20 evaluaciones → decisiones →
visto bueno → revisado → reproducir todo → sellar → reescribir la bitácora → verificar.
"""
import pathlib
import tempfile
import time
import unittest

import precheck
from precheck.auditoria.sello import DestinoArchivo
from precheck.auditoria.sqlite_repo import RepositorioSQLite
from tests.apoyo import NORMATIVA, ResolutorFalso, version_vigente
from tests.test_evaluar import CATALOGO, caso

CASOS = ("plot_1zm6_excede", "plot_1zm6_con_resolucion", "sf_paitilla_ut7")


class TestExtremoAExtremo(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dir = tempfile.TemporaryDirectory()
        cls.anclas = pathlib.Path(cls.dir.name) / "anclas"
        cls.res = ResolutorFalso("cuenta-0001")
        cls.pc = precheck.abrir(pathlib.Path(cls.dir.name) / "b.sqlite3", NORMATIVA, resolutor=cls.res,
                                destino_anclaje=DestinoArchivo(cls.anclas))
        cls.guion()

    @classmethod
    def tearDownClass(cls):
        cls.pc.cerrar()
        cls.dir.cleanup()

    @classmethod
    def como(cls, n):
        cls.res.cuenta = f"cuenta-{n}"
        return cls.pc

    @classmethod
    def guion(cls):
        cls.como("0001").inicializar("P-0001", "Test User 1", "P-0002", "Test User 2", "cuenta-0002")
        for n, rol in (("0003", "redactor"), ("0004", "revisor_doyc")):
            seq = cls.como("0001").vincular_cuenta(f"P-{n}", f"Test User {n}", f"cuenta-{n}").seq
            cls.como(n).confirmar(seq)
            seq = cls.como("0001").designar(f"P-{n}", rol, "alta").seq
            cls.como("0002").confirmar(seq)
        cls.como("0003").proponer(CATALOGO)
        for rid in ("PLOT-ZM6-LOTE-FRENTE", "PLOT-ZM6-DENSIDAD", "PLOT-ZM6-ACERA", "PLOT-ZM6-ALTURA",
                    "SF-PAITILLA-UT7-ZM7-ALTURA"):
            cls.como("0002" if rid.startswith("SF") else "0001").aprobar(rid, version_vigente(rid))
        cls.tiempos, cls.evaluaciones = [], []
        for i in range(20):
            nombre = CASOS[i % 3]
            fecha = "2026-01-15" if nombre.startswith("sf") else "2025-06-01"
            t = time.perf_counter()
            ev = cls.como("0004").evaluar(f"EXP-E2E-{i:04d}", caso(nombre, fecha=fecha))
            cls.tiempos.append(time.perf_counter() - t)
            cls.evaluaciones.append(ev)

    def test_nfr_tiempo_por_expediente(self):
        # spec §6: ≤ 10 s por expediente con el catálogo completo; plan: promedio < 5 s
        self.assertLessEqual(max(self.tiempos), 10.0)
        self.assertLess(sum(self.tiempos) / len(self.tiempos), 5.0)

    def test_flujo_hasta_revisado(self):
        ev = self.evaluaciones[0]
        pc = self.como("0004")
        for r in ev.resultados:
            if r.resultado == "REQUIERE_REVISION":
                pc.decidir(ev.expediente_id, ev.seq, r.regla_id, "veredicto", "revisado", veredicto="NO_CUMPLE")
            elif r.resultado == "NO_CUMPLE" and r.severidad == "bloqueante":
                pc.decidir(ev.expediente_id, ev.seq, r.regla_id, "confirmar", "medición verificada")
        pc.dar_visto_bueno(ev.expediente_id, ev.seq, confirmar_sin_ceus=True)
        self.assertEqual(pc.estado(ev.expediente_id).estado, "revisado")

    def test_cobertura_nunca_es_un_veredicto_global(self):
        # AC-21
        for ev in self.evaluaciones:
            self.assertGreaterEqual(ev.cobertura.reglas_sin_aprobar, 0)
            self.assertFalse(hasattr(ev, "resultado_global"))

    def test_nfr_reproducibilidad_100(self):
        # spec §6 + AC-17: todas las evaluaciones reproducidas coinciden
        pc = self.como("0004")
        resultados = [pc.reproducir(ev.expediente_id, ev.seq).resultado for ev in self.evaluaciones]
        self.assertEqual(resultados, ["coincide"] * 20)

    def test_nfr_reescritura_detectada_contra_el_sello(self):
        # spec §6 + AC-19b
        sello = self.como("0001").sellar()
        self.assertTrue(self.pc.verificar(sello=sello).coincide_sello)
        original = self.pc.ctx.repo
        with tempfile.TemporaryDirectory() as d:
            falsa = RepositorioSQLite(pathlib.Path(d) / "falsa.sqlite3")
            self.pc.ctx.repo = falsa
            try:
                reloj = self.pc.ctx.reloj
                self.pc.ctx.reloj = lambda: "2031-01-01T00:00:00Z"
                self.pc.ctx.anexar("expediente:EXP-E2E-0000", "evaluacion", "P-0004", "revisor_doyc", {"falsa": 1})
                v = self.pc.verificar(sello=sello)
                self.assertTrue(v.integra)
                self.assertFalse(v.coincide_sello)
            finally:
                self.pc.ctx.reloj = reloj
                self.pc.ctx.repo = original
                falsa.cerrar()


if __name__ == "__main__":
    unittest.main()
