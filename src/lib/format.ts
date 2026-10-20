export const pad = (n: number) => String(n).padStart(2, '0');

/** Short duration such as `45m` or `2h 05m`. */
export function formatDuration(ms: number) {
	const m = Math.round(ms / 60000);
	if (m < 60) return m + 'm';
	return Math.floor(m / 60) + 'h ' + pad(m % 60) + 'm';
}

/** Stopwatch digits such as `01:24:09`. */
export function formatDigits(ms: number) {
	const s = Math.floor(ms / 1000);
	return pad(Math.floor(s / 3600)) + ':' + pad(Math.floor(s / 60) % 60) + ':' + pad(s % 60);
}

/** Wall-clock time in the user's locale, such as `9:41 AM`. */
export function formatTime(t: number) {
	return new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** Fractional hours as 24-hour `HH:MM`. */
export function formatHours(h: number) {
	const mins = Math.round(h * 60);
	return pad(Math.floor(mins / 60) % 24) + ':' + pad(mins % 60);
}

export function startOfDay(t: number) {
	const d = new Date(t);
	d.setHours(0, 0, 0, 0);
	return d.getTime();
}
