import { ref } from "vue";

export interface SupervisorApprovalPayload {
	supervisor: string;
	supervisor_name: string;
	override_type: string;
	override_reason: string;
}

export interface SupervisorApprovalOptions {
	overrideType: string;
	title?: string;
	description?: string;
	requireReason?: boolean;
}

/**
 * Composable that manages the supervisor approval flow.
 *
 * Usage (inside a component):
 *
 * ```ts
 * const { requestApproval, approvalDialogOpen, approvalOptions, handleApproved, handleCancelled } =
 *   useSupervisorApproval();
 *
 * // Trigger the dialog:
 * const approval = await requestApproval({ overrideType: "return", title: "Approve Return" });
 * if (approval) {
 *   // proceed — approval contains { supervisor, supervisor_name, override_type, override_reason }
 * }
 * ```
 *
 * In the template:
 *
 * ```html
 * <SupervisorApprovalDialog
 *   v-model="approvalDialogOpen"
 *   v-bind="approvalOptions"
 *   :pos-profile="posProfile"
 *   @approved="handleApproved"
 *   @cancelled="handleCancelled"
 * />
 * ```
 */
export function useSupervisorApproval() {
	const approvalDialogOpen = ref(false);
	const approvalOptions = ref<SupervisorApprovalOptions>({
		overrideType: "custom",
	});

	// Promise resolution handles — set when a requestApproval() call is in flight
	let _resolve: ((payload: SupervisorApprovalPayload | null) => void) | null = null;

	/**
	 * Opens the supervisor approval dialog and returns a promise that resolves
	 * with the approval payload when the supervisor approves, or ``null`` when
	 * the dialog is cancelled.
	 */
	function requestApproval(options: SupervisorApprovalOptions): Promise<SupervisorApprovalPayload | null> {
		approvalOptions.value = { ...options };
		approvalDialogOpen.value = true;

		return new Promise((resolve) => {
			_resolve = resolve;
		});
	}

	function handleApproved(payload: SupervisorApprovalPayload) {
		approvalDialogOpen.value = false;
		if (_resolve) {
			_resolve(payload);
			_resolve = null;
		}
	}

	function handleCancelled() {
		approvalDialogOpen.value = false;
		if (_resolve) {
			_resolve(null);
			_resolve = null;
		}
	}

	return {
		approvalDialogOpen,
		approvalOptions,
		requestApproval,
		handleApproved,
		handleCancelled,
	};
}
