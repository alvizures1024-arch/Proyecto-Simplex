-- MySQL 8.0+: ejecutar una sola vez en la base simplexlab existente.
-- Un único ALTER TABLE conserva registros, tipos, clave primaria y AUTO_INCREMENT.
ALTER TABLE problems
    RENAME TO problemas,
    RENAME COLUMN id TO identificador,
    RENAME COLUMN mode TO modo,
    RENAME COLUMN status TO estado,
    RENAME COLUMN problem TO problema,
    RENAME COLUMN result TO resultado,
    RENAME COLUMN created_at TO fecha_creacion;
