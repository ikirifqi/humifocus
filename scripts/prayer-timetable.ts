// Fetch a year of Kemenag prayer times for an Indonesian regency from api.co.id and write it as
// CSV for the prayer timetable's upload button. The API key is asked for on each run and never
// stored; set API_CO_ID_KEY to skip the prompt.
//
//   pnpm timetable --search bandung                 Find a regency code
//   pnpm timetable --regency 3204 [--year 2026]     Write prayer-timetable-2026-bandung.csv
//                  [--city Bandung] [--out file.csv]

import { writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { parseArgs } from 'node:util';

const API = 'https://use.api.co.id/regional/indonesia/prayer-times';

/** Must match `CSV_COLUMNS` in src/lib/timetable.ts. */
const COLUMNS = [
	'City',
	'UTC offset',
	'Date',
	'Fajr',
	'Sunrise',
	'Dhuhr',
	'Asr',
	'Maghrib',
	'Isha'
];

interface Page<T> {
	is_success: boolean;
	message: string;
	data: T[] | null;
	paging?: { page: number; total_page: number };
}

interface Regency {
	code: string;
	name: string;
}

interface Day {
	regency_name: string;
	gmt: number;
	date: string;
	shubuh: string;
	terbit: string;
	dzuhur: string;
	ashr: string;
	maghrib: string;
	isya: string;
}

/** Ask for the API key without echoing it to the terminal. */
async function askKey() {
	const silent = new Writable({ write: (_chunk, _encoding, done) => done() });
	const rl = createInterface({ input: process.stdin, output: silent, terminal: true });
	process.stderr.write('api.co.id API key: ');
	const key = await rl.question('');
	rl.close();
	process.stderr.write('\n');
	return key.trim();
}

/** Every page of an endpoint's results. */
async function fetchAll<T>(key: string, path: string, params: Record<string, string> = {}) {
	const items: T[] = [];
	for (let page = 1, total = 1; page <= total; page++) {
		const url = `${API}${path}?${new URLSearchParams({ ...params, page: String(page) })}`;
		const res = await fetch(url, { headers: { 'x-api-co-id': key } });
		const body = (await res.json().catch(() => null)) as Page<T> | null;
		if (!res.ok || !body?.is_success) {
			throw new Error(`api.co.id answered ${res.status}: ${body?.message ?? res.statusText}`);
		}
		items.push(...(body.data ?? []));
		total = body.paging?.total_page ?? 1;
	}
	return items;
}

const titleCase = (s: string) => s.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const cell = (v: string | number) =>
	/[",\n]/.test(String(v)) ? `"${String(v).replaceAll('"', '""')}"` : String(v);

async function main() {
	const { values } = parseArgs({
		options: {
			search: { type: 'string' },
			regency: { type: 'string' },
			year: { type: 'string', default: String(new Date().getFullYear()) },
			city: { type: 'string' },
			out: { type: 'string' }
		}
	});
	const { search, regency } = values;
	if (search === undefined && !regency) {
		throw new Error('Pass --search <name> to find a regency, or --regency <code> to fetch one.');
	}
	const year = Number(values.year);
	if (!Number.isInteger(year)) throw new Error('--year must be a year such as 2026.');

	const key = process.env.API_CO_ID_KEY || (await askKey());
	if (!key) throw new Error('An API key is required.');

	if (search !== undefined || !regency) {
		const term = (search ?? '').toLowerCase();
		const regencies = await fetchAll<Regency>(key, '/regencies');
		const found = regencies.filter((r) => r.name.toLowerCase().includes(term));
		for (const r of found) console.log(`${r.code}  ${r.name}`);
		if (found.length === 0) console.error(`No regency matches "${search}".`);
		return;
	}

	const days = await fetchAll<Day>(key, '', {
		regency_code: regency,
		start_date: `${year}-01-01`,
		end_date: `${year}-12-31`
	});
	const expected = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
	if (days.length !== expected) {
		throw new Error(`api.co.id has ${days.length} of the ${expected} days in ${year}.`);
	}

	const city = values.city ?? titleCase(days[0].regency_name);
	const lines = [
		COLUMNS.join(','),
		...days.map((d) =>
			[city, d.gmt, d.date, d.shubuh, d.terbit, d.dzuhur, d.ashr, d.maghrib, d.isya]
				.map(cell)
				.join(',')
		)
	];
	const out = values.out ?? `prayer-timetable-${year}-${slug(city)}.csv`;
	await writeFile(out, lines.join('\n') + '\n');
	console.error(`Wrote ${days.length} days of ${city} to ${out}`);
}

main().catch((err) => {
	console.error(err instanceof Error ? err.message : err);
	process.exitCode = 1;
});
