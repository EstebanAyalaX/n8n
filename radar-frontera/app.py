"""Radar FRONTERA — app local.

Uso:  python3 app.py        → abre http://localhost:8765
Solo usa la biblioteca estándar de Python (no hay que instalar nada en esta fase).
"""
from __future__ import annotations

import json
import re
import sys
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from radar import osm, zonas

PUERTO = 8765
ESTATICOS = Path(__file__).resolve().parent / "static"
RE_ZONA = re.compile(r"^/api/zonas/(\d+)$")


class Manejador(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ESTATICOS), **kw)

    def log_message(self, fmt, *args):  # consola más limpia
        if "/api/" in (args[0] if args else ""):
            sys.stderr.write("  " + (fmt % args) + "\n")

    # ---------- utilidades ----------
    def _json(self, datos, estado: int = 200):
        cuerpo = json.dumps(datos, ensure_ascii=False).encode()
        self.send_response(estado)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    def _cuerpo(self) -> dict:
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"{}")

    def _error(self, e: Exception):
        estado = 400 if isinstance(e, (zonas.ZonaInvalida, ValueError)) else 500
        self._json({"error": str(e)}, estado)

    # ---------- rutas ----------
    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/api/zonas":
            return self._json(zonas.listar())
        if url.path == "/api/estaciones":
            forzar = parse_qs(url.query).get("actualizar") == ["1"]
            return self._json(osm.obtener(forzar=forzar))
        return super().do_GET()

    def do_POST(self):
        try:
            if self.path == "/api/zonas":
                d = self._cuerpo()
                return self._json(zonas.crear(d.get("nombre"), d.get("color"), d.get("geojson")), 201)
            self._json({"error": "Ruta no encontrada"}, 404)
        except Exception as e:
            self._error(e)

    def do_PUT(self):
        try:
            m = RE_ZONA.match(self.path)
            if m:
                return self._json(zonas.actualizar(int(m.group(1)), self._cuerpo()))
            self._json({"error": "Ruta no encontrada"}, 404)
        except Exception as e:
            self._error(e)

    def do_DELETE(self):
        m = RE_ZONA.match(self.path)
        if m:
            zonas.borrar(int(m.group(1)))
            return self._json({"ok": True})
        self._json({"error": "Ruta no encontrada"}, 404)


def main():
    zonas.sembrar_si_vacia()
    # Solo escucha en tu computador (127.0.0.1): nadie más en la red puede entrar.
    servidor = ThreadingHTTPServer(("127.0.0.1", PUERTO), Manejador)
    url = f"http://localhost:{PUERTO}"
    print(f"\nRadar FRONTERA corriendo en {url}  (Ctrl+C para detener)\n")
    if "--sin-navegador" not in sys.argv:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\nDetenido.")


if __name__ == "__main__":
    main()
