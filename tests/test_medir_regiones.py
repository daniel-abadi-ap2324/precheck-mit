"""scripts/medir_regiones.py: IoU, emparejamiento y métricas con regiones sintéticas."""
import importlib.util
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location("medir_regiones", RAIZ / "scripts" / "medir_regiones.py")
mr = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(mr)


def cuadro(x0, y0, x1, y1):
    return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]


def reg(tipo, puntos, **extra):
    return {"pagina": 1, "tipo": tipo, "puntos": puntos, **extra}


class TestGeometria(unittest.TestCase):
    def test_iou_de_cuadrados_conocidos(self):
        a = mr.poligono(cuadro(0, 0, 0.2, 0.2))
        self.assertAlmostEqual(mr.iou(a, mr.poligono(cuadro(0, 0, 0.2, 0.2))), 1.0)
        # Desplazado medio lado: intersección 1/2, unión 3/2 → 1/3.
        self.assertAlmostEqual(mr.iou(a, mr.poligono(cuadro(0.1, 0, 0.3, 0.2))), 1 / 3)
        self.assertEqual(mr.iou(a, mr.poligono(cuadro(0.5, 0.5, 0.6, 0.6))), 0.0)
        # Contenido: un cuarto del área.
        self.assertAlmostEqual(mr.iou(a, mr.poligono(cuadro(0, 0, 0.1, 0.1))), 0.25)

    def test_poligono_invalido_o_degenerado(self):
        self.assertIsNone(mr.poligono([[0, 0], [1, 1], [2, 2]]))
        self.assertIsNotNone(mr.poligono([[0, 0], [1, 1], [1, 0], [0, 1]]))  # lazo: se repara

    def test_emparejamiento_uno_a_uno_por_iou(self):
        P = [mr.poligono(cuadro(0, 0, 0.1, 0.1)), mr.poligono(cuadro(0.5, 0.5, 0.6, 0.6)),
             mr.poligono(cuadro(0.9, 0.9, 0.95, 0.95))]
        V = [mr.poligono(cuadro(0.01, 0, 0.11, 0.1)), mr.poligono(cuadro(0.52, 0.5, 0.62, 0.6))]
        parejas, fp, fv = mr.emparejar(P, V)
        self.assertEqual(sorted((p, v) for p, v, _ in parejas), [(0, 0), (1, 1)])
        self.assertEqual((fp, fv), ([2], []))

    def test_una_verdad_no_se_empareja_dos_veces(self):
        V = [mr.poligono(cuadro(0, 0, 0.1, 0.1))]
        P = [mr.poligono(cuadro(0, 0, 0.1, 0.1)), mr.poligono(cuadro(0.01, 0.01, 0.1, 0.1))]
        parejas, fp, fv = mr.emparejar(P, V)
        self.assertEqual([(p, v) for p, v, _ in parejas], [(0, 0)])  # gana la de mayor IoU
        self.assertEqual(fp, [1])

    def test_centroide_dentro_solo_si_se_pide(self):
        grande = mr.poligono(cuadro(0, 0, 0.4, 0.4))
        chico = mr.poligono(cuadro(0.1, 0.1, 0.15, 0.15))  # IoU 0.016
        self.assertEqual(len(mr.emparejar([chico], [grande])[0]), 0)
        self.assertEqual(len(mr.emparejar([chico], [grande], centroide=True)[0]), 1)


