"""T12 — NFR del informe (spec §6, test-plan «NFR validation»).

- ≤ 2 s p95 por operación (versión del revisor, emitir con su registro, verificar por archivo y por código)
  con el catálogo completo (~650 resultados), 20 repeticiones. Con los casos de tests/casos/ el catálogo
  real solo da 239 resultados (el resto no aplica a la zona), así que la medición usa el catálogo completo
  con `aplica_si` forzado a aplicar y una fecha que cubre todas las vigencias: una evaluación con un
  resultado por regla del catálogo (review B5), revisada con veredictos y algunas observaciones.
- Huella reproducible: 50 regeneraciones de la misma emisión → una sola huella, la emitida.
- Detección de alteración: un carácter cambiado en cualquier texto del modelo embebido → otra huella.
Disparador de sad §7: si verificar supera 1 s de p95 se emite una advertencia (no un fallo).
Datos ficticios: EXP-TEST-*, P-000*.
"""
import copy
import math
import pathlib
import tempfile
import time
import unittest
import warnings

import precheck
from precheck.informe import html
from precheck.informe import huella as hu
from precheck.informe import servicio as inf
from tests.apoyo import NORMATIVA, RAIZ, ResolutorFalso
from tests.test_cli import YO
from tests.test_evaluar import CATALOGO, caso
from tests.test_informe_extremo_a_extremo import ENCABEZADO, INDICACION, escenario

REPETICIONES = 20
LIMITE_P95 = 2.0
RESULTADOS_MINIMOS = 640              # spec §6: «con el catálogo completo (~650 resultados)»
DISPARADOR_VERIFICAR = 1.0
CASOS = sorted(p.stem for p in (RAIZ / "tests/casos").glob("*.json"))


def p95(tiempos):
    orden = sorted(tiempos)
    return orden[math.ceil(0.95 * len(orden)) - 1]


def medir(funcion, argumentos):
    """Tiempo de cada llamada, rotando por los expedientes."""
    tiempos, resultados = [], []
    for i in range(REPETICIONES):
        inicio = time.perf_counter()
        resultados.append(funcion(*argumentos[i % len(argumentos)]))
        tiempos.append(time.perf_counter() - inicio)
    return tiempos, resultados


