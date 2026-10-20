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
