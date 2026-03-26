import { reactive } from "vue";
import {
	start as startGlobalLoading,
	stop as stopGlobalLoading,
} from "../composables/core/useLoading";

export type BootStageId =
	| "check_version"
	| "refresh_assets"
	| "load_profile"
	| "load_items"
	| "load_customers"
	| "finalize";

export interface LoadingState {
	active: boolean;
	progress: number;
	sources: Record<string, number>;
	message: string;
	detail: string;
	sourceMessages: Record<string, string>;
	currentStage: BootStageId | null;
	stages: Record<BootStageId, number>;
}

export const BOOT_STAGE_WEIGHTS: Record<BootStageId, number> = {
	check_version: 10,
	refresh_assets: 15,
	load_profile: 20,
	load_items: 35,
	load_customers: 15,
	finalize: 5,
};

const SOURCE_STAGE_MAP: Partial<Record<string, BootStageId>> = {
	init: "load_profile",
	items: "load_items",
	customers: "load_customers",
};

let sourceCount = 0;
let completedSum = 0;
let isCompleting = false;
let globalOverlayActive = false;

function translate(text: string): string {
	const translator =
		typeof globalThis !== "undefined" &&
		typeof (globalThis as any).__ === "function"
			? (globalThis as any).__
			: (value: string) => value;
	return translator(text);
}

function createDefaultSourceMessages(): Record<string, string> {
	return {
		init: translate("Loading POS profile"),
		items: translate("Loading product catalog"),
		customers: translate("Loading customers"),
	};
}

function createBootStageState(): Record<BootStageId, number> {
	return {
		check_version: 0,
		refresh_assets: 0,
		load_profile: 0,
		load_items: 0,
		load_customers: 0,
		finalize: 0,
	};
}

function getStageTitle(stage: BootStageId): string {
	switch (stage) {
		case "check_version":
			return translate("Checking app version");
		case "refresh_assets":
			return translate("Refreshing outdated assets");
		case "load_profile":
			return translate("Loading POS profile");
		case "load_items":
			return translate("Loading product catalog");
		case "load_customers":
			return translate("Loading customers");
		case "finalize":
			return translate("Finalizing workspace");
	}
}

function getStageDetail(stage: BootStageId): string {
	switch (stage) {
		case "check_version":
			return translate("Comparing cached assets with the latest build");
		case "refresh_assets":
			return translate("Clearing stale POS assets before startup");
		case "load_profile":
			return translate("Fetching register and profile data");
		case "load_items":
			return translate("Preparing searchable inventory for checkout");
		case "load_customers":
			return translate("Preparing customer lookup data");
		case "finalize":
			return translate("Applying final startup checks");
	}
}

function startOverlaySession() {
	if (globalOverlayActive) {
		return;
	}
	startGlobalLoading();
	globalOverlayActive = true;
}

function stopOverlaySession() {
	if (!globalOverlayActive) {
		return;
	}
	stopGlobalLoading();
	globalOverlayActive = false;
}

function requestFrame(callback: FrameRequestCallback) {
	if (typeof requestAnimationFrame === "function") {
		return requestAnimationFrame(callback);
	}
	return setTimeout(() => callback(Date.now()), 16);
}

function activateLoading() {
	loadingState.active = true;
	startOverlaySession();
}

function calculateWeightedProgress() {
	return Math.round(
		Object.entries(BOOT_STAGE_WEIGHTS).reduce((total, [stage, weight]) => {
			return (
				total +
				(((loadingState.stages[stage as BootStageId] || 0) * weight) / 100)
			);
		}, 0),
	);
}

function setLoadingTexts(stage: BootStageId, detail?: string) {
	loadingState.currentStage = stage;
	loadingState.message = getStageTitle(stage);
	loadingState.detail = detail || getStageDetail(stage);
}

/**
 * Reactive loading state used by the UI.
 */
export const loadingState = reactive<LoadingState>({
	active: false,
	progress: 0,
	sources: {},
	message: translate("Loading app data..."),
	detail: translate("Preparing POS workspace"),
	sourceMessages: createDefaultSourceMessages(),
	currentStage: null,
	stages: createBootStageState(),
});

/**
 * Initializes the loading sources.
 * @param list List of source names to track
 */
export function initLoadingSources(list: string[]): void {
	if (!Array.isArray(list) || list.length === 0) {
		console.warn("No loading sources provided");
		return;
	}

	activateLoading();
	sourceCount = list.length;
	completedSum = 0;
	isCompleting = false;
	loadingState.sourceMessages = {
		...createDefaultSourceMessages(),
		...loadingState.sourceMessages,
	};

	list.forEach((name) => {
		if (!(name in loadingState.sources)) {
			loadingState.sources[name] = 0;
		}
	});

	if (!loadingState.currentStage) {
		setLoadingTexts("load_profile");
	}
}

