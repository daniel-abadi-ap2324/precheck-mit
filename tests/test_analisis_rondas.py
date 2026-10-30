"""scripts/analisis/rondas.py con una carpeta temporal que imita web/.data y una verdad mínima."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location("analisis_rondas", RAIZ / "scripts" / "analisis" / "rondas.py")
ro = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ro)


def escribir(ruta: Path, datos) -> None:
    ruta.parent.mkdir(parents=True, exist_ok=True)
    ruta.write_text(datos if isinstance(datos, str) else json.dumps(datos), encoding="utf-8")


def proyecto(datos: Path, pid: str, nombre: str, pck: str) -> None:
    escribir(datos / "proyectos" / f"{pid}.json",
             {"project": {"id": pid, "name": nombre, "precheckId": pck, "updatedAt": "2026-10-13T09:00:00.000Z"}})


class TestRondas(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        base = Path(self._tmp.name)
        self.datos = base / "datos"
        self.verdad = base / "verdad.json"
        escribir(self.verdad, {
            "planos": {"Bella Vista": {"lote.area_m2": {"valor_esperado": {"valor": 500, "tol": 1}},
                                       "plano.escala": {"valor_esperado": True}}},
            "planos_v3": {"Bella Vista": {"plano.norte": {"valor_esperado": True}}},
            "retirados": {"Bella Vista": {"plano.norte": {"valor_esperado": False}}},
            "ambiguos": {"Bella Vista": ["plano.cotas"]},
        })
        # Corrida terminada: lectura 1 acierto (área), 1 error (escala); contradice al motor en R-2.
        proyecto(self.datos, "prj-1", "Bella Vista - prueba 37 con Sonnet 5.5", "pck-1")
        car = self.datos / "prechecks" / "pck-1"
        escribir(car / "estado.json", {"updatedAt": "2026-10-13T09:55:12.874Z",
                                       "ia": {"status": "done", "proveedor": "claude-code", "modelo": "claude-sonnet-5-5"}})
        escribir(car / "resultado.json", {"resultados": [{"regla_id": "R-1", "resultado": "REQUIERE_REVISION"},
                                                         {"regla_id": "R-2", "resultado": "CUMPLE"}]})
        escribir(car / "dictamen.json", {"fecha": "2026-10-13", "decisiones": [
            {"regla_id": "R-1", "decision": "OBSERVACION", "estado": "INFORMACION_REQUERIDA"},
            {"regla_id": "R-2", "decision": "NO_CUMPLE"},
            {"regla_id": "R-3", "decision": "OBSERVACION"}]})
        hechos = {"lote": {"area_m2": {"valor": 500.4, "confianza": 0.9}}, "plano": {"escala": {"valor": False, "confianza": 0.9}}}
        escribir(car / "hechos.json", hechos)
        escribir(car / "lote.json", hechos)
        escribir(car / "ia.log.jsonl", "\n".join([json.dumps({"type": "assistant"}),
                                                  json.dumps({"type": "result", "total_cost_usd": 1.234}),
                                                  json.dumps({"type": "result", "total_cost_usd": 2.857})]))
        escribir(car / "ia.log.txt", "[04:42:39] Revisión con IA\n[04:50:00] algo\n[04:55:12] Proceso terminado (código 0).\n")
        # Corrida sin dictamen: falló.
        proyecto(self.datos, "prj-2", "Bella Vista - prueba 38 con Haiku 5.5", "pck-2")
        escribir(self.datos / "prechecks" / "pck-2" / "estado.json", {"updatedAt": "2026-10-14T10:00:00.000Z",
                 "ia": {"status": "failed", "proveedor": "claude-code", "error": "La IA terminó sin escribir un dictamen válido."}})
        # Carpeta rota (estado.json ilegible): se salta sin romper el resto.
        proyecto(self.datos, "prj-3", "Bella Vista - prueba 38 con Opus 5.5", "pck-3")
        escribir(self.datos / "prechecks" / "pck-3" / "estado.json", "{no es json")
        # Un proyecto que no es una corrida de prueba.
        proyecto(self.datos, "prj-4", "Residencia Betania 01", "pck-4")

    def tearDown(self):
        self._tmp.cleanup()

    def generar(self):
        return ro.generar(self.datos, self.verdad, reglas={})

    def test_forma_y_rondas(self):
        res = self.generar()
        self.assertEqual(res["version"], 1)
        self.assertEqual(res["verdad"], {"datos": 2, "archivo": "docs/demo/verdad-datos-disputados.json"})
        self.assertEqual([r["ronda"] for r in res["rondas"]], [37, 38])
        self.assertEqual(res["rondas"][0]["fecha"], "2026-10-13")
        self.assertEqual(res["planos"], ["Bella Vista"])
        self.assertEqual(res["modelos"], ["Haiku 5.5", "Sonnet 5.5"])

    def test_exactitud_costo_y_contradicciones(self):
        c = self.generar()["rondas"][0]["corridas"][0]
        self.assertTrue(c["terminada"])
        self.assertIsNone(c["error"])
        self.assertEqual((c["proveedor"], c["precheckId"], c["projectId"]), ("claude-code", "pck-1", "prj-1"))
        self.assertEqual(c["fecha"], "2026-10-13T09:55:12.874Z")
        self.assertEqual((c["usd"], c["minutos"], c["decisiones"]), (2.86, 13, 3))
        self.assertEqual(c["lectura"], {"total": 2, "aciertos": 1, "dudas": 0, "errores": 1, "faltan": 0, "exactitud": 0.5,
                                        "detalle": {"lote.area_m2": "acierto", "plano.escala": "error"}})
        self.assertEqual(c["dictamen"], {"contradiceMotor": 1, "informacionRequerida": 1, "externasSinEstado": 0})
        self.assertIsNone(c["deepseek"])

    def test_corrida_sin_dictamen_sale_como_no_terminada(self):
        r38 = self.generar()["rondas"][1]["corridas"]
        self.assertEqual(len(r38), 1)  # la carpeta rota se saltó
        c = r38[0]
        self.assertFalse(c["terminada"])
        self.assertEqual(c["error"], "La IA terminó sin escribir un dictamen válido.")
        for k in ("usd", "minutos", "decisiones", "lectura", "dictamen", "deepseek"):
            self.assertIsNone(c[k], k)

    def test_resultado_roto_no_tumba_el_resto(self):
        # desacuerdos.corridas falla con un resultado sin regla_id: se rehace proyecto a proyecto y se salta esa carpeta.
        car = self.datos / "prechecks" / "pck-3"
        escribir(car / "estado.json", {"ia": {"status": "done", "proveedor": "claude-code"}})
        escribir(car / "dictamen.json", {"fecha": "2026-10-14", "decisiones": [{"regla_id": "R-1", "decision": "CUMPLE"}]})
        escribir(car / "resultado.json", {"resultados": [{"resultado": "CUMPLE"}]})
        res = self.generar()
        self.assertEqual([c["precheckId"] for r in res["rondas"] for c in r["corridas"]], ["pck-1", "pck-2"])
        self.assertTrue(res["rondas"][0]["corridas"][0]["terminada"])

    def test_enrutada_muestra_el_modelo_que_corrio(self):
        estado = self.datos / "prechecks" / "pck-1" / "estado.json"
        for modelo, esperado in (("claude-opus-5-5", "Opus 5.5 (enrutado)"), (None, "Sonnet 5.5 (enrutado)")):
            ia = {"status": "done", "proveedor": "claude-code", "enrutado": "plano escaneado", **({"modelo": modelo} if modelo else {})}
            escribir(estado, {"updatedAt": "2026-10-13T09:55:12.874Z", "ia": ia})
            c = self.generar()["rondas"][0]["corridas"][0]
            self.assertEqual(c["modelo"], esperado)
            self.assertEqual(c["enrutado"], "plano escaneado")

    def test_deepseek_registra_llamadas_y_tokens(self):
        car = self.datos / "prechecks" / "pck-1"
        escribir(car / "estado.json", {"updatedAt": "2026-10-13T09:55:12.874Z", "ia": {"status": "done", "proveedor": "deepseek-api"}})
        escribir(car / "ia.log.txt", "[15:07:22] inicio\n[15:07:30] DeepSeek llamada 1: 1000+50 tokens\n"
                                     "[15:08:00] DeepSeek llamada 2: 3000+70 tokens\n"
                                     '[15:17:30] DeepSeek terminó: 2 llamadas, 0.513 USD, herramientas {"buscar_texto":2}.\n')
        c = self.generar()["rondas"][0]["corridas"][0]
        self.assertEqual(c["deepseek"], {"llamadas": 2, "tokensEntradaMedia": 2000})
        self.assertEqual(c["minutos"], 10)


if __name__ == "__main__":
    unittest.main()
