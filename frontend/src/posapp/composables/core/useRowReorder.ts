import { onBeforeUnmount, ref, type Ref } from "vue";

type RowDrop = {
	source: string;
	target: string;
	after: boolean;
	visibleKeys: string[];
};

/** Shared table handles: vertical rows by default, horizontal columns when requested.
 * Text selection, sorting and selector-to-cart native drags remain separate. */
export function useRowReorder(
	root: Ref<HTMLElement | null>,
	commit: (drop: RowDrop) => void,
	options: { axis?: "horizontal" | "vertical" } = {},
) {
	const horizontal = options.axis === "horizontal";
	const itemAttribute = horizontal
		? "data-column-reorder-id"
		: "data-row-reorder-id";
	const handleAttribute = horizontal
		? "data-column-reorder-key"
		: "data-row-reorder-key";
	const prefix = horizontal ? "pos-column-reorder" : "pos-row-reorder";
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
			root.value?.querySelectorAll<HTMLElement>(`[${itemAttribute}]`) ||
				[],
		);
	const clearMarkers = () =>
		rows().forEach((row) =>
			row.classList.remove(
				`${prefix}-source`,
				`${prefix}-before`,
				`${prefix}-after`,
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
		if (horizontal) root.value?.style.removeProperty("--pos-column-edge");
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
			.find((row) => row.getAttribute(itemAttribute) === active!.key)
			?.classList.add(`${prefix}-source`);
		const hit = document
			.elementFromPoint(lastX, lastY)
			?.closest<HTMLElement>(`[${itemAttribute}]`);
		if (
			!hit ||
			!root.value.contains(hit) ||
			hit.getAttribute(itemAttribute) === active.key
		)
			return;
		const rect = hit.getBoundingClientRect();
		const rtl = getComputedStyle(root.value).direction === "rtl";
		if (horizontal)
			root.value.style.setProperty(
				"--pos-column-edge",
				rtl ? "-3px" : "3px",
			);
		const after = horizontal
			? lastX > rect.left + rect.width / 2 !== rtl
			: lastY > rect.top + rect.height / 2;
		target = { key: hit.getAttribute(itemAttribute)!, after };
		hit.classList.add(after ? `${prefix}-after` : `${prefix}-before`);
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
				!(horizontal
					? scroll.scrollWidth > scroll.clientWidth &&
						/auto|scroll/.test(getComputedStyle(scroll).overflowX)
					: scroll.scrollHeight > scroll.clientHeight &&
						/auto|scroll/.test(getComputedStyle(scroll).overflowY))
			)
				scroll = scroll.parentElement;
			if (scroll) {
				const rect = scroll.getBoundingClientRect();
				if (horizontal && lastY >= rect.top && lastY <= rect.bottom) {
					if (lastX > rect.right - 36 && lastX <= rect.right)
						scroll.scrollLeft += 12;
					else if (lastX < rect.left + 36 && lastX >= rect.left)
						scroll.scrollLeft -= 12;
				} else if (
					!horizontal &&
					lastX >= rect.left &&
					lastX <= rect.right
				) {
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
							(row) => row.getAttribute(itemAttribute)!,
						),
					}
				: null;
		const label = active.label;
		cancel();
		if (drop) {
			commit(drop);
			announcement.value = `${window.__ ? window.__(horizontal ? "Column moved" : "Row moved") : horizontal ? "Column moved" : "Row moved"}: ${label}`;
		}
	}
	function onPointerDown(event: PointerEvent) {
		const handle = (event.target as Element | null)?.closest<HTMLElement>(
			`[${handleAttribute}]`,
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
			key: handle.getAttribute(handleAttribute)!,
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
			`[${handleAttribute}]`,
		);
		if (
			!handle ||
			!root.value?.contains(handle) ||
			!event.altKey ||
			!(
				horizontal
					? ["ArrowLeft", "ArrowRight"]
					: ["ArrowUp", "ArrowDown"]
			).includes(event.key)
		)
			return false;
		event.preventDefault();
		event.stopPropagation();
		const keys = rows().map((row) => row.getAttribute(itemAttribute)!);
		const source = handle.getAttribute(handleAttribute)!;
		const rtl =
			root.value && getComputedStyle(root.value).direction === "rtl";
		const down = horizontal
			? (event.key === "ArrowRight") !== rtl
			: event.key === "ArrowDown";
		const target = keys[keys.indexOf(source) + (down ? 1 : -1)];
		if (target) {
			commit({ source, target, after: down, visibleKeys: keys });
			announcement.value = window.__
				? window.__(horizontal ? "Column moved" : "Row moved")
				: horizontal
					? "Column moved"
					: "Row moved";
		}
		return true;
	}
	onBeforeUnmount(cancel);
	return { onPointerDown, onKeydown, cancel, announcement };
}
