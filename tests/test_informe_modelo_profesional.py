"""T6 — modelo de la versión del profesional (AC-08, AC-09, AC-10, AC-11, AC-19, AC-23)."""
import json
import unittest

from precheck.informe.modelo import Encabezado, proyectar
from tests.apoyo_informe import Bitacora, estado_reglas, resultado, valor

SIN_CEUS_TEXTO = "zona tomada del Documento Gráfico sin certificación de uso de suelo"
ZONA = {"lote.codigo_zona": valor("1ZM6", 0.97, metodo="gis", documento="hoja 5-6G")}
VIGENCIA_PLOT = {"desde": "2021-09-15", "hasta": None}
CLAVES_PROFESIONAL = {"version", "formato_informe", "expediente", "evaluacion", "encabezado", "estado",
                      "aviso_no_vigente", "observaciones", "cumplimientos", "alcance", "cobertura",
                      "normas_consultadas", "version_motor", "nota_preliminar"}


def contenido(r, tipo="cuantitativa", condicion=None, entradas=(), unidad=None, vigencia=None):
    return {"id": r["regla_id"], "version": r["version"], "tipo": tipo, "condicion": condicion,
            "entradas": list(entradas), "unidad": unidad, "severidad": r["severidad"],
            "vigencia": vigencia or VIGENCIA_PLOT,
            "fuente": {"norma": r["fuente_norma"], "articulo": r["articulo"], "cita_textual": r["cita_textual"]}}


def escenario():
    """Expediente con un resultado de cada clase; motivos «MOTIVO-SECRETO-*» que nunca deben salir."""
    frente = resultado("PLOT-ZM6-LOTE-FRENTE", "NO_CUMPLE",
                       valores={"lote.frente_m": valor(15.2, 0.95, metodo="declarado", hoja="A-101")})
    altura = resultado("PLOT-ZM6-ALTURA", "REQUIERE_REVISION", estado="borrador", indicativo="NO_CUMPLE",
                       valores={}, motivo="regla de criterio: requiere juicio del revisor",
                       cita="la altura deberá armonizar con el entorno")
    acera = resultado("PLOT-ZM6-ACERA", "NO_CUMPLE", severidad="observacion",
                      valores={"proyecto.acera_ancho_m": valor(2.5, pagina=4), **ZONA}, advertencias=["sin CEUS"])
    estac = resultado("PLOT-ZM6-ESTAC", "REQUIERE_REVISION", valores={},
                      motivo="dato faltante: proyecto.estacionamientos")
    densidad = resultado("PLOT-ZM6-DENSIDAD", "CUMPLE")
    ocupacion = resultado("PLOT-ZM6-OCUPACION", "REQUIERE_REVISION", estado="borrador", indicativo="NO_CUMPLE",
                          motivo="regla en borrador: resultado no oficial (condición evaluada)")
    retiro = resultado("PLOT-ZM6-RETIRO", "NO_CUMPLE", valores={"lote.retiro_m": valor(2.0)})
    noaplica = resultado("A110-PDC-ACERA-ANCHO", "NO_APLICA", estado="borrador", valores={})
    res = [frente, altura, acera, estac, densidad, ocupacion, retiro, noaplica]
    contenidos = {r["hash_contenido"]: contenido(r) for r in res}
    contenidos[frente["hash_contenido"]] = contenido(frente, condicion="lote.frente_m >= 16",
                                                     entradas=["lote.frente_m"], unidad="m")
    contenidos[altura["hash_contenido"]] = contenido(altura, tipo="criterio")
    contenidos[acera["hash_contenido"]] = contenido(acera, condicion="proyecto.acera_ancho_m >= 3",
                                                    entradas=["proyecto.acera_ancho_m"], unidad="m")
    contenidos[estac["hash_contenido"]] = contenido(estac, condicion="proyecto.estacionamientos >= 10",
                                                    entradas=["proyecto.estacionamientos"])
    return res, contenidos


def _textos(x):
    if isinstance(x, str):
        yield x
    elif isinstance(x, dict):
        for v in x.values():
            yield from _textos(v)
    elif isinstance(x, list):
        for v in x:
            yield from _textos(v)


