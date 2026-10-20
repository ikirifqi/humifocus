import type { Attachment } from 'svelte/attachments';

/** Calls `onOutside` when the user presses outside the element or hits Escape. */
export function clickOutside(onOutside: () => void): Attachment<HTMLElement> {
	return (node) => {
		const onPointer = (ev: PointerEvent) => {
			if (!node.contains(ev.target as Node)) onOutside();
		};
		const onKey = (ev: KeyboardEvent) => {
			if (ev.key === 'Escape') onOutside();
		};
		document.addEventListener('pointerdown', onPointer);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('pointerdown', onPointer);
			document.removeEventListener('keydown', onKey);
		};
	};
}