class TestMedir(unittest.TestCase):
    def test_lote_huella_falsas_y_trabajo(self):
        verdad = {"regiones": [reg("lote", cuadro(0.1, 0.1, 0.5, 0.5)), reg("huella", cuadro(0.2, 0.2, 0.4, 0.4))]}
        prop = {"regiones": [reg("lote", cuadro(0.1, 0.1, 0.5, 0.5)),
                             reg("huella", cuadro(0.2, 0.2, 0.4, 0.3)),       # media huella: IoU 0.5 → ajustar
                             reg("huella", cuadro(0.7, 0.7, 0.8, 0.8)),       # falsa
                             reg("lote", cuadro(0.1, 0.1, 0.5, 0.5), pagina=2)]}  # otra página: fuera de alcance
        m = mr.medir(prop, verdad)
        t = m["paginas"]["1"]["tipos"]
        self.assertEqual(t["lote"]["iou_union"], 1.0)
        self.assertEqual(t["huella"]["iou_parejas"], [0.5])
        self.assertEqual((t["huella"]["falsas"], t["huella"]["faltantes"], t["huella"]["a_ajustar"]), (1, 0, 1))
        self.assertEqual(m["fuera_de_alcance"], 1)
        self.assertEqual(m["trabajo"], {"borrar": 1, "crear": 0, "ajustar": 1, "total": 2})

    def test_alcance_excluye_lo_que_cae_fuera(self):
        verdad = {"regiones": [reg("lote", cuadro(0.1, 0.1, 0.3, 0.3))], "alcance": {"1": [cuadro(0, 0, 0.5, 0.5)]}}
        prop = {"regiones": [reg("lote", cuadro(0.6, 0.6, 0.9, 0.9))]}
        m = mr.medir(prop, verdad)
        self.assertEqual(m["fuera_de_alcance"], 1)
        self.assertEqual(m["paginas"]["1"]["tipos"]["lote"]["faltantes"], 1)

    def test_plazas_sueltas_precision_exhaustividad_y_conteo(self):
        verdad = {"regiones": [reg("estacionamiento", cuadro(0.1 * i, 0, 0.1 * i + 0.05, 0.1)) for i in range(4)]}
        prop = {"regiones": [reg("estacionamiento", cuadro(0.1 * i + 0.005, 0, 0.1 * i + 0.055, 0.1)) for i in range(3)]
                + [reg("estacionamiento", cuadro(0.8, 0.8, 0.85, 0.9))]}
        e = mr.medir(prop, verdad)["paginas"]["1"]["tipos"]["estacionamiento"]
        self.assertEqual((e["aciertos"], e["falsas"], e["faltantes"]), (3, 1, 1))
        self.assertEqual((e["precision"], e["exhaustividad"], e["error_conteo"]), (0.75, 0.75, 0))

    def test_plazas_en_bloque_con_conteo(self):
        verdad = {"regiones": [reg("estacionamiento", cuadro(0, 0, 0.5, 0.1), conteo=10)],
                  "totales": {"estacionamiento": 10}}
        prop = {"regiones": [reg("estacionamiento", cuadro(0.05 * i, 0, 0.05 * i + 0.04, 0.1)) for i in range(12)]}
        e = mr.medir(prop, verdad)["paginas"]["1"]["tipos"]["estacionamiento"]
        # 10 de las 12 caen en el bloque (2 quedan fuera: 0.50–0.54 y 0.55–0.59).
        self.assertEqual((e["aciertos"], e["falsas"], e["faltantes"]), (10, 2, 0))
        self.assertEqual(e["error_conteo"], 2)
        sin_prop = mr.medir({"regiones": []}, verdad)
        self.assertEqual(sin_prop["paginas"]["1"]["tipos"]["estacionamiento"]["faltantes"], 10)
        self.assertEqual(sin_prop["paginas"]["1"]["trabajo"]["crear_si_plazas_por_filas"], 1)

    def test_tipo_equivocado_cuenta_como_ajuste(self):
        verdad = {"regiones": [reg("huella", cuadro(0.2, 0.2, 0.4, 0.4))]}
        prop = {"regiones": [reg("otro", cuadro(0.2, 0.2, 0.4, 0.4)), reg("acceso_vehicular", cuadro(0.8, 0.8, 0.9, 0.9))]}
        m = mr.medir(prop, verdad)
        self.assertEqual([(x["propuesta"], x["verdad"]) for x in m["tipo_equivocado"]], [("otro", "huella")])
        self.assertEqual(m["no_evaluadas"], {"acceso_vehicular": 1})
        self.assertEqual(m["trabajo"], {"borrar": 0, "crear": 0, "ajustar": 1, "total": 1})


if __name__ == "__main__":
    unittest.main()
