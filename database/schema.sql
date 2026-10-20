-- Ejecutar con un usuario que pueda crear bases de datos.
CREATE DATABASE IF NOT EXISTS simplexlab CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE simplexlab;

CREATE TABLE IF NOT EXISTS problemas (
    id INT NOT NULL AUTO_INCREMENT,
    modo VARCHAR(3) NOT NULL,
    estado VARCHAR(16) NOT NULL,
    problema JSON NOT NULL,
    resultado JSON NOT NULL,
    fecha_creacion DATETIME NOT NULL,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Las fechas son UTC. problema contiene obj, cons y max.
-- resultado contiene status, logs, count y, si existe óptimo, z y sol.
-- El usuario de aplicación se crea mediante Docker o manualmente según README.md.

-- Tablas nuevas: no altera ni elimina los problemas existentes.
CREATE TABLE IF NOT EXISTS usuarios (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    correo VARCHAR(254) NOT NULL UNIQUE,
    contrasena_hash VARCHAR(255) NOT NULL,
    fecha_creacion DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sesiones (
    token_hash VARCHAR(64) NOT NULL PRIMARY KEY,
    usuario_id INT NOT NULL,
    fecha_expiracion DATETIME NOT NULL,
    fecha_creacion DATETIME NOT NULL,
    INDEX ix_sesiones_usuario_id (usuario_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sesiones_revocadas (
    token_hash VARCHAR(64) NOT NULL PRIMARY KEY,
    fecha_creacion DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
