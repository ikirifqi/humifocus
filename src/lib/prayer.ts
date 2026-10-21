import { formatHours } from './format';

export interface City {
	lat: number;
	lng: number;
	/** UTC offset in hours. */
	tz: number;
	/** Sun depression angle for Fajr, in degrees. */
	fajr: number;
	/** Sun depression angle for Isha, in degrees. */
	isha: number;
	method: string;
}

export const CITIES: Record<string, City> = {
	Jakarta: { lat: -6.2, lng: 106.82, tz: 7, fajr: 20, isha: 18, method: 'Kemenag' },
	'Kuala Lumpur': { lat: 3.14, lng: 101.69, tz: 8, fajr: 20, isha: 18, method: 'JAKIM' },
	Dubai: { lat: 25.2, lng: 55.27, tz: 4, fajr: 18.2, isha: 18, method: 'Dubai' },
	Cairo: { lat: 30.04, lng: 31.24, tz: 2, fajr: 19.5, isha: 17.5, method: 'Egyptian GAS' },
	Istanbul: { lat: 41.01, lng: 28.98, tz: 3, fajr: 18, isha: 17, method: 'Diyanet' },
	London: { lat: 51.51, lng: -0.13, tz: 0, fajr: 18, isha: 17, method: 'MWL' },
	'New York': { lat: 40.71, lng: -74.01, tz: -5, fajr: 15, isha: 15, method: 'ISNA' }
};

export const DEFAULT_CITY = 'Jakarta';

/**
 * Identifies a city regardless of case and punctuation. It keys the city's uploaded timetables
 * in Firestore, and `firestore.rules` derives the same slug.
 */
export function citySlug(city: string) {
	return city.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

export const PRAYERS = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const;
export type Prayer = (typeof PRAYERS)[number];
export type PrayerTimes = Record<Prayer, number>;

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const dsin = (d: number) => Math.sin(d * D2R);
const dcos = (d: number) => Math.cos(d * D2R);
const dtan = (d: number) => Math.tan(d * D2R);
const fixAngle = (a: number) => ((a % 360) + 360) % 360;
const fixHour = (h: number) => ((h % 24) + 24) % 24;

/** Prayer times for a calendar date, as fractional hours in the city's local time. */
export function prayerTimes(date: Date, c: City): PrayerTimes {
	const y = date.getFullYear();
	const m = date.getMonth() + 1;
	const d = date.getDate();
	const Y = m <= 2 ? y - 1 : y;
	const M = m <= 2 ? m + 12 : m;
	const A = Math.floor(Y / 100);
	const B = 2 - A + Math.floor(A / 4);
	const jd =
		Math.floor(365.25 * (Y + 4716)) + Math.floor(30.6001 * (M + 1)) + d + B - 1524.5 - c.lng / 360;

	const sun = (t: number) => {
		const D = jd + t - 2451545;
		const g = fixAngle(357.529 + 0.98560028 * D);
		const q = fixAngle(280.459 + 0.98564736 * D);
		const L = fixAngle(q + 1.915 * dsin(g) + 0.02 * dsin(2 * g));
		const e = 23.439 - 0.00000036 * D;
		const RA = (Math.atan2(dcos(e) * dsin(L), dcos(L)) * R2D) / 15;
		return { decl: Math.asin(dsin(e) * dsin(L)) * R2D, eqt: q / 15 - fixHour(RA) };
	};
	const noon = (t: number) => fixHour(12 - sun(t).eqt);
	const angleTime = (angle: number, t: number, ccw: boolean) => {
		const s = sun(t);
		const x = (-dsin(angle) - dsin(s.decl) * dsin(c.lat)) / (dcos(s.decl) * dcos(c.lat));
		const h = (Math.acos(Math.max(-1, Math.min(1, x))) * R2D) / 15;
		return noon(t) + (ccw ? -h : h);
	};
	const asr = (t: number) => {
		const s = sun(t);
		const angle = -Math.atan(1 / (1 + dtan(Math.abs(c.lat - s.decl)))) * R2D;
		return angleTime(angle, t, false);
	};

	let T: PrayerTimes = { Fajr: 5, Sunrise: 6, Dhuhr: 12, Asr: 13, Maghrib: 18, Isha: 18 };
	for (let i = 0; i < 2; i++) {
		T = {
			Fajr: angleTime(c.fajr, T.Fajr / 24, true),
			Sunrise: angleTime(0.833, T.Sunrise / 24, true),
			Dhuhr: noon(T.Dhuhr / 24) + 2 / 60,
			Asr: asr(T.Asr / 24),
			Maghrib: angleTime(0.833, T.Maghrib / 24, false),
			Isha: angleTime(c.isha, T.Isha / 24, false)
		};
	}

	const out = {} as PrayerTimes;
	for (const p of PRAYERS) out[p] = fixHour(T[p] + c.tz - c.lng / 15);
	return out;
}

export interface NextPrayer {
	city: City;
	cityName: string;
	/** Today's date in the city, as a local-midnight Date. */
	today: Date;
	name: Prayer;
	/** Hours until the next prayer. */
	inHours: number;
	/** `HH:MM` of the next prayer. */
	at: string;
}

/** The next obligatory prayer (Sunrise excluded) in the city, relative to `now`. */
export function nextPrayer(now: number, cityName: string | null): NextPrayer {
	const name = cityName && CITIES[cityName] ? cityName : DEFAULT_CITY;
	const city = CITIES[name];

	// "now" in the city's wall-clock time.
	const local = new Date(now + city.tz * 3600000);
	const hours = local.getUTCHours() + local.getUTCMinutes() / 60 + local.getUTCSeconds() / 3600;
	const today = new Date(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
	const times = prayerTimes(today, city);

	const upcoming = PRAYERS.filter((p) => p !== 'Sunrise').find((p) => times[p] > hours);
	if (upcoming) {
		return {
			city,
			cityName: name,
			today,
			name: upcoming,
			inHours: times[upcoming] - hours,
			at: formatHours(times[upcoming])
		};
	}

	const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
	const fajr = prayerTimes(tomorrow, city).Fajr;
	return {
		city,
		cityName: name,
		today,
		name: 'Fajr',
		inHours: 24 - hours + fajr,
		at: formatHours(fajr)
	};
}

/** The listed city closest to a coordinate. */
export function nearestCity(lat: number, lng: number) {
	const dist = (n: string) => Math.hypot(CITIES[n].lat - lat, CITIES[n].lng - lng);
	return Object.keys(CITIES).sort((a, b) => dist(a) - dist(b))[0];
}
