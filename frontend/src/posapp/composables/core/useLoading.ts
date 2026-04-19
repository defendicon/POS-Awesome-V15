import { ref, computed } from "vue";
// @ts-ignore
import config from "../../config/loading";

export const LOADING_SCOPE_IDS = {
	global: "global",
	bootstrap: "bootstrap",
	route: "route",
	section: "section",
	action: "action",
	background: "background",
} as const;

export type LoadingScopeId =
	(typeof LOADING_SCOPE_IDS)[keyof typeof LOADING_SCOPE_IDS];

export type LoadingScopeKind =
	| "bootstrap"
	| "route"
	| "section"
	| "action"
	| "background";

export type LoadingScopeState = {
	count: number;
	kind: LoadingScopeKind;
	blocking: boolean;
	message: string;
	progress: number | null;
};

export type LoadingScopeOptions = Partial<
	Pick<LoadingScopeState, "kind" | "blocking" | "message" | "progress">
>;

const DEFAULT_SCOPE_CONFIG: Record<string, Omit<LoadingScopeState, "count">> = {
	global: {
		kind: "bootstrap",
		blocking: true,
		message: "Loading app data...",
		progress: null,
	},
	bootstrap: {
		kind: "bootstrap",
		blocking: true,
		message: "Loading app data...",
		progress: null,
	},
	route: {
		kind: "route",
		blocking: false,
		message: "Loading view...",
		progress: null,
	},
	section: {
		kind: "section",
		blocking: false,
		message: "Loading section...",
		progress: null,
	},
	action: {
		kind: "action",
		blocking: false,
		message: "Processing request...",
		progress: null,
	},
	background: {
		kind: "background",
		blocking: false,
		message: "",
		progress: null,
	},
};

function getDefaultScopeConfig(id: string): Omit<LoadingScopeState, "count"> {
	return (
		DEFAULT_SCOPE_CONFIG[id] ||
		DEFAULT_SCOPE_CONFIG.background ||
		DEFAULT_SCOPE_CONFIG.global || {
			kind: "background",
			blocking: false,
			message: "",
			progress: null,
		}
	);
}

const loaders = ref(new Map<string, LoadingScopeState>());
const overlayVisible = ref(false);
const scopeWarningTimers = new Map<string, ReturnType<typeof setTimeout>>();
let delayTimer: ReturnType<typeof setTimeout> | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
let overlayShownAt = 0;
const STUCK_LOADING_WARNING_MS = 30_000;

function resolveScopeState(
	id: string,
	options: LoadingScopeOptions = {},
	existing?: LoadingScopeState,
): LoadingScopeState {
	const defaults = getDefaultScopeConfig(id);

	return {
		count: existing?.count || 0,
		kind: options.kind || existing?.kind || defaults.kind,
		blocking:
			typeof options.blocking === "boolean"
				? options.blocking
				: typeof existing?.blocking === "boolean"
					? existing.blocking
					: defaults.blocking,
		message:
			typeof options.message === "string"
				? options.message
				: existing?.message || defaults.message,
		progress:
			typeof options.progress === "number"
				? Math.max(0, Math.min(100, Math.round(options.progress)))
				: existing?.progress ?? defaults.progress,
	};
}

function hasBlockingLoaders() {
	return Array.from(loaders.value.values()).some(
		(loader) => loader.count > 0 && loader.blocking,
	);
}

function matchesDefaultScopeState(id: string, loader: LoadingScopeState) {
	const defaults = getDefaultScopeConfig(id);
	return (
		loader.kind === defaults.kind &&
		loader.blocking === defaults.blocking &&
		loader.message === defaults.message &&
		loader.progress === defaults.progress
	);
}

function manageOverlay() {
	const shouldShowOverlay = hasBlockingLoaders();
	const { delay, minVisible } = config.overlay;

	if (shouldShowOverlay) {
		if (hideTimer) {
			clearTimeout(hideTimer);
			hideTimer = null;
		}

		if (delayTimer) {
			clearTimeout(delayTimer);
			delayTimer = null;
		}

		if (!overlayVisible.value) {
			delayTimer = setTimeout(() => {
				overlayVisible.value = true;
				overlayShownAt = Date.now();
				delayTimer = null;
			}, delay);
		}
		return;
	}

	if (delayTimer) {
		clearTimeout(delayTimer);
		delayTimer = null;
	}
	if (!overlayVisible.value) {
		return;
	}

	const elapsed = Date.now() - overlayShownAt;
	const remaining = Math.max(minVisible - elapsed, 0);
	hideTimer = setTimeout(() => {
		overlayVisible.value = false;
		hideTimer = null;
	}, remaining);
}

function warnIfScopeLooksStuck(id: string, loader: LoadingScopeState) {
	if (
		typeof import.meta !== "undefined" &&
		import.meta.env &&
		!import.meta.env.DEV
	) {
		return;
	}

	if (scopeWarningTimers.has(id) || loader.count <= 0) {
		return;
	}

	const timer = setTimeout(() => {
		const activeLoader = loaders.value.get(id);
		if (!activeLoader || activeLoader.count <= 0) {
			scopeWarningTimers.delete(id);
			return;
		}

		console.warn(
			`[loading] Scope "${id}" is still active after ${STUCK_LOADING_WARNING_MS}ms. Prefer helper wrappers and ensure stop() runs in finally blocks.`,
			{
				id,
				kind: activeLoader.kind,
				blocking: activeLoader.blocking,
				message: activeLoader.message,
				count: activeLoader.count,
			},
		);
		scopeWarningTimers.delete(id);
	}, STUCK_LOADING_WARNING_MS);

	scopeWarningTimers.set(id, timer);
}

