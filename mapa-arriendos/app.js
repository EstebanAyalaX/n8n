(() => {
	const { propiedades, reporte } = window.DATOS;
	const estaciones = window.ESTACIONES;
	const POR_PAGINA = 40;

	const form = document.getElementById('filtros');
	const listaEl = document.getElementById('lista');
	const conteoEl = document.getElementById('conteo');
	const ordenEl = document.getElementById('orden');
	const masEl = document.getElementById('mas');

	const clp = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
	const num = new Intl.NumberFormat('es-CL');
	const formatoPrecio = (p) => (p.moneda === 'UF' ? `UF ${num.format(p.precio)}` : clp.format(p.precio));
	const sufijo = (p) => (p.operacion === 'arriendo' ? '/mes' : '');
	const distancia = (m) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);
	const claseValidacion = (v) => v.replace(' ', '-');
	const textoValidacion = { validado: 'Validada', parcial: 'Dirección parcial', 'sin validar': 'Ubicación aproximada' };
	const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

	// ---------- Encabezado y resumen de depuración ----------
	const fecha = new Date(reporte.actualizado).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
	document.getElementById('depuracion').textContent =
		`Depuración: ${num.format(reporte.recibidos)} anuncios recibidos · ${reporte.duplicados_fusionados} duplicados fusionados · ` +
		`${reporte.descartados.precio_falso} precios falsos descartados · ${reporte.telefonos_ocultos} teléfonos ocultos · actualizado ${fecha}`;

	const comunas = [...new Set(propiedades.map((p) => p.comuna))].sort();
	const selComuna = form.elements.comuna;
	for (const c of comunas) selComuna.add(new Option(c, c));

	// ---------- Mapa ----------
	const mapa = L.map('mapa', { zoomControl: true, preferCanvas: false }).setView([-33.035, -71.48], 12);
	L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
		attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
		subdomains: 'abcd',
		maxZoom: 19,
	}).addTo(mapa);

	L.polyline(estaciones.map((e) => [e.lat, e.lng]), { color: '#2b4fa3', weight: 4, opacity: 0.75 }).addTo(mapa);
	const iconoEstacion = L.divIcon({ className: '', html: '<div class="estacion-icono"></div>', iconSize: [12, 12] });
	for (const e of estaciones) {
		L.marker([e.lat, e.lng], { icon: iconoEstacion, keyboard: false, zIndexOffset: -100 })
			.bindTooltip(`Estación ${esc(e.nombre)}`, { direction: 'top' })
			.addTo(mapa);
	}

	const cluster = L.markerClusterGroup({
		maxClusterRadius: 45,
		showCoverageOnHover: false,
		iconCreateFunction: (c) =>
			L.divIcon({ html: `<div>${c.getChildCount()}</div>`, className: 'marker-cluster', iconSize: [40, 40] }),
	});
	mapa.addLayer(cluster);

	const iconos = {};
	const icono = (v) =>
		(iconos[v] ??= L.divIcon({ className: '', html: `<div class="pin ${claseValidacion(v)}"></div>`, iconSize: [14, 14] }));

	const marcadores = new Map();
	for (const p of propiedades) {
		const m = L.marker([p.lat, p.lng], { icon: icono(p.validacion), title: `${formatoPrecio(p)} · ${p.titulo}` });
		m.bindPopup(() => popup(p), { maxWidth: 260 });
		m.on('click', () => resaltar(p.id, false));
		marcadores.set(p.id, m);
	}

	function popup(p) {
		return `<div class="precio">${formatoPrecio(p)} <small>${sufijo(p)}</small></div>
			<div><strong>${esc(p.titulo)}</strong></div>
			<div>${esc(p.direccion ?? p.sector)} · ${esc(p.comuna)}</div>
			<div>${p.m2 ? `${p.m2} m² · ` : ''}Metro ${esc(p.estacion.nombre)} a ${distancia(p.estacion.distancia)}</div>
			<div style="margin-top:6px;color:#5b6b73">${esc(p.descripcion)}</div>`;
	}

	// ---------- Filtros ----------
	function leerFiltros() {
		const f = Object.fromEntries(new FormData(form));
		return { ...f, q: (f.q ?? '').trim().toLowerCase() };
	}

	function filtrar(f) {
		const min = Number(f.min) || 0;
		const max = Number(f.max) || Infinity;
		return propiedades.filter(
			(p) =>
				p.operacion === f.operacion &&
				(!f.comuna || p.comuna === f.comuna) &&
				(!f.tipo || p.tipo === f.tipo) &&
				(!f.dormitorios || p.dormitorios >= Number(f.dormitorios)) &&
				(!f.metro || p.estacion.distancia <= Number(f.metro)) &&
				(!f.validacion || (f.validacion === 'exacta' ? p.ubicacion === 'exacta' : p.validacion === f.validacion)) &&
				p.precio >= min &&
				p.precio <= max &&
				(!f.q ||
					[p.titulo, p.sector, p.direccion, p.comuna, p.estacion.nombre, p.descripcion].join(' ').toLowerCase().includes(f.q)),
		);
	}

	const ORDEN = {
		'precio-asc': (a, b) => a.precio - b.precio,
		'precio-desc': (a, b) => b.precio - a.precio,
		metro: (a, b) => a.estacion.distancia - b.estacion.distancia,
		reciente: (a, b) => b.publicado.localeCompare(a.publicado),
		m2: (a, b) => a.precio / (a.m2 || 1) - b.precio / (b.m2 || 1),
	};

	let resultados = [];
	let ultimaComuna;
	let mostrados = 0;

	function aplicar() {
		const f = leerFiltros();
		const moneda = f.operacion === 'venta' ? 'UF' : '$';
		form.elements.min.placeholder = `Mín ${moneda}`;
		form.elements.max.placeholder = `Máx ${moneda}`;

		resultados = filtrar(f).sort(ORDEN[ordenEl.value]);
		cluster.clearLayers();
		cluster.addLayers(resultados.map((p) => marcadores.get(p.id)));

		conteoEl.textContent = `${num.format(resultados.length)} ${resultados.length === 1 ? 'propiedad' : 'propiedades'} en ${f.operacion}`;
		listaEl.innerHTML = resultados.length ? '' : '<p class="vacio">No hay propiedades con estos filtros.</p>';
		mostrados = 0;
		pintarMas();
		guardarEnUrl(f);
		if (f.comuna !== ultimaComuna && resultados.length) {
			mapa.fitBounds(L.latLngBounds(resultados.map((p) => [p.lat, p.lng])), { padding: [30, 30], maxZoom: 15 });
		}
		ultimaComuna = f.comuna;
	}

	function pintarMas() {
		const trozo = resultados.slice(mostrados, mostrados + POR_PAGINA);
		listaEl.insertAdjacentHTML('beforeend', trozo.map(tarjeta).join(''));
		mostrados += trozo.length;
		masEl.hidden = mostrados >= resultados.length;
	}

	function tarjeta(p) {
		const url = p.fuentes.find((x) => x.url)?.url;
		const nombresFuentes = p.fuentes.map((x) => x.fuente).join(', ');
		return `<article class="tarjeta" data-id="${p.id}" tabindex="0">
			<div class="precio">${formatoPrecio(p)} <small>${sufijo(p)}</small></div>
			<p class="titulo">${p.dormitorios} dorm. · ${p.banos} baño${p.banos > 1 ? 's' : ''} · ${esc(p.tipo)}${p.m2 ? ` · ${p.m2} m²` : ''}</p>
			<div class="etiquetas">
				<span class="etiqueta op">${p.operacion === 'arriendo' ? 'Arriendo' : 'Venta'}</span>
				<span class="etiqueta">${esc(p.comuna)}</span>
				<span class="etiqueta">${esc(p.sector)}</span>
				<span class="etiqueta metro">Metro ${esc(p.estacion.nombre)} · ${distancia(p.estacion.distancia)}</span>
				<span class="etiqueta ${claseValidacion(p.validacion)}">${textoValidacion[p.validacion]}</span>
			</div>
			<div class="fuentes">${p.fuentes.length > 1 ? `Publicado en ${p.fuentes.length} fuentes: ` : 'Fuente: '}${esc(nombresFuentes)}</div>
			<a class="ver-original" ${url ? `href="${esc(url)}" target="_blank" rel="noopener"` : 'aria-disabled="true" title="Anuncio de ejemplo sin enlace"'}>Ver anuncio original ↗</a>
		</article>`;
	}

	function resaltar(id, mover = true) {
		for (const el of listaEl.querySelectorAll('.tarjeta.activa')) el.classList.remove('activa');
		const el = listaEl.querySelector(`[data-id="${id}"]`);
		if (el) {
			el.classList.add('activa');
			if (!mover) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		}
		if (mover) {
			const m = marcadores.get(id);
			cluster.zoomToShowLayer(m, () => m.openPopup());
		}
	}

	listaEl.addEventListener('click', (e) => {
		if (e.target.closest('a')) return;
		const t = e.target.closest('.tarjeta');
		if (t) resaltar(Number(t.dataset.id));
	});
	listaEl.addEventListener('keydown', (e) => {
		const t = e.target.closest('.tarjeta');
		if (t && (e.key === 'Enter' || e.key === ' ')) {
			e.preventDefault();
			resaltar(Number(t.dataset.id));
		}
	});
	masEl.addEventListener('click', pintarMas);

	// ---------- Estado en la URL (para compartir búsquedas) ----------
	function guardarEnUrl(f) {
		const params = new URLSearchParams();
		for (const [k, v] of Object.entries(f)) if (v && !(k === 'operacion' && v === 'arriendo')) params.set(k, v);
		if (ordenEl.value !== 'precio-asc') params.set('orden', ordenEl.value);
		const qs = params.toString();
		history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
	}
	function leerDeUrl() {
		const params = new URLSearchParams(location.search);
		for (const [k, v] of params) {
			if (k === 'orden') ordenEl.value = v;
			else if (form.elements[k]) form.elements[k].value = v;
		}
	}

	let espera;
	form.addEventListener('input', () => {
		clearTimeout(espera);
		espera = setTimeout(aplicar, 150);
	});
	form.addEventListener('reset', () => setTimeout(aplicar));
	form.addEventListener('submit', (e) => e.preventDefault());
	ordenEl.addEventListener('change', aplicar);

	leerDeUrl();
	aplicar();
})();
