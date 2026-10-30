"""T10 — verificar por archivo y por código, y listar emitidos (AC-12, AC-13, AC-14, AC-15).

Contra la bitácora real (SQLite descartable) y el catálogo real de reglas.
Datos ficticios: EXP-TEST-*, P-000*, Test User *.
"""
import json
import re
import time
import unittest

from tests.apoyo import version_vigente
import warnings

from precheck.errores import ErrorPreCheck
from precheck.informe import html
from precheck.informe import huella as hu
from precheck.informe import servicio as inf
from precheck.informe.modelo import FORMATO_INFORME, Encabezado
from precheck.reglas import servicio as reglas
from tests.test_informe_emitir import CADENA, EXP, FRENTE, BaseInforme

EXP2 = "EXP-TEST-0951"
AVISO_CODIGO = "El código prueba que la emisión existe, no que la copia esté íntegra."


def sin_encabezado(modelo):
    return {k: v for k, v in modelo.items() if k != "encabezado"}


class BaseVerificar(BaseInforme):
    def setUp(self):
        super().setUp()
        self.revisar()
        self.enc = Encabezado(tramite="RDP", finca="FINCA-070819", profesional="Test User 9")
        self.em = inf.emitir(self.rev(), EXP, self.ev.seq, self.enc)


class TestVerificarArchivo(BaseVerificar):
    def test_documento_original_coincide_con_su_emision(self):
        # AC-12 por archivo
        v = inf.verificar_informe(self.rev(), self.em.informe.documento)
        self.assertIsInstance(v, inf.VerificacionInforme)
        self.assertEqual((v.resultado, v.trazabilidad_coincide, v.regenerado), ("coincide", True, None))
        (e,) = v.emisiones
        self.assertEqual((e.expediente_id, e.evaluacion, e.seq, e.emitido_por, e.emitido_en, e.vigencia),
                         (EXP, self.ev.seq, self.em.evento.seq, "P-0004", self.em.evento.ocurrido_en, "vigente"))
        self.assertIn(f"{EXP}: {self.em.evento.seq}", v.aviso)

    def test_forma_estructurada_y_bytes_coinciden_con_la_misma_emision(self):
        for contenido in (self.em.informe.estructurada, self.em.informe.documento.encode("utf-8")):
            with self.subTest(tipo=type(contenido).__name__):
                v = inf.verificar_informe(self.rev(), contenido)
                self.assertEqual((v.resultado, v.trazabilidad_coincide), ("coincide", True))
                self.assertEqual([e.seq for e in v.emisiones], [self.em.evento.seq])

    def test_busca_en_todas_las_cadenas_y_dice_el_expediente(self):
        otra = self.evaluar(EXP2)
        self.revisar(otra, expediente=EXP2)
        em2 = inf.emitir(self.rev(), EXP2, otra.seq)
        v = inf.verificar_informe(self.rev(), em2.informe.documento)
        self.assertEqual([(e.expediente_id, e.seq) for e in v.emisiones], [(EXP2, em2.evento.seq)])

    def test_misma_huella_emitida_dos_veces_lista_ambas(self):
        otra = inf.emitir(self.rev("cuenta-0005"), EXP, self.ev.seq, self.enc)
        v = inf.verificar_informe(self.rev(), self.em.informe.documento)
        self.assertEqual([e.seq for e in v.emisiones], [self.em.evento.seq, otra.evento.seq])
        self.assertEqual({e.vigencia for e in v.emisiones}, {"vigente"})

    def test_emision_reemplazada_coincide_e_informa_la_vigencia(self):
        nueva = self.evaluar()
        v = inf.verificar_informe(self.rev(), self.em.informe.documento)
        self.assertEqual(v.resultado, "coincide")
        self.assertEqual((v.emisiones[0].vigencia, v.emisiones[0].reemplazado_por), ("reemplazado", nueva.seq))
        self.assertIn("ninguna emisión vigente", v.aviso)

    def test_texto_visible_editado_con_modelo_intacto_no_coincide(self):
        # AC-13
        doc = self.em.informe.documento
        editado = doc.replace("Amplíe el frente del lote.", "Amplíe el fondo del lote.", 1)
        self.assertNotEqual(editado, doc)
        v = inf.verificar_informe(self.rev(), editado)
        self.assertEqual((v.resultado, v.emisiones), ("no_coincide", ()))

    def test_modelo_embebido_editado_no_coincide(self):
        datos = json.loads(self.em.informe.estructurada)
        datos["modelo"]["observaciones"][0]["que_hacer"] = "Nada que hacer."
        v = inf.verificar_informe(self.rev(), json.dumps(datos, ensure_ascii=False))
        self.assertEqual((v.resultado, v.emisiones), ("no_coincide", ()))

    def test_version_del_revisor_nunca_emitida_no_coincide(self):
        rev = inf.informe_revisor(self.rev(), EXP, self.ev.seq)
        self.assertEqual(inf.verificar_informe(self.rev(), rev.documento).resultado, "no_coincide")

    def test_archivo_que_no_es_del_sistema(self):
        for contenido in ("<html><body>Informe convertido</body></html>", "texto plano", b"%PDF-1.7\xff\xfe",
                          '{"tipo": "otro"}'):
            with self.subTest(contenido=contenido[:12]):
                self.assertEqual(self.rechazo(inf.verificar_informe, self.rev(), contenido).codigo,
                                 "informe.archivo_no_verificable")

    def test_trazabilidad_editada_coincide_pero_avisa(self):
        doc = self.em.informe.documento
        for viejo, nuevo in (("Test User 0004", "Test User 0005"), (self.em.evento.ocurrido_en, "2020-01-01T00:00:00Z")):
            with self.subTest(campo=viejo):
                self.assertIn(viejo, doc)
                v = inf.verificar_informe(self.rev(), doc.replace(viejo, nuevo))
                self.assertEqual((v.resultado, v.trazabilidad_coincide), ("coincide", False))
                self.assertEqual([e.seq for e in v.emisiones], [self.em.evento.seq])

    def test_formato_alterado_sin_emision_no_coincide(self):
        # M5: un archivo cuyo formato se alteró no corresponde a ninguna emisión: «no coincide», no «no verificable»
        datos = json.loads(self.em.informe.estructurada)
        datos["modelo"]["formato_informe"] = "0.9.0"
        v = inf.verificar_informe(self.rev(), json.dumps(datos))
        self.assertEqual((v.resultado, v.emisiones), ("no_coincide", ()))

    def test_emision_registrada_de_otro_formato_no_es_verificable_con_esta_version(self):
        modelo = dict(self.em.informe.modelo, formato_informe="0.9.0")
        huella = hu.huella(modelo)
        p = {**self.em.evento.payload, "formato_informe": "0.9.0", "huella": huella}
        self.rev().anexar(CADENA, "informe_emitido", "P-0004", "revisor_doyc", p)
        v = inf.verificar_informe(self.rev(), html.estructurada(modelo))
        self.assertEqual(v.resultado, "no_verificable_version")
        self.assertIsNone(v.trazabilidad_coincide)
        self.assertEqual([e.formato_informe for e in v.emisiones], ["0.9.0"])
        self.assertIn("0.9.0", v.aviso)

    def test_emision_1_1_0_sigue_verificable_con_sus_etiquetas_originales(self):
        # Las etiquetas legibles llegaron con el formato 1.2.0: un documento 1.1.0 se regenera con las de entonces.
        modelo = dict(self.em.informe.modelo, formato_informe="1.1.0")
        huella = hu.huella(modelo)
        p = {**self.em.evento.payload, "formato_informe": "1.1.0", "huella": huella}
        ev = self.rev().anexar(CADENA, "informe_emitido", "P-0004", "revisor_doyc", p)
        traz = inf.trazabilidad(self.rev().registro(), ev)
        doc = html.render(modelo, huella, traz)
        self.assertIn("Fecha presentacion", html.texto_visible(doc))
        v = inf.verificar_informe(self.rev(), doc)
        self.assertEqual((v.resultado, v.trazabilidad_coincide), ("coincide", True))

    def test_verificar_no_escribe_y_es_rapido(self):
        antes = {c: len(self.eventos(c)) for c in self.e.repo.cadenas()}
        inicio = time.perf_counter()
        inf.verificar_informe(self.rev(), self.em.informe.documento)
        duracion = time.perf_counter() - inicio
        if duracion > 1:           # disparador interno de sad §7: aviso, no fallo
            warnings.warn(f"verificar por archivo tardó {duracion:.2f} s: considerar un índice por huella", stacklevel=2)
        self.assertEqual({c: len(self.eventos(c)) for c in self.e.repo.cadenas()}, antes)


