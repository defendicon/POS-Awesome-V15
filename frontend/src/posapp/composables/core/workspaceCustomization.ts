import {
	computed,
	getCurrentInstance,
	nextTick,
	onBeforeUnmount,
	ref,
	shallowRef,
	watch,
	type Ref,
} from "vue";

export type CustomizationSection = "cards" | "selector" | "invoice" | "buttons";
export type CustomizationEntry = {
	key: string;
	label: string;
	width?: string | number;
	visible?: boolean;
	required?: boolean;
	min?: number;
};
type Preference = {
	section: CustomizationSection;
	kind: "cards" | "buttons" | "order" | "widths" | "visibility" | "rows";
	label: string;
	scope: Ref<string>;
	state: Ref<any>;
	error?: Ref<string>;
	entries?: () => CustomizationEntry[];
	move?: (key: string, direction: number) => void;
	setWidth?: (key: string, width: string | number) => void;
	setVisible?: (key: string, visible: boolean) => void;
	reset: () => void;
	stop?: () => void;
	preset?: (value: "single" | "stack") => void;
};
type Registered = Preference & { id: symbol };
type Snapshot = { value: string; scope: string; error: string };
const participants = shallowRef<Registered[]>([]);
const snapshots = shallowRef(new Map<symbol, Snapshot>());
const active = ref(false);
const section = ref<CustomizationSection>("cards");
const saveError = ref("");
let focusOwner: HTMLElement | null = null;
function restoreFocus() {
	void nextTick(() => {
		if (active.value || typeof document === "undefined") return;
		const target = focusOwner?.isConnected
			? focusOwner
			: document.querySelector<HTMLElement>(
					'button[aria-label="Customize workspace"]',
				);
		target?.focus();
	});
}
const encode = (value: any) => JSON.stringify(value);
const snapshot = (part: Registered): Snapshot => ({
	value: encode(part.state.value),
	scope: part.scope.value,
	error: part.error?.value || "",
});
const changed = computed(() =>
	active.value
		? participants.value.filter(
				(part) =>
					snapshots.value.get(part.id)?.value !==
					encode(part.state.value),
			)
		: [],
);

function stopInteractions() {
	participants.value.forEach((part) => part.stop?.());
}
function open(next: CustomizationSection = "cards") {
	stopInteractions();
	if (!active.value)
		focusOwner =
			typeof document === "undefined"
				? null
				: (document.activeElement as HTMLElement);
	if (!active.value)
		snapshots.value = new Map(
			participants.value.map((part) => [part.id, snapshot(part)]),
		);
	section.value = next;
	saveError.value = "";
	active.value = true;
}
function select(next: CustomizationSection) {
	stopInteractions();
	section.value = next;
}
function cancel() {
	stopInteractions();
	for (const part of participants.value) {
		const saved = snapshots.value.get(part.id);
		if (saved && part.scope.value === saved.scope) {
			part.state.value = JSON.parse(saved.value);
			if (part.error) part.error.value = saved.error;
		}
	}
	active.value = false;
	snapshots.value = new Map();
	saveError.value = "";
	restoreFocus();
}
function apply(): boolean {
	stopInteractions();
	saveError.value = "";
	const changes = changed.value;
	if (changes.some((part) => !part.scope.value)) {
		saveError.value =
			"Wait for the POS Profile to finish loading before applying changes.";
		return false;
	}
	const written: Array<{ key: string; before: string | null }> = [];
	try {
		const updates = new Map(
			changes.map((part) => [part.scope.value, encode(part.state.value)]),
		);
		const records = [...updates].map(([key, value]) => ({
			key,
			value,
			before: localStorage.getItem(key),
		}));
		for (const record of records) {
			localStorage.setItem(record.key, record.value);
			written.push(record);
		}
	} catch (cause) {
		console.warn("Unable to apply workspace customization", cause);
		let rollbackFailed = false;
		for (const record of written.reverse()) {
			try {
				if (record.before === null) localStorage.removeItem(record.key);
				else localStorage.setItem(record.key, record.before);
			} catch (rollbackCause) {
				rollbackFailed = true;
				console.error(
					"Unable to restore workspace preference",
					rollbackCause,
				);
			}
		}
		saveError.value = rollbackFailed
			? "Settings could not be saved completely. Keep this editor open and retry."
			: "Settings could not be saved. Your preview is still available; retry or cancel.";
		return false;
	}
	changes.forEach((part) => {
		if (part.error) part.error.value = "";
	});
	active.value = false;
	snapshots.value = new Map();
	restoreFocus();
	return true;
}
function resetSection() {
	stopInteractions();
	participants.value
		.filter((part) => part.section === section.value)
		.forEach((part) => part.reset());
}

/** Register a UI preference; existing storage keys stay compatible and writes defer during preview. */
export function registerCustomization(preference: Preference) {
	if (!getCurrentInstance()) return { defer: () => false };
	const part: Registered = { ...preference, id: Symbol(preference.kind) };
	participants.value = [...participants.value, part];
	if (active.value)
		snapshots.value = new Map([
			...snapshots.value,
			[part.id, snapshot(part)],
		]);
	watch(
		preference.scope,
		() => {
			if (active.value) cancel();
		},
		{ flush: "sync" },
	);
	onBeforeUnmount(() => {
		part.stop?.();
		participants.value = participants.value.filter(
			(item) => item.id !== part.id,
		);
		const next = new Map(snapshots.value);
		next.delete(part.id);
		snapshots.value = next;
		if (active.value && !participants.value.length) cancel();
	});
	return { defer: () => active.value && snapshots.value.has(part.id) };
}

export const workspaceCustomization = {
	active,
	section,
	saveError,
	participants,
	changed,
	available: computed(() => participants.value.length > 0),
	isEditing: (value: CustomizationSection) =>
		active.value && section.value === value,
	open,
	select,
	apply,
	cancel,
	resetSection,
};
