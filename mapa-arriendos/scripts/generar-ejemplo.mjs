// Genera anuncios "crudos" de EJEMPLO (ficticios) para probar el sistema.
// Simula lo que llegaría de varias fuentes: duplicados entre portales,
// precios falsos/gancho y teléfonos escritos en la descripción.
//
// Uso: node scripts/generar-ejemplo.mjs [cantidad]
import { writeFileSync } from 'node:fs';
import { ESTACIONES } from './geo.mjs';

const CANTIDAD = Number(process.argv[2] ?? 520);

// RNG con semilla para que el ejemplo sea reproducible.
let semilla = 20261125;
const rnd = () => {
	semilla = (semilla * 1664525 + 1013904223) % 4294967296;
	return semilla / 4294967296;
};
const elegir = (arr) => arr[Math.floor(rnd() * arr.length)];
const entre = (a, b) => a + rnd() * (b - a);
const redondear = (n, paso) => Math.round(n / paso) * paso;

const SECTORES = {
	Valparaíso: ['Cerro Alegre', 'Cerro Concepción', 'Barón', 'Placeres', 'Playa Ancha', 'Plan', 'Cerro Bellavista'],
	'Viña del Mar': ['Centro', 'Miramar', 'Recreo', 'Chorrillos', 'Población Vergara', 'El Salto', 'Santa Inés'],
	Quilpué: ['Centro', 'El Sol', 'Belloto', 'Los Pinos'],
	'Villa Alemana': ['Centro', 'Peñablanca', 'Las Américas'],
	Limache: ['Centro', 'San Francisco'],
};
const CALLES = ['Av. Libertad', 'Calle Valparaíso', 'Av. España', 'Errázuriz', 'Pedro Montt', 'Los Carrera',
	'Blanco', 'Freire', 'Prat', 'Baquedano', 'Av. Los Libertadores', 'Colón', 'Uruguay', 'Álvarez', 'Quillota'];
const FUENTES = ['Portal', 'Marketplace', 'Corredora', 'Clasificados'];
const FACTOR_COMUNA = { 'Viña del Mar': 1, Valparaíso: 0.9, Quilpué: 0.8, 'Villa Alemana': 0.78, Limache: 0.75 };
const COSTERAS = new Set(['Puerto', 'Bellavista', 'Francia', 'Barón', 'Portales', 'Recreo', 'Miramar', 'Viña del Mar']);

function telefono() {
	const n = `9${Math.floor(entre(10000000, 99999999))}`;
	return elegir([`+56 ${n[0]} ${n.slice(1, 5)} ${n.slice(5)}`, `+569${n.slice(1)}`, n, `${n.slice(0, 1)}-${n.slice(1, 5)}-${n.slice(5)}`]);
}

function anuncio(i) {
	const est = elegir(ESTACIONES);
	const comuna = est.comuna;
	const sector = elegir(SECTORES[comuna]);
	const operacion = rnd() < 0.75 ? 'arriendo' : 'venta';
	const tipo = rnd() < 0.68 ? 'Departamento' : 'Casa';
	const dormitorios = elegir(tipo === 'Casa' ? [2, 3, 3, 4] : [1, 1, 2, 2, 2, 3]);
	const banos = Math.max(1, Math.min(dormitorios, elegir([1, 1, 2])));
	const m2 = Math.round(dormitorios * entre(22, 32) + (tipo === 'Casa' ? 25 : 8));

	// Ubicación: más cerca del metro es más probable; costa → sesgo hacia tierra (sur).
	const r = rnd() ** 1.6 * 0.016;
	const ang = rnd() * Math.PI * 2;
	let dLat = Math.sin(ang) * r;
	if (COSTERAS.has(est.nombre)) dLat = -Math.abs(dLat) * 0.8 + 0.001;
	const lat = est.lat + dLat;
	const lng = est.lng + Math.cos(ang) * r * 1.2;

	const base = { 1: 360000, 2: 460000, 3: 590000, 4: 720000 }[dormitorios];
	const factor = FACTOR_COMUNA[comuna] * (tipo === 'Casa' ? 1.12 : 1) * entre(0.85, 1.18);
	let precio = operacion === 'arriendo' ? redondear(base * factor, 5000) : redondear(base * factor * 0.0072, 50);

	const precision = rnd();
	const calle = elegir(CALLES);
	let direccion = null;
	let coords = { lat, lng };
	if (precision < 0.55) direccion = `${calle} ${Math.floor(entre(100, 2500))}, ${sector}`;
	else if (precision < 0.8) direccion = `${calle}, ${sector}`;
	else coords = null; // solo dice el sector

	let descripcion = elegir([
		`Se ${operacion === 'arriendo' ? 'arrienda' : 'vende'} ${tipo.toLowerCase()} luminoso en ${sector}.`,
		`${tipo} amplio, ${dormitorios} dormitorios, cerca de metro ${est.nombre}.`,
		`Excelente ubicación en ${sector}, ${comuna}. ${rnd() < 0.5 ? 'Con estacionamiento.' : 'Sin estacionamiento.'}`,
		`${tipo} recién pintado, vista despejada. Gastos comunes bajos.`,
	]);
	if (rnd() < 0.35) descripcion += ` Interesados llamar o WhatsApp ${telefono()}.`;

	// Precios gancho / falsos.
	if (rnd() < 0.045) precio = elegir([1, 1000, 11111, 99999999, 123456]);

	return {
		id_fuente: `ej-${i}`,
		fuente: elegir(FUENTES),
		url: null,
		titulo: `${tipo} ${dormitorios}D ${banos}B en ${sector}`,
		descripcion,
		operacion,
		tipo,
		precio: operacion === 'arriendo' ? `$${precio.toLocaleString('es-CL')}` : `UF ${precio.toLocaleString('es-CL')}`,
		dormitorios,
		banos,
		m2,
		comuna,
		sector,
		direccion,
		lat: coords?.lat ?? null,
		lng: coords?.lng ?? null,
		publicado: new Date(Date.UTC(2026, 10, 25) - Math.floor(entre(0, 30)) * 864e5).toISOString().slice(0, 10),
	};
}

const crudos = [];
for (let i = 0; i < CANTIDAD; i++) {
	const a = anuncio(i);
	crudos.push(a);
	// ~9 %: el mismo aviso publicado en otra fuente con pequeñas variaciones.
	if (rnd() < 0.09) {
		crudos.push({
			...a,
			id_fuente: `${a.id_fuente}-dup`,
			fuente: elegir(FUENTES.filter((f) => f !== a.fuente)),
			titulo: a.titulo.toUpperCase() + elegir(['!!', ' - OPORTUNIDAD', '', ' (disponible)']),
			lat: a.lat && a.lat + entre(-0.0004, 0.0004),
			lng: a.lng && a.lng + entre(-0.0004, 0.0004),
		});
	}
}

writeFileSync(new URL('../data/crudos-ejemplo.json', import.meta.url), JSON.stringify(crudos, null, 1));
console.log(`Generados ${crudos.length} anuncios crudos de ejemplo → data/crudos-ejemplo.json`);
