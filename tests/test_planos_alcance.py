"""Reglas vigentes (precheck/planos/alcance.py): ficha de alcance, alcance que fija la IA con su fuente y lista cerrada."""
import json
import pathlib
import tempfile
import unittest

import pymupdf

from precheck.planos import alcance
from precheck.planos.revisar import cargar_reglas, revisar

REGLAS = [
    {"id": "PLOT-T-RETIRO", "titulo": "Retiro lateral", "tipo": "cuantitativa", "severidad": "bloqueante",
     "aplica_si": "lote.norma_aplicable == 'PLOT-A61-2021' and lote.codigo_zona in ['R2']",
     "entradas": ["proyecto.retiro_lateral_m"], "condicion": "proyecto.retiro_lateral_m >= 1.5",
     "vigencia": {"desde": "2021-01-01", "hasta": None}},
    {"id": "PLOT-T-ALTURA", "titulo": "Altura", "tipo": "cuantitativa", "severidad": "bloqueante",
     "aplica_si": "lote.norma_aplicable == 'PLOT-A61-2021' and lote.codigo_zona in ['R2']",
     "entradas": ["proyecto.pisos_totales"], "condicion": "proyecto.pisos_totales <= 3",
     "vigencia": {"desde": "2021-01-01", "hasta": None}},
    {"id": "PLOT-T-DENSIDAD", "titulo": "Densidad", "tipo": "cuantitativa", "severidad": "bloqueante",
     "aplica_si": "lote.norma_aplicable == 'PLOT-A61-2021' and lote.codigo_zona in ['R2'] and not existe(proyecto.resolucion_edificabilidad)",
     "entradas": ["proyecto.densidad_pers_ha"], "condicion": "proyecto.densidad_pers_ha <= 300",
     "vigencia": {"desde": "2021-01-01", "hasta": None}},
    {"id": "PLOT-T-RAMPA", "titulo": "Rampa doble", "tipo": "cuantitativa", "severidad": "bloqueante",
     "aplica_si": "lote.norma_aplicable == 'PLOT-A61-2021' and rampa.sentidos == 2",
     "entradas": ["rampa.ancho_m"], "condicion": "rampa.ancho_m >= 6",
     "vigencia": {"desde": "2021-01-01", "hasta": None}},
]


def pdf(ruta: pathlib.Path, *paginas: str) -> None:
    doc = pymupdf.open()
    for texto in paginas:
        doc.new_page().insert_text((72, 72), texto, fontsize=9)
    doc.save(ruta)
    doc.close()


def lote(norma="PLOT-A61-2021", zona="R2", **proyecto):
    h = {"lote": {"norma_aplicable": {"valor": norma, "confianza": 1, "fuente": {"metodo": "declarado"}},
                  "codigo_zona": {"valor": zona, "confianza": 1, "fuente": {"metodo": "declarado"}}},
         "expediente": {"fecha_presentacion": {"valor": "2026-09-01", "confianza": 1}}}
    if proyecto:
        h["proyecto"] = {k: {"valor": v, "confianza": 0.95} for k, v in proyecto.items()}
    return h


class Carpeta:
    """Carpeta de PreCheck en un directorio temporal: plano.pdf, un complementario y lote.json."""

    def __init__(self, ia=None, **proyecto):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = pathlib.Path(self.tmp.name)
        pdf(self.dir / "plano.pdf", "ZONIFICACION R2 RESIDENCIAL\nRETIRO LATERAL 0.00 ADOSADO", "PLANTA BAJA")
        pdf(self.dir / "complementario-1.pdf", "NOTA DPU-OT-1091-2026\nse podra aplicar la excepcion del Art. 3 de la Res. 13-91 "
                                               "adosamiento lateral por mutuo acuerdo")
        (self.dir / "documentos.json").write_text(json.dumps([{"archivo": "complementario-1.pdf", "nombre": "gp_dpu.pdf"}]), encoding="utf-8")
        (self.dir / "lote.json").write_text(json.dumps(lote(**proyecto)), encoding="utf-8")
        if ia is not None:
            (self.dir / alcance.ARCHIVO_IA).write_text(json.dumps(ia), encoding="utf-8")

    def correr(self):
        res = revisar(None, None, str(self.dir / "lote.json"), str(self.dir), reglas=REGLAS)
        lista = json.loads((self.dir / alcance.ARCHIVO_LISTA).read_text(encoding="utf-8"))
        return res, lista

    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.tmp.cleanup()


