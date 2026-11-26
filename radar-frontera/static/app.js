(() => {
	const $ = (s) => document.querySelector(s);
	const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

	async function api(ruta, opciones = {}) {
		const r = await fetch(ruta, {
			headers: { 'Content-Type': 'application/json' },
			...opciones,
			body: opciones.body ? JSON.stringify(opciones.body) : undefined,
		});
		const datos = await r.json();
		if (!r.ok) throw new Error(datos.error || 'Error');
		return datos;
	}

	// ---------- Mapa ----------
	const mapa = L.map('mapa').setView([-33.04, -71.45], 12);
	const osmBase = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
		maxZoom: 19,
		attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
	}).addTo(mapa);
	const capaZonas = L.featureGroup().addTo(mapa);
	const capaMetro = L.layerGroup().addTo(mapa);
	L.control.layers({ OpenStreetMap: osmBase }, { Zonas: capaZonas, 'Metro Valparaíso': capaMetro }, { collapsed: false }).addTo(mapa);
	mapa.pm.setLang('es');
	mapa.pm.setGlobalOptions({ snappable: false });

	// ---------- Zonas ----------
	let zonas = [];
	const capas = new Map(); // id → L.Polygon
	let editando = null;

	function dibujarZona(z) {
		const capa = L.geoJSON(z.geojson, {
			style: { color: z.color, weight: 2, fillColor: z.color, fillOpacity: 0.15, dashArray: z.activa ? null : '6 6' },
			pmIgnore: false,
		}).getLayers()[0];
		capa.bindTooltip(esc(z.nombre), { permanent: true, direction: 'center', className: 'etiqueta-zona' });
		capa.on('click', () => enfocar(z.id));
		capaZonas.addLayer(capa);
		capas.set(z.id, capa);
	}

	function pintarLista() {
		$('#lista-zonas').innerHTML = zonas.length
			? zonas
					.map(
						(z) => `<li class="zona ${z.activa ? '' : 'oculta'} ${editando === z.id ? 'editando' : ''}" data-id="${z.id}">
				<div class="zona-cabeza">
					<span class="muestra" style="background:${z.color}"></span>
					<span class="zona-nombre" data-accion="ver">${esc(z.nombre)}</span>
					<span class="zona-area">${z.area_km2} km²</span>
				</div>
				<div class="zona-acciones">
					${
						editando === z.id
							? '<button data-accion="guardar-forma" class="primario">Guardar forma</button><button data-accion="cancelar-forma">Cancelar</button>'
							: `<button data-accion="forma">Editar forma</button>
								<button data-accion="datos">Nombre y color</button>
								<button data-accion="activa">${z.activa ? 'Pausar' : 'Activar'}</button>
								<button data-accion="borrar">Borrar</button>`
					}
				</div>
			</li>`,
					)
					.join('')
			: '<p class="ayuda">No hay zonas. Dibuja la primera.</p>';
	}

	async function cargarZonas() {
		zonas = await api('/api/zonas');
		capaZonas.clearLayers();
		capas.clear();
		zonas.forEach(dibujarZona);
		pintarLista();
	}

	function enfocar(id) {
		const c = capas.get(id);
		if (c) mapa.fitBounds(c.getBounds(), { padding: [40, 40] });
	}

	// Diálogo de nombre y color (para zona nueva o existente).
	function pedirDatos({ titulo, nombre = '', color = '#e4572e' }) {
		const dlg = $('#dialogo-zona');
		const form = $('#form-zona');
		$('#dialogo-titulo').textContent = titulo;
		form.nombre.value = nombre;
		form.color.value = color;
		$('#dialogo-error').hidden = true;
		dlg.showModal();
		return new Promise((resolver) => {
			dlg.addEventListener(
				'close',
				() => resolver(dlg.returnValue === 'guardar' ? { nombre: form.nombre.value.trim(), color: form.color.value } : null),
				{ once: true },
			);
		});
	}

	async function conReintento(titulo, inicial, guardar) {
		let datos = inicial;
		for (;;) {
			datos = await pedirDatos({ titulo, ...datos });
			if (!datos) return null;
			try {
				return await guardar(datos);
			} catch (e) {
				alert(e.message);
			}
		}
	}

	// Dibujar zona nueva.
	const COLORES = ['#e4572e', '#17bebb', '#7b2cbf', '#f2a541', '#2e86ab', '#c1292e', '#3bb273', '#ff7aa2'];
	$('#btn-dibujar').addEventListener('click', () => {
		mapa.pm.enableDraw('Polygon', { templineStyle: { color: '#0e5e57' }, hintlineStyle: { color: '#0e5e57', dashArray: '5 5' } });
		$('#ayuda-dibujo').hidden = false;
		$('#btn-dibujar').disabled = true;
	});
	function terminarDibujo() {
		mapa.pm.disableDraw();
		$('#ayuda-dibujo').hidden = true;
		$('#btn-dibujar').disabled = false;
	}
	$('#btn-cancelar-dibujo').addEventListener('click', terminarDibujo);
	mapa.on('pm:drawend', terminarDibujo);

	mapa.on('pm:create', async ({ layer }) => {
		const geojson = layer.toGeoJSON().geometry;
		const color = COLORES[zonas.length % COLORES.length];
		const creada = await conReintento('Nueva zona', { color }, (d) => api('/api/zonas', { method: 'POST', body: { ...d, geojson } }));
		mapa.removeLayer(layer);
		if (creada) await cargarZonas();
	});

	// Acciones de la lista.
	$('#lista-zonas').addEventListener('click', async (e) => {
		const b = e.target.closest('[data-accion]');
		if (!b) return;
		const id = Number(b.closest('.zona').dataset.id);
		const z = zonas.find((x) => x.id === id);
		const capa = capas.get(id);
		try {
			switch (b.dataset.accion) {
				case 'ver':
					enfocar(id);
					break;
				case 'forma':
					if (editando) capas.get(editando)?.pm.disable();
					editando = id;
					capa.pm.enable({ allowSelfIntersection: false });
					enfocar(id);
					pintarLista();
					break;
				case 'guardar-forma':
					capa.pm.disable();
					editando = null;
					await api(`/api/zonas/${id}`, { method: 'PUT', body: { geojson: capa.toGeoJSON().geometry } });
					await cargarZonas();
					break;
				case 'cancelar-forma':
					capa.pm.disable();
					editando = null;
					await cargarZonas();
					break;
				case 'datos':
					if (await conReintento('Editar zona', { nombre: z.nombre, color: z.color }, (d) => api(`/api/zonas/${id}`, { method: 'PUT', body: d })))
						await cargarZonas();
					break;
				case 'activa':
					await api(`/api/zonas/${id}`, { method: 'PUT', body: { activa: !z.activa } });
					await cargarZonas();
					break;
				case 'borrar':
					if (confirm(`¿Borrar la zona «${z.nombre}»?`)) {
						await api(`/api/zonas/${id}`, { method: 'DELETE' });
						await cargarZonas();
					}
					break;
			}
		} catch (err) {
			alert(err.message);
		}
	});

	// ---------- Estaciones ----------
	const iconoEstacion = L.divIcon({ className: '', html: '<div class="estacion"></div>', iconSize: [12, 12] });
	async function cargarEstaciones(actualizar = false) {
		const btn = $('#btn-osm');
		btn.disabled = true;
		btn.textContent = actualizar ? 'Descargando…' : btn.textContent;
		try {
			const d = await api(`/api/estaciones${actualizar ? '?actualizar=1' : ''}`);
			capaMetro.clearLayers();
			for (const l of d.lineas) L.polyline(l, { color: '#2b4fa3', weight: 4, opacity: 0.7, interactive: false }).addTo(capaMetro);
			for (const e of d.estaciones) {
				L.marker([e.lat, e.lng], { icon: iconoEstacion, pmIgnore: true })
					.bindTooltip(`Estación ${esc(e.nombre)}`, { direction: 'top' })
					.addTo(capaMetro);
			}
			const estado = $('#estado-estaciones');
			const origen =
				d.fuente === 'openstreetmap'
					? `${d.estaciones.length} estaciones desde OpenStreetMap (descargadas ${new Date(d.fecha).toLocaleDateString('es-CL')}).`
					: `${d.estaciones.length} estaciones con coordenadas aproximadas (respaldo).`;
			estado.textContent = origen + (d.aviso ? ` No se pudo actualizar: ${d.aviso}` : '');
			estado.classList.toggle('aviso', d.fuente !== 'openstreetmap' || !!d.aviso);
		} finally {
			btn.disabled = false;
			btn.textContent = 'Actualizar desde OpenStreetMap';
		}
	}
	$('#btn-osm').addEventListener('click', () => cargarEstaciones(true));

	cargarZonas().then(() => capaZonas.getLayers().length && mapa.fitBounds(capaZonas.getBounds(), { padding: [30, 30] }));
	cargarEstaciones();
})();
