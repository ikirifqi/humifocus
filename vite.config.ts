import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// Emit a single-page app: nothing is prerendered, every route is served by the
			// fallback page. `index.html` is used because both Firebase Hosting (via a
			// rewrite) and Cloudflare Pages (built-in SPA mode) serve it for unknown paths.
			adapter: adapter({ fallback: 'index.html' })
		})
	]
});
