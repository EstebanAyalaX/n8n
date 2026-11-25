# Radar Eje Metro

Mapa que reúne anuncios de casas y departamentos en **arriendo y venta** a lo largo del
Metro Valparaíso (Valparaíso, Viña del Mar, Quilpué, Villa Alemana, Limache), los depura
y los muestra con filtros.

> Por ahora usa **datos de ejemplo ficticios** (`data/crudos-ejemplo.json`). Las fuentes reales
> se conectan después: lo que entre debe tener el mismo formato que los crudos de ejemplo.

## Cómo verlo

Abrir `index.html` directo en el navegador (funciona sin servidor), o:

```bash
npm run servir     # http://localhost:3000
```

## Flujo de datos

```
fuentes → data/crudos-*.json → scripts/depurar.mjs → data/propiedades.js → index.html
```

`npm run ejemplo` regenera los crudos ficticios; `npm run depurar [archivo.json]` los procesa.

### Qué hace la depuración (`scripts/depurar.mjs`)

| Paso | Regla |
| --- | --- |
| Teléfonos y correos | Se reemplazan por `[teléfono oculto]` / `[correo oculto]` en título y descripción. |
| Precio | Arriendos desde **$400.000/mes** y ventas desde **UF 1.500**, sin tope superior (`MINIMO` en el script). Se descartan precios vacíos, ≤ 0 o gancho (`11111`, `1234…`, `9999…`). |
| Duplicados | Misma operación, tipo, dormitorios y baños, precio ±2 %, m² ±5 % y a menos de 200 m (o mismo sector si uno no tiene coordenadas). Se fusionan y se guardan todas las fuentes. |
| Ubicación | Con coordenadas y número de calle → **validada**; calle sin número → **parcial**; solo sector → **aproximada** (se ubica en el centro del sector). |
| Anunciante | Agrupa avisos con el mismo teléfono o el mismo perfil en la fuente (`perfil_anunciante`). El teléfono solo se usa para agrupar: no se guarda ni se publica. A cada grupo se le da un número correlativo (Anunciante 1 = el que más avisos tiene). |
| Metro | Calcula la estación más cercana y la distancia (coordenadas de estaciones aproximadas, en `scripts/geo.mjs`). |

### Formato de un anuncio crudo

```json
{
  "id_fuente": "abc123", "fuente": "Portal", "url": "https://…",
  "perfil_anunciante": "Portal:u1234",
  "titulo": "Depto 2D 1B en Recreo", "descripcion": "…",
  "operacion": "arriendo", "tipo": "Departamento",
  "precio": "$450.000", "dormitorios": 2, "banos": 1, "m2": 55,
  "comuna": "Viña del Mar", "sector": "Recreo",
  "direccion": "Av. España 1234, Recreo", "lat": -33.02, "lng": -71.57,
  "publicado": "2026-11-20"
}
```

`precio` acepta `"$450.000"`, `"450 mil"`, `"UF 3.200"` o un número. `lat`/`lng`, `direccion` y `perfil_anunciante` pueden ser `null`.

## Funciones de la página

- Arriendo / Venta, comuna, tipo, dormitorios, distancia al metro, validación y búsqueda libre (sin filtro de precio).
- Filtro por anunciante (un solo aviso / varios avisos / sin datos) y lista de anunciantes con varias propiedades; clic en uno muestra todos sus avisos.
- Orden por precio, cercanía al metro, más recientes o precio por m².
- Clic en una tarjeta → el mapa va al anuncio; clic en el mapa → resalta la tarjeta.
- Los filtros quedan en la URL, así se puede compartir una búsqueda.

Mapa: Leaflet + MarkerCluster (incluidos en `vendor/`), mapa base © OpenStreetMap / CARTO.
