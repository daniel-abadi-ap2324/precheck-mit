import importlib.util
import unittest
from pathlib import Path

_ruta = Path(__file__).resolve().parents[1] / "scripts" / "analisis" / "coincidencia.py"
_spec = importlib.util.spec_from_file_location("coincidencia", _ruta)
co = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(co)


def corrida(modelo, plano="P", lote=None, ia=None, motor=None, hechos=None):
    return dict(modelo=modelo, plano=plano, fecha="2026-10-19", lote=lote or {}, ia=ia or {}, motor=motor or {}, hechos=hechos if hechos is not None else (lote or {}))


def dato(v, conf=0.95):
    return {"valor": v, "confianza": conf}


class Coincidencia(unittest.TestCase):
    def test_iguales_con_tolerancia(self):
        self.assertTrue(co.iguales(100.0, 101.0))
        self.assertFalse(co.iguales(100.0, 103.0))
        self.assertTrue(co.iguales("Sí ", "sí"))
        self.assertFalse(co.iguales(True, 1))
        self.assertTrue(co.iguales(["0071877", "214312"], "214312 y 0071877"))
        self.assertTrue(co.iguales([1, 2, 3], "1, 2 y 3"))
        self.assertFalse(co.iguales(["1", "2"], "1, 2 y 3"))

    def test_aplanar_sin_datos_ajenos_al_plano(self):
        lote = {"expediente": {"hay_cesion": dato(True)}, "lote": {"codigo_zona": dato("R2"), "area": dato(5)}}
        self.assertEqual(co.aplanar(lote), {"lote.area": 5})

    def test_consenso_y_medicion(self):
        lote = lambda a, b: {"lote": {"area": dato(a)}, "plano": {"escala": dato(b)}}
        refs = [corrida("Opus 5.5", lote=lote(700, True), ia={"R1": {"decision": "CUMPLE"}}),
                corrida("Fable 5.1", lote=lote(700.5, False), ia={"R1": {"decision": "CUMPLE"}})]
        ref = co.referencia_por_plano(refs)["P"]
        x = corrida("DeepSeek Flash", lote=lote(700, True), ia={"R1": {"decision": "NO_CUMPLE"}})
        m = co.medir(x, ref, {}, set())
        self.assertEqual(m["opus"], 100.0)
        self.assertEqual(m["fable"], 50.0)          # escala distinta a la de Fable
        self.assertEqual(m["datos_consenso"], 1)     # escala sin consenso: no cuenta
        self.assertEqual(m["consenso"], 100.0)
        self.assertEqual(m["decisiones"], 0.0)

    def test_posible_error_de_la_verdad(self):
        refs = [corrida("Opus 5.5", lote={"a": dato(5)}), corrida("Fable 5.1", lote={"a": dato(5)})]
        ref = co.referencia_por_plano(refs)
        dudosos = co.errores_de_verdad(ref, {"P": {"a": 9}})
        self.assertEqual([(d["dato"], d["verdad"], d["opus_fable"]) for d in dudosos], [("a", 9, 5)])
        # Un error de la verdad no cuenta como fallo del modelo.
        x = corrida("DeepSeek Flash", lote={"a": dato(5)})
        self.assertIsNone(co.medir(x, ref["P"], {"a": 9}, {"a"})["exactitud"])
        self.assertEqual(co.medir(x, ref["P"], {"a": 9}, set())["exactitud"], 0.0)

    def test_sin_las_dos_referencias_no_hay_error_de_verdad(self):
        ref = co.referencia_por_plano([corrida("Opus 5.5", lote={"a": dato(5)}), corrida("Opus 5.5", lote={"a": dato(5)})])
        self.assertEqual(co.errores_de_verdad(ref, {"P": {"a": 9}}), [])


if __name__ == "__main__":
    unittest.main()
