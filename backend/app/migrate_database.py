"""Renombra el esquema existente con copia de seguridad y comprobación de datos.

Desde la raíz: .venv/Scripts/python.exe -m app.migrate_database
(con PYTHONPATH=backend), o desde backend: ../.venv/Scripts/python.exe -m app.migrate_database
"""
import json
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import inspect, text
from sqlalchemy.exc import OperationalError

from .database import engine

ROOT = Path(__file__).resolve().parents[2]
EXPECTED = {"id", "modo", "estado", "problema", "resultado", "fecha_creacion"}
INTERMEDIATE = (EXPECTED - {"id"}) | {"identificador"}


def rename_identifier(connection):
    original = [dict(row) for row in connection.execute(text(
        "SELECT * FROM problemas ORDER BY identificador"
    )).mappings()]
    backup_dir = ROOT / "database" / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    backup = backup_dir / f"problemas-{stamp}.json"
    backup.write_text(json.dumps(original, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    print(f"Copia de seguridad: {backup}")
    migration = (ROOT / "database/migrations/002_identificador_a_id.sql").read_text(encoding="utf-8")
    try:
        connection.exec_driver_sql(migration)
    except OperationalError as exc:
        if exc.orig.args[0] == 1142:
            raise RuntimeError(
                "MySQL denegó ALTER sobre problemas. Ejecuta como administrador "
                "database/migrations/002_permisos_administrador.sql y reintenta. "
                f"Los datos no se modificaron. Copia: {backup}"
            ) from None
        raise
    connection.commit()
    actual = [dict(row) for row in connection.execute(text(
        "SELECT * FROM problemas ORDER BY id"
    )).mappings()]
    expected = [{("id" if key == "identificador" else key): value
                 for key, value in row.items()} for row in original]
    if expected != actual:
        raise RuntimeError(f"La comprobación de datos no coincide. Revisa la copia {backup}.")
    print(f"Columna renombrada a id: {len(actual)} registros conservados íntegramente.")


def migrate():
    with engine.connect() as connection:
        tables = set(inspect(connection).get_table_names())
        if "problemas" in tables:
            if "problems" in tables:
                raise RuntimeError("Existen problems y problemas. Revisa ambas tablas antes de migrar.")
            columns = {c["name"] for c in inspect(connection).get_columns("problemas")}
            if columns == INTERMEDIATE:
                rename_identifier(connection)
                return
            if columns != EXPECTED:
                raise RuntimeError("La tabla problemas no tiene las columnas esperadas.")
            print("El esquema ya está en español; no se modificaron datos.")
            return
        if "problems" not in tables:
            raise RuntimeError("No existe la tabla problems que se debe migrar.")
        original = connection.execute(text("SELECT * FROM problems ORDER BY id")).mappings().all()
        original = [dict(row) for row in original]
        backup_dir = ROOT / "database" / "backups"
        backup_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        backup = backup_dir / f"problems-{stamp}.json"
        backup.write_text(json.dumps(original, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
        print(f"Copia de seguridad: {backup}")
        migration = (ROOT / "database" / "migrations" / "001_nombres_en_espanol.sql").read_text(encoding="utf-8")
        try:
            connection.exec_driver_sql(migration)
        except OperationalError as exc:
            if exc.orig.args[0] == 1142:
                raise RuntimeError(
                    "MySQL denegó el cambio de nombre. Pide a tu administrador ejecutar "
                    "database/migrations/001_permisos_administrador.sql y vuelve a intentarlo. "
                    f"Los datos originales no se modificaron. Copia: {backup}"
                ) from None
            raise
        connection.commit()
        renamed = connection.execute(text("""
            SELECT identificador AS id, modo AS mode, estado AS status,
                   problema AS problem, resultado AS result, fecha_creacion AS created_at
            FROM problemas ORDER BY identificador
        """)).mappings().all()
        if original != [dict(row) for row in renamed]:
            raise RuntimeError(f"La comprobación de datos no coincide. Revisa la copia {backup}.")
        print(f"Migración completada: {len(original)} registros conservados íntegramente.")
        rename_identifier(connection)


if __name__ == "__main__":
    try:
        migrate()
    finally:
        engine.dispose()
