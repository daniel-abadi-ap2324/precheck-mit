-- Contenido de cada versión de regla, una sola vez, direccionado por su hash (ADR-0004, dedup).
CREATE TABLE IF NOT EXISTS contenido_regla (
    hash           TEXT    NOT NULL PRIMARY KEY CHECK (length(hash) = 64),  -- sha256(canónico(contenido))
    regla_id       TEXT    NOT NULL,
    version        INTEGER NOT NULL CHECK (version >= 1),
    contenido      TEXT    NOT NULL CHECK (json_valid(contenido)),
    registrado_en  TEXT    NOT NULL,
    UNIQUE (regla_id, version)
) STRICT;

CREATE TRIGGER IF NOT EXISTS contenido_regla_sin_update BEFORE UPDATE ON contenido_regla
BEGIN SELECT RAISE(ABORT, 'contenido de regla inmutable'); END;

CREATE TRIGGER IF NOT EXISTS contenido_regla_sin_delete BEFORE DELETE ON contenido_regla
BEGIN SELECT RAISE(ABORT, 'contenido de regla inmutable'); END;
