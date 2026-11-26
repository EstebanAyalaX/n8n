"""Estaciones y trazado de Metro Valparaíso (Merval) desde OpenStreetMap (Overpass API).

Se descarga una vez y queda guardado en data/estaciones.json. Si no hay internet
o Overpass no responde, se usa una lista de respaldo con coordenadas aproximadas.
"""
from __future__ import annotations

import json
import math
import urllib.parse
import urllib.request
from datetime import datetime

from .db import DATA

CACHE = DATA / "estaciones.json"
SERVIDORES = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
AGENTE = "radar-frontera/0.1 (herramienta local de uso personal)"
CAJA = "-33.10,-71.70,-32.90,-71.20"  # Valparaíso → Limache

CONSULTA = f"""
[out:json][timeout:60];
(
  node["railway"="station"]["network"~"merval|metro valpara",i]({CAJA});
  node["railway"="station"]["operator"~"merval",i]({CAJA});
  node["public_transport"="station"]["train"="yes"]({CAJA});
  node["railway"="halt"]["network"~"merval|metro valpara",i]({CAJA});
);
out body;
relation["route"~"^(train|light_rail|subway)$"]["network"~"merval|metro valpara",i]({CAJA});
out geom;
"""

# Respaldo: coordenadas aproximadas (no oficiales).
RESPALDO = [
    ("Puerto", -33.0386, -71.6290), ("Bellavista", -33.0442, -71.6203), ("Francia", -33.0465, -71.6130),
    ("Barón", -33.0430, -71.6040), ("Portales", -33.0300, -71.5910), ("Recreo", -33.0245, -71.5780),
    ("Miramar", -33.0220, -71.5630), ("Viña del Mar", -33.0270, -71.5520), ("Hospital", -33.0310, -71.5410),
    ("Chorrillos", -33.0350, -71.5280), ("El Salto", -33.0410, -71.5110), ("Quilpué", -33.0480, -71.4430),
    ("El Sol", -33.0500, -71.4320), ("El Belloto", -33.0510, -71.4110), ("Las Américas", -33.0500, -71.3950),
    ("La Concepción", -33.0490, -71.3850), ("Villa Alemana", -33.0450, -71.3730),
    ("Sargento Aldea", -33.0430, -71.3620), ("Peñablanca", -33.0400, -71.3500), ("Limache", -32.9850, -71.2750),
]


def _descargar() -> dict:
    datos = urllib.parse.urlencode({"data": CONSULTA}).encode()
    ultimo_error = None
    for url in SERVIDORES:
        try:
            req = urllib.request.Request(url, data=datos, headers={"User-Agent": AGENTE})
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.load(r)
        except Exception as e:  # probar el siguiente servidor
            ultimo_error = e
    raise RuntimeError(f"No se pudo consultar OpenStreetMap: {ultimo_error}")


def interpretar(osm: dict) -> dict:
    """Convierte la respuesta de Overpass en {estaciones, lineas}."""
    estaciones = {}
    lineas = []
    for el in osm.get("elements", []):
        if el["type"] == "node":
            t = el.get("tags", {})
            nombre = t.get("name") or t.get("official_name")
            if not nombre:
                continue
            nombre = nombre.replace("Estación ", "").strip()
            # Una estación puede venir como varios nodos (andenes): conservar uno por nombre.
            estaciones.setdefault(nombre, {"nombre": nombre, "lat": el["lat"], "lng": el["lon"], "osm_id": el["id"]})
        elif el["type"] == "relation":
            for m in el.get("members", []):
                if m.get("type") == "way" and m.get("geometry"):
                    lineas.append([[p["lat"], p["lon"]] for p in m["geometry"]])
    lista = sorted(estaciones.values(), key=lambda e: e["lng"])
    return {"estaciones": lista, "lineas": lineas}


def _respaldo() -> dict:
    est = [{"nombre": n, "lat": la, "lng": lo, "osm_id": None} for n, la, lo in RESPALDO]
    return {
        "estaciones": est,
        "lineas": [[[e["lat"], e["lng"]] for e in sorted(est, key=lambda e: e["lng"])]],
        "fuente": "respaldo",
        "nota": "Coordenadas aproximadas. Pulsa «Actualizar desde OpenStreetMap» con internet.",
        "fecha": None,
    }


def obtener(forzar: bool = False) -> dict:
    """Devuelve estaciones desde la copia local; descarga de OSM si no hay copia o si se fuerza."""
    if CACHE.exists() and not forzar:
        return json.loads(CACHE.read_text(encoding="utf-8"))
    try:
        datos = interpretar(_descargar())
        if len(datos["estaciones"]) < 5:
            raise RuntimeError("OpenStreetMap devolvió muy pocas estaciones.")
    except Exception as e:
        if CACHE.exists():
            guardado = json.loads(CACHE.read_text(encoding="utf-8"))
            guardado["aviso"] = str(e)
            return guardado
        r = _respaldo()
        r["aviso"] = str(e)
        return r
    if not datos["lineas"]:  # sin trazado: unir estaciones en orden
        datos["lineas"] = [[[e["lat"], e["lng"]] for e in datos["estaciones"]]]
    datos.update(fuente="openstreetmap", fecha=datetime.now().isoformat(timespec="seconds"),
                 nota="© Colaboradores de OpenStreetMap (ODbL)")
    DATA.mkdir(exist_ok=True)
    CACHE.write_text(json.dumps(datos, ensure_ascii=False), encoding="utf-8")
    return datos


def distancia_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))
