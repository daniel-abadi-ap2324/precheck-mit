"""Regiones de la lámina (precheck/planos/regiones.py) y su contraste en la revisión, con PDF sintéticos.

El CLI de Claude se simula siempre (no se gasta cuota): con una función inyectada o con un script de Python en
PRECHECK_CLAUDE_BIN que responde como `claude -p --output-format json`.
"""
import contextlib
import io
import json
import os
import pathlib
import sys
import tempfile
import unittest
from unittest import mock

try:
    import pymupdf
except ImportError:  # pragma: no cover
    pymupdf = None

ANCHO, ALTO = 2592, 1728          # 36" × 24"
ESCALA = 200
M = 72 / 0.0254 / ESCALA          # puntos por metro a 1:200
X0, Y0 = 300.0, 300.0             # esquina superior izquierda del lote (20 × 30 m = 600 m²)
LOTE = (20.0, 30.0)
HUELLA = (4.0, 3.0, 12.0, 15.0)   # x, y (desde el fondo del lote, arriba), ancho, fondo: retiro posterior 3 m
ESTACIONAMIENTOS = 4              # 2.5 × 5 m, entre la huella y el frente (abajo)


def _m(x, y):
    return X0 + x * M, Y0 + y * M


def _plano(ruta, rotacion=0, con_area=True, con_escala=True, segunda_hoja=False, rotulo_huella="SALA"):
    doc = pymupdf.open()
    p = doc.new_page(width=ANCHO, height=ALTO)
    w, h = LOTE
    p.draw_polyline([_m(0, 0), _m(w, 0), _m(w, h), _m(0, h)], closePath=True, width=0.72)
    hx, hy, hw, hh = HUELLA
    p.draw_polyline([_m(hx, hy), _m(hx + hw, hy), _m(hx + hw, hy + hh), _m(hx, hy + hh)], closePath=True, width=0.5)
    if rotulo_huella:
        p.insert_text(_m(hx + 4, hy + 6), rotulo_huella, fontsize=9)   # ambiente rotulado: la huella
    for i in range(ESTACIONAMIENTOS):
        a, b = _m(2 + i * 2.5, 20), _m(2 + (i + 1) * 2.5, 25)
        p.draw_rect(pymupdf.Rect(*a, *b), width=0.3)
    p.draw_rect(pymupdf.Rect(20, 20, ANCHO - 20, ALTO - 20), width=1.5)  # marco de la lámina
    p.insert_text((X0, Y0 + 32 * M), "ACERA", fontsize=9)
    if con_area:
        p.insert_text((1500, 1400), "AREA DEL LOTE: 600.00 M2", fontsize=12)
    if con_escala:
        p.insert_text((1500, 1440), "PLANTA DE CONJUNTO ESCALA 1:200", fontsize=12)
    if rotacion:
        p.set_rotation(rotacion)
    if segunda_hoja:
        # Un cuadro de notas de 10 × 60 m a 1:500 mide 600 m², pero la hoja no rotula 1:500: no es el lote.
        q = doc.new_page(width=ANCHO, height=ALTO)
        k = 72 / 0.0254 / 500
        q.draw_rect(pymupdf.Rect(1600, 200, 1600 + 10 * k, 200 + 60 * k), width=0.5)
        q.insert_text((200, 1500), "ELEVACION FRONTAL ESCALA 1:100", fontsize=12)
    doc.save(ruta)
    return ruta


def _por_tipo(doc):
    cuenta = {}
    for r in doc["regiones"]:
        cuenta[r["tipo"]] = cuenta.get(r["tipo"], 0) + 1
    return cuenta


def _caja(puntos):
    xs, ys = [p[0] for p in puntos], [p[1] for p in puntos]
    return min(xs), min(ys), max(xs), max(ys)


