<script lang="ts">
	import { app } from '#lib/app.svelte.js';
	import { clickOutside } from '#lib/click-outside.js';
	import { formatHours } from '#lib/format.js';
	import {
		CITIES,
		PRAYERS,
		findPlace,
		nearestCity,
		nextPrayer,
		placeNames,
		placeToday
	} from '#lib/prayer.js';
	import { parseTimetableCsv } from '#lib/timetable.js';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	const CITY_MENU_WIDTH = 220;

	let dialog: HTMLDialogElement;
	let fileInput: HTMLInputElement;
	let cityBtn: HTMLButtonElement;
	let monthOffset = $state(0);
	let cityOpen = $state(false);
	let cityMenu = $state({ top: 0, left: 0, maxHeight: 0 });
	let locating = $state(false);
	let uploadError = $state('');

	const place = $derived(findPlace(app.city, app.timetables));
	const today = $derived(placeToday(app.now, place).today);
	const next = $derived(nextPrayer(app.now, place));
	const month = $derived(new Date(today.getFullYear(), today.getMonth() + monthOffset, 1));
	const timetable = $derived(place.timetable(month.getFullYear()));
	const rows = $derived.by(() => {
		const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
		return Array.from({ length: days }, (_, i) => {
			const date = new Date(month.getFullYear(), month.getMonth(), i + 1);
			return {
				date,
				isToday: monthOffset === 0 && i + 1 === today.getDate(),
				times: place.times(date)
			};
		});
	});

	$effect(() => {
		if (open) {
			monthOffset = 0;
			uploadError = '';
			dialog.showModal();
		} else {
			dialog.close();
		}
	});

	/**
	 * The city menu is fixed to the viewport, so the dialog's edges never crop it on a small
	 * screen. Place it under its button, kept on screen.
	 */
	function toggleCity() {
		cityOpen = !cityOpen;
		if (!cityOpen) return;
		const rect = cityBtn.getBoundingClientRect();
		const top = rect.bottom + 6;
		cityMenu = {
			top,
			left: Math.max(8, Math.min(rect.right - CITY_MENU_WIDTH, innerWidth - CITY_MENU_WIDTH - 8)),
			maxHeight: innerHeight - top - 8
		};
	}

	function pickCity(name: string) {
		app.setCity(name);
		cityOpen = false;
		locating = false;
		monthOffset = 0;
		uploadError = '';
	}

	function locate() {
		if (!navigator.geolocation) return pickCity(place.name);
		locating = true;
		navigator.geolocation.getCurrentPosition(
			(p) => pickCity(nearestCity(p.coords.latitude, p.coords.longitude)),
			() => pickCity(place.name),
			{ timeout: 6000 }
		);
	}

	async function upload() {
		const file = fileInput.files?.[0];
		fileInput.value = '';
		if (!file) return;
		try {
			const timetable = parseTimetableCsv(await file.text());
			// The upload shows at once from the local cache; the server's answer comes later.
			const saved = app.uploadTimetable(timetable);
			pickCity(timetable.city);
			// Open on the uploaded year: this month, or January of another year.
			if (timetable.year !== today.getFullYear()) {
				monthOffset = (timetable.year - today.getFullYear()) * 12 - today.getMonth();
			}
			await saved;
		} catch (err) {
			uploadError = `Couldn't upload ${file.name}. ${err instanceof Error ? err.message : err}`;
		}
	}

	const uploadedOn = (t: number) =>
		new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
</script>

<!-- The city menu is placed for the window it opened in. -->
<svelte:window onresize={() => (cityOpen = false)} />

<dialog
	bind:this={dialog}
	onclose={() => (open = false)}
	onclick={(ev) => ev.target === dialog && (open = false)}
	aria-labelledby="prayer-title"
