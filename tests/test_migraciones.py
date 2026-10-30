"""T1 — migraciones de la bitácora (AC-19: la base rechaza alterar la cadena)."""
import hashlib
import json
import sqlite3
import unittest

from precheck.auditoria import migrar


def _hash(previo, payload):
    canon = json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256((previo + canon).encode("utf-8")).hexdigest()


class TestMigraciones(unittest.TestCase):
    def setUp(self):
        self.con = sqlite3.connect(":memory:")
        migrar.aplicar(self.con)

    def tearDown(self):
        self.con.close()

    def test_aplica_todas_y_registra_version(self):
        self.assertEqual(self.con.execute("PRAGMA user_version").fetchone()[0], len(migrar.migraciones()))
        tablas = {r[0] for r in self.con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        self.assertTrue({"cadena", "evento", "contenido_regla", "uso_regla"} <= tablas)

    def test_reaplicar_no_hace_nada(self):
        migrar.aplicar(self.con)
        self.assertEqual(self.con.execute("SELECT count(*) FROM cadena").fetchone()[0], 1)

    def test_activa_claves_foraneas(self):
        self.assertEqual(self.con.execute("PRAGMA foreign_keys").fetchone()[0], 1)

    def _genesis(self):
        h = _hash("", {"a": 1})
        self.con.execute("INSERT INTO evento VALUES ('reglas',1,'designacion_genesis','P-1','aprobador',"
                         "'2026-09-27T00:00:00Z',?, '', ?)", (json.dumps({"a": 1}), h))
        return h

    def test_rechaza_salto_de_secuencia_y_hash_previo_ajeno(self):
        h1 = self._genesis()
        with self.assertRaises(sqlite3.DatabaseError):
            self.con.execute("INSERT INTO evento VALUES ('reglas',3,'x','P','r','t','{}',?,?)", (h1, "b" * 64))
        with self.assertRaises(sqlite3.DatabaseError):
            self.con.execute("INSERT INTO evento VALUES ('reglas',2,'x','P','r','t','{}',?,?)", ("c" * 64, "d" * 64))

    def test_rechaza_modificar_y_borrar(self):
        self._genesis()
        for sql in ("UPDATE evento SET payload='{}'", "DELETE FROM evento", "DELETE FROM cadena",
                    "UPDATE cadena SET creada_en='x'"):
            with self.subTest(sql=sql), self.assertRaises(sqlite3.DatabaseError):
                self.con.execute(sql)

    def test_revertir_deja_la_base_vacia(self):
        migrar.revertir(self.con)
        self.assertEqual(self.con.execute("SELECT count(*) FROM sqlite_master").fetchone()[0], 0)
        self.assertEqual(self.con.execute("PRAGMA user_version").fetchone()[0], 0)


if __name__ == "__main__":
    unittest.main()