class TestNfrInforme(unittest.TestCase):
    """Una bitácora para toda la clase: cada expediente de tests/casos evaluado y revisado una vez."""

    @classmethod
    def setUpClass(cls):
        cls.dir = tempfile.TemporaryDirectory()
        cls.ruta = pathlib.Path(cls.dir.name) / "bitacora.sqlite3"
        escenario(cls.ruta)
        cls.pc = precheck.abrir(cls.ruta, NORMATIVA, resolutor=ResolutorFalso(YO))
        cls.encabezado = precheck.Encabezado(**ENCABEZADO)
        cls.completo = cls.catalogo_completo()
        cls.expedientes = []
        for n, nombre in enumerate(CASOS):
            expediente = f"EXP-TEST-13{n:02d}"
            ev = cls.pc.evaluar(expediente, caso(nombre))
            for r in ev.resultados:
                if r.resultado == "REQUIERE_REVISION":
                    cls.pc.decidir(expediente, ev.seq, r.regla_id, "veredicto", "revisado a mano", veredicto="CUMPLE")
                elif r.resultado == "NO_CUMPLE":
                    cls.pc.decidir(expediente, ev.seq, r.regla_id, "confirmar", "MOTIVO-INTERNO", indicacion=INDICACION)
            for norma in ev.cobertura.normas_sin_reglas:
                cls.pc.decidir(expediente, ev.seq, f"norma:{norma}", "veredicto", "revisado", veredicto="CUMPLE")
            cls.pc.dar_visto_bueno(expediente, ev.seq, confirmar_sin_ceus=True)
            cls.expedientes.append((expediente, ev))
        cls.p95 = {}

    @classmethod
    def catalogo_completo(cls):
        """Otra bitácora con el catálogo completo, `aplica_si` forzado: un resultado por regla (B5)."""
        cls.ruta_completo = pathlib.Path(cls.dir.name) / "completo.sqlite3"
        escenario(cls.ruta_completo)
        cuentas = {}
        for cuenta in ("cuenta-0003", YO):
            cuentas[cuenta] = precheck.abrir(cls.ruta_completo, NORMATIVA, resolutor=ResolutorFalso(cuenta))
        try:
            cuentas["cuenta-0003"].proponer([dict(copy.deepcopy(r), aplica_si=None, version=r["version"] + 1)
                                             for r in CATALOGO])
            pc, expediente = cuentas[YO], "EXP-TEST-1399"
            ev = pc.evaluar(expediente, caso(fecha="2026-07-01"))
            for i, r in enumerate(ev.resultados):
                if r.resultado == "REQUIERE_REVISION" and i % 10 == 0:
                    pc.decidir(expediente, ev.seq, r.regla_id, "veredicto", "revisado a mano", veredicto="NO_CUMPLE",
                               indicacion=INDICACION)
                elif r.resultado == "REQUIERE_REVISION":
                    pc.decidir(expediente, ev.seq, r.regla_id, "veredicto", "revisado a mano", veredicto="CUMPLE")
                elif r.resultado == "NO_CUMPLE" and r.severidad == "bloqueante":
                    pc.decidir(expediente, ev.seq, r.regla_id, "confirmar", "MOTIVO-INTERNO", indicacion=INDICACION)
            for norma in ev.cobertura.normas_sin_reglas:
                pc.decidir(expediente, ev.seq, f"norma:{norma}", "veredicto", "revisado", veredicto="CUMPLE")
            pc.dar_visto_bueno(expediente, ev.seq, confirmar_sin_ceus=True)
            return expediente, ev
        finally:
            for pc in cuentas.values():
                pc.cerrar()

    @classmethod
    def tearDownClass(cls):
        cls.pc.cerrar()
        cls.dir.cleanup()
        if cls.p95:
            print(f"\n[NFR informe] p95 (s) con {len(cls.completo[1].resultados)} resultados: "
                  + ", ".join(f"{k} {v:.3f}" for k, v in cls.p95.items()))

    def comprobar(self, operacion, tiempos):
        self.assertEqual(len(tiempos), REPETICIONES)
        self.p95[operacion] = valor = p95(tiempos)
        self.assertLessEqual(valor, LIMITE_P95, f"{operacion}: p95 {valor:.3f} s > {LIMITE_P95} s")
        if operacion.startswith("verificar") and valor > DISPARADOR_VERIFICAR:
            warnings.warn(f"sad §7: {operacion} p95 {valor:.3f} s > {DISPARADOR_VERIFICAR} s; considerar el índice "
                          "derivado por huella", stacklevel=2)
        return valor

    def test_catalogo_completo_y_casos(self):
        self.assertEqual(len(CASOS), 3)
        _, ev = self.completo
        self.assertGreaterEqual(len(CATALOGO), RESULTADOS_MINIMOS)
        self.assertGreaterEqual(len(ev.resultados), RESULTADOS_MINIMOS, "spec §6: ~650 resultados (B5)")
        self.assertEqual({r.resultado for r in ev.resultados} - {"CUMPLE", "NO_CUMPLE", "REQUIERE_REVISION"}, set())
        propuestas = {e.payload["regla_id"] for e in self.pc.ctx.repo.leer("reglas") if e.tipo == "propuesta"}
        self.assertGreaterEqual(len(propuestas), 600)

    def test_p95_de_cada_operacion(self):
        # sobre la evaluación con ~650 resultados (B5)
        expediente, ev = self.completo
        pc = precheck.abrir(self.ruta_completo, NORMATIVA, resolutor=ResolutorFalso(YO))
        try:
            argumentos = [(expediente, ev.seq, self.encabezado)]
            tiempos, informes = medir(pc.informe_revisor, argumentos)
            self.comprobar("informe_revisor", tiempos)
            self.assertGreaterEqual(len(informes[0].modelo["resultados"]), RESULTADOS_MINIMOS)

            tiempos, emisiones = medir(pc.emitir, argumentos)
            self.comprobar("emitir", tiempos)
            self.assertEqual({(e.evento.tipo, e.informe.version) for e in emisiones},
                             {("informe_emitido", "profesional")})
            self.assertGreater(len(emisiones[0].informe.modelo["observaciones"]), 50)

            tiempos, verificaciones = medir(pc.verificar_informe, [(emisiones[0].informe.documento.encode("utf-8"),)])
            self.comprobar("verificar_archivo", tiempos)
            self.assertEqual({v.resultado for v in verificaciones}, {"coincide"})

            tiempos, verificaciones = medir(pc.verificar_codigo, [(expediente, emisiones[0].codigo)])
            self.comprobar("verificar_codigo", tiempos)
            self.assertEqual({v.resultado for v in verificaciones}, {"coincide"})
        finally:
            pc.cerrar()

    def test_50_regeneraciones_una_sola_huella(self):
        # con eventos posteriores a la emisión (indicación nueva y otra emisión): se regenera la emitida
        expediente, ev = next((x, e) for x, e in self.expedientes if any(r.resultado == "NO_CUMPLE" for r in e.resultados))
        regla = next(r.regla_id for r in ev.resultados if r.resultado == "NO_CUMPLE")
        em = self.pc.emitir(expediente, ev.seq, self.encabezado)
        self.pc.indicar(expediente, ev.seq, regla, "Indicación posterior a la emisión.")
        self.assertNotEqual(self.pc.emitir(expediente, ev.seq, self.encabezado).informe.huella, em.informe.huella)
        eventos = list(self.pc.ctx.repo.leer(f"expediente:{expediente}"))
        emision = next(e for e in eventos if e.seq == em.evento.seq)
        huellas = {hu.huella(inf.regenerar(self.pc.ctx, expediente, eventos, emision, self.encabezado))
                   for _ in range(50)}
        self.assertEqual(huellas, {em.informe.huella})

    def test_un_caracter_alterado_en_cualquier_texto_del_modelo_cambia_la_huella(self):
        expediente, ev = self.expedientes[0]
        em = self.pc.emitir(expediente, ev.seq, self.encabezado)
        modelo, _ = html.extraer(em.informe.documento)
        rutas = []

        def recorrer(nodo, ruta):
            if isinstance(nodo, dict):
                for k, v in nodo.items():
                    recorrer(v, ruta + (k,))
            elif isinstance(nodo, list):
                for i, v in enumerate(nodo):
                    recorrer(v, ruta + (i,))
            elif isinstance(nodo, str) and nodo.strip():
                rutas.append(ruta)

        recorrer(modelo, ())
        self.assertGreater(len(rutas), 50)
        original = hu.huella(modelo)
        for ruta in rutas:
            copia = html.extraer(em.informe.documento)[0]
            padre = copia
            for clave in ruta[:-1]:
                padre = padre[clave]
            texto = padre[ruta[-1]]
            i = next((j for j, c in enumerate(texto) if not c.isspace()), 0)
            padre[ruta[-1]] = texto[:i] + ("X" if texto[i] != "X" else "Y") + texto[i + 1:]
            with self.subTest(ruta=ruta):
                self.assertNotEqual(hu.huella(copia), original)


if __name__ == "__main__":
    unittest.main()
