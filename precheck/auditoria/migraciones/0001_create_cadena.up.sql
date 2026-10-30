-- Raíz del agregado: una cadena por expediente más la cadena única de reglas (ADR-0003).
CREATE TABLE IF NOT EXISTS cadena (
    id         TEXT NOT NULL PRIMARY KEY,               -- 'reglas' | 'expediente:<expediente_id>'
    tipo       TEXT NOT NULL CHECK (tipo IN ('reglas', 'expediente')),
    creada_en  TEXT NOT NULL,                           -- ISO 8601 UTC
    CHECK ((tipo = 'reglas' AND id = 'reglas') OR (tipo = 'expediente' AND id LIKE 'expediente:_%'))
) STRICT;

CREATE TRIGGER IF NOT EXISTS cadena_sin_update BEFORE UPDATE ON cadena
BEGIN SELECT RAISE(ABORT, 'bitácora de solo anexar: cadena no se modifica'); END;

CREATE TRIGGER IF NOT EXISTS cadena_sin_delete BEFORE DELETE ON cadena
BEGIN SELECT RAISE(ABORT, 'bitácora de solo anexar: cadena no se borra'); END;

-- Bootstrap: la cadena de reglas existe desde el inicio (fecha fija, determinista).
INSERT INTO cadena (id, tipo, creada_en) VALUES ('reglas', 'reglas', '2026-01-01T00:00:00Z')
ON CONFLICT (id) DO NOTHING;