class TestModeloProfesional(unittest.TestCase):
    def setUp(self):
        self.res, self.contenidos = escenario()
        b = self.b = Bitacora()
        self.ev = b.evaluar(self.res, normas_sin_reglas=["MIVIOT"])
        b.decidir(self.ev, "PLOT-ZM6-LOTE-FRENTE", "confirmar", "MOTIVO-SECRETO-1")
        b.decidir(self.ev, "PLOT-ZM6-ALTURA", "veredicto", "MOTIVO-SECRETO-2", veredicto="NO_CUMPLE")
        b.decidir(self.ev, "PLOT-ZM6-ESTAC", "veredicto", "MOTIVO-SECRETO-3", veredicto="NO_CUMPLE")
        b.decidir(self.ev, "PLOT-ZM6-OCUPACION", "veredicto", "MOTIVO-SECRETO-4", veredicto="CUMPLE")
        b.decidir(self.ev, "PLOT-ZM6-RETIRO", "descartar", "MOTIVO-SECRETO-5")
        b.decidir(self.ev, "norma:MIVIOT", "veredicto", "MOTIVO-SECRETO-6", veredicto="NO_CUMPLE")
        b.visto_bueno(self.ev, confirmar_sin_ceus=True)
        for clave in ("PLOT-ZM6-LOTE-FRENTE", "PLOT-ZM6-ALTURA", "PLOT-ZM6-ACERA", "PLOT-ZM6-ESTAC",
                      "norma:MIVIOT"):
            b.indicar(self.ev, clave, f"Qué hacer con {clave}.")
        self.m = self.modelo()

    def modelo(self, version="profesional", encabezado=None):
        return proyectar(self.b.eventos, estado_reglas(self.res), self.ev, version, encabezado,
                         contenidos=self.contenidos)

    def obs(self):
        return {o["clave"]: o for o in self.m["observaciones"]}

    def test_claves_sin_resultados_por_regla(self):
        self.assertEqual(set(self.m), CLAVES_PROFESIONAL)
        self.assertEqual(self.m["estado"]["estado"], "revisado")

    def test_observacion_dice_que_donde_por_que_y_que_hacer(self):
        # AC-08
        o = self.obs()
        self.assertEqual(set(o), {"PLOT-ZM6-LOTE-FRENTE", "PLOT-ZM6-ALTURA", "PLOT-ZM6-ACERA", "PLOT-ZM6-ESTAC",
                                  "norma:MIVIOT"})
        frente = o["PLOT-ZM6-LOTE-FRENTE"]
        self.assertEqual(frente["que"], "valor declarado: 15.2 m; límite de la norma: mínimo 16 m")
        self.assertEqual(frente["donde"], "hoja A-101")
        self.assertEqual(frente["por_que"], {"cita": "cita literal de PLOT-ZM6-LOTE-FRENTE",
                                             "norma": "PLOT, Acuerdo 61 de 2021", "articulo": "10"})
        self.assertEqual(frente["que_hacer"], "Qué hacer con PLOT-ZM6-LOTE-FRENTE.")
        self.assertEqual(o["PLOT-ZM6-ESTAC"]["que"], "falta el dato estacionamientos")
        self.assertEqual(o["PLOT-ZM6-ESTAC"]["donde"], "ubicación no consta en los datos declarados")
        altura = o["PLOT-ZM6-ALTURA"]["que"]
        self.assertIn("la altura deberá armonizar con el entorno", altura)
        self.assertNotIn("límite", altura)
        self.assertEqual(o["PLOT-ZM6-ACERA"]["donde"], "página 4")

    def test_limite_en_lenguaje_llano_segun_el_operador(self):
        # AC-08: el profesional nunca ve nombres internos de datos ni expresiones de la regla
        frente = self.res[0]
        casos = (("lote.frente_m >= 16", "m", "mínimo 16 m"), ("lote.frente_m <= 40", "pisos", "máximo 40 pisos"),
                 ("lote.frente_m > 1.20", None, "mayor que 1.20"), ("lote.frente_m < 3", "%", "menor que 3 %"),
                 ("lote.frente_m == 2", "m", "igual a 2 m"))
        for condicion, unidad, esperado in casos:
            with self.subTest(condicion=condicion):
                self.contenidos[frente["hash_contenido"]] = contenido(
                    frente, condicion=condicion, entradas=["lote.frente_m"], unidad=unidad)
                que = self.obs_de(self.modelo())["PLOT-ZM6-LOTE-FRENTE"]["que"]
                self.assertTrue(que.endswith(f"límite de la norma: {esperado}"), que)

    def test_condicion_compuesta_se_cita_literal(self):
        frente = self.res[0]
        self.contenidos[frente["hash_contenido"]] = contenido(
            frente, condicion="lote.frente_m >= 0.5 * lote.fondo_m", entradas=["lote.frente_m"], unidad="m")
        que = self.obs_de(self.modelo())["PLOT-ZM6-LOTE-FRENTE"]["que"]
        self.assertEqual(que, "valor declarado: 15.2 m; según la norma: «cita literal de PLOT-ZM6-LOTE-FRENTE»")

    def test_ninguna_observacion_muestra_nombres_internos_de_datos(self):
        for o in self.m["observaciones"]:
            for texto in _textos(o):
                with self.subTest(clave=o["clave"], texto=texto):
                    self.assertNotRegex(texto, r"\b(lote|proyecto|expediente)\.")
                    self.assertNotRegex(texto, r"\b[a-z_]+\.[a-z_]+\b")
                    self.assertNotRegex(texto, r"[<>]=?|==")

    def obs_de(self, m):
        return {o["clave"]: o for o in m["observaciones"]}

    def test_bloqueantes_primero_por_severidad_de_la_regla(self):
        sev = [x["severidad"] for x in self.m["observaciones"]]
        self.assertEqual(sev, sorted(sev, key=lambda s: s != "bloqueante"))
        self.assertEqual(self.m["observaciones"][-1]["clave"], "PLOT-ZM6-ACERA")
        self.assertEqual(self.obs()["PLOT-ZM6-ALTURA"]["severidad"], "bloqueante")

    def test_nada_sin_respaldo_ni_motivos(self):
        # AC-09 y AC-08 (ningún motivo de decisión)
        texto = json.dumps(self.m, ensure_ascii=False)
        for prohibido in ("MOTIVO-SECRETO", "NO_APLICA", "no oficial", "indicativo", "A110-PDC-ACERA-ANCHO",
                          "regla en borrador", "requiere juicio", "motivo"):
            self.assertNotIn(prohibido, texto)
        self.assertNotIn("resultados", self.m)
        self.assertEqual(self.m["cumplimientos"], [
            {"norma": "PLOT-A61-2021", "tema": "DENSIDAD", "cantidad": 1},
            {"norma": "PLOT-A61-2021", "tema": "OCUPACION", "cantidad": 1}])

    def test_regla_no_aprobada_sin_veredicto_desfavorable_no_es_observacion(self):
        self.assertNotIn("PLOT-ZM6-OCUPACION", self.obs())
        self.assertNotIn("PLOT-ZM6-RETIRO", self.obs())

    def test_observacion_que_depende_de_la_zona_sin_ceus(self):
        # AC-10
        o = self.obs()
        self.assertEqual(o["PLOT-ZM6-ACERA"]["zona_sin_ceus"], SIN_CEUS_TEXTO)
        self.assertIsNone(o["PLOT-ZM6-LOTE-FRENTE"]["zona_sin_ceus"])

    def test_primera_pagina(self):
        # AC-11, en las dos versiones
        for version in ("profesional", "revisor"):
            with self.subTest(version=version):
                m = self.modelo(version, Encabezado(tramite="RDP", finca="070819"))
                nota = " ".join(m["nota_preliminar"])
                self.assertIn("No constituye registro de plano, autorización ni permiso", nota)
                self.assertIn("Acuerdo Municipal N°110 de 2025", nota)
                self.assertIn("no es la lista de observaciones del dictamen", nota)
                self.assertIn("el dictamen puede incluir otras", nota)
                self.assertIn("se verifica con la DOYC", nota)
                self.assertEqual((m["encabezado"]["tramite"], m["encabezado"]["finca"], m["encabezado"]["proyecto"]),
                                 ("RDP", "070819", "no consta"))
                self.assertEqual(m["version_motor"], "1.0.0")
                self.assertEqual(m["normas_consultadas"], [
                    {"codigo": "MIVIOT", "norma": "Normas del MIVIOT para zonas exceptuadas (sin reglas cargadas)",
                     "vigencia": "no consta"},
                    {"codigo": "PLOT-A61-2021", "norma": "PLOT, Acuerdo 61 de 2021", "vigencia": VIGENCIA_PLOT}])
                self.assertNotIn("aprobado", json.dumps(m, ensure_ascii=False).lower())

    def test_alcance(self):
        # AC-19
        a = self.m["alcance"]
        self.assertEqual(a["normas_con_reglas_aprobadas"], ["PLOT-A61-2021"])
        self.assertEqual(a["reglas_no_evaluadas"], 2)
        self.assertEqual(a["normas_decididas_a_mano"], ["MIVIOT"])
        self.assertTrue(a["zona_sin_ceus"])
        # AC-19 precisada (M7): los veredictos favorables, solo como conteo por norma y tema (AC-09); los
        # descartes, uno por uno; ambos dicen si había dato declarado
        self.assertEqual(a["veredictos_favorables"], [
            {"norma": "PLOT-A61-2021", "tema": "OCUPACION", "cantidad": 1, "sin_dato_declarado": 0}])
        self.assertEqual(a["descartados"], [
            {"clave": "PLOT-ZM6-RETIRO", "norma": "PLOT-A61-2021", "dato_declarado": True}])
        self.assertNotIn("PLOT-ZM6-OCUPACION", json.dumps(a), "un veredicto favorable no se detalla por regla")
        self.assertNotIn("criterio_del_revisor", a)
        self.assertIn("no declara que el proyecto cumpla", a["declaracion"])

    def test_veredicto_favorable_sin_dato_declarado_se_cuenta_aparte(self):
        res = [resultado("PLOT-ZM6-ESTAC", "REQUIERE_REVISION", valores={}),
               resultado("PLOT-ZM6-OCUPACION", "REQUIERE_REVISION", estado="borrador")]
        b = Bitacora()
        seq = b.evaluar(res, ceus="1ZM6")
        for r in res:
            b.decidir(seq, r["regla_id"], "veredicto", "m", veredicto="CUMPLE")
        b.visto_bueno(seq)
        m = proyectar(b.eventos, estado_reglas(res), seq, "profesional", None,
                      contenidos={r["hash_contenido"]: contenido(r) for r in res})
        self.assertEqual(m["alcance"]["veredictos_favorables"], [
            {"norma": "PLOT-A61-2021", "tema": "ESTAC", "cantidad": 1, "sin_dato_declarado": 1},
            {"norma": "PLOT-A61-2021", "tema": "OCUPACION", "cantidad": 1, "sin_dato_declarado": 0}])

    def test_alcance_sale_siempre_sin_cumple_global(self):
        # AC-19: revisado, sin observaciones ni limitaciones
        res = [resultado("PLOT-ZM6-DENSIDAD", "CUMPLE")]
        b = Bitacora()
        seq = b.evaluar(res, ceus="1ZM6")
        b.visto_bueno(seq)
        m = proyectar(b.eventos, estado_reglas(res), seq, "profesional", None,
                      contenidos={res[0]["hash_contenido"]: contenido(res[0])})
        self.assertEqual(m["observaciones"], [])
        a = m["alcance"]
        self.assertEqual((a["reglas_no_evaluadas"], a["normas_decididas_a_mano"], a["zona_sin_ceus"],
                          a["veredictos_favorables"], a["descartados"]), (0, [], False, [], []))
        self.assertIn("no declara que el proyecto cumpla", a["declaracion"])
        self.assertTrue(all("global" not in k for k in m) and all("global" not in k for k in a))
        self.assertNotIn("el proyecto cumple", json.dumps(m, ensure_ascii=False).lower())

    def test_norma_sin_reglas_desfavorable(self):
        # AC-23
        o = self.obs()["norma:MIVIOT"]
        self.assertEqual(o["rotulo"], "norma sin reglas cargadas: decisión del revisor")
        self.assertIsNone(o["por_que"]["cita"])
        self.assertIn("MIVIOT", o["por_que"]["texto"])
        self.assertIn("el sistema no tiene su texto", o["por_que"]["texto"])
        self.assertEqual(o["que_hacer"], "Qué hacer con norma:MIVIOT.")

    def test_observacion_sin_indicacion_se_reporta(self):
        # AC-23 / AC-18: la indicación es obligatoria; `proyectar` devuelve las que faltan
        res, _ = escenario()
        b = Bitacora()
        seq = b.evaluar(res, normas_sin_reglas=["MIVIOT"])
        b.decidir(seq, "norma:MIVIOT", "veredicto", "m", veredicto="NO_CUMPLE")
        m = proyectar(b.eventos, estado_reglas(res), seq, "profesional", None, contenidos=self.contenidos)
        self.assertIn("norma:MIVIOT", m["estado"]["faltantes"]["indicaciones"])
        self.assertIsNone(next(o for o in m["observaciones"] if o["clave"] == "norma:MIVIOT")["que_hacer"])


if __name__ == "__main__":
    unittest.main()
