import { onBeforeUnmount, ref, type Ref } from "vue";

type RowDrop = {
	source: string;
	target: string;
	after: boolean;
	visibleKeys: string[];
};

/** Pointer-only handles keep text selection, row clicks and selector-to-cart native drags intact. */
export function useRowReorder(
	root: Ref<HTMLElement | null>,
	commit: (drop: RowDrop) => void,
) {
	const announcement = ref("");
	let active: {
		key: string;
		pointer: number;
		x: number;
		y: number;
		moved: boolean;
		label: string;
	} | null = null;
	let target: { key: string; after: boolean } | null = null;
	let ghost: HTMLElement | null = null;
	let frame: number | null = null;
	let lastX = 0;
	let lastY = 0;
	const rows = () =>
		Array.from(
			root.value?.querySelectorAll<HTMLElement>(
				"[data-row-reorder-id]",
			) || [],
		);
	const clearMarkers = () =>
		rows().forEach((row) =>
			row.classList.remove(
				"pos-row-reorder-source",
				"pos-row-reorder-before",
				"pos-row-reorder-after",
			),
		);

	function cancel() {
		window.removeEventListener("pointermove", move);
		window.removeEventListener("pointerup", end);
		window.removeEventListener("pointercancel", cancel);
		window.removeEventListener("keydown", escape);
		window.removeEventListener("blur", cancel);
		if (frame !== null) cancelAnimationFrame(frame);
		frame = null;
		ghost?.remove();
		ghost = null;
		clearMarkers();
		active = null;
		target = null;
	}
	function escape(event: KeyboardEvent) {
		if (event.key === "Escape") cancel();
	}
	function markTarget() {
		if (!active?.moved || !root.value) return;
		clearMarkers();
		target = null;
		rows()
			.find((row) => row.dataset.rowReorderId === active!.key)
			?.classList.add("pos-row-reorder-source");
		const hit = document
			.elementFromPoint(lastX, lastY)
			?.closest<HTMLElement>("[data-row-reorder-id]");
		if (
			!hit ||
			!root.value.contains(hit) ||
			hit.dataset.rowReorderId === active.key
		)
			return;
		const rect = hit.getBoundingClientRect();
		const after = lastY > rect.top + rect.height / 2;
		target = { key: hit.dataset.rowReorderId!, after };
		hit.classList.add(
			after ? "pos-row-reorder-after" : "pos-row-reorder-before",
		);
	}
	function tick() {
		if (!active) return;
		if (active.moved && root.value) {
			const hit = document.elementFromPoint(lastX, lastY);
			let scroll: HTMLElement | null =
				hit && root.value.contains(hit)
					? (hit as HTMLElement)
					: root.value;
			while (
				scroll &&
				!(
					scroll.scrollHeight > scroll.clientHeight &&
					/auto|scroll/.test(getComputedStyle(scroll).overflowY)
				)
			)
				scroll = scroll.parentElement;
			if (scroll) {
				const rect = scroll.getBoundingClientRect();
				if (lastX >= rect.left && lastX <= rect.right) {
					if (lastY > rect.bottom - 36 && lastY <= rect.bottom)
						scroll.scrollTop += 12;
					else if (lastY < rect.top + 36 && lastY >= rect.top)
						scroll.scrollTop -= 12;
				}
			}
			markTarget();
		}
		frame = requestAnimationFrame(tick);
	}
	function move(event: PointerEvent) {
		if (!active || event.pointerId !== active.pointer) return;
		event.preventDefault();
		lastX = event.clientX;
		lastY = event.clientY;
		active.moved ||= Math.hypot(lastX - active.x, lastY - active.y) > 5;
		if (!active.moved) return;
		if (!ghost) {
			ghost = document.createElement("div");
			ghost.className = "pos-row-reorder-ghost";
			ghost.textContent = active.label;
			ghost.setAttribute("aria-hidden", "true");
			document.body.appendChild(ghost);
		}
		ghost.style.left = `${lastX + 12}px`;
		ghost.style.top = `${lastY + 12}px`;
		markTarget();
	}
	function end(event: PointerEvent) {
		if (!active || event.pointerId !== active.pointer) return;
		const drop =
			active.moved && target
				? {
						source: active.key,
						target: target.key,
						after: target.after,
						visibleKeys: rows().map(
							(row) => row.dataset.rowReorderId!,
						),
					}
				: null;
		const label = active.label;
		cancel();
		if (drop) {
			commit(drop);
			announcement.value = `${window.__ ? window.__("Row moved") : "Row moved"}: ${label}`;
		}
	}
	function onPointerDown(event: PointerEvent) {
		const handle = (event.target as Element | null)?.closest<HTMLElement>(
			"[data-row-reorder-key]",
		);
		if (
			!handle ||
			!root.value?.contains(handle) ||
			event.button !== 0 ||
			active
		)
			return;
		event.preventDefault();
		event.stopPropagation();
		handle.focus();
		active = {
			key: handle.dataset.rowReorderKey!,
			pointer: event.pointerId,
			x: event.clientX,
			y: event.clientY,
			moved: false,
			label: handle.getAttribute("aria-label") || "",
		};
		lastX = event.clientX;
		lastY = event.clientY;
		window.addEventListener("pointermove", move, { passive: false });
		window.addEventListener("pointerup", end);
		window.addEventListener("pointercancel", cancel);
		window.addEventListener("keydown", escape);
		window.addEventListener("blur", cancel);
		frame = requestAnimationFrame(tick);
	}
	function onKeydown(event: KeyboardEvent) {
		const handle = (event.target as Element | null)?.closest<HTMLElement>(
			"[data-row-reorder-key]",
		);
		if (
			!handle ||
			!root.value?.contains(handle) ||
			!event.altKey ||
			!["ArrowUp", "ArrowDown"].includes(event.key)
		)
			return false;
		event.preventDefault();
		event.stopPropagation();
		const keys = rows().map((row) => row.dataset.rowReorderId!);
		const source = handle.dataset.rowReorderKey!;
		const down = event.key === "ArrowDown";
		const target = keys[keys.indexOf(source) + (down ? 1 : -1)];
		if (target) {
			commit({ source, target, after: down, visibleKeys: keys });
			announcement.value = window.__
				? window.__("Row moved")
				: "Row moved";
		}
		return true;
	}
	onBeforeUnmount(cancel);
	return { onPointerDown, onKeydown, cancel, announcement };
}
