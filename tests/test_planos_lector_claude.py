"""Tercer lector opcional (Claude por el CLI) del recuadro de datos: precheck/planos/lector_claude.py. El CLI va simulado:
estas pruebas no gastan cuota."""
import io
import json
import os
import subprocess
import unittest
from unittest import mock

from precheck.planos import extractores as ex
from precheck.planos import lector_claude as LC
from precheck.planos import lineas as L
from precheck.planos.lineas import Linea

REGION = (900.0, 240.0, 1500.0, 560.0)
CLAUDE = """DATOS DE LA FINCA
PARCELA:
FINCA: 078850; COD. UBICACION: 8701; TOMO:370
FOLIO: 426,
AREA: 733.14M2
ZONIFICACION: RM-H2 + CI (RESIDENCIAL MULTIFAMILIAR
DENSIDAD PERMITIDA: 0.0773314Ha X 1,500 PER/Ha (+"""


def ln(texto, caja, conf=0.8):
    return Linea(texto=texto, pagina=1, bbox=caja, metodo="ocr", confianza=conf)


def encendido(valor="1", **otras):
    return mock.patch.dict(os.environ, {"PRECHECK_OCR_CLAUDE": valor, **otras})


class TestActivacion(unittest.TestCase):
    def setUp(self):
        LC.reiniciar()

    def test_apagado_por_defecto_no_llama(self):
        ejecutar = mock.Mock()
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("PRECHECK_OCR_CLAUDE", None)
            self.assertFalse(LC.activo())
            self.assertIsNone(LC.leer(b"png", ejecutar))
        with encendido("0"):
            self.assertIsNone(LC.leer(b"png", ejecutar))
        ejecutar.assert_not_called()

    def test_encendido_llama_con_copia_literal_y_registra_el_costo(self):
        ejecutar = mock.Mock(return_value=(CLAUDE, 0.0795))
        with encendido():
            self.assertEqual(LC.leer(b"png", ejecutar), CLAUDE)
        prompt, carpeta = ejecutar.call_args.args
        self.assertIn("No corrijas números ni ortografía", prompt)
        self.assertIn("[ilegible]", prompt)
        self.assertIn(str(carpeta), prompt)
        self.assertEqual(LC.resumen(), {"llamadas": 1, "costo_usd": 0.0795, "fallos": 0})

    def test_el_prompt_no_trae_numeros_del_plano_de_prueba(self):
        for n in ("078850", "733.14", "0773314", "073314"):
            self.assertNotIn(n, LC.PROMPT)

    def test_fallo_del_cli_se_ignora_sin_error(self):
        for error in (FileNotFoundError("claude"), subprocess.TimeoutExpired("claude", 300), ValueError("no JSON"),
                      RuntimeError("is_error")):
            LC.reiniciar()
            with encendido(), self.assertLogs(LC.log, "WARNING"):
                self.assertIsNone(LC.leer(b"png", mock.Mock(side_effect=error)))
            self.assertEqual(LC.resumen()["fallos"], 1)

    def test_tope_de_llamadas_por_documento(self):
        ejecutar = mock.Mock(return_value=("FINCA: 1", None))
        with encendido(PRECHECK_OCR_CLAUDE_MAX="2"):
            self.assertEqual([LC.leer(b"png", ejecutar) is not None for _ in range(3)], [True, True, False])
        self.assertEqual(ejecutar.call_count, 2)
        self.assertEqual(LC.resumen()["costo_usd"], 0)   # el CLI no informó costo


class TestLlamadaAlCli(unittest.TestCase):
    def _correr(self, stdout, codigo=0):
        r = subprocess.CompletedProcess([], codigo, stdout=stdout, stderr="")
        with mock.patch.object(LC.subprocess, "run", return_value=r) as run:
            return LC.llamar_cli("prompt", __import__("pathlib").Path(".")), run

    def test_lee_resultado_y_costo_del_json(self):
        (texto, costo), run = self._correr(json.dumps({"result": "FINCA: 078850", "total_cost_usd": 0.08}))
        self.assertEqual((texto, costo), ("FINCA: 078850", 0.08))
        args = run.call_args.args[0]
        self.assertIn("--no-session-persistence", args)
        self.assertEqual(args[args.index("--allowedTools") + 1], "Read")
        self.assertNotIn("CLAUDECODE", run.call_args.kwargs["env"])

    def test_error_del_cli_lanza_y_leer_lo_ignora(self):
        with self.assertRaises(RuntimeError):
            self._correr(json.dumps({"result": "sin cuota", "is_error": True}), 1)
        with self.assertRaises(ValueError):
            self._correr("no es JSON")
        LC.reiniciar()
        with encendido(), mock.patch.object(LC.subprocess, "run", side_effect=FileNotFoundError("claude")), \
                self.assertLogs(LC.log, "WARNING"):
            self.assertIsNone(LC.leer(b"png"))


