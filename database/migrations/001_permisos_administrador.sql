-- Ejecutar con una cuenta administradora antes de la migración.
-- Autoriza únicamente el cambio de la tabla anterior; no borra registros.
GRANT ALTER, DROP ON simplexlab.problems TO 'simplex'@'localhost';
