import { formatHours } from './format';
import { CITIES, PRAYERS, citySlug, type PrayerTimes } from './prayer';

/** A city's prayer times for one year, uploaded as CSV and shared with every user. */
export interface Timetable {
	city: string;
	year: number;
	/** UTC offset in hours. */
	tz: number;
	/** Times by month (0 to 11), then by day of the month (0-based). */
	months: PrayerTimes[][];
	/** Uid of the user who last uploaded it. */
	uploadedBy: string;
	uploadedAt: number;
}

export type ParsedTimetable = Omit<Timetable, 'uploadedBy' | 'uploadedAt'>;

/** Header row of the CSV, as written by `scripts/prayer-timetable.ts`. */
export const CSV_COLUMNS = ['City', 'UTC offset', 'Date', ...PRAYERS];

/** Years a timetable can be uploaded for, matching `firestore.rules`. */
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();

/** Document id of a city's timetable for a year. `firestore.rules` derives the same id. */
export function timetableId(city: string, year: number) {
	return citySlug(city) + '_' + year;
}

/** `H:MM` or `HH:MM`, with optional seconds, as fractional hours; `null` when malformed. */
function parseTime(s: string) {
	const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s);
	if (!m || +m[1] > 23 || +m[2] > 59) return null;
	return +m[1] + +m[2] / 60;
}

/** Split CSV text into rows of cells, honoring double-quoted cells. */
function csvRows(text: string) {
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = '';
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (quoted) {
			if (c === '"' && text[i + 1] === '"') {
				cell += '"';
				i++;
			} else if (c === '"') quoted = false;
			else cell += c;
		} else if (c === '"') quoted = true;
		else if (c === ',') {
			row.push(cell);
			cell = '';
		} else if (c === '\n' || c === '\r') {
			if (c === '\r' && text[i + 1] === '\n') i++;
			row.push(cell);
			rows.push(row);
			row = [];
			cell = '';
		} else cell += c;
	}
	row.push(cell);
	rows.push(row);
	return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/**
 * Read a year of prayer times for one city from CSV with the `CSV_COLUMNS` header.
 * Throws an `Error` whose message explains what is wrong, for showing to the user.
 */
export function parseTimetableCsv(text: string): ParsedTimetable {
	const [header, ...rows] = csvRows(text.replace(/^\uFEFF/, ''));
	if (!header) throw new Error('The file is empty.');
	const names = header.map((h) => h.trim().toLowerCase());
	const col: Record<string, number> = {};
	for (const name of CSV_COLUMNS) {
		col[name] = names.indexOf(name.toLowerCase());
		if (col[name] < 0) throw new Error(`Missing the "${name}" column.`);
	}

	let first: { city: string; tz: number; year: number } | undefined;
	let months: (PrayerTimes | undefined)[][] = [];
	for (const [i, row] of rows.entries()) {
		const line = `Line ${i + 2}`;
		const get = (name: string) => (row[col[name]] ?? '').trim();

		// A listed city spelled another way is that city, so the upload replaces its calculated times.
		const city =
			Object.keys(CITIES).find((c) => citySlug(c) === citySlug(get('City'))) ?? get('City');
		if (!city || city.length > 100) throw new Error(`${line}: city must be 1 to 100 characters.`);
		if (!/[a-z0-9]/.test(citySlug(city))) {
			throw new Error(`${line}: city must have at least one Latin letter or digit.`);
		}
		const tz = Number(get('UTC offset'));
		if (get('UTC offset') === '' || !Number.isFinite(tz) || tz < -12 || tz > 14) {
			throw new Error(`${line}: UTC offset must be a number of hours, such as 7.`);
		}
		const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(get('Date'));
		const [year, month, day] = date ? [+date[1], +date[2] - 1, +date[3]] : [0, -1, 0];
		if (!date || month > 11 || day < 1 || day > daysInMonth(year, month)) {
			throw new Error(`${line}: date must look like 2026-01-31.`);
		}
		if (year < MIN_YEAR || year > MAX_YEAR) {
			throw new Error(`${line}: the year must be between ${MIN_YEAR} and ${MAX_YEAR}.`);
		}

		if (!first) {
			first = { city, tz, year };
			months = Array.from({ length: 12 }, (_, m) => new Array(daysInMonth(year, m)));
		} else if (city !== first.city || tz !== first.tz || year !== first.year) {
			throw new Error(`${line}: every row must have the same city, UTC offset, and year.`);
		}
		if (months[month][day - 1]) throw new Error(`${line}: ${get('Date')} appears twice.`);

		const times = {} as PrayerTimes;
		for (const p of PRAYERS) {
			const t = parseTime(get(p));
			if (t === null) throw new Error(`${line}: ${p} must be a time such as 04:35.`);
			times[p] = t;
		}
		months[month][day - 1] = times;
	}

	if (!first) throw new Error('The file has no rows.');
	for (let m = 0; m < 12; m++) {
		const missing = months[m].findIndex((t) => !t);
		if (missing >= 0) {
			const date = new Date(first.year, m, missing + 1).toLocaleDateString(undefined, {
				month: 'short',
				day: 'numeric',
				year: 'numeric'
			});
			throw new Error(`The file has no times for ${date}. It needs every day of the year.`);
		}
	}
	return { ...first, months: months as PrayerTimes[][] };
}

/**
 * Firestore stores each month as one string, so the security rules can check its shape with a
 * single regex: days separated by commas, each day six `HH:MM` times separated by spaces.
 */
export function encodeMonths(months: PrayerTimes[][]) {
	return months.map((days) =>
		days.map((t) => PRAYERS.map((p) => formatHours(t[p])).join(' ')).join(',')
	);
}

/** The reverse of `encodeMonths`; `null` when malformed or missing a day of the year. */
export function decodeMonths(value: unknown, year: number): PrayerTimes[][] | null {
	if (!Array.isArray(value) || value.length !== 12) return null;
	const months: PrayerTimes[][] = [];
	for (const [m, month] of value.entries()) {
		if (typeof month !== 'string' || month.split(',').length !== daysInMonth(year, m)) return null;
		const days: PrayerTimes[] = [];
		for (const day of month.split(',')) {
			const parts = day.split(' ').map(parseTime);
			if (parts.length !== PRAYERS.length || parts.includes(null)) return null;
			days.push(Object.fromEntries(PRAYERS.map((p, i) => [p, parts[i]])) as PrayerTimes);
		}
		months.push(days);
	}
	return months;
}