class TestFusion(unittest.TestCase):
    def test_datos_por_rotulo(self):
        self.assertEqual(LC.datos("FINCA: 078850; COD. UBICACION: 8701; TOMO:370"),
                         [("FINCA", "FINCA: 078850", "078850"), ("UBICACION", "COD. UBICACION: 8701", "8701"), ("TOMO", "TOMO:370", "370")])
        self.assertEqual(LC.datos("DATOS DE LA FINCA"), [])
        self.assertEqual(LC.datos("Area Comun Cerrada 101.69"), [])   # sin separador no es el dato
        self.assertEqual(LC.datos("AREA: 7[ilegible]3.14M2"), [])      # lo ilegible no se fusiona

    def test_coincidencia_confianza_tope(self):
        segundo = [ln("FINCA: 078850", (960, 282, 1020, 292), 0.95), ln("AREA:733.14M2", (960, 309, 1030, 318), 0.95)]
        res = LC.fusionar(list(segundo), "FINCA: 078850\nAREA: 733.14M2", REGION, 1, segundo)
        claude = {x.texto: x for x in res if x not in segundo}
        self.assertEqual(set(claude), {"FINCA: 078850", "AREA: 733.14M2"})
        self.assertTrue(all(x.confianza == LC.CONFIANZA_COINCIDE == 0.8 and not x.candidatos for x in claude.values()))
        self.assertLess(max(x.confianza for x in res), 0.85)
        # Reemplaza a las del segundo lector, en su misma caja.
        self.assertEqual([x.texto for x in res], ["FINCA: 078850", "AREA: 733.14M2"])
        self.assertEqual(claude["FINCA: 078850"].bbox, (960, 282, 1020, 292))
        hecho = ex.fincas(res)
        self.assertEqual((hecho["valor"], hecho["confianza"], hecho.get("candidatos")), ("078850", 0.68, None))

    def test_discrepancia_valor_de_claude_con_candidatos(self):
        tesseract = [ln("DATOS DEL LOTE", (960, 270, 1040, 278), 0.9), ln("FINCA: 07885", (960, 282, 1020, 292), 0.6),
                     ln("AREA DEL LOTE: 133.14M2", (960, 309, 1080, 318), 0.6), ln("ZONIFICACION: RM-H2", (960, 330, 1060, 338), 0.6)]
        res = LC.fusionar(list(tesseract), "FINCA: 078850\nAREA DEL LOTE: 733.14M2\nZONIFICACION: RMH3", REGION, 1)
        nueva = next(x for x in res if x.texto == "FINCA: 078850")
        self.assertEqual((nueva.confianza, nueva.candidatos), (LC.CONFIANZA_DIFIERE, ("FINCA: 078850", "FINCA: 07885")))
        self.assertNotIn("FINCA: 07885", [x.texto for x in res])
        # El valor de Claude llega al hecho con ambos candidatos (el de Claude primero) y en revisión.
        finca = ex.fincas(res)
        self.assertEqual((finca["valor"], finca["estado"], finca["candidatos"]), ("078850", "revision", ["078850", "07885"]))
        area = ex.area_lote(res)
        self.assertEqual((area["valor"], area["estado"], area["candidatos"]), (733.14, "revision", [733.14, 133.14]))
        zona = ex.zonificacion_declarada(res)
        self.assertEqual((zona["valor"], zona["estado"], zona["candidatos"]), ("RMH3", "revision", ["RMH3", "RM-H2"]))

    def test_dato_solo_de_claude_y_lineas_ajenas_intactas(self):
        tabla = ln("Area Comun Cerrada 101.69", (1380, 337, 1480, 347))
        mixta = ln("TOMO: 3TO PROPIETARIO X", (960, 400, 1100, 410))
        res = LC.fusionar([tabla, mixta], "FOLIO: 426\nTOMO: 370", REGION, 1, ancla=ln("DATOS DE LA FINCA", (990, 250, 1140, 260)))
        folio = next(x for x in res if x.texto == "FOLIO: 426")
        self.assertEqual((folio.confianza, folio.bbox), (LC.CONFIANZA_SOLO, (990, 250, 1140, 260)))
        self.assertIn(tabla, res)
        self.assertNotIn(mixta, res)   # sus datos (TOMO) los trae todos Claude

    def test_fuera_de_la_region_o_sin_datos_no_cambia(self):
        lejos = [ln("FINCA: 999", (10, 10, 50, 20))]
        self.assertEqual(LC.fusionar(list(lejos), "PARCELA:\nCREATIVE DEVELOPMENT INC.", REGION, 1), lejos)
        res = LC.fusionar(list(lejos), "FINCA: 078850", REGION, 1)
        self.assertIn(lejos[0], res)

    def test_recuadro_de_datos_y_rotulo_suelto(self):
        datos = [ln("FINCA: 07885", (960, 282, 1020, 292)), ln("AREA: 133.14M2", (960, 309, 1030, 318))]
        self.assertTrue(LC.es_recuadro_de_datos(datos, REGION, 1))
        self.assertFalse(LC.es_recuadro_de_datos([ln("VECINO ADOSADO FINCA: #07564", (960, 282, 1100, 292))], REGION, 1))


