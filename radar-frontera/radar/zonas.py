"""Zonas de farming: polígonos con nombre y color."""
from __future__ import annotations

import json
import math
import re

from .db import conectar

# Zonas iniciales APROXIMADAS: son rectángulos de partida para que las redibujes
# en el mapa con el contorno real que trabajas.
def _caja(lat: float, lng: float, dlat: float, dlng: float) -> dict:
    return {
        "type": "Polygon",
        "coordinates": [[
            [lng - dlng, lat - dlat], [lng + dlng, lat - dlat],
            [lng + dlng, lat + dlat], [lng - dlng, lat + dlat],
            [lng - dlng, lat - dlat],
        ]],
    }


ZONAS_INICIALES = [
    ("Villa Alemana centro", "#e4572e", _caja(-33.0445, -71.3725, 0.0065, 0.0090)),
    ("El Belloto", "#17bebb", _caja(-33.0510, -71.4110, 0.0060, 0.0085)),
    ("Quilpué centro", "#7b2cbf", _caja(-33.0480, -71.4420, 0.0060, 0.0085)),
    ("Viña del Mar Miraflores", "#f2a541", _caja(-33.0330, -71.5260, 0.0070, 0.0090)),
]

RE_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")


class ZonaInvalida(ValueError):
    pass


def _validar(nombre: str, color: str, geojson: dict) -> None:
    if not nombre or len(nombre) > 60:
        raise ZonaInvalida("El nombre es obligatorio (máximo 60 caracteres).")
    if not RE_COLOR.match(color or ""):
        raise ZonaInvalida("El color debe ser tipo #RRGGBB.")
    if not geojson or geojson.get("type") != "Polygon":
        raise ZonaInvalida("La zona debe ser un polígono.")
    anillo = geojson["coordinates"][0]
    if len(anillo) < 4:
        raise ZonaInvalida("El polígono necesita al menos 3 puntos.")


def sembrar_si_vacia() -> None:
    con = conectar()
    with con:
        if con.execute("SELECT COUNT(*) FROM zonas").fetchone()[0] == 0:
            con.executemany(
                "INSERT INTO zonas (nombre, color, geojson) VALUES (?, ?, ?)",
                [(n, c, json.dumps(g)) for n, c, g in ZONAS_INICIALES],
            )


def area_km2(geojson: dict) -> float:
    """Área aproximada (fórmula del trapecio sobre proyección local)."""
    anillo = geojson["coordinates"][0]
    lat0 = math.radians(sum(p[1] for p in anillo) / len(anillo))
    kx, ky = 111.32 * math.cos(lat0), 110.57
    s = 0.0
    for (x1, y1), (x2, y2) in zip(anillo, anillo[1:]):
        s += (x1 * kx) * (y2 * ky) - (x2 * kx) * (y1 * ky)
    return abs(s) / 2


def contiene(geojson: dict, lat: float, lng: float) -> bool:
    """¿El punto está dentro del polígono? (ray casting)."""
    anillo = geojson["coordinates"][0]
    dentro = False
    for (x1, y1), (x2, y2) in zip(anillo, anillo[1:]):
        if (y1 > lat) != (y2 > lat) and lng < (x2 - x1) * (lat - y1) / (y2 - y1) + x1:
            dentro = not dentro
    return dentro


def _fila(r) -> dict:
    g = json.loads(r["geojson"])
    return {
        "id": r["id"], "nombre": r["nombre"], "color": r["color"], "geojson": g,
        "activa": bool(r["activa"]), "area_km2": round(area_km2(g), 2), "editada": r["editada"],
    }


def listar() -> list[dict]:
    con = conectar()
    return [_fila(r) for r in con.execute("SELECT * FROM zonas ORDER BY nombre")]


def crear(nombre: str, color: str, geojson: dict) -> dict:
    nombre = (nombre or "").strip()
    _validar(nombre, color, geojson)
    con = conectar()
    try:
        with con:
            cur = con.execute(
                "INSERT INTO zonas (nombre, color, geojson) VALUES (?, ?, ?)",
                (nombre, color, json.dumps(geojson)),
            )
    except Exception as e:  # nombre repetido
        raise ZonaInvalida(f"Ya existe una zona llamada «{nombre}».") from e
    return _fila(con.execute("SELECT * FROM zonas WHERE id = ?", (cur.lastrowid,)).fetchone())


def actualizar(zona_id: int, datos: dict) -> dict:
    con = conectar()
    actual = con.execute("SELECT * FROM zonas WHERE id = ?", (zona_id,)).fetchone()
    if not actual:
        raise ZonaInvalida("La zona no existe.")
    nombre = (datos.get("nombre") or actual["nombre"]).strip()
    color = datos.get("color") or actual["color"]
    geojson = datos.get("geojson") or json.loads(actual["geojson"])
    activa = int(datos.get("activa", bool(actual["activa"])))
    _validar(nombre, color, geojson)
    try:
        with con:
            con.execute(
                "UPDATE zonas SET nombre=?, color=?, geojson=?, activa=?, "
                "editada=datetime('now','localtime') WHERE id=?",
                (nombre, color, json.dumps(geojson), activa, zona_id),
            )
    except Exception as e:
        raise ZonaInvalida(f"Ya existe una zona llamada «{nombre}».") from e
    return _fila(con.execute("SELECT * FROM zonas WHERE id = ?", (zona_id,)).fetchone())


def borrar(zona_id: int) -> None:
    con = conectar()
    with con:
        con.execute("DELETE FROM zonas WHERE id = ?", (zona_id,))
