import { defineStore } from "pinia";

const VERSION_STORAGE_KEY = "posawesome_version";
const DISMISSED_VERSION_KEY = "posawesome_update_dismissed";
const LAST_CHECK_KEY = "posawesome_update_last_check";
const SNOOZE_STORAGE_KEY = "posawesome_update_snooze_until";
const DEFAULT_SNOOZE_MINUTES = 10;
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const hasBrowserContext = typeof window !== "undefined";

let cachedDateFormatter: Intl.DateTimeFormat | null | undefined = null;

function getDateFormatter(): Intl.DateTimeFormat | null | undefined {
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
	} catch {
		cachedDateFormatter = undefined;
	}
	return cachedDateFormatter;
}

function safeNumber(value: string | null): number | null {
	if (value === null) return null;
	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric : null;
}

function safeStorageGet(
	storage: Storage | undefined,
	key: string,
): string | null {
	if (!hasBrowserContext || !storage) return null;
	try {
		return storage.getItem(key);
	} catch (err) {
		console.warn(`Failed to read ${key} from storage`, err);
		return null;
	}
}

function safeStorageSet(
	storage: Storage | undefined,
	key: string,
	value: string,
): boolean {
	if (!hasBrowserContext || !storage) return false;
	try {
		storage.setItem(key, value);
		return true;
	} catch (err) {
		console.warn(`Failed to persist ${key} in storage`, err);
		return false;
	}
}

function safeStorageRemove(storage: Storage | undefined, key: string): void {
	if (!hasBrowserContext || !storage) return;
	try {
		storage.removeItem(key);
	} catch (err) {
		console.warn(`Failed to remove ${key} from storage`, err);
	}
}

function parseTimestamp(version: string | null | number): number | null {
	if (version === null || version === undefined) return null;
	const numeric = Number(version);
	if (!Number.isNaN(numeric) && numeric > 1000) {
		return numeric;
	}
	const parts = String(version).split("-");
	const candidate = Number(parts[parts.length - 1]);
	return Number.isNaN(candidate) ? null : candidate;
}

function normalizeVersionInput(
	version: string | null | number,
	explicitTimestamp?: number | null,
) {
	if (!version) {
		return { normalized: null, timestamp: null };
	}
	const normalized = String(version);
	const timestamp = explicitTimestamp ?? parseTimestamp(normalized);
	return { normalized, timestamp };
}

function formatTimestamp(timestamp: number | null): string | null {
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
	} catch {
		// Fall back to ISO formatting when locale formatting is unavailable.
	}
	return date.toISOString();
}

export interface UpdateState {
	currentVersion: string | null;
	currentCommit: string | null;
	availableVersion: string | null;
	availableTimestamp: number | null;
	dismissedUntil: number | null;
	dismissedVersion: string | null;
	lastCheckedAt: number | null;
	availableMessage: string | null;
	availableCommit: string | null;
	availableCommitDate: string | null;
	availableBranch: string | null;
	availableCommits: Array<{
		commit_hash: string;
		commit_short?: string;
		commit_message?: string;
		commit_date?: string;
	}>;
	reloadAction: (() => void) | null;
	reloading: boolean;
}

