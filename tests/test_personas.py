"""T5 — errores y registro de personas (AC-10: sin autoaprobación; AC-11: solo aprobadores designados)."""
import unittest

from precheck.auditoria.cadena import EventoNuevo, encadenar
from precheck.errores import CODIGOS, ErrorGobierno, ErrorPreCheck
from precheck.personas.registro import exigir_rol, puede_aprobar, registro_de_personas


def cadena(*eventos):
    """eventos: (tipo, actor, payload)."""
    res = []
    for tipo, actor, payload in eventos:
        res.append(encadenar("reglas", res[-1] if res else None,
                             EventoNuevo(tipo, actor, "x", "2026-09-27T00:00:00Z", payload)))
    return res


GENESIS = ("designacion_genesis", "P-1", {"personas": [{"persona_id": "P-1", "nombre": "Test User", "cuenta": "cuenta1"},
                                                       {"persona_id": "P-9", "nombre": "Test User 9", "cuenta": "cuenta9"}]})


class TestErrores(unittest.TestCase):
    def test_error_lleva_codigo_mensaje_y_detalles(self):
        e = ErrorGobierno("gobierno.auto_aprobacion", persona="P-1")
        self.assertIsInstance(e, ErrorPreCheck)
        self.assertEqual(e.codigo, "gobierno.auto_aprobacion")
        self.assertEqual(e.mensaje, "Nadie puede aprobar una regla que redactó.")
        self.assertEqual(e.detalles, {"persona": "P-1"})

    def test_codigos_del_contrato(self):
        import pathlib
        # Cada feature declara sus códigos en su propio contrato CLI.
        features = pathlib.Path(__file__).resolve().parent.parent / "docs/features"
        cli = "\n".join((features / f / "contracts/cli.md").read_text(encoding="utf-8")
                        for f in ("motor-reglas-auditable", "informe-precheck"))
        for codigo in CODIGOS:
            with self.subTest(codigo=codigo):
                self.assertIn(f"| `{codigo}` |", cli)


class TestRegistro(unittest.TestCase):
    def test_genesis_es_aprobador_y_vincula_su_cuenta(self):
        r = registro_de_personas(cadena(GENESIS))
        self.assertEqual(r.persona_de_cuenta("cuenta1"), "P-1")
        self.assertIn("aprobador", r.roles("P-1"))

    def test_vinculo_y_designacion_confirmados_por_segunda_persona(self):
        r = registro_de_personas(cadena(
            GENESIS,
            ("vinculo_propuesto", "P-1", {"persona_id": "P-2", "nombre": "Test User 2", "cuenta": "cuenta2"}),
            ("vinculo_confirmado", "P-2", {"propuesta_seq": 2, "cuenta": "cuenta2"}),
            ("designacion_propuesta", "P-1", {"persona_id": "P-2", "rol": "redactor", "motivo": "m"}),
            ("designacion_confirmada", "P-9", {"propuesta_seq": 4}),
        ))
        self.assertEqual(r.persona_de_cuenta("cuenta2"), "P-2")
        self.assertEqual(r.roles("P-2"), {"redactor"})

    def test_propuesta_sin_confirmar_no_otorga_nada(self):
        r = registro_de_personas(cadena(
            GENESIS, ("designacion_propuesta", "P-1", {"persona_id": "P-1", "rol": "redactor", "motivo": "m"})))
        self.assertNotIn("redactor", r.roles("P-1"))

    def test_confirmacion_del_mismo_proponente_se_ignora(self):
        r = registro_de_personas(cadena(
            GENESIS,
            ("designacion_propuesta", "P-1", {"persona_id": "P-1", "rol": "redactor", "motivo": "m"}),
            ("designacion_confirmada", "P-1", {"propuesta_seq": 2})))
        self.assertNotIn("redactor", r.roles("P-1"))

    def test_autoaprobacion_se_compara_por_persona(self):
        # AC-10: la persona P-1 redactó con una cuenta e intenta aprobar con otra: misma persona
        r = registro_de_personas(cadena(GENESIS))
        with self.assertRaises(ErrorGobierno) as cm:
            puede_aprobar(r, "P-1", redactada_por="P-1")
        self.assertEqual(cm.exception.codigo, "gobierno.auto_aprobacion")

    def test_sin_designacion_no_aprueba(self):
        # AC-11
        r = registro_de_personas(cadena(
            GENESIS,
            ("vinculo_propuesto", "P-1", {"persona_id": "P-2", "nombre": "Test User 2", "cuenta": "cuenta2"}),
            ("vinculo_confirmado", "P-2", {"propuesta_seq": 2})))
        with self.assertRaises(ErrorGobierno) as cm:
            puede_aprobar(r, "P-2", redactada_por="P-1")
        self.assertEqual(cm.exception.codigo, "gobierno.sin_designacion")

    def test_exigir_rol(self):
        r = registro_de_personas(cadena(GENESIS))
        with self.assertRaises(ErrorPreCheck) as cm:
            exigir_rol(r, "P-1", "revisor_doyc")
        self.assertEqual(cm.exception.codigo, "identidad.sin_rol")

    def test_cuenta_no_vinculada(self):
        r = registro_de_personas(cadena(GENESIS))
        with self.assertRaises(ErrorPreCheck) as cm:
            r.exigir_persona("desconocida")
        self.assertEqual(cm.exception.codigo, "identidad.cuenta_no_vinculada")


if __name__ == "__main__":
    unittest.main()


class TestResolutorCuentaSO(unittest.TestCase):
    def test_no_se_deja_suplantar_por_variables_de_entorno(self):
        # review A1: getpass.getuser() lee LOGNAME/USER antes que el sistema
        import os
        import sys
        from unittest import mock

        from precheck.personas.registro import ResolutorCuentaSO
        if sys.platform == "win32":      # Windows: sin pwd; la cuenta real sale de GetUserNameW
            real = ResolutorCuentaSO().cuenta_actual()
        else:
            import pwd
            real = pwd.getpwuid(os.geteuid()).pw_name
        with mock.patch.dict(os.environ, {"LOGNAME": "cuenta-suplantada", "USER": "cuenta-suplantada",
                                          "LNAME": "cuenta-suplantada", "USERNAME": "cuenta-suplantada"}):
            self.assertEqual(ResolutorCuentaSO().cuenta_actual(), real)