class TestManipulaciones(BaseVerificar):
    """A1: el documento se compara completo contra su render; cualquier cambio de presentación es una alteración."""

    def manipulaciones(self):
        doc = self.em.informe.documento
        celdas = re.compile(r"<td>([^<]+)</td><td>([^<]+)</td>")
        return {
            "bloque_style": doc.replace("</style>", "section:nth-of-type(4){display:none}</style>", 1),
            "atributo_hidden": doc.replace("<section><h2>Observaciones", "<section hidden><h2>Observaciones", 1),
            "style_en_nota": doc.replace('<section class="nota">', '<section class="nota" style="display:none">', 1),
            "trazabilidad_falsa": doc.replace(
                "<main>", f"<main><div {html.MARCA_TRAZABILIDAD}><h2>APROBADO: CUMPLE TODA LA NORMA</h2></div>", 1),
            "script_ejecutable": doc.replace("</head>", "<script>document.body.innerHTML='APROBADO'</script></head>", 1),
            "imagen_externa": doc.replace("</main>", "<img src='https://evil.example/x.png'></main>", 1),
            "texto_movido_entre_celdas": celdas.sub(r"<td>\1 \2</td><td></td>", doc, count=1),
            "formato_alterado": re.sub(r'"formato_informe":"[^"]+"', '"formato_informe":"9.9.9"', doc, count=1),
            "clave_extra_en_el_sobre": doc.replace('"tipo":"precheck-informe"',
                                                   '"extra":"APROBADO","tipo":"precheck-informe"', 1),
        }

    def test_cada_manipulacion_no_coincide(self):
        for nombre, alterado in self.manipulaciones().items():
            with self.subTest(manipulacion=nombre):
                self.assertNotEqual(alterado, self.em.informe.documento)
                try:
                    v = inf.verificar_informe(self.rev(), alterado)
                except ErrorPreCheck as e:
                    self.assertEqual(e.codigo, "informe.archivo_no_verificable")
                    continue
                self.assertEqual((v.resultado, v.emisiones), ("no_coincide", ()))

    def test_clave_extra_en_la_forma_estructurada_no_es_del_sistema(self):
        datos = json.loads(self.em.informe.estructurada)
        datos["extra"] = "APROBADO"
        self.assertEqual(self.rechazo(inf.verificar_informe, self.rev(), json.dumps(datos)).codigo,
                         "informe.archivo_no_verificable")

    def test_solo_se_toleran_crlf_y_el_salto_final(self):
        doc = self.em.informe.documento
        for nombre, variante in (("crlf", doc.replace("\n", "\r\n")), ("sin_salto_final", doc.rstrip("\n")),
                                 ("bytes_crlf", doc.replace("\n", "\r\n").encode("utf-8"))):
            with self.subTest(variante=nombre):
                v = inf.verificar_informe(self.rev(), variante)
                self.assertEqual((v.resultado, v.trazabilidad_coincide), ("coincide", True))
        self.assertEqual(inf.verificar_informe(self.rev(), doc.replace("<main>", "<main> ", 1)).resultado,
                         "no_coincide")

    def test_se_tolera_un_bom_inicial_en_ambas_formas(self):
        # N3 (re-revisión): un BOM UTF-8 inicial (que agregan algunos editores) no es una alteración
        doc, est = self.em.informe.documento, self.em.informe.estructurada
        bom = "\ufeff"
        for nombre, variante in (("html", bom + doc), ("html_bytes", (bom + doc).encode("utf-8")),
                                 ("json", bom + est), ("json_bytes", (bom + est).encode("utf-8")),
                                 ("html_bom_crlf", bom + doc.replace("\n", "\r\n"))):
            with self.subTest(variante=nombre):
                v = inf.verificar_informe(self.rev(), variante)
                self.assertEqual((v.resultado, v.trazabilidad_coincide), ("coincide", True))
        self.assertEqual(inf.verificar_informe(self.rev(), bom + bom + doc).resultado, "no_coincide",
                         "solo se tolera un BOM")


