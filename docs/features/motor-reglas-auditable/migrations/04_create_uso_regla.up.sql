-- Índice de uso de solo anexar: qué eventos de evaluación usaron cada versión (flujos 5 y 6).
-- Se escribe en la misma transacción que la evaluación y se puede reconstruir desde los eventos.
CREATE TABLE IF NOT EXISTS uso_regla (
    regla_id   TEXT    NOT NULL,
    version    INTEGER NOT NULL,
    cadena_id  TEXT    NOT NULL,
    seq        INTEGER NOT NULL,
    PRIMARY KEY (regla_id, version, cadena_id, seq),
    FOREIGN KEY (regla_id, version) REFERENCES contenido_regla (regla_id, version),
    FOREIGN KEY (cadena_id, seq)    REFERENCES evento (cadena_id, seq)
) STRICT, WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_uso_regla_evento ON uso_regla (cadena_id, seq);

CREATE TRIGGER IF NOT EXISTS uso_regla_sin_update BEFORE UPDATE ON uso_regla
BEGIN SELECT RAISE(ABORT, 'índice de uso de solo anexar'); END;

CREATE TRIGGER IF NOT EXISTS uso_regla_sin_delete BEFORE DELETE ON uso_regla
BEGIN SELECT RAISE(ABORT, 'índice de uso de solo anexar'); END;
