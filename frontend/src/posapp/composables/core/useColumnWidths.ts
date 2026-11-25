import { computed, onBeforeUnmount, ref, watch, type Ref } from "vue";

import {
	registerCustomization,
	workspaceCustomization,
	type CustomizationSection,
} from "./workspaceCustomization";

type Header = {
	key: string;
	width?: string | number;
	minWidth?: string | number;
	headerProps?: Record<string, any>;
	[key: string]: any;
};
const utilityMinimums: Record<string, number> = {
	"row-reorder": 56,
	"item-select": 64,
	"data-table-expand": 48,
};
export const minimumColumnWidth = (key: string) =>
	utilityMinimums[key] ?? (key === "item_name" ? 96 : 64);
export const clampColumnWidth = (key: string, width: number) =>
	Math.round(Math.max(minimumColumnWidth(key), Math.min(1600, width)));
const pixels = (value: unknown): number | null => {
	if (typeof value === "number")
		return Number.isFinite(value) && value > 0 ? value : null;
	if (typeof value === "string" && /^\d+(?:\.\d+)?(?:px)?$/.test(value))
		return parseFloat(value);
	return null;
};

/** Widths are presentation preferences; row data, column order and visibility remain separate. */
export function useColumnWidths(
	root: Ref<HTMLElement | null>,
	orderScope: Ref<string>,
	options: { section?: CustomizationSection; label?: string } = {},
) {
	const widths = ref<Record<string, number>>({});
	const error = ref("");
	const scope = computed(() =>
		orderScope.value
			? orderScope.value.startsWith("posawesome:column-order:")
				? orderScope.value.replace(
						"posawesome:column-order:",
						"posawesome:column-widths:",
					)
				: `${orderScope.value}:widths`
			: "",
	);
	const hasWidths = computed(() => Object.keys(widths.value).length > 0);
	const announcement = ref("");
	const resizing = ref(false);
	let active: {
		key: string;
		pointer: number;
		x: number;
		start: number;
		rtl: boolean;
		original: Record<string, number>;
	} | null = null;
	const __ = (text: string) => (window.__ ? window.__(text) : text);
	function persist() {
		if (customization.defer()) return;
		if (!scope.value) return;
		try {
			localStorage.setItem(scope.value, JSON.stringify(widths.value));
			error.value = "";
		} catch (cause) {
			console.warn("Unable to save column widths", cause);
			error.value = __(
				"Column widths could not be saved. Changes last for this session only.",
			);
		}
	}
	function apply<T extends Header>(headers: T[]) {
		return headers.map((header) => {
			const width = widths.value[header.key];
			// Fixed widths are applied to every displayed column once customization starts.
			const fixed = hasWidths.value
				? clampColumnWidth(
						header.key,
						width ??
							pixels(header.width) ??
							pixels(header.minWidth) ??
							120,
					)
				: null;
			return {
				...header,
				...(fixed === null
					? {}
					: { width: fixed, minWidth: fixed, maxWidth: fixed }),
				headerProps: {
					...header.headerProps,
					"data-column-width-id": header.key,
				},
			};
		});
	}
	function tableStyle(headers: Header[]) {
		return hasWidths.value
			? {
					"--pos-custom-table-width": `${headers.reduce((sum, header) => sum + (pixels(header.width) ?? 120), 0)}px`,
				}
			: {};
	}
	function detach() {
		window.removeEventListener("pointermove", onMove);
		window.removeEventListener("pointerup", onEnd);
		window.removeEventListener("pointercancel", cancel);
		window.removeEventListener("blur", cancel);
		window.removeEventListener("keydown", onEscape);
		root.value?.classList.remove("pos-column-widths--resizing");
		root.value
			?.querySelectorAll(".pos-column-width-active")
			.forEach((header) =>
				header.classList.remove("pos-column-width-active"),
			);
		resizing.value = false;
		active = null;
	}
	function cancel() {
		if (active) widths.value = active.original;
		detach();
	}
	function onEscape(event: KeyboardEvent) {
		if (event.key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			cancel();
		}
	}
	function onMove(event: PointerEvent) {
		if (!active || event.pointerId !== active.pointer) return;
		event.preventDefault();
		const width = clampColumnWidth(
			active.key,
			active.start + (event.clientX - active.x) * (active.rtl ? -1 : 1),
		);
		widths.value = { ...widths.value, [active.key]: width };
	}
	function onEnd(event: PointerEvent) {
		if (!active || event.pointerId !== active.pointer) return;
		// A release can carry a final coordinate without an intermediate move.
		onMove(event);
		const key = active.key;
		const changed =
			Math.abs((widths.value[key] ?? active.start) - active.start) >= 1;
		if (!changed) {
			cancel();
			return;
		}
		detach();
		persist();
		announcement.value = `${__("Column width updated")}: ${widths.value[key]}px`;
	}
	function measure() {
		const measured: Record<string, number> = { ...widths.value };
		root.value
			?.querySelectorAll<HTMLElement>(":is(th, [role=columnheader])[data-column-width-id]")
			.forEach((header) => {
				const key = header.getAttribute("data-column-width-id")!;
				const width = header.getBoundingClientRect().width;
				if (width > 0) measured[key] = clampColumnWidth(key, width);
			});
		return measured;
	}
	function handleFor(event: Event) {
		const handle = (event.target as Element | null)?.closest<HTMLElement>(
			"[data-column-width-key]",
		);
		return handle && root.value?.contains(handle) ? handle : null;
	}
	function onPointerDown(event: PointerEvent): boolean {
		const handle = handleFor(event);
		if (!handle || active || event.button !== 0) return false;
		event.preventDefault();
		event.stopPropagation();
		handle.focus();
		const key = handle.getAttribute("data-column-width-key")!;
		const original = widths.value;
		const measured = measure();
		const start = measured[key] ?? minimumColumnWidth(key);
		active = {
			key,
			pointer: event.pointerId,
			x: event.clientX,
			start,
			rtl: getComputedStyle(root.value!).direction === "rtl",
			original,
		};
		widths.value = measured;
		root.value?.classList.add("pos-column-widths--resizing");
		handle.closest("th, [role=columnheader]")?.classList.add("pos-column-width-active");
		resizing.value = true;
		window.addEventListener("pointermove", onMove, { passive: false });
		window.addEventListener("pointerup", onEnd);
		window.addEventListener("pointercancel", cancel);
		window.addEventListener("blur", cancel);
		window.addEventListener("keydown", onEscape);
		return true;
	}
	function resetColumn(key: string) {
		cancel();
		const next = { ...widths.value };
		delete next[key];
		widths.value = next;
		persist();
	}
	function onDoubleClick(event: MouseEvent) {
		const handle = handleFor(event);
		if (!handle) return;
		event.preventDefault();
		event.stopPropagation();
		resetColumn(handle.getAttribute("data-column-width-key")!);
	}
	function onKeydown(event: KeyboardEvent): boolean {
		const handle = handleFor(event);
		if (!handle) return false;
		if (!["ArrowLeft", "ArrowRight", "Home"].includes(event.key))
			return true;
		event.preventDefault();
		event.stopPropagation();
		const key = handle.getAttribute("data-column-width-key")!;
		if (event.key === "Home") {
			resetColumn(key);
			return true;
		}
		cancel();
		const measured = measure();
		const rtl = getComputedStyle(root.value!).direction === "rtl";
		const delta =
			(event.key === "ArrowRight" ? 1 : -1) *
			(rtl ? -1 : 1) *
			(event.shiftKey ? 10 : 1);
		widths.value = {
			...measured,
			[key]: clampColumnWidth(
				key,
				(measured[key] ?? minimumColumnWidth(key)) + delta,
			),
		};
		persist();
		return true;
	}
	watch(
		scope,
		() => {
			cancel();
			widths.value = {};
			error.value = "";
			if (!scope.value) return;
			try {
				const saved = JSON.parse(
					localStorage.getItem(scope.value) || "null",
				);
				if (!saved || typeof saved !== "object" || Array.isArray(saved))
					return;
				const clean: Record<string, number> = {};
				for (const [key, width] of Object.entries(saved).slice(
					0,
					200,
				)) {
					if (
						key &&
						typeof width === "number" &&
						Number.isFinite(width) &&
						width > 0
					)
						clean[key] = clampColumnWidth(key, width);
				}
				widths.value = clean;
			} catch (cause) {
				console.warn("Unable to load column widths", cause);
				error.value = __(
					"Saved column widths could not be loaded. Default widths are in use.",
				);
			}
		},
		{ immediate: true },
	);
	function reset() {
		cancel();
		widths.value = {};
		persist();
	}
	function setWidth(key: string, value: string | number) {
		const width = Number(value);
		if (!Number.isFinite(width) || width <= 0) return;
		cancel();
		widths.value = { ...measure(), [key]: clampColumnWidth(key, width) };
		persist();
	}
	const customization = registerCustomization({
		section: options.section || "selector",
		label: options.label || "Item selector",
		kind: "widths",
		scope,
		state: widths,
		error,
		reset,
		stop: cancel,
		setWidth,
		entries: () => {
			const current = widths.value;
			return Array.from(
				root.value?.querySelectorAll<HTMLElement>(
					"[data-column-width-key]",
				) || [],
			).map((handle) => {
				const key = handle.dataset.columnWidthKey!;
				return {
					key,
					label: handle.dataset.columnWidthLabel || key,
					width:
						current[key] ??
						Math.round(
							handle.closest("th, [role=columnheader]")?.getBoundingClientRect()
								.width || 120,
						),
					min: minimumColumnWidth(key),
				};
			});
		},
	});
	const editing = computed(() =>
		workspaceCustomization.isEditing(options.section || "selector"),
	);
	onBeforeUnmount(cancel);
	return {
		widths,
		editing,
		setWidth,
		error,
		hasWidths,
		announcement,
		resizing,
		apply,
		tableStyle,
		onPointerDown,
		onDoubleClick,
		onKeydown,
		reset,
		resetColumn,
		cancel,
	};
}