class TestVerificarCodigo(BaseVerificar):
    def test_codigo_completo_regenera_sin_encabezado_y_avisa(self):
        # AC-12 por código
        v = inf.verificar_codigo(self.rev(), EXP, self.em.codigo)
        self.assertEqual((v.resultado, v.trazabilidad_coincide), ("coincide", None))
        self.assertTrue(v.aviso.startswith(AVISO_CODIGO), v.aviso)
        self.assertIn(f"Emisión vigente — {EXP}: {self.em.evento.seq}.", v.aviso)       # B1
        self.assertEqual([e.seq for e in v.emisiones], [self.em.evento.seq])
        reg = v.regenerado
        self.assertEqual((reg.version, reg.expediente_id, reg.evaluacion), ("profesional", EXP, self.ev.seq))
        self.assertEqual(sin_encabezado(reg.modelo), sin_encabezado(self.em.informe.modelo))
        enc = reg.modelo["encabezado"]
        self.assertEqual({enc[c] for c in hu.CAMPOS_ENCABEZADO}, {"no conservado"})
        self.assertEqual(enc["huella_encabezado"], hu.huella_encabezado(self.enc))
        self.assertNotIn("FINCA-070819", reg.documento)
        self.assertIn("no conservado", reg.documento)
        # M3: imprime el código de la emisión, con la marca visible de contenido regenerado
        self.assertEqual(reg.huella, self.em.informe.huella)
        pie = re.search(r'<footer class="pie">(.*?)</footer>', reg.documento, re.S).group(1)
        self.assertIn(self.em.codigo, pie)
        self.assertIn("Contenido regenerado para comparación — encabezado no conservado",
                      html.texto_visible(reg.documento))

    def test_aviso_por_codigo_dice_la_emision_vigente_cuando_fue_sustituida(self):
        inf.indicar(self.rev(), EXP, self.ev.seq, FRENTE, "Amplíe el frente a 16 m.")
        nueva = inf.emitir(self.rev(), EXP, self.ev.seq, self.enc)
        v = inf.verificar_codigo(self.rev(), EXP, self.em.codigo)
        self.assertEqual(v.emisiones[0].vigencia, "sustituida")
        self.assertIn(f"Emisión vigente — {EXP}: {nueva.evento.seq}.", v.aviso)

    def test_prefijo_de_16_con_espacios_y_guiones(self):
        codigo = "-".join(self.em.codigo.split(" ")[:4]).upper()
        v = inf.verificar_codigo(self.rev(), EXP, codigo)
        self.assertEqual((v.resultado, [e.seq for e in v.emisiones]), ("coincide", [self.em.evento.seq]))

    def test_codigo_corto(self):
        self.assertEqual(self.rechazo(inf.verificar_codigo, self.rev(), EXP, self.em.informe.huella[:15]).codigo,
                         "informe.codigo_corto")

    def test_codigo_de_otro_expediente_o_inexistente_no_coincide(self):
        self.evaluar(EXP2)
        for expediente, codigo in ((EXP2, self.em.codigo), (EXP, "0" * 64)):
            with self.subTest(expediente=expediente):
                v = inf.verificar_codigo(self.rev(), expediente, codigo)
                self.assertEqual((v.resultado, v.emisiones, v.regenerado), ("no_coincide", (), None))

    def test_regenera_con_corte_temporal(self):
        inf.indicar(self.rev(), EXP, self.ev.seq, FRENTE, "Indicación posterior a la emisión.")
        reglas.retirar(self.e.como("cuenta-0001"), "PLOT-ZM6-DENSIDAD", version_vigente("PLOT-ZM6-DENSIDAD"), "retiro posterior")
        v = inf.verificar_codigo(self.rev(), EXP, self.em.codigo)
        self.assertEqual(sin_encabezado(v.regenerado.modelo), sin_encabezado(self.em.informe.modelo))
        self.assertNotIn("Indicación posterior", v.regenerado.documento)
        self.assertEqual([a.referencia for a in v.emisiones[0].afectaciones], [f"PLOT-ZM6-DENSIDAD v{version_vigente('PLOT-ZM6-DENSIDAD')}"])
        con_original = inf.regenerar(self.rev(), EXP, self.eventos(), self.em.evento, self.enc)
        self.assertEqual(hu.huella(con_original), self.em.informe.huella)

    def test_regenerar_es_reproducible(self):
        huellas = {inf.verificar_codigo(self.rev(), EXP, self.em.codigo).regenerado.huella for _ in range(3)}
        self.assertEqual(len(huellas), 1)

    def test_emision_1_1_0_se_regenera_por_codigo_en_su_formato(self):
        huella = hu.huella(dict(self.em.informe.modelo, formato_informe="1.1.0"))
        p = {**self.em.evento.payload, "formato_informe": "1.1.0", "huella": huella}
        self.rev().anexar(CADENA, "informe_emitido", "P-0004", "revisor_doyc", p)
        v = inf.verificar_codigo(self.rev(), EXP, huella[:16])
        self.assertEqual(v.resultado, "coincide")
        self.assertEqual(v.regenerado.modelo["formato_informe"], "1.1.0")
        self.assertIn("Fecha presentacion", html.texto_visible(v.regenerado.documento))

    def test_emision_de_otro_formato_no_se_regenera(self):
        p = {**self.em.evento.payload, "formato_informe": "0.9.0", "huella": "ab" * 32}
        self.rev().anexar(CADENA, "informe_emitido", "P-0004", "revisor_doyc", p)
        v = inf.verificar_codigo(self.rev(), EXP, "ab" * 8)
        self.assertEqual((v.resultado, v.regenerado), ("no_verificable_version", None))
        self.assertEqual(v.emisiones[0].formato_informe, "0.9.0")
        self.assertIn("0.9.0", v.aviso)


