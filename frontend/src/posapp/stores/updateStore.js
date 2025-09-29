import { defineStore } from "pinia";

const VERSION_STORAGE_KEY = "posawesome_version";
const SNOOZE_STORAGE_KEY = "posawesome_update_snooze_until";
const DEFAULT_SNOOZE_MINUTES = 10;

function parseTimestamp(version) {
	if (!version) return null;
	const numeric = Number(version);
	if (!Number.isNaN(numeric) && numeric > 1000) {
		return numeric;
	}
	const parts = String(version).split("-");
	const candidate = Number(parts[parts.length - 1]);
	return Number.isNaN(candidate) ? null : candidate;
}

function formatTimestamp(timestamp) {
	if (!timestamp) return null;
	const date = new Date(timestamp);
	if (Number.isNaN(date.getTime())) {
		return null;
	}
	try {
		return new Intl.DateTimeFormat(undefined, {
			year: "numeric",
			month: "short",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
		}).format(date);
	} catch (err) {
		return date.toISOString();
	}
}

export const useUpdateStore = defineStore("update", {
	state: () => ({
		currentVersion: null,
		availableVersion: null,
		availableTimestamp: null,
		dismissedUntil: null,
		reloadAction: null,
		reloading: false,
	}),
	getters: {
		isUpdateReady(state) {
			return Boolean(
				state.availableVersion &&
				state.currentVersion &&
				state.availableVersion !== state.currentVersion,
			);
		},
		shouldPrompt(state) {
			if (!this.isUpdateReady || state.reloading) {
				return false;
			}
			return !state.dismissedUntil || state.dismissedUntil <= Date.now();
		},
		formattedAvailableVersion(state) {
			return formatTimestamp(state.availableTimestamp) || state.availableVersion;
		},
	},
	actions: {
		initializeFromStorage() {
			if (typeof window === "undefined") return;
			const storedVersion = window.localStorage?.getItem(VERSION_STORAGE_KEY);
			if (storedVersion) {
				this.currentVersion = storedVersion;
			}
			const snoozeUntil = window.sessionStorage?.getItem(SNOOZE_STORAGE_KEY);
			if (snoozeUntil) {
				const numeric = Number(snoozeUntil);
				if (!Number.isNaN(numeric)) {
					this.dismissedUntil = numeric;
				}
			}
		},
		setCurrentVersion(version, explicitTimestamp) {
			if (!version) return;
			this.currentVersion = String(version);
			try {
				window.localStorage?.setItem(VERSION_STORAGE_KEY, this.currentVersion);
			} catch (err) {
				console.warn("Failed to persist current version", err);
			}
			if (!this.availableVersion) {
				this.availableVersion = this.currentVersion;
				this.availableTimestamp = explicitTimestamp || parseTimestamp(this.currentVersion);
			}
		},
		setAvailableVersion(version, explicitTimestamp) {
			if (!version) return;
			this.availableVersion = String(version);
			this.availableTimestamp = explicitTimestamp || parseTimestamp(version);
			if (!this.currentVersion) {
				this.setCurrentVersion(version, this.availableTimestamp);
			}
		},
		markUpdateApplied(version, explicitTimestamp) {
			if (version) {
				this.setCurrentVersion(version, explicitTimestamp);
			}
			this.reloading = false;
			this.availableVersion = this.currentVersion;
			this.availableTimestamp = explicitTimestamp || parseTimestamp(this.currentVersion);
			this.dismissedUntil = null;
			if (typeof window !== "undefined") {
				window.sessionStorage?.removeItem(SNOOZE_STORAGE_KEY);
			}
		},
		setReloadAction(action) {
			this.reloadAction = action;
		},
		reloadNow() {
			if (typeof this.reloadAction === "function") {
				this.reloading = true;
				this.reloadAction();
			}
		},
		snooze(minutes = DEFAULT_SNOOZE_MINUTES) {
			const until = Date.now() + minutes * 60 * 1000;
			this.dismissedUntil = until;
			if (typeof window !== "undefined") {
				try {
					window.sessionStorage?.setItem(SNOOZE_STORAGE_KEY, String(until));
				} catch (err) {
					console.warn("Failed to persist snooze state", err);
				}
			}
		},
		resetSnooze() {
			this.dismissedUntil = null;
			if (typeof window !== "undefined") {
				window.sessionStorage?.removeItem(SNOOZE_STORAGE_KEY);
			}
		},
	},
});

export function formatBuildVersion(version) {
	return formatTimestamp(parseTimestamp(version)) || version;
}