class TestFicha(unittest.TestCase):
    def test_mp_c2_esta_en_las_dos_lineas_del_metro(self):
        # El código no decide la norma por sí solo: la elige la IA con la ubicación del lote.
        candidatas = alcance.normas_candidatas(cargar_reglas(), "PLOT-A61-2021", "MP-C2")
        self.assertEqual(candidatas[0], "PLOT-A61-2021")
        self.assertIn("MIVIOT-ML1", candidatas)
        self.assertIn("MIVIOT-ML2", candidatas)

    def test_datos_de_alcance_y_solo_si_existe(self):
        claves, solo = alcance.claves_de_alcance(REGLAS, ["PLOT-A61-2021"])
        self.assertIn("rampa.sentidos", claves)
        self.assertNotIn("lote.norma_aplicable", claves)
        self.assertEqual(solo, ["proyecto.resolucion_edificabilidad"])

    def test_la_ficha_detecta_la_nota_de_la_dpu(self):
        with Carpeta() as c:
            c.correr()
            base = json.loads((c.dir / alcance.ARCHIVO_BASE).read_text(encoding="utf-8"))
        self.assertEqual(base["documentos"][0]["tipo_probable"], "nota DPU")
        self.assertEqual(base["normas_candidatas"], ["PLOT-A61-2021"])


class TestCita(unittest.TestCase):
    def test_cita_sin_tildes_ni_signos(self):
        self.assertTrue(alcance.aparece("Zonificación: R2 residencial", "ZONIFICACION R2 RESIDENCIAL"))
        self.assertFalse(alcance.aparece("R2", "ZONIFICACION R2"))   # demasiado corta para probar algo

    def test_ocr_admite_errores_de_lectura(self):
        self.assertTrue(alcance.aparece("excepcion del Art. 3 de la Res. 13-91", "la excepcon del Art 3 de la Res 13-9l y", ocr=True))
        self.assertFalse(alcance.aparece("excepcion del Art. 3 de la Res. 13-91", "la excepcon del Art 3 de la Res 13-9l y"))


class TestPaso1(unittest.TestCase):
    def test_sin_alcance_ia_todo_sigue_igual(self):
        with Carpeta(retiro_lateral_m=0.0, pisos_totales=2) as c:
            res, lista = c.correr()
        self.assertFalse(lista["alcance_ia"]["presente"])
        self.assertEqual({r["regla_id"] for r in lista["reglas"] if r["resultado"] == "NO_CUMPLE"}, {"PLOT-T-RETIRO"})

    def test_cita_inventada_no_entra_y_vuelve_como_error(self):
        ia = {"codigo_zona": {"valor": "R3", "fuente": {"documento": "plano", "pagina": 1, "cita": "ZONIFICACION R3 INVENTADA", "metodo": "lectura"}}}
        with Carpeta(ia) as c:
            res, lista = c.correr()
        self.assertEqual(res["codigo_zona"], "R2")
        self.assertTrue(any("no está en el texto" in e for e in lista["alcance_ia"]["errores"]), lista["alcance_ia"])
        self.assertTrue(any(a.startswith("ALCANCE_IA:") for a in res["avisos"]))

    def test_lectura_visual_entra_marcada_sin_verificar(self):
        ia = {"datos_de_alcance": {"rampa.sentidos": {"valor": 2, "confianza": 0.9,
                                                      "fuente": {"documento": "plano", "pagina": 2, "metodo": "vision", "detalle": "flechas en los dos sentidos"}}}}
        with Carpeta(ia, retiro_lateral_m=2.0, pisos_totales=2) as c:
            res, lista = c.correr()
            hechos = json.loads((c.dir / "hechos.json").read_text(encoding="utf-8"))
        self.assertIn("PLOT-T-RAMPA", {r["regla_id"] for r in lista["reglas"]})
        self.assertFalse(hechos["rampa"]["sentidos"]["fuente"]["cita_verificada"])
        self.assertEqual(hechos["rampa"]["sentidos"]["fuente"]["origen"], "alcance_ia")

    def test_unidad_territorial_dudosa_no_se_fija_ni_pide_retoma(self):
        dudosa = {"valor": 5, "confianza": 0.5, "fuente": {"documento": "plano", "pagina": 1, "metodo": "vision", "detalle": "UT no determinable"}}
        firme = {"valor": 5, "confianza": 0.9, "fuente": {"documento": "plano", "pagina": 1, "metodo": "vision", "detalle": "polígono de la UT 5"}}
        with Carpeta({"sf_unidad_territorial": dudosa}) as c:
            _, lista = c.correr()
            hechos = json.loads((c.dir / "hechos.json").read_text(encoding="utf-8"))
        self.assertNotIn("sf_unidad_territorial", hechos["lote"])
        self.assertEqual(lista["alcance_ia"]["errores"], [])
        self.assertTrue(lista["alcance_ia"]["no_fijados"][0].startswith("sf_unidad_territorial: 5 con confianza 0.5"))
        with Carpeta({"sf_unidad_territorial": firme}) as c:
            _, lista = c.correr()
            hechos = json.loads((c.dir / "hechos.json").read_text(encoding="utf-8"))
        self.assertEqual(hechos["lote"]["sf_unidad_territorial"]["valor"], 5)
        self.assertEqual(lista["alcance_ia"]["no_fijados"], [])

    def test_norma_no_registrada_es_error(self):
        ia = {"norma": {"valor": "INVENTADA", "fuente": {"documento": "plano", "pagina": 1, "metodo": "vision"}}}
        with Carpeta(ia) as c:
            res, lista = c.correr()
        self.assertEqual(res["norma_aplicable"], "PLOT-A61-2021")
        self.assertTrue(any("no es una norma registrada" in e for e in lista["alcance_ia"]["errores"]))

    def test_dato_que_solo_cuenta_si_existe_en_false_se_quita(self):
        # Escribir false haría que existe() diera True y la regla de densidad dejara de aplicar: se quita el dato.
        ia = {"datos_de_alcance": {"proyecto.resolucion_edificabilidad": {"valor": False, "fuente": {"documento": "plano", "pagina": 1, "metodo": "vision"}}}}
        with Carpeta(ia, densidad_pers_ha=250) as c:
            res, lista = c.correr()
        self.assertIn("PLOT-T-DENSIDAD", {r["regla_id"] for r in lista["reglas"]})

    def test_dato_que_no_decide_alcance_es_error(self):
        ia = {"datos_de_alcance": {"proyecto.retiro_lateral_m": {"valor": 2, "fuente": {"documento": "plano", "pagina": 1, "metodo": "vision"}}}}
        with Carpeta(ia) as c:
            _, lista = c.correr()
        self.assertTrue(any("paso 2" in e for e in lista["alcance_ia"]["errores"]))


