"""Base de datos local (SQLite). Un solo archivo: data/radar.db."""
from __future__ import annotations

import sqlite3
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DATA = RAIZ / "data"
RUTA_DB = DATA / "radar.db"

ESQUEMA = """
CREATE TABLE IF NOT EXISTS zonas (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre    TEXT NOT NULL UNIQUE,
    color     TEXT NOT NULL,
    geojson   TEXT NOT NULL,          -- Polygon GeoJSON (lng, lat)
    activa    INTEGER NOT NULL DEFAULT 1,
    creada    TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    editada   TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
"""


def conectar() -> sqlite3.Connection:
    DATA.mkdir(exist_ok=True)
    con = sqlite3.connect(RUTA_DB)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    con.executescript(ESQUEMA)
    return con