class TestEnLaHoja(unittest.TestCase):
    """_reforzar_recuadros con el CLI simulado: Claude va después del segundo lector y gana en sus datos."""

    class Pagina:
        def get_pixmap(self, dpi):
            from PIL import Image  # noqa: PLC0415

            buf = io.BytesIO()
            Image.new("RGB", (40, 40), "white").save(buf, format="PNG")
            return mock.Mock(tobytes=lambda _fmt: buf.getvalue())

    def _hoja(self, *_):
        from PIL import Image  # noqa: PLC0415

        return Image.new("RGB", (8000, 4000), "white"), b""

    def setUp(self):
        LC.reiniciar()
        self.lineas = [ln("DATOS DE LA FINCA", (990, 250, 1140, 260)), ln("FINCA: 07885", (960, 282, 1020, 292), 0.6),
                       ln("AREA: 133.14M2", (960, 309, 1030, 318), 0.6)]

    def _correr(self, motor, salida_cli):
        ejecutar = mock.Mock(**salida_cli)
        with mock.patch.object(L, "_segundo_lector", return_value=motor), mock.patch.object(L, "_girar", side_effect=self._hoja), \
                mock.patch.object(LC, "llamar_cli", ejecutar):
            return L._reforzar_recuadros(self.Pagina(), 0, list(self.lineas), 1, 2592.0, 1728.0), ejecutar

    def test_desactivado_no_llama(self):
        os.environ.pop("PRECHECK_OCR_CLAUDE", None)
        res, ejecutar = self._correr(None, {"return_value": (CLAUDE, 0.08)})
        self.assertEqual(res, self.lineas)
        ejecutar.assert_not_called()

    def test_sin_segundo_lector_claude_lee_una_vez_por_recuadro(self):
        with encendido():
            res, ejecutar = self._correr(None, {"return_value": (CLAUDE, 0.08)})
        self.assertEqual(ejecutar.call_count, 1)   # dos anclas «FINCA» en el mismo recuadro: una sola llamada
        textos = {x.texto: x for x in res}
        self.assertIn("FINCA: 078850", textos)
        self.assertEqual(textos["AREA: 733.14M2"].candidatos, ("AREA: 733.14M2", "AREA: 133.14M2"))
        self.assertNotIn("FINCA: 07885", textos)
        self.assertEqual(LC.resumen()["costo_usd"], 0.08)

    def test_con_segundo_lector_coincidencia_y_fallo_del_cli(self):
        rapid = mock.Mock(return_value=mock.Mock(boxes=[[[0, 0], [300, 0], [300, 40], [0, 40]]], txts=["FINCA: 078850"], scores=[0.95]))
        with encendido():
            res, _ = self._correr(rapid, {"return_value": ("FINCA: 078850\nAREA: 733.14M2", None)})
        finca = [x for x in res if "078850" in x.texto]
        self.assertEqual([(x.texto, x.confianza) for x in finca], [("FINCA: 078850", 0.8)])
        LC.reiniciar()
        with encendido(), self.assertLogs(LC.log, "WARNING"):
            res, _ = self._correr(rapid, {"side_effect": FileNotFoundError("claude")})
        # Queda lo del segundo lector, sin error.
        self.assertIn("FINCA: 078850", [x.texto for x in res])
        self.assertEqual(LC.resumen()["fallos"], 1)

    def test_rotulo_suelto_de_finca_vecina_no_gasta_llamada(self):
        self.lineas = [ln("VECINO ADOSADO FINCA: #07564", (960, 282, 1100, 292))]
        with encendido():
            res, ejecutar = self._correr(None, {"return_value": (CLAUDE, 0.08)})
        ejecutar.assert_not_called()
        self.assertEqual(res, self.lineas)


if __name__ == "__main__":
    unittest.main()