>
	<div class="panel">
		<div class="head">
			<div class="title">
				<span id="prayer-title">Prayer timetable</span>
				<span class="sub"
					>{place.name} · {timetable ? 'Uploaded timetable' : (place.method ?? 'No timetable')} · UTC{place.tz >=
					0
						? '+'
						: ''}{place.tz}</span
				>
			</div>
			<div class="controls">
				<div class="city" {@attach clickOutside(() => (cityOpen = false))}>
					<button
						bind:this={cityBtn}
						class="ctl city-btn"
						onclick={toggleCity}
						title="Change location"
						aria-expanded={cityOpen}
					>
						<svg
							width="15"
							height="15"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.8"
							stroke-linecap="round"
							stroke-linejoin="round"
							><path d="M12 21s-6-5.3-6-11a6 6 0 0 1 12 0c0 5.7-6 11-6 11z"></path><circle
								cx="12"
								cy="10"
								r="2.2"
							></circle></svg
						>{place.name}
					</button>
					{#if cityOpen}
						<div
							class="popover city-menu"
							style:top="{cityMenu.top}px"
							style:left="{cityMenu.left}px"
							style:width="{CITY_MENU_WIDTH}px"
							style:max-height="{cityMenu.maxHeight}px"
						>
							<button class="city-item locate" onclick={locate}>
								<svg
									width="15"
									height="15"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="1.8"
									stroke-linecap="round"
									><circle cx="12" cy="12" r="7"></circle><circle cx="12" cy="12" r="2"
									></circle><path d="M12 2v3M12 19v3M2 12h3M19 12h3"></path></svg
								>{locating ? 'Locating…' : 'Use my location'}
							</button>
							<div class="sep"></div>
							{#each placeNames(app.timetableCities) as name (name)}
								<button
									class="city-item"
									class:selected={name === place.name}
									onclick={() => pickCity(name)}
								>
									<span>{name}</span><span class="method">{CITIES[name]?.method ?? 'Uploaded'}</span
									>
								</button>
							{/each}
						</div>
					{/if}
				</div>
				<input bind:this={fileInput} type="file" accept=".csv,text/csv" hidden onchange={upload} />
				<button
					class="ctl square"
					onclick={() => fileInput.click()}
					title="Upload a year of prayer times as CSV"
					aria-label="Upload timetable CSV"
				>
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.8"
						stroke-linecap="round"
						stroke-linejoin="round"
						><path d="M12 15V4M7 9l5-5 5 5"></path><path d="M4 19h16"></path></svg
					>
				</button>
				<button class="ctl square" onclick={() => monthOffset--} aria-label="Previous month">
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.8"
						stroke-linecap="round"
						stroke-linejoin="round"><path d="M15 5l-7 7 7 7"></path></svg
					>
				</button>
				<span class="month"
					>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span
				>
				<button class="ctl square" onclick={() => monthOffset++} aria-label="Next month">
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.8"
						stroke-linecap="round"
						stroke-linejoin="round"><path d="M9 5l7 7-7 7"></path></svg
					>
				</button>
				<button class="ctl square close" onclick={() => (open = false)} aria-label="Close">
					<svg
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.8"
						stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"></path></svg
					>
				</button>
			</div>
		</div>
		{#if uploadError}
			<p class="note error" role="alert">{uploadError}</p>
		{:else if timetable}
			<p class="note">
				Times for {timetable.year} come from a timetable uploaded {uploadedOn(timetable.uploadedAt)}
				by {timetable.uploadedBy === app.user?.uid ? 'you' : 'another user'}.
			</p>
		{:else if !place.method}
			<p class="note">
				No timetable uploaded for {place.name} in {month.getFullYear()}. Upload a CSV to fill it in.
			</p>
		{/if}
		<div class="scroll">
			<table>
				<thead>
					<tr>
						<th class="date">Date</th>
						{#each PRAYERS as p (p)}
							<th>{p}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each rows as r (r.date.getTime())}
						<tr class:today={r.isToday}>
							<td class="date">
								<span class="day"
									>{r.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span
								>
								<span class="wd">{r.date.toLocaleDateString(undefined, { weekday: 'short' })}</span>
							</td>
							{#each PRAYERS as p (p)}
								<td class:sunrise={p === 'Sunrise'} class:next={r.isToday && p === next?.name}
									>{r.times ? formatHours(r.times[p]) : '–'}</td
								>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</dialog>

<style>
	dialog {
		width: min(720px, calc(100% - 32px));
		max-width: none;
		max-height: calc(100dvh - 32px);
		padding: 0;
		border-radius: 18px;
		border: 1px solid var(--line);
		background: var(--bg);
		color: var(--fg);
		box-shadow: 0 24px 60px -20px rgba(0, 0, 0, 0.4);
		overflow: hidden;
	}

	dialog[open] {
		display: flex;
	}

	dialog::backdrop {
		background: rgba(0, 0, 0, 0.35);
	}

	.panel {
		display: flex;
		flex-direction: column;
		width: 100%;
		min-height: 0;
	}

	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 16px 16px 12px 20px;
		border-bottom: 1px solid var(--line);
		flex-wrap: wrap;
	}

	.title {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.title > :first-child {
		font-size: 17px;
		font-weight: 500;
	}

	.sub {
		font-size: 12px;
		color: var(--fg2);
	}

	.controls {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
		justify-content: flex-end;
	}

	.ctl {
		height: 40px;
		border-radius: 10px;
		border: 1px solid var(--line);
		background: var(--bg2);
		color: var(--fg2);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}

	.ctl:hover {
		color: var(--fg);
	}

	.square {
		width: 40px;
	}

	.close {
		border: none;
		background: transparent;
		margin-left: 4px;
	}

	.city {
		position: relative;
	}

	.city-btn {
		gap: 8px;
		padding: 0 12px;
		color: var(--fg);
		font-size: 13px;
		font-weight: 500;
	}

	.city-btn:hover {
		border-color: var(--fg3);
	}

	.city-btn svg {
		color: var(--fg2);
	}

	.city-menu {
		position: fixed;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 6px;
		border-radius: 12px;
		box-shadow: 0 12px 32px -12px rgba(0, 0, 0, 0.3);
		display: flex;
		flex-direction: column;
		gap: 2px;
		z-index: 30;
	}

	.city-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 10px;
		height: 42px;
		border-radius: 8px;
		border: none;
		background: transparent;
		color: var(--fg);
		font-size: 14px;
		cursor: pointer;
		text-align: left;
		width: 100%;
		flex-shrink: 0;
	}

	.city-item:hover,
	.city-item.selected {
		background: var(--accent2);
	}

	.locate {
		justify-content: flex-start;
		gap: 10px;
		height: 44px;
		font-weight: 600;
	}

	.locate svg {
		color: var(--accent);
	}

	.method {
		font-size: 11px;
		color: var(--fg3);
		font-family: var(--mono);
	}

	.sep {
		flex-shrink: 0;
		height: 1px;
		background: var(--line);
		margin: 4px 6px;
	}

	.month {
		font-size: 14px;
		font-weight: 500;
		min-width: 130px;
		text-align: center;
	}

	.note {
		margin: 0;
		padding: 10px 20px;
		border-bottom: 1px solid var(--line);
		font-size: 12px;
		color: var(--fg2);
	}

	.note.error {
		color: var(--danger);
	}

	.scroll {
		overflow: auto;
		padding: 0 8px 8px;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-family: var(--mono);
		font-size: 13px;
		min-width: 520px;
	}

	thead tr {
		position: sticky;
		top: 0;
		background: var(--bg);
		z-index: 1;
	}

	th {
		text-align: right;
		padding: 12px 12px 8px;
		font-family: var(--sans);
		font-size: 11px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--fg3);
		font-weight: 600;
	}

	td {
		padding: 9px 12px;
		border-top: 1px solid var(--line);
		text-align: right;
		white-space: nowrap;
	}

	.date {
		text-align: left;
	}

	td.date {
		font-family: var(--sans);
		font-size: 13px;
	}

	.wd,
	.sunrise {
		color: var(--fg3);
	}

	tr.today {
		background: var(--accent2);
	}

	tr.today .day,
	.next {
		font-weight: 600;
	}

	.next {
		color: var(--accent);
	}
</style>
