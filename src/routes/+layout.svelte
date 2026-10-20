<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import { app } from '#lib/app.svelte.js';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	$effect(() => {
		if (app.theme === 'system') delete document.documentElement.dataset.theme;
		else document.documentElement.dataset.theme = app.theme;
	});
</script>

<svelte:head>
	<title>HumiFocus</title>
	<link rel="icon" href={favicon} />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		rel="stylesheet"
		href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@200;300;400&family=Manrope:wght@400;500;600&display=swap"
	/>
</svelte:head>

{@render children()}