export const useUpdateStore = defineStore("update", {
	state: (): UpdateState => ({
		currentVersion: null,
		currentCommit: null,
		availableVersion: null,
		availableTimestamp: null,
		dismissedUntil: null,
		dismissedVersion: null,
		lastCheckedAt: null,
		availableMessage: null,
		availableCommit: null,
		availableCommitDate: null,
		availableBranch: null,
		availableCommits: [],
		reloadAction: null,
		reloading: false,
	}),
	getters: {
		isUpdateReady(state: UpdateState): boolean {
			return Boolean(
				state.availableVersion &&
				state.currentVersion &&
				state.availableVersion !== state.currentVersion,
			);
		},
		shouldPrompt(state: UpdateState): boolean {
			if (!this.isUpdateReady || state.reloading) {
				return false;
			}
			if (
				state.dismissedVersion &&
				state.availableVersion === state.dismissedVersion
			) {
				return false;
			}
			return !state.dismissedUntil || state.dismissedUntil <= Date.now();
		},
		formattedAvailableVersion(state: UpdateState): string | null {
			return (
				formatTimestamp(state.availableTimestamp) ||
				state.availableVersion
			);
		},
		formattedAvailableDetails(state: UpdateState): string | null {
			if (!state.availableMessage && !state.availableCommitDate) {
				return null;
			}
			const bits: string[] = [];
			if (state.availableMessage) {
				bits.push(state.availableMessage);
			}
			if (state.availableCommitDate) {
				bits.push(state.availableCommitDate);
			}
			return bits.join(" • ");
		},
		formattedAvailableBranch(state: UpdateState): string | null {
			return state.availableBranch
				? `current branch: ${state.availableBranch}`
				: null;
		},
		formattedAvailableCommits(state: UpdateState) {
			return state.availableCommits || [];
		},
	},
	actions: {
		initializeFromStorage() {
			if (!hasBrowserContext) return;
			const storedVersion = safeStorageGet(
				window.localStorage,
				VERSION_STORAGE_KEY,
			);
			if (storedVersion) {
				this.$patch({
					currentVersion: storedVersion,
					availableVersion: this.availableVersion || storedVersion,
					availableTimestamp:
						this.availableTimestamp ||
						parseTimestamp(storedVersion),
				});
			}
			const snoozeUntil = safeNumber(
				safeStorageGet(window.sessionStorage, SNOOZE_STORAGE_KEY),
			);
			if (
				snoozeUntil &&
				(!this.dismissedUntil || snoozeUntil > this.dismissedUntil)
			) {
				this.dismissedUntil = snoozeUntil;
			}
			const dismissedVersion = safeStorageGet(
				window.localStorage,
				DISMISSED_VERSION_KEY,
			);
			if (dismissedVersion) {
				this.dismissedVersion = dismissedVersion;
			}
			const lastCheckedAt = safeNumber(
				safeStorageGet(window.localStorage, LAST_CHECK_KEY),
			);
			if (lastCheckedAt) {
				this.lastCheckedAt = lastCheckedAt;
			}
		},
		setCurrentVersion(
			version: string | number | null,
			explicitTimestamp?: number | null,
		) {
			const { normalized, timestamp } = normalizeVersionInput(
				version,
				explicitTimestamp,
			);
			if (!normalized) return;
			const { currentVersion, availableVersion, availableTimestamp } =
				this;
			const updates: Partial<UpdateState> = {};
			const versionChanged = currentVersion !== normalized;
			if (versionChanged) {
				updates.currentVersion = normalized;
			}
			const shouldSyncAvailable =
				!availableVersion || availableVersion === currentVersion;
			if (shouldSyncAvailable) {
				if (availableVersion !== normalized) {
					updates.availableVersion = normalized;
				}
				if ((timestamp ?? null) !== (availableTimestamp ?? null)) {
					updates.availableTimestamp = timestamp;
				}
			}
			if (Object.keys(updates).length) {
				this.$patch(updates);
			}
			if (versionChanged && hasBrowserContext) {
				safeStorageSet(
					window.localStorage,
					VERSION_STORAGE_KEY,
					normalized,
				);
			}
		},
		setCurrentCommit(commit: string | null) {
			if (!commit) return;
			if (this.currentCommit === commit) return;
			this.currentCommit = commit;
		},
		setAvailableVersion(
			version: string | number | null,
			explicitTimestamp?: number | null,
		) {
			const { normalized, timestamp } = normalizeVersionInput(
				version,
				explicitTimestamp,
			);
			if (!normalized) return;
			const { availableVersion, availableTimestamp, currentVersion } =
				this;
			const updates: Partial<UpdateState> = {};
			const versionChanged = availableVersion !== normalized;
			const timestampChanged =
				(timestamp ?? null) !== (availableTimestamp ?? null);
			if (!versionChanged && !timestampChanged) {
				if (!currentVersion) {
					this.setCurrentVersion(normalized, timestamp);
				}
				return;
			}
			if (versionChanged) {
				if (this.dismissedVersion === normalized) {
					this.dismissedVersion = null;
					if (hasBrowserContext) {
						safeStorageRemove(
							window.localStorage,
							DISMISSED_VERSION_KEY,
						);
					}
				}
			}
			if (versionChanged) {
				updates.availableVersion = normalized;
			}
			if (timestampChanged) {
				updates.availableTimestamp = timestamp;
			}
				if (versionChanged) {
					updates.availableMessage = null;
					updates.availableCommit = null;
					updates.availableCommitDate = null;
					updates.availableBranch = null;
					updates.availableCommits = [];
				}
			if (!currentVersion) {
				updates.currentVersion = normalized;
			}
			if (Object.keys(updates).length) {
				this.$patch(updates);
			}
			if (!currentVersion && hasBrowserContext) {
				safeStorageSet(
					window.localStorage,
					VERSION_STORAGE_KEY,
					normalized,
				);
			}
		},
		markUpdateApplied(
			version?: string | number | null,
			explicitTimestamp?: number | null,
		) {
			const updates: Partial<UpdateState> = {
				reloading: false,
				dismissedUntil: null,
				dismissedVersion: null,
			};
			if (version) {
				const { normalized, timestamp } = normalizeVersionInput(
					version,
					explicitTimestamp,
				);
				updates.currentVersion = normalized;
				updates.availableVersion = normalized;
				updates.availableTimestamp = timestamp;
				if (hasBrowserContext) {
					safeStorageSet(
						window.localStorage,
						VERSION_STORAGE_KEY,
						normalized || "",
					);
				}
			} else if (this.currentVersion) {
				const normalized = this.currentVersion;
				const timestamp =
					explicitTimestamp ?? parseTimestamp(normalized);
				updates.availableVersion = normalized;
				updates.availableTimestamp = timestamp ?? null;
			}
			this.$patch(updates);
			if (hasBrowserContext) {
				safeStorageRemove(window.sessionStorage, SNOOZE_STORAGE_KEY);
				safeStorageRemove(window.localStorage, DISMISSED_VERSION_KEY);
			}
		},
		dismissUpdate() {
			if (!this.availableVersion) {
				return;
			}
			this.dismissedVersion = this.availableVersion;
			this.dismissedUntil = null;
			if (hasBrowserContext) {
				safeStorageSet(
					window.localStorage,
					DISMISSED_VERSION_KEY,
					this.availableVersion,
				);
				safeStorageRemove(
					window.sessionStorage,
					SNOOZE_STORAGE_KEY,
				);
			}
		},
		clearDismissed() {
			if (!this.dismissedVersion && !this.dismissedUntil) {
				return;
			}
			this.dismissedVersion = null;
			this.dismissedUntil = null;
			if (hasBrowserContext) {
				safeStorageRemove(window.localStorage, DISMISSED_VERSION_KEY);
				safeStorageRemove(window.sessionStorage, SNOOZE_STORAGE_KEY);
			}
		},
		shouldCheckNow(force = false) {
			if (force) return true;
			if (!this.lastCheckedAt) return true;
			return Date.now() - this.lastCheckedAt >= CHECK_INTERVAL_MS;
		},
		async checkForUpdates(force = false) {
			if (!hasBrowserContext) return;
			if (!this.shouldCheckNow(force)) return;
			this.lastCheckedAt = Date.now();
			safeStorageSet(
				window.localStorage,
				LAST_CHECK_KEY,
				String(this.lastCheckedAt),
			);
			// @ts-ignore
			const frappe = (window as any).frappe;
			if (!frappe?.call) return;
			try {
				const r = await frappe.call({
					method: "posawesome.posawesome.api.utilities.get_remote_update_info",
				});
				const buildVersion = r?.message?.build_version;
				const currentCommit = r?.message?.commit_hash;
				if (currentCommit) {
					this.setCurrentCommit(currentCommit);
				}
				if (buildVersion) {
					this.setAvailableVersion(buildVersion);
				}
				if (r?.message?.remote_ahead) {
					const remoteAhead = r.message
						.remote_ahead as Record<string, string> | null;
					const branches = Object.keys(remoteAhead || {});
					const branch = branches[0];
					if (branch) {
						const sample = r.message.remote_sample || {};
						this.availableBranch =
							r.message.remote_sample_branch || branch;
						this.availableCommit =
							sample.commit_hash || remoteAhead?.[branch] || null;
						this.availableMessage =
							sample.commit_message?.trim() || null;
						this.availableCommitDate =
							sample.commit_date || null;
						this.availableCommits =
							r?.message?.remote_commits || [];
						this.availableVersion =
							this.availableCommit || buildVersion;
						return;
					}
				}
				if (r?.message?.commit_message) {
					this.availableMessage =
						r?.message?.commit_message?.trim() || null;
					this.availableCommit = r?.message?.commit_hash || null;
					this.availableCommitDate = r?.message?.commit_date || null;
				}
			} catch (err) {
				console.warn("Failed to check for updates", err);
			}
		},
		setReloadAction(action: () => void) {
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
				safeStorageSet(
					window.sessionStorage,
					SNOOZE_STORAGE_KEY,
					String(until),
				);
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

export function formatBuildVersion(version: string | number | null) {
	return formatTimestamp(parseTimestamp(version)) || String(version || "");
}
