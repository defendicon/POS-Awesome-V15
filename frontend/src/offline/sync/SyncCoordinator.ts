import {
	getSyncResourceDefinitions,
	getSyncResourcesForTrigger,
} from "./resourceRegistry";
import type {
	SyncLifecycleState,
	SyncResourceDefinition,
	SyncResourceId,
	SyncResourceState,
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
		scopeSignature: null,
		schemaVersion: null,
	};
}

export class SyncCoordinator {
	private readonly concurrency: number;

	private readonly resources: SyncResourceDefinition[];

	private readonly runResource: RunResource;

	private readonly onStateChange: ((states: SyncResourceState[]) => void) | null;

	private readonly inFlightTriggers = new Map<SyncTrigger, Promise<void>>();

	private readonly resourceStates = new Map<SyncResourceId, SyncResourceState>();

	constructor(options: SyncCoordinatorOptions = {}) {
		this.concurrency = Math.max(1, options.concurrency || 1);
		this.resources =
			options.resources?.map((resource) => ({
				...resource,
				triggers: [...resource.triggers],
			})) || getSyncResourceDefinitions();
		this.runResource = options.runResource || (async () => undefined);
		this.onStateChange = options.onStateChange || null;

		for (const resource of this.resources) {
			this.resourceStates.set(resource.id, createInitialState(resource.id));
		}
	}

	getResourceState(resourceId: SyncResourceId) {
		const state = this.resourceStates.get(resourceId);
		return state ? { ...state } : null;
	}

	getResourceStates() {
		return Array.from(this.resourceStates.values()).map((state) => ({
			...state,
		}));
	}

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

	async runTrigger(trigger: SyncTrigger) {
		const inFlight = this.inFlightTriggers.get(trigger);
		if (inFlight) {
			return inFlight;
		}

		const runPromise = this.executeTrigger(trigger).finally(() => {
			this.inFlightTriggers.delete(trigger);
		});
		this.inFlightTriggers.set(trigger, runPromise);
		return runPromise;
	}

	private async executeTrigger(trigger: SyncTrigger) {
		const resources = this.getResourcesForTrigger(trigger);
		if (!resources.length) {
			return;
		}

		let currentIndex = 0;
		const workerCount = Math.min(this.concurrency, resources.length);
		const workers = Array.from({ length: workerCount }, async () => {
			while (currentIndex < resources.length) {
				const resource = resources[currentIndex];
				currentIndex += 1;
				if (!resource) {
					return;
				}
				await this.executeResource(resource, trigger);
			}
		});

		await Promise.all(workers);
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
		this.updateResourceState(resource.id, {
			status: "syncing",
			lastError: null,
		});

		try {
			const runResult = await this.runResource(resource, trigger);
			const resolvedStatus = runResult?.status || "fresh";
			this.updateResourceState(resource.id, {
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
			});
		} catch (error) {
			this.updateResourceState(resource.id, {
				status: "error",
				lastError:
					error instanceof Error ? error.message : String(error || "Unknown error"),
				consecutiveFailures:
					(this.resourceStates.get(resource.id)?.consecutiveFailures || 0) + 1,
			});
			throw error;
		}
	}

	private updateResourceState(
		resourceId: SyncResourceId,
		patch: Partial<SyncResourceState> & { status?: SyncLifecycleState },
	) {
		const previousState =
			this.resourceStates.get(resourceId) || createInitialState(resourceId);
		this.resourceStates.set(resourceId, {
			...previousState,
			...patch,
		});
		this.emitStateChange();
	}

	private emitStateChange() {
		if (!this.onStateChange) {
			return;
		}
		this.onStateChange(this.getResourceStates());
	}
}

export function createDefaultSyncCoordinator() {
	return new SyncCoordinator({
		resources: getSyncResourcesForTrigger("boot").length
			? getSyncResourceDefinitions()
			: [],
	});
}