export function setBootStageProgress(
	stage: BootStageId,
	value: number,
	detail?: string,
): void {
	activateLoading();

	const clampedValue = Math.max(0, Math.min(100, value));
	const oldValue = loadingState.stages[stage] || 0;
	const nextValue = Math.max(oldValue, clampedValue);
	loadingState.stages[stage] = nextValue;
	setLoadingTexts(stage, detail);
	loadingState.progress = calculateWeightedProgress();

	if (loadingState.progress >= 100 && !isCompleting) {
		completeLoading();
	}
}

export function markBootStageLoaded(
	stage: BootStageId,
	detail?: string,
): void {
	setBootStageProgress(stage, 100, detail);
}

export function setBootStageDetail(
	stage: BootStageId,
	detail: string,
): void {
	activateLoading();
	setLoadingTexts(stage, detail);
}

/**
 * Sets the progress of a specific source.
 * @param name The source name
 * @param value Progress value (0-100)
 */
export function setSourceProgress(name: string, value: number): void {
	if (isCompleting || sourceCount === 0) {
		return;
	}

	if (!(name in loadingState.sources)) {
		loadingState.sources[name] = 0;
	}

	const clampedValue = Math.max(0, Math.min(100, value));
	const oldValue = loadingState.sources[name] || 0;
	const newValue = Math.max(oldValue, clampedValue);

	loadingState.sources[name] = newValue;

	const newMessage =
		loadingState.sourceMessages[name] || translate(`Loading ${name}...`);
	const mappedStage = SOURCE_STAGE_MAP[name];
	if (mappedStage) {
		setBootStageProgress(mappedStage, newValue);
	} else if (loadingState.message !== newMessage) {
		loadingState.message = newMessage;
	}

	if (newValue > oldValue) {
		completedSum += newValue - oldValue;
		const sourceProgress = Math.round(completedSum / sourceCount);
		const nextProgress = Math.max(
			loadingState.progress,
			Math.min(100, sourceProgress),
		);
		if (nextProgress !== loadingState.progress) {
			animateProgress(loadingState.progress, nextProgress);
		}
	}
}

/**
 * Animates the progress bar from one value to another.
 */
function animateProgress(from: number, to: number): void {
	if (from === to) return;

	const startTime =
		typeof performance !== "undefined" && typeof performance.now === "function"
			? performance.now()
			: Date.now();
	const duration = 300;
	let frameCount = 0;

	function updateProgress(currentTime: number) {
		frameCount += 1;
		const elapsed = Math.max(0, currentTime - startTime);
		const progress = Math.min(elapsed / duration, 1);
		const eased = 1 - Math.pow(1 - progress, 3);
		const stagedProgress = calculateWeightedProgress();
		loadingState.progress = Math.round(
			Math.max(stagedProgress, from + (to - from) * eased),
		);

		if (progress < 1 && frameCount < 20) {
			requestFrame(updateProgress);
		} else {
			loadingState.progress = Math.max(stagedProgress, to);
		}
	}

	requestFrame(updateProgress);
}

/**
 * Finalizes the loading process.
 */
function completeLoading(): void {
	if (isCompleting) return;
	isCompleting = true;

	loadingState.progress = 100;
	loadingState.message = translate("Setup complete!");
	loadingState.detail = translate("POS is ready");

	setTimeout(() => {
		if (!loadingState.active) return;
		loadingState.message = translate("Ready!");
		loadingState.detail = translate("You can start using POS now");

		setTimeout(() => {
			loadingState.active = false;
			loadingState.message = translate("Loading app data...");
			loadingState.detail = translate("Preparing POS workspace");
			loadingState.currentStage = null;
			loadingState.sources = {};
			loadingState.stages = createBootStageState();
			stopOverlaySession();
			sourceCount = 0;
			completedSum = 0;
			isCompleting = false;
		}, 600);
	}, 400);
}

/**
 * Marks a specific source as 100% loaded.
 */
export function markSourceLoaded(name: string): void {
	setSourceProgress(name, 100);
}

/**
 * Manually resets the loading state.
 */
export function resetLoadingState(): void {
	loadingState.active = false;
	loadingState.progress = 0;
	loadingState.message = translate("Loading app data...");
	loadingState.detail = translate("Preparing POS workspace");
	loadingState.sources = {};
	loadingState.sourceMessages = createDefaultSourceMessages();
	loadingState.currentStage = null;
	loadingState.stages = createBootStageState();
	sourceCount = 0;
	completedSum = 0;
	isCompleting = false;
	stopOverlaySession();
}

/**
 * Gets current loading status for debugging.
 */
export function getLoadingStatus() {
	return {
		active: loadingState.active,
		progress: loadingState.progress,
		sources: { ...loadingState.sources },
		stage: loadingState.currentStage,
		stages: { ...loadingState.stages },
		sourceCount,
		completedSum,
		isCompleting,
	};
}