class _Carpeta(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = pathlib.Path(self._tmp.name)

    def tearDown(self):
        self._tmp.cleanup()


@unittest.skipUnless(pymupdf, "requiere pymupdf")
class TestPropuestaVectorial(_Carpeta):
    def test_lote_huella_y_estacionamientos_a_escala(self):
        from precheck.planos.regiones import TIPOS, proponer

        doc = proponer(_plano(self.dir / "p.pdf"), self.dir / "out")
        self.assertEqual(_por_tipo(doc), {"lote": 1, "huella": 1, "estacionamiento": ESTACIONAMIENTOS})
        pag = doc["paginas"]["1"]
        self.assertEqual((pag["imagen"], pag["ancho_px"], pag["alto_px"], pag["escala"]), ("r1.png", 3600, 2400, ESCALA))
        self.assertEqual((pag["ancho_mm"], pag["alto_mm"]), (914.4, 609.6))
        self.assertTrue((self.dir / "out" / "r1.png").exists())
        self.assertTrue((self.dir / "out" / "regiones.json").exists())
        lote = next(r for r in doc["regiones"] if r["tipo"] == "lote")
        x0, y0, x1, y1 = _caja(lote["puntos"])
        self.assertAlmostEqual(x0, X0 / ANCHO, places=3)
        self.assertAlmostEqual(y0, Y0 / ALTO, places=3)
        self.assertAlmostEqual(x1, (X0 + LOTE[0] * M) / ANCHO, places=3)
        self.assertAlmostEqual(y1, (Y0 + LOTE[1] * M) / ALTO, places=3)
        for r in doc["regiones"]:
            self.assertIn(r["tipo"], TIPOS)
            self.assertEqual((r["origen"], r["confirmada"], r["editada"], r["pagina"]), ("vectorial", False, False, 1))
            self.assertLess(r["confianza"], 0.85)
            self.assertGreaterEqual(len(r["puntos"]), 3)
            self.assertNotEqual(r["puntos"][0], r["puntos"][-1])
            self.assertTrue(all(0 <= c <= 1 for p in r["puntos"] for c in p))
            self.assertRegex(r["id"], r"^r-[0-9a-f]{6,}$")
        self.assertEqual(len({r["id"] for r in doc["regiones"]}), len(doc["regiones"]))

    def test_con_la_hoja_girada_las_fracciones_son_las_de_la_hoja_como_se_lee(self):
        from precheck.planos.regiones import proponer

        doc = proponer(_plano(self.dir / "p.pdf", rotacion=90), self.dir / "out")
        pag = doc["paginas"]["1"]
        self.assertEqual((pag["ancho_px"], pag["alto_px"]), (2400, 3600))
        self.assertEqual((pag["ancho_mm"], pag["alto_mm"]), (609.6, 914.4))
        lote = next(r for r in doc["regiones"] if r["tipo"] == "lote")
        # Giro de 90° en sentido horario: x' = ALTO - y, y' = x (la hoja como se lee mide ALTO × ANCHO).
        x0, y0, x1, y1 = _caja(lote["puntos"])
        self.assertAlmostEqual(x0, (ALTO - (Y0 + LOTE[1] * M)) / ALTO, places=3)
        self.assertAlmostEqual(x1, (ALTO - Y0) / ALTO, places=3)
        self.assertAlmostEqual(y0, X0 / ANCHO, places=3)
        self.assertAlmostEqual(y1, (X0 + LOTE[0] * M) / ANCHO, places=3)
        self.assertEqual(_por_tipo(doc)["estacionamiento"], ESTACIONAMIENTOS)

    def test_sin_escala_conocida_no_etiqueta_por_tamano(self):
        from precheck.planos.regiones import proponer

        doc = proponer(_plano(self.dir / "p.pdf", con_area=False, con_escala=False), self.dir / "out")
        self.assertEqual(doc["regiones"], [])
        self.assertIsNone(doc["paginas"]["1"]["escala"])   # la hoja relevante tiene imagen aunque no haya regiones
        self.assertTrue((self.dir / "out" / "r1.png").exists())

    def test_area_declarada_en_lote_json_fija_la_escala(self):
        from precheck.planos.regiones import proponer

        lt = self.dir / "lote.json"
        lt.write_text(json.dumps({"lote": {"area_m2": {"valor": 600.0, "confianza": 1, "fuente": {"metodo": "declarado"}}}}),
                      encoding="utf-8")
        doc = proponer(_plano(self.dir / "p.pdf", con_area=False), self.dir / "out", lote=lt)
        self.assertEqual(_por_tipo(doc).get("lote"), 1)
        self.assertEqual(doc["paginas"]["1"]["escala"], ESCALA)

    def test_un_cuadro_que_mide_el_area_a_una_escala_no_rotulada_no_es_el_lote(self):
        from precheck.planos.regiones import proponer

        doc = proponer(_plano(self.dir / "p.pdf", segunda_hoja=True), self.dir / "out")
        self.assertEqual([r["pagina"] for r in doc["regiones"] if r["tipo"] == "lote"], [1])

    def test_conserva_las_regiones_humanas_y_reemplaza_las_automaticas(self):
        from precheck.planos.regiones import proponer

        pdf = _plano(self.dir / "p.pdf")
        out = self.dir / "out"
        primero = proponer(pdf, out)
        lote = next(r for r in primero["regiones"] if r["tipo"] == "lote")
        humana = {"id": "r-humana", "pagina": 1, "tipo": "tinaquera", "puntos": [[0.5, 0.5], [0.52, 0.5], [0.52, 0.53]],
                  "origen": "humano", "confianza": 0.7, "etiqueta": "a mano", "confirmada": False, "editada": False}
        confirmada = {**lote, "confirmada": True, "etiqueta": "revisado"}
        vieja = {"id": "r-vieja", "pagina": 1, "tipo": "acera", "puntos": [[0.1, 0.1], [0.2, 0.1], [0.2, 0.2]],
                 "origen": "vision", "confianza": 0.5, "etiqueta": "", "confirmada": False, "editada": False}
        editada = {**vieja, "id": "r-editada", "editada": True}
        previas = {**primero, "regiones": [humana, confirmada, vieja, editada]}
        (out / "regiones.json").write_text(json.dumps(previas), encoding="utf-8")
        segundo = proponer(pdf, out)
        ids = [r["id"] for r in segundo["regiones"]]
        self.assertIn("r-humana", ids)
        self.assertIn("r-editada", ids)
        self.assertNotIn("r-vieja", ids)
        self.assertEqual(next(r for r in segundo["regiones"] if r["id"] == "r-humana"), humana)
        # El lote confirmado se conserva tal cual y no se duplica con el nuevo automático.
        lotes = [r for r in segundo["regiones"] if r["tipo"] == "lote"]
        self.assertEqual(lotes, [confirmada])
        self.assertEqual(_por_tipo(segundo)["estacionamiento"], ESTACIONAMIENTOS)

    def test_identificadores_estables_entre_corridas(self):
        from precheck.planos.regiones import proponer

        pdf = _plano(self.dir / "p.pdf")
        a = proponer(pdf, self.dir / "a")
        b = proponer(pdf, self.dir / "b")
        self.assertEqual([r["id"] for r in a["regiones"]], [r["id"] for r in b["regiones"]])


def _lote_por_lineas(ruta, superficie="SUPERFICIE 600.00 M2", escala_lote=ESCALA, rotulos=True, a_trazos=True):
    """Lote de 20 × 30 m dibujado con líneas de propiedad sueltas (a trazos en dos lados, sin polígono cerrado) y
    sus vértices rotulados 1–4 en letra grande, como en Tocumen. Sin escala rotulada."""
    k = 72 / 0.0254 / escala_lote
    doc = pymupdf.open()
    p = doc.new_page(width=ANCHO, height=ALTO)
    v = [(X0, Y0), (X0 + 20 * k, Y0), (X0 + 20 * k, Y0 + 30 * k), (X0, Y0 + 30 * k)]
    for i in range(4):
        a, b = v[i], v[(i + 1) % 4]
        if a_trazos and i % 2:
            n = 20
            for j in range(0, n, 2):   # a trazos: la mitad del lado dibujada
                p.draw_line((a[0] + (b[0] - a[0]) * j / n, a[1] + (b[1] - a[1]) * j / n),
                            (a[0] + (b[0] - a[0]) * (j + 1) / n, a[1] + (b[1] - a[1]) * (j + 1) / n), width=0.5)
        else:
            p.draw_line(a, b, width=0.5)
    if rotulos:
        for i, (x, y) in enumerate(v):
            p.insert_text((x - 25 if i in (0, 3) else x + 8, y - 8 if i < 2 else y + 22), str(i + 1), fontsize=18)
    p.insert_text((X0 + 5, Y0 + 40), "LOCAL 1", fontsize=9)        # algo dibujado dentro del lote
    p.draw_rect(pymupdf.Rect(X0 + 40, Y0 + 60, X0 + 120, Y0 + 140), width=1)
    if superficie:
        p.insert_text((1700, 1400), superficie, fontsize=12)
    doc.save(ruta)
    return ruta


@unittest.skipUnless(pymupdf, "requiere pymupdf")
class TestLoteYEscala(_Carpeta):
    def test_lote_por_vertices_rotulados_y_lineas_de_propiedad_con_la_escala_del_area_escrita(self):
        from precheck.planos.regiones import proponer

        doc = proponer(_lote_por_lineas(self.dir / "p.pdf"), self.dir / "out")
        lotes = [r for r in doc["regiones"] if r["tipo"] == "lote"]
        self.assertEqual(len(lotes), 1)
        x0, y0, x1, y1 = _caja(lotes[0]["puntos"])
        self.assertAlmostEqual(x0, X0 / ANCHO, places=3)
        self.assertAlmostEqual(y1, (Y0 + 30 * M) / ALTO, places=3)
        self.assertIn("Vértices 1–4", lotes[0]["etiqueta"])
        # «SUPERFICIE 600.00 M2» con el polígono dibujado a 1:200: la escala de la hoja sale del área.
        self.assertEqual(doc["paginas"]["1"]["escala"], ESCALA)

    def test_escala_implicita_que_no_es_estandar_no_se_fija(self):
        from precheck.planos.regiones import proponer

        doc = proponer(_lote_por_lineas(self.dir / "p.pdf", escala_lote=455), self.dir / "out")
        lote = next(r for r in doc["regiones"] if r["tipo"] == "lote")
        self.assertIn("≈ 1:455", lote["etiqueta"])   # 600 m² escritos sobre un dibujo a 1:455…
        self.assertIsNone(doc["paginas"]["1"]["escala"])  # …pero 1:455 no es una escala rotulada ni estándar

    def test_sin_rotulos_de_vertices_no_hay_lote(self):
        from precheck.planos.regiones import proponer

        doc = proponer(_lote_por_lineas(self.dir / "p.pdf", rotulos=False), self.dir / "out")
        self.assertEqual([r for r in doc["regiones"] if r["tipo"] == "lote"], [])

    def test_vertices_rotulados_sin_lineas_entre_ellos_no_son_un_lote(self):
        from precheck.planos.detectores import lotes_rotulados

        # Ejes 1–4 en círculos: números grandes, pero ninguna línea une un número con el siguiente.
        pal = [_palabra(str(i + 1), 300 + 200 * i, 900, tam=18) for i in range(4)]
        segs = _segs([((300 + 200 * i, 100), (300 + 200 * i, 880)) for i in range(4)])
        self.assertEqual(lotes_rotulados(pal, segs), [])

    def test_un_solo_lote_por_hoja(self):
        from precheck.planos.regiones import proponer

        pdf = _plano(self.dir / "p.pdf")
        d = pymupdf.open(pdf)
        v = [_m(0, 0), _m(20, 0), _m(20, 30), _m(0, 30)]
        for i, (x, y) in enumerate(v):   # rotula los vértices del lote cerrado del plano sintético
            d[0].insert_text((x - 25 if i in (0, 3) else x + 8, y - 8 if i < 2 else y + 22), str(i + 1), fontsize=18)
        d.save(self.dir / "q.pdf")
        doc = proponer(self.dir / "q.pdf", self.dir / "out")
        self.assertEqual(_por_tipo(doc)["lote"], 1)
        self.assertIn("Área a 1:200", next(r for r in doc["regiones"] if r["tipo"] == "lote")["etiqueta"])

    def test_escala_rotulada_unica_sin_area_etiqueta_plazas_por_tamano(self):
        from precheck.planos.regiones import proponer

        doc = proponer(_plano(self.dir / "p.pdf", con_area=False, con_escala=True), self.dir / "out")
        self.assertEqual(doc["paginas"]["1"]["escala"], ESCALA)
        self.assertEqual(_por_tipo(doc).get("estacionamiento"), ESTACIONAMIENTOS)

    def test_area_escrita_como_superficie(self):
        from precheck.planos.lineas import Linea
        from precheck.planos.regiones import area_escrita

        def ln(t):
            return Linea(t, 1, (0, 0, 1, 1), "pdf_texto", 0.99)

        self.assertEqual(area_escrita([ln("SUPERFICIE 31450.00 M2"), ln("AREA MINIMA DE LOTE: 1,500.00 M2")]), 31450.0)
        self.assertEqual(area_escrita([ln("Superficie: 1,250.50 m2")]), 1250.5)
        self.assertIsNone(area_escrita([ln("SUPERFICIE 100.00 M2"), ln("SUPERFICIE 200.00 M2")]))  # ambiguo
        self.assertIsNone(area_escrita([ln("AREA 590.20 M2")]))
        # «SUPERFICIE TOTAL» suele ser el área construida: no es el lote.
        self.assertIsNone(area_escrita([ln("SUPERFICIE TOTAL 1,850.00 M2")]))
        self.assertIsNone(area_escrita([ln("SUPERFICIE TOTAL: 1850 M2")]))
        self.assertEqual(area_escrita([ln("SUPERFICIE DEL TERRENO: 600.00 M2")]), 600.0)
        self.assertEqual(area_escrita([ln("SUPERFICIE TOTAL 1,850.00 M2"), ln("SUPERFICIE 600.00 M2")]), 600.0)


def _plano_ambientes(ruta, rotulos=("SALA", "C O C I N A", "TERRAZA"), plazas_en_patio=False):
    """Lote de 20 × 30 m a 1:200 con tres espacios cerrados de 6 × 8 m en fila (x = 2–8, 8–14, 14–20 m; y = 4–12 m)
    y, debajo, un patio cerrado de 16 × 10 m (y = 14–24 m)."""
    doc = pymupdf.open()
    p = doc.new_page(width=ANCHO, height=ALTO)
    p.draw_polyline([_m(0, 0), _m(20, 0), _m(20, 30), _m(0, 30)], closePath=True, width=0.72)
    for i, x in enumerate((2, 8, 14)):
        p.draw_rect(pymupdf.Rect(*_m(x, 4), *_m(x + 6, 12)), width=1.2)
        if i < len(rotulos) and rotulos[i]:
            p.insert_text(_m(x + 1.5, 8), rotulos[i], fontsize=8)
    p.draw_rect(pymupdf.Rect(*_m(2, 14), *_m(18, 24)), width=1.2)
    p.insert_text(_m(8, 16), "ESTACIONAMIENTO", fontsize=8)
    if plazas_en_patio:
        for i in range(4):
            p.draw_rect(pymupdf.Rect(*_m(3 + i * 2.5, 18), *_m(3 + (i + 1) * 2.5, 23)), width=0.3)
    p.insert_text((1500, 1400), "AREA DEL LOTE: 600.00 M2", fontsize=12)
    p.insert_text((1500, 1440), "PLANTA DE CONJUNTO ESCALA 1:200", fontsize=12)
    doc.save(ruta)
    return ruta


def _plano_podio(ruta, rampa=True, calle=True):
    """Lote de 20 × 30 m a 1:200 con el frente abajo (y = 30, ACERA) y un podio de estacionamientos adosado al fondo y a
    los costados (y = 0–25 m; muro perimetral de 0.3 m dentro del lindero): dos filas de 7 plazas de 2.5 × 5 m sin
    rótulo de ambiente, un LOBBY de 6 × 5.5 m (x = 2–8, y = 19–24.5) y el jardín del frente cerrado por una cerca."""
    doc = pymupdf.open()
    p = doc.new_page(width=ANCHO, height=ALTO)
    p.draw_polyline([_m(0, 0), _m(20, 0), _m(20, 30), _m(0, 30)], closePath=True, width=0.72)
    # Muro del podio (0.3 m de grueso, por dentro del lindero en el fondo y los costados) y su fachada en y = 25.
    for a, b in (((0, 0.15), (20, 0.15)), ((0.15, 0), (0.15, 25)), ((19.85, 0), (19.85, 25))):
        p.draw_line(_m(*a), _m(*b), width=0.3 * M)
    p.draw_line(_m(0, 25), _m(20, 25), width=0.3 * M)
    for y in (1, 12):
        for i in range(7):
            p.draw_rect(pymupdf.Rect(*_m(2 + i * 2.5, y), *_m(2 + (i + 1) * 2.5, y + 5)), width=0.3)
    p.draw_rect(pymupdf.Rect(*_m(2, 19), *_m(8, 24.5)), width=1.2)
    p.insert_text(_m(3.5, 22), "LOBBY", fontsize=8)
    if rampa:
        p.insert_text(_m(9, 9), "RAMPA BAJA A", fontsize=6)
        p.insert_text(_m(9, 10), "SEMISOTANO 12%", fontsize=6)
    # Cerca del jardín del frente, a 0.3 m de los linderos: el jardín no toca el lindero (no se demuestra abierto).
    p.draw_rect(pymupdf.Rect(*_m(0.3, 25.3), *_m(19.7, 29.7)), width=0.2)
    if calle:
        p.insert_text(_m(5, 32), "ACERA", fontsize=9)
    p.insert_text((1500, 1400), "AREA DEL LOTE: 600.00 M2", fontsize=12)
    p.insert_text((1500, 1440), "PLANTA DE CONJUNTO ESCALA 1:200", fontsize=12)
    doc.save(ruta)
    return ruta


@unittest.skipUnless(pymupdf, "requiere pymupdf")
class TestHuellaPorAmbientes(_Carpeta):
    def _huella(self, doc):
        from shapely.geometry import Polygon
        from shapely.ops import unary_union

        hs = [r for r in doc["regiones"] if r["tipo"] == "huella"]
        return unary_union([Polygon([(x * ANCHO, y * ALTO) for x, y in r["puntos"]]) for r in hs]) if hs else None

    def test_union_de_ambientes_rotulados_sin_la_terraza(self):
        from precheck.planos.regiones import proponer

        doc = proponer(_plano_ambientes(self.dir / "p.pdf"), self.dir / "out")
        from shapely.geometry import Point

        h = self._huella(doc)
        self.assertIsNotNone(h)
        # SALA y COCINA (x = 2–14 m, y = 4–12 m) unidas a través del muro, y el estacionamiento cerrado sin plazas
        # dibujadas (techado); la terraza (x = 14–20 m) no.
        for x, y in ((5, 6), (11, 6), (8, 7.9), (10, 20)):
            self.assertTrue(h.contains(Point(*_m(x, y))), (x, y))
        self.assertFalse(h.contains(Point(*_m(17, 8))))
        self.assertAlmostEqual(h.bounds[1], _m(0, 4)[1], delta=0.4 * M)

    def test_estacionamiento_con_plazas_dentro_no_es_huella(self):
        from precheck.planos.regiones import proponer

        doc = proponer(_plano_ambientes(self.dir / "p.pdf", plazas_en_patio=True), self.dir / "out")
        self.assertEqual(_por_tipo(doc).get("estacionamiento"), 4)
        x0, y0, x1, y1 = self._huella(doc).bounds
        self.assertLess(y1, _m(0, 13)[1])          # solo la fila de ambientes
        self.assertAlmostEqual(x1, _m(14, 0)[0], delta=0.4 * M)

    def test_podio_con_rampa_y_semisotano_llega_a_los_linderos_que_no_son_frente(self):
        """Podio de plazas sin rótulos salvo el LOBBY (como Bella Vista): con «RAMPA … SEMISOTANO» dentro del lote, la
        huella llega al fondo y a los costados (adosados), pero no se acerca al frente más que el lobby, aunque el
        jardín del frente esté cerrado por una cerca (no se demuestra abierto)."""
        from precheck.planos.regiones import proponer

        doc = proponer(_plano_podio(self.dir / "p.pdf"), self.dir / "out")
        self.assertEqual(_por_tipo(doc).get("estacionamiento"), 14)
        x0, y0, x1, y1 = self._huella(doc).bounds
        self.assertAlmostEqual(y0, _m(0, 0)[1], delta=0.4 * M)      # fondo (lindero posterior): adosado
        self.assertAlmostEqual(x0, _m(0, 0)[0], delta=0.4 * M)      # costados: adosados
        self.assertAlmostEqual(x1, _m(20, 0)[0], delta=0.4 * M)
        self.assertLess(y1, _m(0, 25)[1] + 0.2 * M)                 # el frente sigue a ≥ 5 m (no entra el jardín)
        self.assertGreater(self._huella(doc).area, 0.7 * (20 * 25) * M * M)

    def test_podio_sin_rampa_o_sin_frente_reconocido_no_se_extiende(self):
        from precheck.planos.regiones import proponer

        for i, kw in enumerate(({"rampa": False}, {"calle": False})):
            doc = proponer(_plano_podio(self.dir / f"p{i}.pdf", **kw), self.dir / f"out{i}")
            x0, y0, x1, y1 = self._huella(doc).bounds
            self.assertGreater(y0, _m(0, 15)[1], kw)                # solo el lobby (y = 19–24.5 m)
            self.assertLess(x1, _m(9, 0)[0], kw)

    def test_es_podio(self):
        from precheck.planos.detectores import es_podio

        lote = [_m(0, 0), _m(20, 0), _m(20, 30), _m(0, 30)]
        dentro, fuera = _m(10, 10), _m(30, 10)
        self.assertTrue(es_podio(lote, [_palabra("RAMPA BAJA A", *dentro), _palabra("SEMISÓTANO 12%", *dentro)]))
        self.assertTrue(es_podio(lote, [_palabra("RAMPA SUBE A MEZZANINE", *dentro)]))
        self.assertFalse(es_podio(lote, [_palabra("RAMPA", *dentro)]))                     # rampa de acceso sola
        self.assertFalse(es_podio(lote, [_palabra("RAMPA", *dentro), _palabra("SÓTANO", *fuera)]))
        self.assertFalse(es_podio(lote, [_palabra("ESTAC. LIVIANOS", *dentro), _palabra("MEZZANINE", *dentro)]))

    def test_sin_rotulos_de_ambiente_no_hay_huella(self):
        from precheck.planos.regiones import proponer

        doc = proponer(_plano(self.dir / "p.pdf", rotulo_huella=""), self.dir / "out")
        self.assertNotIn("huella", _por_tipo(doc))   # ya no «el polígono más grande dentro del lote»

    def test_rotulos(self):
        from precheck.planos.detectores import compactar, es_ambiente

        self.assertEqual(compactar("C O M E D O R"), "COMEDOR")
        self.assertEqual(compactar("LÍNEA DE C O N S T R U C C I Ó N"), "LÍNEA DE CONSTRUCCIÓN")
        for t in ("LOCAL 12", "S A L A", "Depósito", "LAV.", "REC. SERVICIO", "BAÑO VISITA", "CTO ELECTRICO"):
            self.assertTrue(es_ambiente(t), t)
        for t in ("TERRAZA", "PATIO DE SERVICIO", "LOTE 73", "ACERA", "JARDÍN", "LOCALIZACION"):
            self.assertFalse(es_ambiente(t), t)


@unittest.skipUnless(pymupdf, "requiere pymupdf")
class TestRobustez(_Carpeta):
    def _ocho(self):
        """Lote de dos fincas que se tocan en una esquina: una polilínea cerrada en «8» (2 × 10 × 15 m = 300 m²)."""
        d = pymupdf.open()
        p = d.new_page(width=ANCHO, height=ALTO)
        p.draw_polyline([_m(0, 0), _m(10, 0), _m(10, 15), _m(20, 15), _m(20, 30), _m(10, 30), _m(10, 15), _m(0, 15)],
                        closePath=True, width=0.72)
        for x, y in ((1, 2), (12, 17)):
            p.draw_rect(pymupdf.Rect(*_m(x, y), *_m(x + 6, y + 8)), width=1.2)
            p.insert_text(_m(x + 1.5, y + 4), "SALA", fontsize=8)
        p.insert_text((1500, 1400), "AREA DEL LOTE: 300.00 M2", fontsize=12)
        p.insert_text((1500, 1440), "PLANTA DE CONJUNTO ESCALA 1:200", fontsize=12)
        d.save(self.dir / "ocho.pdf")
        return self.dir / "ocho.pdf"

    def test_lote_que_se_toca_a_si_mismo_no_tumba_la_propuesta(self):
        from precheck.planos.regiones import proponer

        avisos = []
        doc = proponer(self._ocho(), self.dir / "out", avisos=avisos)
        self.assertEqual(_por_tipo(doc), {"lote": 1, "huella": 2})   # una huella en cada pieza del «8»
        self.assertEqual(avisos, [])

    def test_un_detector_que_falla_se_avisa_y_la_propuesta_sigue(self):
        from precheck.planos import detectores
        from precheck.planos.regiones import proponer

        avisos = []
        with mock.patch.object(detectores, "huella_por_ambientes", side_effect=ValueError("roto")):
            doc = proponer(_plano(self.dir / "p.pdf"), self.dir / "out", avisos=avisos)
        self.assertEqual(_por_tipo(doc), {"lote": 1, "estacionamiento": ESTACIONAMIENTOS})
        self.assertTrue(any("huella" in a and "roto" in a for a in avisos), avisos)

    def test_piezas_de_un_poligono(self):
        from precheck.planos.detectores import piezas_poligono, poligono_simple

        ocho = [(0, 0), (10, 0), (10, 15), (20, 15), (20, 30), (10, 30), (10, 15), (0, 15)]
        self.assertEqual(len(piezas_poligono(ocho)), 2)
        self.assertEqual(poligono_simple(ocho).geom_type, "Polygon")
        self.assertIsNone(poligono_simple([(0, 0), (1, 1), (2, 2)]))


@unittest.skipUnless(pymupdf, "requiere pymupdf")
class TestAreaVerdeYAcera(_Carpeta):
    def _plano(self, relleno=(0.85, 0.95, 0.85), rotulo="GRAMA"):
        pdf = _plano(self.dir / "p.pdf")
        d = pymupdf.open(pdf)
        p = d[0]
        # Franja de grama de 1.25 m frente al lote (fuera del lindero), con relleno y rotulada; la acera sin cordón.
        p.draw_rect(pymupdf.Rect(*_m(2, 32), *_m(18, 33.25)), color=(0, 0.5, 0), fill=relleno, width=0.3)
        if rotulo:
            p.insert_text(_m(9, 32.9), rotulo, fontsize=6)
        d.save(self.dir / "q.pdf")
        return self.dir / "q.pdf"

    def test_grama_rotulada_con_relleno_verde(self):
        from precheck.planos.regiones import proponer

        doc = proponer(self._plano(), self.dir / "out")
        verdes = [r for r in doc["regiones"] if r["tipo"] == "area_verde"]
        self.assertEqual(len(verdes), 1)
        x0, y0, x1, y1 = _caja(verdes[0]["puntos"])
        self.assertAlmostEqual(x0, _m(2, 0)[0] / ANCHO, places=3)
        self.assertAlmostEqual(y1, _m(0, 33.25)[1] / ALTO, places=3)

    def test_sin_relleno_verde_o_sin_rotulo_no_hay_area_verde(self):
        from precheck.planos.regiones import proponer

        for kw in ({"relleno": (1, 1, 1)}, {"rotulo": ""}):
            doc = proponer(self._plano(**kw), self.dir / "out")
            self.assertNotIn("area_verde", _por_tipo(doc), kw)

    def test_la_acera_no_se_propone(self):
        from precheck.planos.regiones import PROPONER_ACERA, proponer

        self.assertFalse(PROPONER_ACERA)
        doc = proponer(self._plano(), self.dir / "out")   # el plano sintético rotula «ACERA» frente al lote
        self.assertNotIn("acera", _por_tipo(doc))

    def test_detector_de_acera_entre_lindero_y_cordon(self):
        """El detector (desactivado en la propuesta) recorta la franja rotulada al frente del lote."""
        from precheck.planos import detectores as de

        d = pymupdf.open(_plano(self.dir / "p.pdf"))
        p = d[0]
        p.draw_line(_m(-10, 33), _m(30, 33), width=0.5)   # cordón a 3 m del lindero
        lote = [_m(0, 0), _m(20, 0), _m(20, 30), _m(0, 30)]
        franjas = de.aceras(p, lote, de.palabras(p), pt_por_m=M)
        self.assertEqual(len(franjas), 1)
        xs, ys = [q[0] for q in franjas[0]], [q[1] for q in franjas[0]]
        self.assertAlmostEqual(min(ys), _m(0, 30)[1], delta=0.3 * M)
        self.assertAlmostEqual(max(ys), _m(0, 33)[1], delta=0.3 * M)
        self.assertAlmostEqual(min(xs), _m(0, 0)[0], delta=0.3 * M)
        self.assertAlmostEqual(max(xs), _m(20, 0)[0], delta=0.3 * M)


def _fila_numerada(p, x0, y0, numeros, paso=16.0, fondo=32.0, separadores=True, tam=5):
    """Fila horizontal de plazas sin escala: separadores verticales cada `paso`, número en el centro de cada plaza."""
    if separadores:
        for i in range(len(numeros) + 1):
            p.draw_line((x0 + i * paso, y0), (x0 + i * paso, y0 + fondo), width=0.12)
        p.draw_line((x0, y0), (x0 + len(numeros) * paso, y0), width=0.12)
    for i, n in enumerate(numeros):
        p.insert_text((x0 + i * paso + paso / 2 - tam * 0.28 * len(str(n)), y0 + fondo * 0.6), str(n), fontsize=tam)


def _palabra(texto, x, y, tam=5.0):
    from precheck.planos.detectores import Palabra

    return Palabra(texto, x, y, tam, (x - 3, y - 2, x + 3, y + 2))


def _segs(lineas):
    import numpy as np

    return np.array([(*a, *b, 0.12) for a, b in lineas], dtype=float)


@unittest.skipUnless(pymupdf, "requiere pymupdf")
class TestPlazasPorNumeracion(_Carpeta):
    """Plazas por su numeración y las líneas separadoras, sin escala ni rectángulos cerrados (como en Tocumen)."""

    def test_fila_numerada_sin_escala_un_poligono_por_plaza_y_tolera_huecos(self):
        from precheck.planos.regiones import proponer

        doc_pdf = pymupdf.open()
        p = doc_pdf.new_page(width=ANCHO, height=ALTO)
        numeros = [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13]       # falta el 7 en la numeración, no en el dibujo
        _fila_numerada(p, 600, 600, numeros)
        _fila_numerada(p, 600, 700, list(range(14, 24)))           # otra fila
        doc_pdf.save(self.dir / "p.pdf")
        doc = proponer(self.dir / "p.pdf", self.dir / "out")
        plazas = [r for r in doc["regiones"] if r["tipo"] == "estacionamiento"]
        self.assertEqual(len(plazas), len(numeros) + 10)
        self.assertIsNone(doc["paginas"]["1"]["escala"])
        etiquetas = {r["etiqueta"] for r in plazas}
        self.assertIn("Plaza 13", etiquetas)
        self.assertNotIn("Plaza 7", etiquetas)
        # La plaza 8 es la séptima de la fila: entre los separadores 6 y 7.
        x0, y0, x1, y1 = _caja(next(r for r in plazas if r["etiqueta"] == "Plaza 8")["puntos"])
        self.assertAlmostEqual(x0, (600 + 6 * 16) / ANCHO, places=3)
        self.assertAlmostEqual(x1, (600 + 7 * 16) / ANCHO, places=3)
        self.assertAlmostEqual(y0, 600 / ALTO, places=3)
        self.assertAlmostEqual(y1, 632 / ALTO, places=3)

    def test_numeros_sin_separadores_no_son_plazas(self):
        from precheck.planos.regiones import proponer

        doc_pdf = pymupdf.open()
        p = doc_pdf.new_page(width=ANCHO, height=ALTO)
        _fila_numerada(p, 600, 600, list(range(1, 11)), separadores=False)
        doc_pdf.save(self.dir / "p.pdf")
        doc = proponer(self.dir / "p.pdf", self.dir / "out")
        self.assertEqual([r for r in doc["regiones"] if r["tipo"] == "estacionamiento"], [])

    def test_peldanos_y_ejes_numerados_no_son_plazas(self):
        from precheck.planos.detectores import filas_de_plazas

        # Peldaños: huella de 10 pt y 45 pt de ancho (proporción 4.5); ejes: líneas de 600 pt cada 100 pt.
        pal = [_palabra(str(i + 1), 105 + 10 * i, 120) for i in range(10)]
        segs = [((100 + 10 * i, 100), (100 + 10 * i, 145)) for i in range(11)]
        pal += [_palabra(str(i + 1), 1050 + 100 * i, 400, tam=12) for i in range(6)]
        segs += [((1000 + 100 * i, 100), (1000 + 100 * i, 700)) for i in range(7)]
        filas = filas_de_plazas(pal, _segs(segs))
        self.assertEqual(sum(len(f.plazas) for f in filas), 0)
        self.assertTrue(all(f.motivo.startswith("proporción") for f in filas), [f.motivo for f in filas])

    def test_plazas_en_angulo(self):
        import math

        from precheck.planos.detectores import filas_de_plazas

        # Separadores a 60° de la fila: paso de 18.5 pt a lo largo de la fila (16 pt de ancho), 32 pt de largo.
        paso, largo, phi = 16 / math.sin(math.radians(60)), 32.0, math.radians(60)
        dx, dy = math.cos(phi) * largo / math.sin(phi), largo
        segs = [((500 + paso * i, 300), (500 + paso * i + dx, 300 + dy)) for i in range(9)]
        pal = [_palabra(str(i + 1), 500 + paso * (i + 0.5) + dx / 2, 300 + dy / 2) for i in range(8)]
        filas = filas_de_plazas(pal, _segs(segs))
        plazas = [pl for f in filas for pl in f.plazas]
        self.assertEqual(len(plazas), 8)
        f = next(f for f in filas if f.plazas)
        self.assertAlmostEqual(f.ancho_pt, 16, delta=0.5)
        self.assertAlmostEqual(f.largo_pt, 32 / math.sin(phi), delta=0.5)

    def test_con_escala_rechaza_medidas_que_no_son_de_plaza(self):
        from precheck.planos.detectores import filas_de_plazas

        # 16 × 32 pt a 1:100 son 0.56 × 1.13 m: no es un estacionamiento aunque la proporción sea la de uno.
        pal = [_palabra(str(i + 1), 108 + 16 * i, 120) for i in range(8)]
        segs = [((100 + 16 * i, 100), (100 + 16 * i, 132)) for i in range(9)]
        self.assertEqual(sum(len(f.plazas) for f in filas_de_plazas(pal, _segs(segs), escala=100)), 0)
        self.assertEqual(sum(len(f.plazas) for f in filas_de_plazas(pal, _segs(segs), escala=450)), 8)

    def test_no_duplica_las_plazas_rectangulares(self):
        from precheck.planos.regiones import proponer

        pdf = _plano(self.dir / "p.pdf")
        d = pymupdf.open(pdf)
        p = d[0]
        for i in range(ESTACIONAMIENTOS):   # numera los rectángulos de 2.5 × 5 m del plano sintético
            x, y = _m(2 + i * 2.5 + 1.0, 23)
            p.insert_text((x, y), str(i + 1), fontsize=9)
        d.save(self.dir / "q.pdf")
        doc = proponer(self.dir / "q.pdf", self.dir / "out")
        self.assertEqual(_por_tipo(doc)["estacionamiento"], ESTACIONAMIENTOS)


@unittest.skipUnless(pymupdf, "requiere pymupdf")
class TestHojaEscaneada(_Carpeta):
    """La hoja escaneada se gira como la enderezó el OCR de la extracción (su miniatura p<N>.png), para que la imagen y
    las regiones estén en el mismo sistema que extraccion.json y las marcas de la web."""

    def _escaneada(self):
        from PIL import Image, ImageDraw

        img = Image.new("RGB", (360, 240), "white")   # hoja apaisada con una mancha arriba a la izquierda
        ImageDraw.Draw(img).rectangle((20, 20, 140, 90), fill="black")
        ImageDraw.Draw(img).rectangle((200, 150, 220, 230), fill="gray")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        doc = pymupdf.open()
        doc.new_page(width=ANCHO, height=ALTO).insert_image(pymupdf.Rect(0, 0, ANCHO, ALTO), stream=buf.getvalue())
        pdf = self.dir / "escaneado.pdf"
        doc.save(pdf)
        return pdf, img

    def test_giro_igual_al_de_la_miniatura_de_la_extraccion(self):
        from precheck.planos.regiones import proponer

        pdf, img = self._escaneada()
        ext_dir = self.dir / "plan"
        ext_dir.mkdir()
        img.rotate(90, expand=True).save(ext_dir / "p1.png")   # el OCR la giró 270° en sentido horario
        ext = {"documento": "escaneado.pdf", "hechos": [],
               "paginas": [{"numero": 1, "tipo": "escaneada", "ancho_mm": 610, "alto_mm": 914, "miniatura": "p1.png",
                            "lamina": {"titulo": "LOCALIZACION"}}]}
        (ext_dir / "extraccion.json").write_text(json.dumps(ext), encoding="utf-8")
        doc = proponer(pdf, self.dir / "out", extraccion=ext_dir / "extraccion.json")
        pag = doc["paginas"]["1"]
        self.assertEqual((pag["ancho_px"], pag["alto_px"]), (2400, 3600))
        self.assertEqual((pag["ancho_mm"], pag["alto_mm"]), (609.6, 914.4))
        from PIL import Image

        r1 = Image.open(self.dir / "out" / "r1.png").convert("L").resize((24, 36))
        mini = Image.open(ext_dir / "p1.png").convert("L").resize((24, 36))
        # La mancha negra queda en el mismo lugar (abajo a la izquierda tras el giro).
        self.assertLess(r1.getpixel((4, 30)), 100)
        self.assertLess(mini.getpixel((4, 30)), 100)
        self.assertGreater(r1.getpixel((20, 4)), 150)

    def test_sin_extraccion_ni_tesseract_queda_como_viene(self):
        from precheck.planos.regiones import proponer

        pdf, _ = self._escaneada()
        with mock.patch("precheck.planos.lineas.orientacion", side_effect=FileNotFoundError("tesseract")):
            doc = proponer(pdf, self.dir / "out")
        self.assertEqual((doc["paginas"]["1"]["ancho_px"], doc["paginas"]["1"]["alto_px"]), (3600, 2400))
        self.assertEqual(doc["regiones"], [])


class TestConfianza(unittest.TestCase):
    def test_por_origen_y_siempre_menor_que_el_umbral(self):
        from precheck.planos.regiones import confianza_region

        casos = [({"origen": "vectorial", "confianza": 0.7, "confirmada": True}, 0.80),
                 ({"origen": "vision", "confianza": 0.5, "editada": True}, 0.70),
                 ({"origen": "humano"}, 0.70),
                 ({"origen": "vectorial", "confianza": 0.7}, 0.70),
                 ({"origen": "vision", "confianza": 0.5}, 0.50),
                 ({"origen": "vision", "confianza": 0.9}, 0.50),
                 ({"origen": "vision", "confianza": 0.4}, 0.40)]
        for r, esperada in casos:
            self.assertEqual(confianza_region(r), esperada, r)
            self.assertLess(confianza_region(r), 0.85)


# Respuesta simulada de Claude: regiones válidas e inválidas y etiquetas de candidatos.
RESPUESTA = {
    "regiones": [
        {"tipo": "acera", "puntos": [[0.1, 0.9], [0.4, 0.9], [0.4, 0.95], [0.1, 0.95], [0.1, 0.9]], "confianza": 0.8},
        {"tipo": "area_verde", "puntos": [[0.6, 0.6], [0.7, 0.6], [0.7, 0.7]], "confianza": 0.6, "etiqueta": "jardín"},
        {"tipo": "piscina", "puntos": [[0.1, 0.1], [0.2, 0.1], [0.2, 0.2]], "confianza": 0.9},       # tipo no permitido
        {"tipo": "huella", "puntos": [[0.1, 0.1], [1.5, 0.1], [0.2, 0.2]], "confianza": 0.9},        # fuera de la hoja
        {"tipo": "huella", "puntos": [[0.1, 0.1], [0.2, 0.1]], "confianza": 0.9},                    # dos vértices
        {"tipo": "tinaquera", "puntos": [[0.3, 0.3], [0.31, 0.3], [0.31, 0.31]], "confianza": 0.1},  # poca confianza
        {"tipo": "acera", "puntos": [[0.1, 0.1], [0.2, 0.2], [0.3, 0.3]], "confianza": 0.9},         # sin área
        {"tipo": "tinaquera", "puntos": [[0.8, 0.8], [0.85, 0.8], [0.85, 0.85]], "confianza": 0.7},
    ],
    "candidatos": [{"n": 1, "tipo": "area_verde", "confianza": 0.7}, {"n": 99, "tipo": "acera", "confianza": 0.9}],
}


class _DeepSeekFalso:
    """Servidor local que responde como la API de DeepSeek y guarda cada pedido. `entorno(carpeta)` apunta la URL a él,
    pone una llave de prueba y cambia el home a `carpeta`, así ninguna ruta lee ~/.config/precheck/deepseek.env."""

    def __init__(self, respuesta: dict, codigo: int = 200):
        import http.server  # noqa: PLC0415
        import threading  # noqa: PLC0415

        self.pedidos: list[dict] = []
        falso = self

        class Manejador(http.server.BaseHTTPRequestHandler):
            def do_POST(self):  # noqa: N802
                cuerpo = json.loads(self.rfile.read(int(self.headers["content-length"])))
                falso.pedidos.append({"autorizacion": self.headers.get("authorization"), "cuerpo": cuerpo})
                datos = {"choices": [{"message": {"role": "assistant", "content": json.dumps(respuesta)}, "finish_reason": "stop"}],
                         "usage": {"prompt_tokens": 1000, "completion_tokens": 200}} if codigo == 200 else {"error": "falla"}
                salida = json.dumps(datos).encode("utf-8")
                self.send_response(codigo)
                self.send_header("content-type", "application/json")
                self.send_header("content-length", str(len(salida)))
                self.end_headers()
                self.wfile.write(salida)

            def log_message(self, *args):
                pass

        self.servidor = http.server.HTTPServer(("127.0.0.1", 0), Manejador)
        self.hilo = threading.Thread(target=self.servidor.serve_forever, daemon=True)

    def __enter__(self):
        self.hilo.start()
        return self

    def __exit__(self, *exc):
        self.servidor.shutdown()
        self.servidor.server_close()

    @contextlib.contextmanager
    def entorno(self, home: pathlib.Path):
        url = f"http://127.0.0.1:{self.servidor.server_address[1]}/chat/completions"
        with mock.patch.dict(os.environ, {"PRECHECK_DEEPSEEK_URL": url, "DEEPSEEK_API_KEY": "sk-prueba-0123456789",
                                          "PRECHECK_DEEPSEEK_TOPE_USD": "60"}), \
                mock.patch("pathlib.Path.home", return_value=home):
            yield


class TestVision(unittest.TestCase):
    def test_limpia_la_respuesta(self):
        from precheck.planos.regiones import limpiar_vision

        cand = [[[0.5, 0.5], [0.6, 0.5], [0.6, 0.6], [0.5, 0.6]]]
        regs = limpiar_vision(RESPUESTA, 2, cand)
        self.assertEqual([(r["tipo"], r["origen"]) for r in regs],
                         [("acera", "vision"), ("area_verde", "vision"), ("tinaquera", "vision"), ("area_verde", "vision")])
        self.assertEqual(regs[0]["puntos"], [[0.1, 0.9], [0.4, 0.9], [0.4, 0.95], [0.1, 0.95]])  # sin cerrar
        self.assertEqual(regs[3]["puntos"], cand[0])
        # Con tipos pedidos, solo esos.
        self.assertEqual([r["tipo"] for r in limpiar_vision(RESPUESTA, 2, cand, ["tinaquera"])], ["tinaquera"])
        self.assertTrue(all(r["confianza"] <= 0.5 and r["pagina"] == 2 for r in regs))
        self.assertEqual(regs[1]["etiqueta"], "jardín")

    def test_json_de_texto(self):
        from precheck.planos.regiones import json_de_texto

        self.assertEqual(json_de_texto('Aquí va:\n```json\n{"regiones": []}\n```'), {"regiones": []})
        self.assertEqual(json_de_texto('{"a": 1}'), {"a": 1})
        self.assertIsNone(json_de_texto("no sé"))

    @unittest.skipUnless(pymupdf, "requiere pymupdf")
    def test_proponer_con_vision_simulada(self):
        from precheck.planos.regiones import proponer

        vistos = []

        def falso(prompt, carpeta):
            imagen = next(pathlib.Path(carpeta).glob("hoja*.png"))
            self.assertIn(str(imagen), prompt)
            vistos.append(prompt)
            return "```json\n" + json.dumps(RESPUESTA) + "\n```"

        with tempfile.TemporaryDirectory() as d:
            doc = proponer(_plano(pathlib.Path(d, "p.pdf")), pathlib.Path(d, "out"), vision=True, ejecutar=falso)
        self.assertEqual(len(vistos), 1)
        # La hoja ya tiene lote, huella y plazas vectoriales: solo se piden los otros tipos (y nunca acera ni área
        # verde, que la visión marcaba siempre mal).
        linea = next(ln for ln in vistos[0].splitlines() if "solo puede ser uno de" in ln)
        for t in ("lote", "huella", "estacionamiento", "acera", "area_verde"):
            self.assertNotIn(t, linea.split("uno de:")[1].split(".")[0].split(", "))
        self.assertIn("tinaquera", linea)
        vision = [r for r in doc["regiones"] if r["origen"] == "vision"]
        self.assertEqual({r["tipo"] for r in vision}, {"tinaquera"})
        self.assertTrue(all(r["confianza"] <= 0.5 for r in vision))
        self.assertEqual(_por_tipo(doc)["lote"], 1)   # lo vectorial sigue

    @unittest.skipUnless(pymupdf, "requiere pymupdf")
    def test_lo_que_la_vision_repite_de_lo_vectorial_no_se_duplica(self):
        from precheck.planos.regiones import proponer

        estac = _rect(2, 20, 2.5, 5)
        respuesta = {"regiones": [{"tipo": "estacionamiento", "puntos": estac, "confianza": 0.9},
                                  {"tipo": "lote", "puntos": _rect(0, 0, *LOTE), "confianza": 0.9},
                                  {"tipo": "tinaquera", "puntos": _rect(17, 27, 2, 2), "confianza": 0.9}]}
        with tempfile.TemporaryDirectory() as d:
            doc = proponer(_plano(pathlib.Path(d, "p.pdf")), pathlib.Path(d, "out"), vision=True,
                           ejecutar=lambda prompt, carpeta: json.dumps(respuesta))
        self.assertEqual([r["tipo"] for r in doc["regiones"] if r["origen"] == "vision"], ["tinaquera"])
        self.assertEqual(_por_tipo(doc)["estacionamiento"], ESTACIONAMIENTOS)

    @unittest.skipUnless(pymupdf, "requiere pymupdf")
    def test_si_la_vision_falla_se_avisa_y_sigue(self):
        from precheck.planos.regiones import proponer

        def falla(prompt, carpeta):
            raise RuntimeError("sin sesión")

        avisos = []
        with tempfile.TemporaryDirectory() as d:
            doc = proponer(_plano(pathlib.Path(d, "p.pdf")), pathlib.Path(d, "out"), vision=True, ejecutar=falla, avisos=avisos)
        self.assertEqual(_por_tipo(doc)["lote"], 1)
        self.assertTrue(any("sin sesión" in a for a in avisos))

    def test_un_solo_lote_y_plazas_repetidas_fuera(self):
        from precheck.planos.regiones import deduplicar_vision, region

        lote_v = region(1, "lote", _rect(0, 0, *LOTE), "vectorial", 0.7)
        plaza_v = region(1, "estacionamiento", _rect(2, 20, 2.5, 5), "vectorial", 0.7)
        vision = [region(1, "lote", _rect(3, 3, *LOTE), "vision", 0.5),            # desplazado: IoU < 0.5
                  region(1, "estacionamiento", _rect(2.8, 21, 3, 5), "vision", 0.5),  # IoU ≈ 0.4, centro dentro
                  region(1, "estacionamiento", _rect(12, 20, 2.5, 5), "vision", 0.5),
                  region(2, "lote", _rect(0, 0, *LOTE), "vision", 0.4),
                  region(2, "lote", _rect(1, 1, *LOTE), "vision", 0.3)]           # segundo lote de visión en la hoja 2
        quedan = deduplicar_vision([lote_v, plaza_v], vision)
        self.assertEqual([(r["pagina"], r["tipo"], r["confianza"]) for r in quedan],
                         [(1, "estacionamiento", 0.5), (2, "lote", 0.4)])

    @unittest.skipUnless(pymupdf, "requiere pymupdf")
    def test_hoja_escaneada_pide_todo_y_plazas_por_mosaico(self):
        from PIL import Image

        from precheck.planos import regiones as rg

        buf = io.BytesIO()
        Image.new("RGB", (360, 240), "white").save(buf, format="PNG")
        d = pymupdf.open()
        d.new_page(width=ANCHO, height=ALTO).insert_image(pymupdf.Rect(0, 0, ANCHO, ALTO), stream=buf.getvalue())
        llamadas = []

        def falso(prompt, carpeta):
            llamadas.append(prompt)
            if "TROZO" in prompt:
                # Un puesto en la esquina superior izquierda de cada trozo (fracciones del trozo).
                return json.dumps({"regiones": [{"tipo": "estacionamiento", "confianza": 0.8,
                                                 "puntos": [[0.10, 0.10], [0.15, 0.10], [0.15, 0.20], [0.10, 0.20]]}]})
            return json.dumps({"regiones": [{"tipo": "estacionamiento", "confianza": 0.8,
                                             "puntos": [[0.5, 0.5], [0.52, 0.5], [0.52, 0.55]]}],
                               "estacionamientos_visibles": True})

        with tempfile.TemporaryDirectory() as tmp:
            pdf = pathlib.Path(tmp, "e.pdf")
            d.save(pdf)
            doc = rg.proponer(pdf, pathlib.Path(tmp, "out"), vision=True, ejecutar=falso)
        principal = [p for p in llamadas if "TROZO" not in p]
        self.assertEqual(len(principal), 1)
        self.assertEqual(len(llamadas) - 1, rg.MOSAICO[0] * rg.MOSAICO[1])
        linea = next(ln for ln in principal[0].splitlines() if "solo puede ser uno de" in ln)
        for t in ("lote", "huella", "estacionamiento"):
            self.assertIn(t, linea)
        plazas = [r for r in doc["regiones"] if r["tipo"] == "estacionamiento"]
        # Las del mosaico reemplazan a las de la hoja entera; el trozo 1 empieza en (0, 0) y el 4 en (0.42, 0.42).
        self.assertEqual(len(plazas), 4)
        cajas = sorted(_caja(r["puntos"]) for r in plazas)
        self.assertAlmostEqual(cajas[0][0], 0.10 * 0.58, places=3)
        self.assertAlmostEqual(cajas[-1][0], 0.42 + 0.10 * 0.58, places=3)


class TestSam(unittest.TestCase):
    def test_mascara_a_poligono_y_refinado_con_predictor_simulado(self):
        try:
            import numpy as np
            from PIL import Image
            import cv2  # noqa: F401
        except ImportError:  # pragma: no cover
            self.skipTest("requiere numpy, pillow y opencv")
        from precheck.planos.regiones import mascara_a_puntos, refinar_con_sam

        mascara = np.zeros((100, 200), dtype=float)
        mascara[20:60, 40:120] = 1.0
        pts = mascara_a_puntos(mascara, 200, 100)
        x0, y0, x1, y1 = _caja(pts)
        self.assertEqual(len(pts), 4)
        self.assertAlmostEqual(x0, 0.2, places=2)
        self.assertAlmostEqual(y1, 0.59, places=2)

        class Predictor:
            def set_image(self, img):
                self.forma = img.shape

            def predict(self, box, multimask_output):
                return np.array([mascara]), np.array([0.9]), None

        r = {"id": "", "pagina": 1, "tipo": "huella", "puntos": [[0.18, 0.15], [0.62, 0.15], [0.62, 0.65], [0.18, 0.65]],
             "origen": "vision", "confianza": 0.5, "etiqueta": "", "confirmada": False, "editada": False}
        afinada = refinar_con_sam(Image.new("RGB", (200, 100)), [r], Predictor())[0]
        self.assertEqual(afinada["puntos"], pts)
        self.assertEqual(afinada["origen"], "vision")

    def test_sin_sam2_se_omite(self):
        from precheck.planos.regiones import predictor_sam

        with mock.patch.dict(sys.modules, {"sam2": None, "sam2.sam2_image_predictor": None}):
            self.assertIsNone(predictor_sam([]))


def _region(tipo, puntos, origen="vectorial", pagina=1, **extra):
    return {"id": f"r-{tipo}-{len(puntos)}-{puntos[0][0]}", "pagina": pagina, "tipo": tipo, "puntos": puntos,
            "origen": origen, "confianza": 0.7 if origen != "vision" else 0.5, "etiqueta": "", "confirmada": False,
            "editada": False, **extra}


def _rect(x, y, w, h):
    """Rectángulo en metros (sobre el lote sintético) → fracciones de la hoja a 1:200."""
    a, b = _m(x, y), _m(x + w, y + h)
    return [[a[0] / ANCHO, a[1] / ALTO], [b[0] / ANCHO, a[1] / ALTO], [b[0] / ANCHO, b[1] / ALTO], [a[0] / ANCHO, b[1] / ALTO]]


def _regiones(escala=ESCALA, con_acera=True, estac=ESTACIONAMIENTOS, confirmada=False):
    regs = [_region("lote", _rect(0, 0, *LOTE), confirmada=confirmada),
            _region("huella", _rect(*HUELLA))]
    regs += [_region("estacionamiento", _rect(2 + i * 2.5, 20, 2.5, 5)) for i in range(estac)]
    if con_acera:
        regs.append(_region("acera", _rect(0, 30.5, 20, 1.5), origen="humano"))
    return {"version": 1, "generado": "2026-10-09T12:00:00Z",
            "paginas": {"1": {"imagen": "r1.png", "ancho_px": 3600, "alto_px": 2400, "ancho_mm": ANCHO / 72 * 25.4,
                              "alto_mm": ALTO / 72 * 25.4, "escala": escala}},
            "regiones": regs}


def _declarado(**proyecto):
    return {"proyecto": {k: {"valor": v, "confianza": 1, "fuente": {"metodo": "declarado"}} for k, v in proyecto.items()}}


class TestContraste(unittest.TestCase):
    def test_conteos_presentes_y_medidas(self):
        from precheck.planos.regiones import contrastar

        res = contrastar(_regiones(), {})
        self.assertEqual(res["conteos"], {"acera": 1, "estacionamiento": ESTACIONAMIENTOS, "huella": 1, "lote": 1})
        self.assertEqual(res["presentes"], ["acera", "estacionamiento", "huella", "lote"])
        m = res["medidas"]
        self.assertAlmostEqual(m["retiro_posterior_m"], 3.0, places=1)
        self.assertAlmostEqual(m["retiro_frontal_m"], 12.0, places=1)
        self.assertAlmostEqual(m["area_lote_m2"], 600.0, delta=1)
        self.assertAlmostEqual(m["area_huella_m2"], 180.0, delta=1)
        self.assertAlmostEqual(m["ocupacion_pct"], 30.0, places=1)
        self.assertEqual(res["discrepancias"], [])
        self.assertTrue(all(c < 0.85 for c in res["confianza"].values()))

    def test_discrepancias_contra_lo_declarado(self):
        from precheck.planos.regiones import contrastar

        hechos = _declarado(estacionamientos=6, retiro_posterior_m=5.0, ocupacion_pct=31.0)
        res = contrastar(_regiones(), hechos)
        datos = {d["dato"]: d for d in res["discrepancias"]}
        self.assertEqual(set(datos), {"proyecto.estacionamientos", "proyecto.retiro_posterior_m"})  # 31 % está dentro del 10 %
        self.assertEqual((datos["proyecto.estacionamientos"]["declarado"], datos["proyecto.estacionamientos"]["dibujado"]), (6, 4))
        self.assertAlmostEqual(datos["proyecto.retiro_posterior_m"]["dibujado"], 3.0, places=1)
        self.assertIn("Verifíquelo", datos["proyecto.retiro_posterior_m"]["mensaje"])
        self.assertTrue(all(d["confianza"] < 0.85 for d in res["discrepancias"]))

    def test_numeracion_con_huecos_no_es_el_conteo(self):
        from precheck.planos.regiones import contrastar, nota_numeracion

        def plaza(n, pagina=1):
            return {"tipo": "estacionamiento", "pagina": pagina, "etiqueta": f"Plaza {n}", "puntos": [[0, 0], [0.1, 0], [0.1, 0.1]]}

        nota = nota_numeracion([plaza(n) for n in range(1, 11) if n not in (4, 7)])
        self.assertIn("hasta el 10, pero son 8", nota)
        self.assertIn("números 4, 7", nota)
        self.assertIsNone(nota_numeracion([plaza(n) for n in range(1, 6)]))                         # sin huecos
        self.assertIsNone(nota_numeracion([{**plaza(1), "etiqueta": "Plaza techada"}]))            # sin número
        # Varias láminas: se mira la que tiene más plazas.
        self.assertIn("Página 2", nota_numeracion([plaza(1), plaza(3)] + [plaza(n, 2) for n in (1, 2, 4)]))
        regs = _regiones()
        regs["regiones"] = [r for r in regs["regiones"] if r["tipo"] != "estacionamiento"] + [plaza(n) for n in (1, 2, 4)]
        self.assertTrue(any("no hay plaza con los números 3" in n for n in contrastar(regs, {})["notas"]))

    def test_sin_regiones_del_tipo_no_hay_discrepancia_de_conteo(self):
        from precheck.planos.regiones import contrastar

        res = contrastar(_regiones(estac=0), _declarado(estacionamientos=6))
        self.assertEqual(res["discrepancias"], [])

    def test_sin_escala_no_hay_medidas_en_metros(self):
        from precheck.planos.regiones import contrastar

        res = contrastar(_regiones(escala=None), _declarado(retiro_posterior_m=5.0))
        self.assertIsNone(res["medidas"]["retiro_posterior_m"])
        self.assertIsNone(res["medidas"]["area_lote_m2"])
        self.assertAlmostEqual(res["medidas"]["ocupacion_pct"], 30.0, places=1)   # proporción: no necesita escala
        self.assertEqual(res["discrepancias"], [])

    def test_sin_frente_marcado_no_se_adivina_el_retiro_posterior(self):
        from precheck.planos.regiones import contrastar

        res = contrastar(_regiones(con_acera=False), {})
        self.assertIsNone(res["medidas"]["retiro_posterior_m"])
        self.assertTrue(any("frente" in n for n in res["notas"]))

    def test_region_de_retiro_posterior_fija_el_fondo(self):
        from precheck.planos.regiones import contrastar

        regs = _regiones(con_acera=False)
        regs["regiones"].append(_region("retiro_posterior", _rect(0, 0, 20, 3), origen="humano"))
        res = contrastar(regs, {})
        self.assertAlmostEqual(res["medidas"]["retiro_posterior_m"], 3.0, places=1)

    def test_confirmadas_dan_mas_confianza_pero_menos_del_umbral(self):
        from precheck.planos.regiones import contrastar

        res = contrastar(_regiones(confirmada=True), {})
        self.assertEqual(res["confianza"]["conteo.lote"], 0.8)

    def test_lo_derivado_de_una_huella_automatica_es_evidencia_debil(self):
        """Bella Vista: la huella por ambientes rotulados deja fuera el estacionamiento techado (ocupación 18.4 → 5.8 %).
        Sin confirmar, ocupación, área de huella y retiros llevan confianza ≤ 0.5 y el detalle; el lote no."""
        from precheck.planos.regiones import CONFIANZA_HUELLA_AUTOMATICA, contrastar
        from precheck.planos.revisar import hechos_de_regiones

        res = contrastar(_regiones(), _declarado(ocupacion_pct=60.0))
        for c in ("ocupacion_pct", "area_huella_m2", "retiro_posterior_m", "retiro_frontal_m"):
            self.assertLessEqual(res["confianza"][c], CONFIANZA_HUELLA_AUTOMATICA, c)
            self.assertIn("ambientes rotulados", res["detalles"][c])
        self.assertEqual(res["confianza"]["area_lote_m2"], 0.7)
        d = next(d for d in res["discrepancias"] if d["dato"] == "proyecto.ocupacion_pct")
        self.assertLessEqual(d["confianza"], 0.5)
        self.assertIn("puede faltar área techada", d["mensaje"])
        h = hechos_de_regiones(res)
        self.assertEqual(h["plano"]["regiones"]["ocupacion_pct"]["confianza"], 0.5)
        self.assertIn("sin rótulo", h["plano"]["regiones"]["ocupacion_pct"]["detalle"])
        self.assertNotIn("detalle", h["plano"]["regiones"]["area_lote_m2"])
        # Confirmada (o editada) por la persona, la huella vuelve a valer como las demás regiones.
        regs = _regiones()
        for r in regs["regiones"]:
            if r["tipo"] == "huella":
                r["confirmada"] = True
        res = contrastar(regs, {})
        self.assertEqual(res["confianza"]["ocupacion_pct"], 0.7)   # el mínimo con el lote (vectorial, sin confirmar)
        self.assertEqual(res["detalles"], {})


@unittest.skipUnless(pymupdf, "requiere pymupdf")
class TestCli(_Carpeta):
    def test_proponer_y_resumen(self):
        from precheck.planos.regiones import main

        pdf = _plano(self.dir / "p.pdf")
        out = self.dir / "out"
        salida = io.StringIO()
        with contextlib.redirect_stdout(salida):
            self.assertEqual(main(["proponer", "--pdf", str(pdf), "--salida", str(out)]), 0)
        self.assertIn("estacionamiento 4", salida.getvalue())
        lt = self.dir / "lote.json"
        lt.write_text(json.dumps(_declarado(estacionamientos=9)), encoding="utf-8")
        salida = io.StringIO()
        with contextlib.redirect_stdout(salida):
            self.assertEqual(main(["resumen", "--regiones", str(out / "regiones.json"), "--lote", str(lt)]), 0)
        res = json.loads(salida.getvalue())
        self.assertEqual(res["conteos"]["estacionamiento"], 4)
        self.assertEqual(res["discrepancias"][0]["dato"], "proyecto.estacionamientos")

    def test_proponer_con_vision_por_el_cli_simulado(self):
        """El CLI real de Claude se reemplaza por un script que responde como `claude -p --output-format json`."""
        from precheck.planos.regiones import main

        script = self.dir / "claude_falso.py"
        script.write_text(
            "import json, sys\n"
            "prompt = sys.stdin.read()\n"
            "assert '-p' in sys.argv and '--output-format' in sys.argv and 'Read' in sys.argv\n"
            f"respuesta = {json.dumps(json.dumps(RESPUESTA))}\n"
            "print(json.dumps({'type': 'result', 'is_error': False, 'result': respuesta}))\n", encoding="utf-8")
        out = self.dir / "out"
        with mock.patch.dict(os.environ, {"PRECHECK_CLAUDE_BIN": f'"{sys.executable}" "{script}"'}), \
                contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(main(["proponer", "--pdf", str(_plano(self.dir / "p.pdf")), "--salida", str(out), "--vision"]), 0)
        doc = json.loads((out / "regiones.json").read_text(encoding="utf-8"))
        self.assertEqual({r["tipo"] for r in doc["regiones"] if r["origen"] == "vision"}, {"tinaquera"})

    def test_proponer_con_vision_deepseek_simulado(self):
        """DeepSeek se reemplaza por un servidor local: nunca se llama a la API real ni se lee la llave real."""
        from precheck.planos.regiones import main

        with _DeepSeekFalso(RESPUESTA) as ds, ds.entorno(self.dir), contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(main(["proponer", "--pdf", str(_plano(self.dir / "p.pdf")), "--salida", str(self.dir / "out"),
                                   "--vision", "--modelo", "deepseek-flash", "--gasto", str(self.dir / "ia")]), 0)
        self.assertEqual(len(ds.pedidos), 1)
        pedido = ds.pedidos[0]
        self.assertEqual(pedido["autorizacion"], "Bearer sk-prueba-0123456789")
        cuerpo = pedido["cuerpo"]
        self.assertEqual((cuerpo["model"], cuerpo["temperature"], cuerpo["response_format"]),
                         ("deepseek-flash", 0, {"type": "json_object"}))
        texto, imagen = cuerpo["messages"][0]["content"]
        self.assertNotIn("herramienta Read", texto["text"])
        self.assertIn("Mira la imagen adjunta (hoja 1", texto["text"])
        self.assertTrue(imagen["image_url"]["url"].startswith("data:image/png;base64,iVBOR"))
        doc = json.loads((self.dir / "out" / "regiones.json").read_text(encoding="utf-8"))
        self.assertEqual({r["tipo"] for r in doc["regiones"] if r["origen"] == "vision"}, {"tinaquera"})
        gasto = json.loads((self.dir / "ia" / "deepseek_gasto.json").read_text(encoding="utf-8"))
        self.assertEqual(gasto, {"usd": 0.00054, "llamadas": 1, "tokens_entrada": 1000, "tokens_salida": 200})

    def test_deepseek_con_el_tope_alcanzado_no_llama(self):
        from precheck.planos.regiones import main

        (self.dir / "ia").mkdir()
        (self.dir / "ia" / "deepseek_gasto.json").write_text(json.dumps({"usd": 60.0, "llamadas": 9}), encoding="utf-8")
        with _DeepSeekFalso(RESPUESTA) as ds, ds.entorno(self.dir), contextlib.redirect_stdout(io.StringIO()), \
                contextlib.redirect_stderr(io.StringIO()) as err:
            self.assertEqual(main(["proponer", "--pdf", str(_plano(self.dir / "p.pdf")), "--salida", str(self.dir / "out"),
                                   "--vision", "--modelo", "deepseek-flash", "--gasto", str(self.dir / "ia")]), 0)
        self.assertEqual(ds.pedidos, [])
        self.assertIn("Tope de gasto de DeepSeek alcanzado (60.00 de 60 USD)", err.getvalue())

    def test_deepseek_sin_llave_o_con_error_avisa_y_sigue(self):
        from precheck.planos.regiones import llamar_deepseek

        img = self.dir / "hoja1.png"
        img.write_bytes(b"\x89PNG")
        prompt = f"Lee con la herramienta Read la imagen {img}: es un TROZO de la hoja 1."
        with _DeepSeekFalso(RESPUESTA, codigo=500) as ds, ds.entorno(self.dir):
            with mock.patch.dict(os.environ, {"DEEPSEEK_API_KEY": ""}), self.assertRaisesRegex(RuntimeError, "No hay llave"):
                llamar_deepseek(prompt, self.dir, gasto=self.dir / "ia")
            with self.assertRaisesRegex(RuntimeError, "DeepSeek respondió 500"):
                llamar_deepseek(prompt, self.dir, gasto=self.dir / "ia")
            with self.assertRaisesRegex(RuntimeError, "no está en la carpeta"):
                llamar_deepseek(prompt, self.dir / "otra", gasto=self.dir / "ia")
        self.assertEqual(len(ds.pedidos), 1)
        self.assertIn("Mira la imagen adjunta: es un TROZO", ds.pedidos[0]["cuerpo"]["messages"][0]["content"][0]["text"])
        self.assertFalse((self.dir / "ia" / "deepseek_gasto.json").exists())

    def test_pdf_inexistente_sale_con_error(self):
        from precheck.planos.regiones import main

        with contextlib.redirect_stderr(io.StringIO()) as err:
            self.assertEqual(main(["proponer", "--pdf", str(self.dir / "no.pdf"), "--salida", str(self.dir / "o")]), 1)
        self.assertIn("No se pudieron proponer", err.getvalue())


EXTRACCION = {
    "documento": "A-101.pdf",
    "hechos": [{"hecho": "lote.area_m2", "valor": 600.0, "confianza": 0.95, "estado": "ok", "fuente": {"pagina": 1}}],
}


class TestRevisarConRegiones(_Carpeta):
    def _revisar(self, carpeta, regiones=None, crudo=None):
        from precheck.planos.revisar import revisar

        carpeta.mkdir()
        ext, lt = carpeta / "extraccion.json", carpeta / "lote.json"
        ext.write_text(json.dumps(EXTRACCION), encoding="utf-8")
        complemento = {"lote": {"norma_aplicable": {"valor": "PLOT-A61-2021", "confianza": 0.95},
                                "codigo_zona": {"valor": "1ZM6", "confianza": 0.95}},
                       **_declarado(estacionamientos=6, retiro_posterior_m=5.0)}
        lt.write_text(json.dumps(complemento), encoding="utf-8")
        if regiones is not None:
            (carpeta / "regiones.json").write_text(json.dumps(regiones), encoding="utf-8")
        if crudo is not None:
            (carpeta / "regiones.json").write_text(crudo, encoding="utf-8")
        return revisar(None, str(ext), str(lt), str(carpeta), "2026-09-01", reglas=self.reglas)

    @classmethod
    def setUpClass(cls):
        from precheck.planos.revisar import cargar_reglas

        cls.reglas = cargar_reglas()

    def test_las_regiones_no_cambian_el_resultado_de_ninguna_regla(self):
        sin = self._revisar(self.dir / "sin")
        con = self._revisar(self.dir / "con", _regiones())
        self.assertFalse((self.dir / "sin" / "regiones_resumen.json").exists())
        self.assertEqual(sin["resumen"], con["resumen"])
        self.assertEqual([(r["regla_id"], r["resultado"]) for r in sin["resultados"]],
                         [(r["regla_id"], r["resultado"]) for r in con["resultados"]])

    def test_agrega_hechos_de_regiones_con_confianza_menor_que_el_umbral_y_el_resumen(self):
        res = self._revisar(self.dir / "c", _regiones())
        hechos = json.loads((self.dir / "c" / "hechos.json").read_text(encoding="utf-8"))
        reg = hechos["plano"]["regiones"]
        self.assertEqual(reg["conteo"]["estacionamiento"]["valor"], ESTACIONAMIENTOS)
        self.assertTrue(reg["presente"]["huella"]["valor"])
        self.assertAlmostEqual(reg["retiro_posterior_m"]["valor"], 3.0, places=1)

        def confianzas(n):
            if isinstance(n, dict) and "valor" in n:
                yield n["confianza"]
            elif isinstance(n, dict):
                for v in n.values():
                    yield from confianzas(v)

        self.assertTrue(all(c < 0.85 for c in confianzas(reg)))
        self.assertEqual(hechos["proyecto"]["estacionamientos"]["valor"], 6)   # lo declarado no se toca
        resumen = json.loads((self.dir / "c" / "regiones_resumen.json").read_text(encoding="utf-8"))
        self.assertEqual({d["dato"] for d in resumen["discrepancias"]}, {"proyecto.estacionamientos", "proyecto.retiro_posterior_m"})
        self.assertTrue(any(a.startswith("REGIONES_DISCREPANTES") for a in res["avisos"]))

    def test_regiones_danadas_no_impiden_la_revision(self):
        sin = self._revisar(self.dir / "sin")
        con = self._revisar(self.dir / "mal", crudo="{no es json")
        self.assertEqual(sin["resumen"], con["resumen"])
        self.assertTrue(any("regiones.json" in a for a in con["avisos"]))


if __name__ == "__main__":
    unittest.main()
