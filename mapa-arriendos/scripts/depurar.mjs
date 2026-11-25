// Depura anuncios crudos y genera los datos que consume el mapa.
//   1. Normaliza precio, textos y campos.
//   2. Oculta teléfonos y correos (título y descripción).
//   3. Descarta precios falsos (fuera de rango o absurdos para su comuna).
//   4. Ubica en el mapa: exacta si hay coordenadas, aproximada si solo hay sector.
//   5. Fusiona duplicados publicados en varias fuentes.
//   6. Calcula la estación de metro más cercana.
//
// Uso: node scripts/depurar.mjs [entrada.json]   (por defecto data/crudos-ejemplo.json)
import { readFileSync, writeFileSync } from 'node:fs';
import { ESTACIONES, distanciaMetros, estacionMasCercana } from './geo.mjs';

const entrada = process.argv[2] ?? new URL('../data/crudos-ejemplo.json', import.meta.url);
const crudos = JSON.parse(readFileSync(entrada, 'utf8'));
const reporte = { recibidos: crudos.length, descartados: { precio_falso: 0, datos_incompletos: 0 }, duplicados_fusionados: 0, telefonos_ocultos: 0 };

// ---------- 1. Normalización ----------
function parsePrecio(p) {
	if (typeof p === 'number') return { valor: p, moneda: null };
	if (!p) return null;
	const s = String(p).toLowerCase();
	const moneda = s.includes('uf') ? 'UF' : 'CLP';
	let num = s.replace(/uf|\$|clp|\s/g, '');
	const mil = /mil$/.test(num);
	num = num.replace(/mil$/, '').replace(/\./g, '').replace(',', '.');
	const valor = Number(num) * (mil ? 1000 : 1);
	return Number.isFinite(valor) ? { valor, moneda } : null;
}

