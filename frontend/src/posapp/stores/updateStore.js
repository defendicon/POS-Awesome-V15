import { defineStore } from "pinia";

const VERSION_STORAGE_KEY = "posawesome_version";
const SNOOZE_STORAGE_KEY = "posawesome_update_snooze_until";
const DEFAULT_SNOOZE_MINUTES = 10;
const hasBrowserContext = typeof window !== "undefined";

let cachedDateFormatter = null;

function getDateFormatter() {
	if (cachedDateFormatter !== null) {
		return cachedDateFormatter;
	}
	try {
		cachedDateFormatter = new Intl.DateTimeFormat(undefined, {
			year: "numeric",
			month: "short",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
		});
	} catch (err) {
		cachedDateFormatter = undefined;
	}
	return cachedDateFormatter;
}

function safeNumber(value) {
	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric : null;
}

function safeStorageGet(storage, key) {
	if (!hasBrowserContext || !storage) return null;
	try {
		return storage.getItem(key);
	} catch (err) {
		console.warn(`Failed to read ${key} from storage`, err);
		return null;
	}
}

function safeStorageSet(storage, key, value) {
	if (!hasBrowserContext || !storage) return false;
	try {
		storage.setItem(key, value);
		return true;
	} catch (err) {
		console.warn(`Failed to persist ${key} in storage`, err);
		return false;
	}
}

function safeStorageRemove(storage, key) {
	if (!hasBrowserContext || !storage) return;
	try {
		storage.removeItem(key);
	} catch (err) {
		console.warn(`Failed to remove ${key} from storage`, err);
	}
}

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
		const formatter = getDateFormatter();
		if (formatter) {
			return formatter.format(date);
		}
	} catch (err) {
		// Swallow and fall back
	}
	return date.toISOString();
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
			if (!hasBrowserContext) return;
			const storedVersion = safeStorageGet(window.localStorage, VERSION_STORAGE_KEY);
			if (storedVersion) {
				this.$patch({
					currentVersion: storedVersion,
					availableVersion: this.availableVersion || storedVersion,
					availableTimestamp: this.availableTimestamp || parseTimestamp(storedVersion),
				});
			}
			const snoozeUntil = safeNumber(safeStorageGet(window.sessionStorage, SNOOZE_STORAGE_KEY));
			if (snoozeUntil && (!this.dismissedUntil || snoozeUntil > this.dismissedUntil)) {
				this.dismissedUntil = snoozeUntil;
			}
		},
		setCurrentVersion(version, explicitTimestamp) {
			if (!version) return;
			const normalized = String(version);
			const timestamp = explicitTimestamp ?? parseTimestamp(normalized);
			const { currentVersion, availableVersion, availableTimestamp } = this;
			const updates = {};
			const versionChanged = currentVersion !== normalized;
			if (versionChanged) {
				updates.currentVersion = normalized;
			}
			const shouldSyncAvailable = !availableVersion || availableVersion === currentVersion;
			if (shouldSyncAvailable) {
				if (availableVersion !== normalized) {
					updates.availableVersion = normalized;
				}
				if ((timestamp ?? null) !== (availableTimestamp ?? null)) {
					updates.availableTimestamp = timestamp ?? null;
				}
			}
			if (Object.keys(updates).length) {
				this.$patch(updates);
			}
			if (versionChanged && hasBrowserContext) {
				safeStorageSet(window.localStorage, VERSION_STORAGE_KEY, normalized);
			}
		},
		setAvailableVersion(version, explicitTimestamp) {
			if (!version) return;
			const normalized = String(version);
			const timestamp = explicitTimestamp ?? parseTimestamp(normalized);
			const { availableVersion, availableTimestamp, currentVersion } = this;
			const updates = {};
			const versionChanged = availableVersion !== normalized;
			const timestampChanged = (timestamp ?? null) !== (availableTimestamp ?? null);
			if (!versionChanged && !timestampChanged) {
				if (!currentVersion) {
					this.setCurrentVersion(normalized, timestamp ?? null);
				}
				return;
			}
			if (versionChanged) {
				updates.availableVersion = normalized;
			}
			if (timestampChanged) {
				updates.availableTimestamp = timestamp ?? null;
			}
			if (!currentVersion) {
				updates.currentVersion = normalized;
			}
			if (Object.keys(updates).length) {
				this.$patch(updates);
			}
			if (!currentVersion && hasBrowserContext) {
				safeStorageSet(window.localStorage, VERSION_STORAGE_KEY, normalized);
			}
		},
		markUpdateApplied(version, explicitTimestamp) {
			const updates = {
				reloading: false,
				dismissedUntil: null,
			};
			if (version) {
				const normalized = String(version);
				const timestamp = explicitTimestamp ?? parseTimestamp(normalized);
				updates.currentVersion = normalized;
				updates.availableVersion = normalized;
				updates.availableTimestamp = timestamp ?? null;
				if (hasBrowserContext) {
					safeStorageSet(window.localStorage, VERSION_STORAGE_KEY, normalized);
				}
			} else if (this.currentVersion) {
				const normalized = this.currentVersion;
				const timestamp = explicitTimestamp ?? parseTimestamp(normalized);
				updates.availableVersion = normalized;
				updates.availableTimestamp = timestamp ?? null;
			}
			this.$patch(updates);
			if (hasBrowserContext) {
				safeStorageRemove(window.sessionStorage, SNOOZE_STORAGE_KEY);
			}
		},
		setReloadAction(action) {
			if (this.reloadAction === action) return;
			this.reloadAction = action;
		},
		reloadNow() {
			if (typeof this.reloadAction !== "function" || this.reloading) {
				return;
			}
			this.reloading = true;
			this.reloadAction();
		},
		snooze(minutes = DEFAULT_SNOOZE_MINUTES) {
			const until = Date.now() + minutes * 60 * 1000;
			if (this.dismissedUntil === until) {
				return;
			}
			this.dismissedUntil = until;
			if (hasBrowserContext) {
				safeStorageSet(window.sessionStorage, SNOOZE_STORAGE_KEY, String(until));
			}
		},
		resetSnooze() {
			if (this.dismissedUntil === null) {
				return;
			}
			this.dismissedUntil = null;
			if (hasBrowserContext) {
				safeStorageRemove(window.sessionStorage, SNOOZE_STORAGE_KEY);
			}
		},
	},
});

export function formatBuildVersion(version) {
	return formatTimestamp(parseTimestamp(version)) || version;
}
