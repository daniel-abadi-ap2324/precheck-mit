-- Eventos encadenados. hash = sha256(hash_previo + canónico(payload)); lo calcula la aplicación.
-- La base impone la continuidad de la cadena y prohíbe modificar o borrar (ADR-0002).
CREATE TABLE IF NOT EXISTS evento (
    cadena_id    TEXT    NOT NULL REFERENCES cadena (id),
    seq          INTEGER NOT NULL CHECK (seq >= 1),
    tipo         TEXT    NOT NULL,                      -- ver data-model.md «Tipos de evento»
    actor        TEXT    NOT NULL,                      -- persona_id del registro, o 'sistema:precheck@<version>'
    rol          TEXT    NOT NULL,
    ocurrido_en  TEXT    NOT NULL,                      -- ISO 8601 UTC
    payload      TEXT    NOT NULL CHECK (json_valid(payload)),
    hash_previo  TEXT    NOT NULL,                      -- '' en el génesis de cada cadena
    hash         TEXT    NOT NULL UNIQUE CHECK (length(hash) = 64),
    PRIMARY KEY (cadena_id, seq),
    CHECK ((seq = 1) = (hash_previo = ''))
) STRICT;

CREATE TRIGGER IF NOT EXISTS evento_continuidad BEFORE INSERT ON evento
WHEN NEW.seq <> COALESCE((SELECT MAX(seq) FROM evento WHERE cadena_id = NEW.cadena_id), 0) + 1
  OR NEW.hash_previo <> COALESCE((SELECT hash FROM evento WHERE cadena_id = NEW.cadena_id AND seq = NEW.seq - 1), '')
BEGIN SELECT RAISE(ABORT, 'cadena rota: seq o hash_previo no continúan la cadena'); END;

CREATE TRIGGER IF NOT EXISTS evento_sin_update BEFORE UPDATE ON evento
BEGIN SELECT RAISE(ABORT, 'bitácora de solo anexar: evento no se modifica'); END;

CREATE TRIGGER IF NOT EXISTS evento_sin_delete BEFORE DELETE ON evento
BEGIN SELECT RAISE(ABORT, 'bitácora de solo anexar: evento no se borra'); END;
