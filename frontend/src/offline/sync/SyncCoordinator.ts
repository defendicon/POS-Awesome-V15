import {
	getSyncResourceDefinitions,
	getSyncResourcesForTrigger,
} from "./resourceRegistry";
import { setSyncResourceState } from "./syncState";
import type {
	SyncLifecycleState,
	SyncResourceDefinition,
	SyncResourceId,
	SyncResourceState,
	SyncTriggerRunSummary,
	SyncTrigger,
} from "./types";

type RunResource = (
	resource: SyncResourceDefinition,
	trigger: SyncTrigger,
) => Promise<
	| void
	| (Partial<SyncResourceState> & {
			status?: SyncLifecycleState;
	  })
>;

type SyncCoordinatorOptions = {
	concurrency?: number;
	resources?: SyncResourceDefinition[];
	runResource?: RunResource;
	onStateChange?: (states: SyncResourceState[]) => void;
	initialBackoffMs?: number;
	maxBackoffMs?: number;
};

const PRIORITY_WEIGHT: Record<SyncResourceDefinition["priority"], number> = {
	boot_critical: 0,
	warm: 1,
	lazy: 2,
};

function createInitialState(resourceId: SyncResourceId): SyncResourceState {
	return {
		resourceId,
		status: "idle",
		lastSyncedAt: null,
		watermark: null,
		lastSuccessHash: null,
		lastError: null,
		consecutiveFailures: 0,
		lastAttemptAt: null,
		nextRetryAt: null,
		cooldownMs: null,
		lastTrigger: null,
		scopeSignature: null,
		schemaVersion: null,
	};
}

const PRIORITY_ORDER: SyncResourceDefinition["priority"][] = [
	"boot_critical",
	"warm",
	"lazy",
];

function nowIso() {
	return new Date().toISOString();
}

function toErrorMessage(error: unknown) {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error || "Unknown error");
}

function hasUsableSnapshot(state: SyncResourceState) {
	return Boolean(state.lastSyncedAt || state.watermark || state.schemaVersion);
}

function resolveCooldownStatus(state: SyncResourceState): SyncLifecycleState {
	if (!hasUsableSnapshot(state)) {
		return state.status === "limited" ? "limited" : "error";
	}
	return state.status === "limited" ? "limited" : "stale";
}

type ResourceExecutionSummary = {
	resourceId: SyncResourceId;
	priority: SyncResourceDefinition["priority"];
	status: SyncLifecycleState;
	skipped: boolean;
	error: string | null;
};

/**
 * Orchestrates offline background synchronisation for all registered resources.
 *
 * Resources are processed in priority order (`boot_critical` → `warm` → `lazy`) with
 * configurable concurrency. Each trigger run is deduplicated — a second call for the
 * same trigger while one is already in flight returns the existing Promise.
 *
 * @example
 * ```ts
 * import { createDefaultSyncCoordinator } from "@/offline";
 *
 * const coordinator = createDefaultSyncCoordinator();
 * coordinator.runTrigger("boot");
 * ```
 */
export class SyncCoordinator {
	private readonly concurrency: number;

	private readonly resources: SyncResourceDefinition[];

	private readonly runResource: RunResource;

	private readonly onStateChange: ((states: SyncResourceState[]) => void) | null;

	private readonly initialBackoffMs: number;

	private readonly maxBackoffMs: number;

	private readonly inFlightTriggers = new Map<SyncTrigger, Promise<void>>();

	private readonly resourceStates = new Map<SyncResourceId, SyncResourceState>();

	private lastRunSummary: SyncTriggerRunSummary | null = null;

	constructor(options: SyncCoordinatorOptions = {}) {
		this.concurrency = Math.max(1, options.concurrency || 1);
		this.resources =
			options.resources?.map((resource) => ({
				...resource,
				triggers: [...resource.triggers],
			})) || getSyncResourceDefinitions();
		this.runResource = options.runResource || (async () => undefined);
		this.onStateChange = options.onStateChange || null;
		this.initialBackoffMs = Math.max(1_000, options.initialBackoffMs || 5_000);
		this.maxBackoffMs = Math.max(
			this.initialBackoffMs,
			options.maxBackoffMs || 5 * 60 * 1_000,
		);

		for (const resource of this.resources) {
			this.resourceStates.set(resource.id, createInitialState(resource.id));
		}
	}

	/**
	 * Returns a snapshot of the current state for a single resource,
	 * or `null` if the resource ID is not registered.
	 */
	getResourceState(resourceId: SyncResourceId) {
		const state = this.resourceStates.get(resourceId);
		return state ? { ...state } : null;
	}

