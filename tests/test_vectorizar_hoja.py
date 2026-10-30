"""Pruebas del vectorizador de hojas del Documento Gráfico (precheck/gis/vectorizar_hoja.py).

Necesitan pymupdf y shapely (entorno de desarrollo); sin ellos se omiten.
"""
import importlib.util
import pathlib
import sys
import unittest

TIENE_DEPENDENCIAS = all(importlib.util.find_spec(m) for m in ("pymupdf", "shapely"))
RAIZ = pathlib.Path(__file__).resolve().parent.parent

if TIENE_DEPENDENCIAS:
    import pymupdf
    from shapely.geometry import LineString

    sys.path.insert(0, str(RAIZ / "precheck" / "gis"))
    import vectorizar_hoja as v

ROJO, AZUL = (1, 0, 0), (0, 0.44, 1)


def hoja_sintetica():
    """Marco relleno; un límite rojo que termina 0,2 pt antes del marco y lo parte en dos zonas (1R3 con un
    EOT encima, y 1ZM6); y un río azul que cruza ambas zonas."""
    doc = pymupdf.open()
    p = doc.new_page(width=600, height=400)
    p.draw_rect(pymupdf.Rect(50, 50, 550, 350), color=None, fill=(0.9, 0.9, 0.9))
    p.draw_line((300, 50.2), (300, 349.8), color=ROJO, width=1)
    p.draw_line((50.2, 300), (549.8, 300), color=AZUL, width=1)
    p.insert_text((140, 200), "1R3", fontsize=10)
    p.insert_text((140, 240), "EOT", fontsize=10)
    p.insert_text((440, 200), "1ZM6", fontsize=10)
    return doc, p


def hoja_con(trazos, textos):
    """Hoja con marco relleno (50, 50, 550, 350), trazos [(color, puntos)] y rótulos [(texto, x, y)]."""
    doc = pymupdf.open()
    p = doc.new_page(width=600, height=400)
    p.draw_rect(pymupdf.Rect(50, 50, 550, 350), color=None, fill=(0.9, 0.9, 0.9))
    for color, puntos in trazos:
        p.draw_polyline(puntos, color=color, width=1)
    for texto, x, y in textos:
        p.insert_text((x, y), texto, fontsize=10)
    return doc, p


def color_elegido(doc_pagina):
    _, p = doc_pagina
    marco = v.marco_mapa(p)
    return v.detectar_color(p, marco, v.rotulos(p, marco))


@unittest.skipUnless(TIENE_DEPENDENCIAS, "requiere pymupdf y shapely")
class PruebasVectorizarHoja(unittest.TestCase):
    def test_cierra_contra_el_marco_los_limites_recortados(self):
        marco = pymupdf.Rect(50, 50, 550, 350)
        extra = v.cierres_al_marco([LineString([(300, 50.2), (300, 349.8)])], marco)
        self.assertEqual(sorted(tuple(map(tuple, s.coords)) for s in extra),
                         [((300.0, 50.2), (300.0, 50.0)), ((300.0, 349.8), (300.0, 350.0))])
        # Un extremo lejos del marco no se toca.
        self.assertEqual(v.cierres_al_marco([LineString([(300, 60), (300, 340)])], marco), [])

    def test_elige_el_rojo_aunque_un_eot_caiga_dentro_de_la_zona(self):
        _, p = hoja_sintetica()
        marco = v.marco_mapa(p)
        etiquetas = v.rotulos(p, marco)
        self.assertEqual(v.detectar_color(p, marco, etiquetas), [(1.0, 0.0, 0.0)])
        caras, asignados = v.caras_y_asignacion(p, marco, [(1.0, 0.0, 0.0)], etiquetas)
        self.assertEqual(len(caras), 2)
        self.assertEqual(sorted(sorted(c) for c in asignados.values()), [["1R3", "EOT"], ["1ZM6"]])

    def test_los_eot_no_cuentan_al_elegir_el_color(self):
        # Rojo: dos zonas, cada una con su código y un EOT encima. Azul: separa los códigos de los EOT.
        # Si los EOT contaran, el rojo tendría dos conflictos y ganaría el azul.
        hoja = hoja_con(
            [(ROJO, [(300, 49), (300, 351)]), (AZUL, [(49, 220), (551, 220)])],
            [("1R3", 140, 150), ("1ZM6", 440, 150), ("EOT", 140, 280), ("EOT", 440, 280)],
        )
        self.assertEqual(color_elegido(hoja), [(1.0, 0.0, 0.0)])

    def test_ante_empate_gana_el_rojo_aunque_el_azul_tenga_mas_trazos(self):
        # Un solo rótulo: rojo y azul dejan una zona con código cada uno. El río tiene más segmentos.
        rio = [(49 + 10 * i, 220 + (i % 2) * 4) for i in range(51)] + [(551, 220)]
        hoja = hoja_con([(ROJO, [(300, 49), (300, 351)]), (AZUL, rio)], [("1R3", 140, 150)])
        self.assertEqual(color_elegido(hoja), [(1.0, 0.0, 0.0)])

    def test_una_hoja_con_dos_rojos_usa_ambos_y_no_suma_los_rios(self):
        # Hoja con dos ediciones (como 5-5E): mitad izquierda con rojo 1.0 y mitad derecha con rojo 0.9, más un río.
        hoja = hoja_con(
            [
                (ROJO, [(300, 49), (300, 351)]),
                (ROJO, [(49, 200), (300, 200)]),
                ((0.9, 0, 0), [(300, 200), (551, 200)]),
                (AZUL, [(425, 49), (425, 351)]),
            ],
            [("1R3", 140, 120), ("1ZM6", 140, 280), ("1R2", 360, 120), ("1R4", 360, 280)],
        )
        _, p = hoja
        marco = v.marco_mapa(p)
        colores = color_elegido(hoja)
        self.assertEqual(sorted(colores), [(0.9, 0.0, 0.0), (1.0, 0.0, 0.0)])
        caras, asignados = v.caras_y_asignacion(p, marco, colores, v.rotulos(p, marco))
        self.assertEqual(len(caras), 4)
        self.assertEqual(sorted(c for cods in asignados.values() for c in cods), ["1R2", "1R3", "1R4", "1ZM6"])


if __name__ == "__main__":
    unittest.main()