class TestPermisos(unittest.TestCase):
    PERMISO = {"id": "PERM-1", "tipo": "excepcion", "documento": "gp_dpu.pdf", "pagina": 1,
               "cita_textual": "se podra aplicar la excepcion del Art. 3 de la Res. 13-91",
               "efecto": [{"regla_id": "PLOT-T-RETIRO", "accion": "exceptua", "motivo": "adosamiento con acuerdo de vecinos"},
                          {"regla_id": "PLOT-T-ALTURA", "accion": "condiciona"}],
               "propuesta_regla": {"titulo": "Res. 13-91 Art. 3: adosamiento lateral por mutuo acuerdo", "aplica_si": "…", "condicion": "…"}}

    def test_exceptua_condiciona_y_propone(self):
        with Carpeta({"permisos": [self.PERMISO]}, retiro_lateral_m=0.0, pisos_totales=2) as c:
            res, lista = c.correr()
            propuestas = json.loads((c.dir / alcance.ARCHIVO_PROPUESTAS).read_text(encoding="utf-8"))
        self.assertEqual([e["regla_id"] for e in lista["exceptuadas"]], ["PLOT-T-RETIRO"])
        self.assertIn("Res. 13-91", lista["exceptuadas"][0]["motivo"])
        altura = next(r for r in lista["reglas"] if r["regla_id"] == "PLOT-T-ALTURA")
        self.assertEqual((altura["resultado"], altura["permiso"]), ("REQUIERE_REVISION", "PERM-1"))
        self.assertTrue(lista["permisos"][0]["fuente"]["cita_verificada"])
        self.assertEqual(propuestas[0]["permiso"], "PERM-1")

    def test_permiso_con_cita_que_no_esta_es_error(self):
        malo = {**self.PERMISO, "cita_textual": "se exonera de todos los retiros"}
        with Carpeta({"permisos": [malo]}, retiro_lateral_m=0.0) as c:
            res, lista = c.correr()
        self.assertEqual(lista["exceptuadas"], [])
        self.assertTrue(any("PERM-1" in e for e in lista["alcance_ia"]["errores"]))

    def test_efecto_sobre_regla_inexistente_es_error(self):
        p = {**self.PERMISO, "efecto": [{"regla_id": "NO-EXISTE", "accion": "exceptua"}]}
        with Carpeta({"permisos": [p]}) as c:
            _, lista = c.correr()
        self.assertTrue(any("NO-EXISTE" in e for e in lista["alcance_ia"]["errores"]))


if __name__ == "__main__":
    unittest.main()
