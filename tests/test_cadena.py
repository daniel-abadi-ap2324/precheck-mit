"""T2 — canónico JSON y cadena de eventos (AC-19: detectar alteración, inserción y eliminación)."""
import dataclasses
import unittest

from precheck.auditoria import canonico
from precheck.auditoria.cadena import EventoNuevo, cabeza, encadenar, verificar


def nuevo(i):
    return EventoNuevo(tipo="evaluacion", actor="P-1", rol="revisor_doyc",
                       ocurrido_en=f"2026-09-27T00:00:0{i}Z", payload={"n": i, "r": "CUMPLE"})


def cadena_de(n, cadena_id="expediente:E1"):
    eventos = []
    for i in range(1, n + 1):
        eventos.append(encadenar(cadena_id, eventos[-1] if eventos else None, nuevo(i)))
    return eventos


class TestCanonico(unittest.TestCase):
    def test_claves_reordenadas_dan_el_mismo_hash(self):
        self.assertEqual(canonico.calcular("", {"a": 1, "b": "ñ"}), canonico.calcular("", {"b": "ñ", "a": 1}))

    def test_compatible_con_verificar_cadena(self):
        from precheck.auditoria import verificar_cadena
        self.assertEqual(canonico.calcular("x", {"k": [1, 2]}), verificar_cadena.calcular("x", {"k": [1, 2]}))


class TestCadena(unittest.TestCase):
    def test_encadena_con_seq_y_hash_previo(self):
        e = cadena_de(3)
        self.assertEqual([x.seq for x in e], [1, 2, 3])
        self.assertEqual(e[0].hash_previo, "")
        self.assertEqual(e[2].hash_previo, e[1].hash)
        self.assertEqual(len(e[2].hash), 64)

    def test_hash_cubre_tipo_actor_y_fecha(self):
        a = encadenar("c", None, nuevo(1))
        b = encadenar("c", None, dataclasses.replace(nuevo(1), actor="P-2"))
        self.assertNotEqual(a.hash, b.hash)

    def test_mismo_evento_en_dos_cadenas_da_hashes_distintos(self):
        a, b = encadenar("expediente:E1", None, nuevo(1)), encadenar("expediente:E2", None, nuevo(1))
        self.assertNotEqual(a.hash, b.hash)
        movido = dataclasses.replace(a, cadena_id="expediente:E2")
        self.assertEqual(verificar([movido]), (False, 1))

    def test_cadena_integra(self):
        self.assertEqual(verificar(cadena_de(4)), (True, None))
        self.assertEqual(verificar([]), (True, None))

    def test_detecta_payload_alterado(self):
        e = cadena_de(3)
        e[1] = dataclasses.replace(e[1], payload={"n": 2, "r": "NO_CUMPLE"})
        self.assertEqual(verificar(e), (False, 2))

    def test_detecta_evento_eliminado(self):
        e = cadena_de(4)
        del e[1]
        self.assertEqual(verificar(e), (False, 3))

    def test_detecta_evento_insertado(self):
        e = cadena_de(3)
        falso = encadenar("expediente:E1", e[0], nuevo(9))
        e.insert(1, falso)
        self.assertFalse(verificar(e)[0])

    def test_cabeza(self):
        e = cadena_de(2)
        self.assertEqual(cabeza(e), e[-1].hash)
        self.assertEqual(cabeza([]), "")


if __name__ == "__main__":
    unittest.main()