function clearScopeWarning(id: string) {
	const timer = scopeWarningTimers.get(id);
	if (!timer) {
		return;
	}

	clearTimeout(timer);
	scopeWarningTimers.delete(id);
}

export function start(
	id: string = LOADING_SCOPE_IDS.global,
	options: LoadingScopeOptions = {},
) {
	const existing = loaders.value.get(id);
	const next = resolveScopeState(id, options, existing);
	next.count = (existing?.count || 0) + 1;
	loaders.value.set(id, next);
	warnIfScopeLooksStuck(id, next);
	manageOverlay();
}

export function stop(id: string = LOADING_SCOPE_IDS.global) {
	const existing = loaders.value.get(id);
	if (!existing) {
		clearScopeWarning(id);
		manageOverlay();
		return;
	}

	if (existing.count <= 1) {
		loaders.value.delete(id);
		clearScopeWarning(id);
	} else {
		loaders.value.set(id, {
			...existing,
			count: existing.count - 1,
		});
	}

	manageOverlay();
}

export function setScopeMeta(id: string, options: LoadingScopeOptions = {}) {
	const existing = loaders.value.get(id);
	const next = resolveScopeState(id, options, existing);
	next.count = existing?.count || 0;
	if (!existing && next.count === 0 && matchesDefaultScopeState(id, next)) {
		return;
	}
	loaders.value.set(id, next);
	manageOverlay();
}

export function clearScopeMeta(id: string) {
	const existing = loaders.value.get(id);
	if (!existing) {
		return;
	}

	if (existing.count > 0) {
		const next = resolveScopeState(id);
		next.count = existing.count;
		loaders.value.set(id, next);
		manageOverlay();
		return;
	}

	loaders.value.delete(id);
	manageOverlay();
}

export function withLoading<T>(
	fn: () => T | Promise<T>,
	id: string = LOADING_SCOPE_IDS.global,
	options: LoadingScopeOptions = {},
): Promise<T> {
	start(id, options);
	return Promise.resolve()
		.then(fn)
		.finally(() => stop(id));
}

export function useLoading() {
	const isLoading = (id: string = LOADING_SCOPE_IDS.global) =>
		computed(() => (loaders.value.get(id)?.count || 0) > 0);
	const isAnyLoading = computed(() =>
		Array.from(loaders.value.values()).some((loader) => loader.count > 0),
	);
	const getScopeState = (id: string) =>
		computed<LoadingScopeState>(() => {
			const loader = loaders.value.get(id);
			return (
				loader || {
					...resolveScopeState(id),
				}
			);
		});

	return {
		start,
		stop,
		setScopeMeta,
		clearScopeMeta,
		withLoading,
		isLoading,
		isAnyLoading,
		getScopeState,
		overlayVisible,
	};
}

export const isAnyLoading = computed(() =>
	Array.from(loaders.value.values()).some((loader) => loader.count > 0),
);

export function startBootstrapLoading(options: LoadingScopeOptions = {}) {
	start(LOADING_SCOPE_IDS.bootstrap, {
		kind: "bootstrap",
		blocking: true,
		...options,
	});
}

export function stopBootstrapLoading() {
	stop(LOADING_SCOPE_IDS.bootstrap);
}

export function withBootstrapLoading<T>(
	fn: () => T | Promise<T>,
	options: LoadingScopeOptions = {},
) {
	return withLoading(fn, LOADING_SCOPE_IDS.bootstrap, {
		kind: "bootstrap",
		blocking: true,
		...options,
	});
}

export function startRouteLoading(options: LoadingScopeOptions = {}) {
	start(LOADING_SCOPE_IDS.route, {
		kind: "route",
		blocking: false,
		...options,
	});
}

export function stopRouteLoading() {
	stop(LOADING_SCOPE_IDS.route);
}

export function withRouteLoading<T>(
	fn: () => T | Promise<T>,
	options: LoadingScopeOptions = {},
) {
	return withLoading(fn, LOADING_SCOPE_IDS.route, {
		kind: "route",
		blocking: false,
		...options,
	});
}

export function startBackgroundLoading(options: LoadingScopeOptions = {}) {
	start(LOADING_SCOPE_IDS.background, {
		kind: "background",
		blocking: false,
		...options,
	});
}

export function stopBackgroundLoading() {
	stop(LOADING_SCOPE_IDS.background);
}

export function withBackgroundLoading<T>(
	fn: () => T | Promise<T>,
	options: LoadingScopeOptions = {},
) {
	return withLoading(fn, LOADING_SCOPE_IDS.background, {
		kind: "background",
		blocking: false,
		...options,
	});
}

export function startActionLoading(options: LoadingScopeOptions = {}) {
	start(LOADING_SCOPE_IDS.action, {
		kind: "action",
		blocking: false,
		...options,
	});
}

export function stopActionLoading() {
	stop(LOADING_SCOPE_IDS.action);
}

export function withActionLoading<T>(
	fn: () => T | Promise<T>,
	options: LoadingScopeOptions = {},
) {
	return withLoading(fn, LOADING_SCOPE_IDS.action, {
		kind: "action",
		blocking: false,
		...options,
	});
}

export function startSectionLoading(id: string, options: LoadingScopeOptions = {}) {
	start(id, {
		kind: "section",
		blocking: false,
		...options,
	});
}

export function stopSectionLoading(id: string) {
	stop(id);
}

export function withSectionLoading<T>(
	id: string,
	fn: () => T | Promise<T>,
	options: LoadingScopeOptions = {},
) {
	return withLoading(fn, id, {
		kind: "section",
		blocking: false,
		...options,
	});
}
