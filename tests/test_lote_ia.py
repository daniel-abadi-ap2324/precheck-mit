"""Plan del lote de revisiones con IA (scripts/lote_ia.py): repeticiones, DeepSeek sin repetir y --maximo solo para lo nuevo.

No llama a la web: se prueba `planificar`, que recibe lo que ya existe.
"""
import importlib.util
import sys
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "scripts"))
_spec = importlib.util.spec_from_file_location("lote_ia", RAIZ / "scripts" / "lote_ia.py")
lote_ia = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(lote_ia)

PLANOS = ["Bella Vista", "Tocumen (comercial)"]


def nombres(trabajos):
    return [t["nombre"] for t in trabajos]


class DatosFijosYHoraTope(unittest.TestCase):
    def test_los_datos_fijos_se_imponen_iguales_en_cada_corrida(self):
        fijos = {"Bella Vista": {"codigoZona": "1ZM6", "datosDeclarados": {"lote.area_m2": 727.54, "proyecto.unidades_vivienda": 72},
                                 "definidas": ["lote.codigo_zona", "lote.area_m2", "proyecto.unidades_vivienda", "lote.frente_m"]}}
        d1 = lote_ia.datos_precheck("Bella Vista", "uno", fijos)
        d2 = lote_ia.datos_precheck("Bella Vista", "dos", fijos)
        self.assertEqual({k: v for k, v in d1.items() if k != "nombreProyecto"}, {k: v for k, v in d2.items() if k != "nombreProyecto"})
        self.assertEqual(d1["datosDeclarados"], {"lote.area_m2": 727.54, "proyecto.unidades_vivienda": 72})
        # Una definida sin valor declarado no se manda (la web la rechazaría): ese dato queda a revisión.
        self.assertEqual(d1["definidas"], ["lote.codigo_zona", "lote.area_m2", "proyecto.unidades_vivienda"])

    def test_sin_datos_fijos_queda_como_antes(self):
        d = lote_ia.datos_precheck("San Francisco", "x")
        self.assertNotIn("codigoZona", d)
        self.assertNotIn("datosDeclarados", d)
        self.assertNotIn("definidas", d)

    def test_no_se_lanza_lo_que_no_alcanza_antes_de_la_hora_tope(self):
        tope = lote_ia.hora_tope("13:30", ahora=lote_ia.hora_tope("12:00"))
        self.assertTrue(lote_ia.alcanza("sonnet", lote_ia.hora_tope("13:10"), tope))
        self.assertFalse(lote_ia.alcanza("opus", lote_ia.hora_tope("13:10"), tope))
        self.assertFalse(lote_ia.alcanza("fable", lote_ia.hora_tope("12:45"), tope))
        self.assertTrue(lote_ia.alcanza("fable", lote_ia.hora_tope("12:00"), None))


class Planificar(unittest.TestCase):
    def test_la_repeticion_es_el_bucle_exterior_y_la_primera_no_lleva_sufijo(self):
        trabajos, omitidas, avisos = lote_ia.planificar(PLANOS, ["sonnet", "opus"], 78, 2, 20, {})
        self.assertEqual(
            nombres(trabajos),
            [
                "Bella Vista - prueba 78 con Sonnet 5.5",
                "Bella Vista - prueba 78 con Opus 5.5",
                "Tocumen (comercial) - prueba 78 con Sonnet 5.5",
                "Tocumen (comercial) - prueba 78 con Opus 5.5",
                "Bella Vista - prueba 78 con Sonnet 5.5 (2)",
                "Bella Vista - prueba 78 con Opus 5.5 (2)",
                "Tocumen (comercial) - prueba 78 con Sonnet 5.5 (2)",
                "Tocumen (comercial) - prueba 78 con Opus 5.5 (2)",
            ],
        )
        self.assertEqual([t["repeticion"] for t in trabajos], [1, 1, 1, 1, 2, 2, 2, 2])
        self.assertEqual(trabajos[0]["modelo"], "claude-sonnet-5-5")
        self.assertEqual((omitidas, avisos), ([], []))

    def test_deepseek_corre_una_sola_vez_salvo_que_se_pida(self):
        trabajos, _, avisos = lote_ia.planificar(PLANOS, ["deepseek"], 78, 3, 20, {})
        self.assertEqual(nombres(trabajos), ["Bella Vista - prueba 78 con DeepSeek Flash", "Tocumen (comercial) - prueba 78 con DeepSeek Flash"])
        self.assertEqual(len(avisos), 2)  # uno por repetición saltada, no uno por plano
        self.assertIn("--deepseek-repeticiones", avisos[0])
        con, _, avisos = lote_ia.planificar(PLANOS, ["deepseek"], 78, 3, 20, {}, deepseek_repeticiones=True)
        self.assertEqual((len(con), avisos), (6, []))

    def test_maximo_cuenta_solo_lo_nuevo_y_se_omiten_las_terminadas(self):
        existentes = {
            "Bella Vista - prueba 78 con Sonnet 5.5": "done",
            "Tocumen (comercial) - prueba 78 con Sonnet 5.5": "running",
            "Bella Vista - prueba 78 con Sonnet 5.5 (2)": "failed",
        }
        trabajos, omitidas, _ = lote_ia.planificar(PLANOS, ["sonnet"], 78, 3, 2, existentes)
        self.assertEqual(omitidas, ["Bella Vista - prueba 78 con Sonnet 5.5"])
        self.assertEqual(
            [(t["nombre"], t["en_curso"]) for t in trabajos],
            [
                ("Tocumen (comercial) - prueba 78 con Sonnet 5.5", True),
                # Una que falló se vuelve a pedir y cuenta como nueva.
                ("Bella Vista - prueba 78 con Sonnet 5.5 (2)", False),
                ("Tocumen (comercial) - prueba 78 con Sonnet 5.5 (2)", False),
            ],
        )

    def test_los_nombres_se_leen_con_el_mismo_contrato(self):
        from analisis import nombres as n

        trabajos, _, _ = lote_ia.planificar(["CASO-A"], ["fable"], 77, 3, 9, {})
        self.assertEqual([n.leer(t["nombre"])["repeticion"] for t in trabajos], [1, 2, 3])


if __name__ == "__main__":
    unittest.main()