	/**
	 * Returns snapshots of the current state for all registered resources.
	 */
	getResourceStates() {
		return Array.from(this.resourceStates.values()).map((state) => ({
			...state,
		}));
	}

	getLastRunSummary() {
		return this.lastRunSummary
			? JSON.parse(JSON.stringify(this.lastRunSummary))
			: null;
	}

	/**
	 * Replaces in-memory resource states with the supplied values, then emits a state-change
	 * notification. Used to restore persisted state after a page reload.
	 */
	hydrateResourceStates(states: SyncResourceState[]) {
		for (const state of states || []) {
			if (!state?.resourceId || !this.resourceStates.has(state.resourceId)) {
				continue;
			}
			this.resourceStates.set(state.resourceId, {
				...createInitialState(state.resourceId),
				...state,
			});
		}
		this.emitStateChange();
	}

	/**
	 * Runs all resources that subscribe to `trigger`, in priority order.
	 * If a run for the same trigger is already in flight, returns the existing Promise
	 * instead of starting a second one.
	 *
	 * @param trigger - The event that initiated this sync pass.
	 */
	async runTrigger(trigger: SyncTrigger) {
		const inFlight = this.inFlightTriggers.get(trigger);
		if (inFlight) {
			return inFlight;
		}

		const runPromise = this.executeTrigger(trigger)
			.then(() => undefined)
			.finally(() => {
			this.inFlightTriggers.delete(trigger);
			});
		this.inFlightTriggers.set(trigger, runPromise);
		return runPromise;
	}

	private async executeTrigger(trigger: SyncTrigger) {
		const resources = this.getResourcesForTrigger(trigger);
		const startedAt = nowIso();
		if (!resources.length) {
			this.lastRunSummary = {
				trigger,
				startedAt,
				finishedAt: nowIso(),
				resourcesTotal: 0,
				succeeded: 0,
				failed: 0,
				skipped: 0,
				bootCriticalFailures: 0,
				errors: [],
				resources: [],
			};
			return;
		}
		const summaries: ResourceExecutionSummary[] = [];

		for (const priority of PRIORITY_ORDER) {
			const priorityResources = resources.filter(
				(resource) => resource.priority === priority,
			);
			if (!priorityResources.length) {
				continue;
			}

			const prioritySummaries = await this.executeResourceBatch(
				priorityResources,
				trigger,
			);
			summaries.push(...prioritySummaries);

			if (
				priority === "boot_critical" &&
				prioritySummaries.some((summary) => !!summary.error)
			) {
				break;
			}
		}

		const errors = summaries
			.filter((summary) => !!summary.error)
			.map((summary) => ({
				resourceId: summary.resourceId,
				priority: summary.priority,
				message: summary.error as string,
			}));

		this.lastRunSummary = {
			trigger,
			startedAt,
			finishedAt: nowIso(),
			resourcesTotal: resources.length,
			succeeded: summaries.filter(
				(summary) => !summary.skipped && !summary.error,
			).length,
			failed: errors.length,
			skipped: summaries.filter((summary) => summary.skipped).length,
			bootCriticalFailures: errors.filter(
				(summary) => summary.priority === "boot_critical",
			).length,
			errors,
			resources: summaries,
		};

		if (this.lastRunSummary.bootCriticalFailures > 0) {
			const bootFailure = new Error(
				`Boot-critical offline sync failed for ${this.lastRunSummary.bootCriticalFailures} resource(s): ${errors
					.filter((summary) => summary.priority === "boot_critical")
					.map((summary) => `${summary.resourceId}: ${summary.message}`)
					.join("; ")}`,
			) as Error & { summary?: SyncTriggerRunSummary };
			bootFailure.summary = this.getLastRunSummary() || undefined;
			throw bootFailure;
		}
	}

	private async executeResourceBatch(
		resources: SyncResourceDefinition[],
		trigger: SyncTrigger,
	) {
		const summaries: ResourceExecutionSummary[] = [];
		let currentIndex = 0;
		const workerCount = Math.min(this.concurrency, resources.length);
		const workers = Array.from({ length: workerCount }, async () => {
			while (currentIndex < resources.length) {
				const resource = resources[currentIndex];
				currentIndex += 1;
				if (!resource) {
					return;
				}
				try {
					summaries.push(await this.executeResource(resource, trigger));
				} catch (error) {
					summaries.push({
						resourceId: resource.id,
						priority: resource.priority,
						status: "error",
						skipped: false,
						error: toErrorMessage(error),
					});
				}
			}
		});

		await Promise.allSettled(workers);
		return summaries.sort((left, right) => {
			const leftIndex = resources.findIndex(
				(resource) => resource.id === left.resourceId,
			);
			const rightIndex = resources.findIndex(
				(resource) => resource.id === right.resourceId,
			);
			return leftIndex - rightIndex;
		});
	}