class TestEmitidos(BaseVerificar):
    def test_lista_la_emision_vigente(self):
        (e,) = inf.emitidos(self.rev(), EXP)
        self.assertEqual((e.seq, e.huella, e.vigencia, e.afectaciones, e.formato_informe),
                         (self.em.evento.seq, self.em.informe.huella, "vigente", (), FORMATO_INFORME))
        self.assertEqual(inf.emitidos(self.rev(), "EXP-TEST-SIN-NADA"), ())

    def test_retiro_y_suspension_posteriores_marcan_afectado_sin_alterar(self):
        # AC-14
        payload = dict(self.em.evento.payload)
        ret = reglas.retirar(self.e.como("cuenta-0001"), FRENTE, version_vigente(FRENTE), "retiro posterior").evento
        prop = reglas.proponer_suspension(self.e.como("cuenta-0001"), "PLOT-A61-2021", "nulidad")
        susp = reglas.confirmar(self.e.como("cuenta-0002"), prop.seq).evento
        lev = reglas.proponer_levantamiento(self.e.como("cuenta-0002"), "PLOT-A61-2021", "desestimada")
        levc = reglas.confirmar(self.e.como("cuenta-0001"), lev.seq).evento
        (e,) = inf.emitidos(self.rev(), EXP)
        self.assertEqual([(a.tipo, a.referencia, a.desde, a.hasta) for a in e.afectaciones], [
            ("retiro", f"{FRENTE} v{version_vigente(FRENTE)}", ret.ocurrido_en, None),
            ("suspension", "PLOT-A61-2021", susp.ocurrido_en, levc.ocurrido_en)])
        guardado = next(x for x in self.eventos() if x.seq == self.em.evento.seq)
        self.assertEqual((guardado.payload, guardado.hash), (payload, self.em.evento.hash))

    def test_reemplazado_sustituida_y_misma_huella(self):
        # AC-15
        misma = inf.emitir(self.rev(), EXP, self.ev.seq, self.enc)
        inf.indicar(self.rev(), EXP, self.ev.seq, FRENTE, "Amplíe el frente a 16 m.")
        distinta = inf.emitir(self.rev(), EXP, self.ev.seq, self.enc)
        estados = {e.seq: e for e in inf.emitidos(self.rev(), EXP)}
        self.assertEqual((estados[self.em.evento.seq].vigencia, estados[self.em.evento.seq].sustituida_por),
                         ("sustituida", distinta.evento.seq))
        self.assertEqual(estados[misma.evento.seq].vigencia, "sustituida")
        self.assertEqual(estados[distinta.evento.seq].vigencia, "vigente")
        nueva = self.evaluar()
        self.assertEqual({(e.vigencia, e.reemplazado_por) for e in inf.emitidos(self.rev(), EXP)},
                         {("reemplazado", nueva.seq)})

    def test_misma_huella_no_marca_nada(self):
        inf.emitir(self.rev(), EXP, self.ev.seq, self.enc)
        self.assertEqual({e.vigencia for e in inf.emitidos(self.rev(), EXP)}, {"vigente"})


class TestAutorizacion(BaseVerificar):
    def test_sin_rol_no_verifica_ni_lista(self):
        for cuenta, codigo in (("cuenta-0003", "identidad.sin_rol"), ("cuenta-9999", "identidad.cuenta_no_vinculada")):
            ctx = self.rev(cuenta)
            for fn, args in ((inf.verificar_informe, (self.em.informe.documento,)),
                             (inf.verificar_codigo, (EXP, self.em.codigo)), (inf.emitidos, (EXP,))):
                with self.subTest(cuenta=cuenta, fn=fn.__name__):
                    self.assertEqual(self.rechazo(fn, ctx, *args).codigo, codigo)


if __name__ == "__main__":
    unittest.main()
