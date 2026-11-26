# Radar FRONTERA

App local para hacer farming territorial: vigila varias zonas del eje Metro Valparaíso,
junta los avisos de arriendo, los muestra en un mapa y compara las zonas.

Todo corre en tu Mac. Los datos quedan en `data/` (no se suben a GitHub).

## Cómo correrlo

Necesitas Python 3.9 o más nuevo (los Mac recientes lo traen; si no, `xcode-select --install`).

```bash
cd radar-frontera
python3 app.py
```

Se abre solo el navegador en http://localhost:8765. Para detenerlo: `Ctrl + C` en la Terminal.
La app solo escucha en tu computador: nadie más en tu red puede entrar.

## Cómo agregar una zona nueva

1. Pulsa **+ Dibujar zona**.
2. Haz clic en el mapa en cada esquina del sector que quieres vigilar.
3. Para cerrar el polígono, haz clic de nuevo en el primer punto.
4. Escribe el nombre, elige un color y pulsa **Guardar**.

Con los botones de cada zona puedes **Editar forma** (arrastrar los vértices y luego **Guardar forma**),
cambiar **Nombre y color**, **Pausar** (deja de recolectar avisos, pero no se borra) o **Borrar**.

Las 4 zonas iniciales son rectángulos aproximados: redibújalas con el contorno real que trabajas.

## Estaciones de metro

Al abrir la app por primera vez se descargan las estaciones de Metro Valparaíso desde
OpenStreetMap y quedan guardadas en `data/estaciones.json`. Si no hay internet se usan
coordenadas aproximadas (verás un aviso amarillo); pulsa **Actualizar desde OpenStreetMap** cuando tengas conexión.

## Estado por fases

- [x] Fase 2: zonas y estaciones
- [ ] Fase 3: recolección diaria por fuente y zona (SQLite con fotos fechadas)
- [ ] Fase 4: limpieza (UF del día, $/m², duplicados, dueño directo, gastos comunes)
- [ ] Fase 5: mapa de avisos, panel de comparación y lista «Para captar»
- [ ] Fase 6: exportar CSV para la pestaña Precios