	private getResourcesForTrigger(trigger: SyncTrigger) {
		const triggerResources = this.resources.filter((resource) =>
			resource.triggers.includes(trigger),
		);
		return triggerResources
			.map((resource, index) => ({ resource, index }))
			.sort((left, right) => {
				const priorityDelta =
					PRIORITY_WEIGHT[left.resource.priority] -
					PRIORITY_WEIGHT[right.resource.priority];
				return priorityDelta !== 0 ? priorityDelta : left.index - right.index;
			})
			.map(({ resource }) => resource);
	}

	private async executeResource(
		resource: SyncResourceDefinition,
		trigger: SyncTrigger,
	) {
		const previousState =
			this.resourceStates.get(resource.id) || createInitialState(resource.id);
		if (this.shouldDeferForCooldown(previousState, trigger)) {
			const deferredState = await this.updateResourceState(resource.id, {
				status: resolveCooldownStatus(previousState),
				lastTrigger: trigger,
			});
			return {
				resourceId: resource.id,
				priority: resource.priority,
				status: deferredState.status,
				skipped: true,
				error: null,
			};
		}

		await this.updateResourceState(resource.id, {
			status: "syncing",
			lastError: null,
			lastAttemptAt: nowIso(),
			lastTrigger: trigger,
		});

		try {
			const runResult = await this.runResource(resource, trigger);
			const resolvedStatus = runResult?.status || "fresh";
			const nextState = await this.updateResourceState(resource.id, {
				...runResult,
				status: resolvedStatus,
				lastSyncedAt:
					runResult?.lastSyncedAt ||
					(resolvedStatus === "idle" ? previousState.lastSyncedAt : new Date().toISOString()),
				lastError: runResult?.lastError || null,
				consecutiveFailures:
					typeof runResult?.consecutiveFailures === "number"
						? runResult.consecutiveFailures
						: resolvedStatus === "error"
							? previousState.consecutiveFailures + 1
							: 0,
				lastAttemptAt: nowIso(),
				nextRetryAt: null,
				cooldownMs: null,
				lastTrigger: trigger,
			});
			return {
				resourceId: resource.id,
				priority: resource.priority,
				status: nextState.status,
				skipped: false,
				error: nextState.status === "error" ? nextState.lastError : null,
			};
		} catch (error) {
			const failureCount = (previousState.consecutiveFailures || 0) + 1;
			const cooldownMs = this.computeBackoffMs(failureCount);
			const nextRetryAt = new Date(Date.now() + cooldownMs).toISOString();
			const nextState = await this.updateResourceState(resource.id, {
				status: "error",
				lastError: toErrorMessage(error),
				consecutiveFailures: failureCount,
				lastAttemptAt: nowIso(),
				nextRetryAt,
				cooldownMs,
				lastTrigger: trigger,
			});
			return {
				resourceId: resource.id,
				priority: resource.priority,
				status: nextState.status,
				skipped: false,
				error: nextState.lastError,
			};
		}
	}

	private shouldDeferForCooldown(
		state: SyncResourceState,
		trigger: SyncTrigger,
	) {
		if (trigger === "user_action" || !state.nextRetryAt) {
			return false;
		}
		const nextRetryAt = Date.parse(state.nextRetryAt);
		return Number.isFinite(nextRetryAt) && nextRetryAt > Date.now();
	}

	private computeBackoffMs(failureCount: number) {
		const multiplier = 2 ** Math.max(0, failureCount - 1);
		return Math.min(this.maxBackoffMs, this.initialBackoffMs * multiplier);
	}

	private async updateResourceState(
		resourceId: SyncResourceId,
		patch: Partial<SyncResourceState> & { status?: SyncLifecycleState },
	) {
		const previousState =
			this.resourceStates.get(resourceId) || createInitialState(resourceId);
		const nextState = {
			...previousState,
			...patch,
		};
		this.resourceStates.set(resourceId, nextState);
		await setSyncResourceState(nextState);
		this.emitStateChange();
		return nextState;
	}

	private emitStateChange() {
		if (!this.onStateChange) {
			return;
		}
		this.onStateChange(this.getResourceStates());
	}
}

/**
 * Creates a {@link SyncCoordinator} pre-loaded with the full default resource registry.
 * This is the standard factory used by `useSyncCoordinator` at app startup.
 */
export function createDefaultSyncCoordinator() {
	return new SyncCoordinator({
		resources: getSyncResourcesForTrigger("boot").length
			? getSyncResourceDefinitions()
			: [],
	});
}