const MENORES = new Set(['en', 'de', 'del', 'la', 'el', 'y']);
const capitalizar = (t) =>
	t.toLowerCase().split(' ').map((w, i) => (i > 0 && MENORES.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
function limpiarTitulo(t) {
	return capitalizar(String(t).replace(/!+/g, '').replace(/\s-\s*oportunidad/i, '').replace(/\(disponible\)/i, '').trim())
		.replace(/(\d)d\b/gi, '$1D').replace(/(\d)b\b/gi, '$1B');
}

// ---------- 2. Teléfonos y correos ----------
const RE_TEL = /(\+?\s?56[\s.-]?)?\b9[\s.-]?\d{4}[\s.-]?\d{4}\b/g;
const RE_MAIL = /[\w.+-]+@[\w-]+\.[\w.]+/g;
function ocultarContacto(texto) {
	if (!texto) return texto;
	let n = 0;
	const limpio = texto.replace(RE_TEL, () => (n++, '[teléfono oculto]')).replace(RE_MAIL, () => (n++, '[correo oculto]'));
	reporte.telefonos_ocultos += n;
	return limpio.replace(/(interesados\s+)?(llamar|whatsapp|wsp|contactar)[^.]*\[(teléfono|correo) oculto\][^.]*\.?/gi, 'Contactar por el anuncio original.');
}

// ---------- 3. Precios falsos ----------
const RANGO = { arriendo: { CLP: [120000, 4000000] }, venta: { UF: [600, 40000] } };
// Patrones típicos de precio gancho: 11111, 99999, 123456…
const precioPatron = (v) => /^(\d)\1{3,}$|^1234|^9{4,}/.test(String(Math.round(v)));

let items = [];
for (const c of crudos) {
	const precio = parsePrecio(c.precio);
	if (!precio || !c.operacion || !c.comuna) {
		reporte.descartados.datos_incompletos++;
		continue;
	}
	precio.moneda ??= c.operacion === 'venta' ? 'UF' : 'CLP';
	const rango = RANGO[c.operacion]?.[precio.moneda];
	if (!rango || precio.valor < rango[0] || precio.valor > rango[1] || precioPatron(precio.valor)) {
		reporte.descartados.precio_falso++;
		continue;
	}
	items.push({ ...c, precio: precio.valor, moneda: precio.moneda });
}

// Comparación relativa: precio por m² contra la mediana de su comuna y operación.
const mediana = (arr) => {
	const s = [...arr].sort((a, b) => a - b);
	return s[Math.floor(s.length / 2)];
};
const grupos = {};
for (const it of items) if (it.m2) (grupos[`${it.operacion}|${it.comuna}`] ??= []).push(it.precio / it.m2);
const medianas = Object.fromEntries(Object.entries(grupos).map(([k, v]) => [k, mediana(v)]));
items = items.filter((it) => {
	const m = medianas[`${it.operacion}|${it.comuna}`];
	if (!it.m2 || !m) return true;
	const r = it.precio / it.m2 / m;
	if (r < 0.5 || r > 2.5) {
		reporte.descartados.precio_falso++;
		return false;
	}
	return true;
});

// ---------- 4. Ubicación y validación ----------
const centroSector = {};
for (const it of items.filter((i) => i.lat != null)) {
	const k = `${it.comuna}|${it.sector}`;
	(centroSector[k] ??= []).push(it);
}
const promedio = (arr) => ({ lat: arr.reduce((s, x) => s + x.lat, 0) / arr.length, lng: arr.reduce((s, x) => s + x.lng, 0) / arr.length });
const hash = (s) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

for (const it of items) {
	if (it.lat != null && it.lng != null) {
		it.ubicacion = 'exacta';
		it.validacion = /\d/.test(it.direccion ?? '') ? 'validado' : 'parcial';
	} else {
		const vecinos = centroSector[`${it.comuna}|${it.sector}`];
		const centro = vecinos ? promedio(vecinos) : promedio(ESTACIONES.filter((e) => e.comuna === it.comuna));
		// Desplazamiento pequeño y determinista para que no se apilen en el mismo punto.
		const h = hash(it.id_fuente);
		it.lat = centro.lat + ((h % 100) - 50) * 0.00004;
		it.lng = centro.lng + (((h >> 8) % 100) - 50) * 0.00004;
		it.ubicacion = 'aproximada';
		it.validacion = 'sin validar';
	}
}

// ---------- 5. Duplicados ----------
const PESO = { validado: 3, parcial: 2, 'sin validar': 1 };
const esDuplicado = (a, b) =>
	a.operacion === b.operacion && a.tipo === b.tipo && a.dormitorios === b.dormitorios && a.banos === b.banos &&
	Math.abs(a.precio - b.precio) / a.precio <= 0.02 &&
	(!a.m2 || !b.m2 || Math.abs(a.m2 - b.m2) / a.m2 <= 0.05) &&
	(distanciaMetros(a, b) < 200 || (a.sector === b.sector && (a.ubicacion === 'aproximada' || b.ubicacion === 'aproximada')));

const unicos = [];
for (const it of items) {
	const previo = unicos.find((u) => esDuplicado(u, it));
	if (!previo) {
		unicos.push({ ...it, fuentes: [{ fuente: it.fuente, url: it.url }] });
		continue;
	}
	reporte.duplicados_fusionados++;
	previo.fuentes.push({ fuente: it.fuente, url: it.url });
	if (PESO[it.validacion] > PESO[previo.validacion]) {
		Object.assign(previo, { lat: it.lat, lng: it.lng, direccion: it.direccion, ubicacion: it.ubicacion, validacion: it.validacion });
	}
	if (it.publicado < previo.publicado) previo.publicado = it.publicado;
}

// ---------- 6. Salida ----------
const propiedades = unicos.map((u, i) => ({
	id: i + 1,
	operacion: u.operacion,
	tipo: u.tipo,
	precio: u.precio,
	moneda: u.moneda,
	dormitorios: u.dormitorios,
	banos: u.banos,
	m2: u.m2 ?? null,
	comuna: u.comuna,
	sector: u.sector ?? null,
	direccion: u.direccion ?? null,
	lat: +u.lat.toFixed(5),
	lng: +u.lng.toFixed(5),
	ubicacion: u.ubicacion,
	validacion: u.validacion,
	titulo: limpiarTitulo(ocultarContacto(u.titulo)),
	descripcion: ocultarContacto(u.descripcion),
	fuentes: [...new Map(u.fuentes.map((f) => [f.fuente, f])).values()],
	publicado: u.publicado,
	estacion: estacionMasCercana(u),
}));

reporte.publicados = propiedades.length;
reporte.actualizado = new Date().toISOString();
const salida = { reporte, propiedades };
writeFileSync(new URL('../data/propiedades.json', import.meta.url), JSON.stringify(salida));
// Copia como script para que index.html funcione abriéndolo directo (file://) sin servidor.
writeFileSync(new URL('../data/propiedades.js', import.meta.url), `window.DATOS = ${JSON.stringify(salida)};\n`);
console.log(reporte);
writeFileSync(new URL('../data/estaciones.js', import.meta.url), `window.ESTACIONES = ${JSON.stringify(ESTACIONES)};\n`);
