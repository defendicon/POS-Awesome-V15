<template>
	<v-dialog :model-value="modelValue" max-width="500" persistent @update:model-value="$emit('update:modelValue', $event)">
		<v-card class="pos-themed-card supervisor-approval-dialog">
			<v-card-title class="supervisor-approval-dialog__title">
				<div>
					<div class="supervisor-approval-dialog__eyebrow">{{ __("Supervisor Required") }}</div>
					<div class="text-h6">{{ title || __("Supervisor Approval") }}</div>
				</div>
				<v-btn
					icon="mdi-close"
					variant="text"
					:aria-label="__('Cancel supervisor approval')"
					:disabled="loading"
					@click="handleCancel"
				/>
			</v-card-title>

			<v-card-text>
				<div v-if="description" class="supervisor-approval-dialog__description">
					{{ description }}
				</div>

				<div class="supervisor-approval-dialog__list">
					<button
						v-for="employee in supervisors"
						:key="employee.user"
						type="button"
						class="supervisor-approval-dialog__option"
						:class="{ 'supervisor-approval-dialog__option--active': selectedSupervisor === employee.user }"
						@click="selectedSupervisor = employee.user"
					>
						<div>
							<strong>{{ employee.full_name }}</strong>
							<div class="supervisor-approval-dialog__meta">{{ employee.user }}</div>
						</div>
						<v-icon icon="mdi-check-circle" color="primary" v-if="selectedSupervisor === employee.user" />
					</button>
					<div v-if="!supervisors.length" class="supervisor-approval-dialog__empty">
						{{ __("No supervisors are assigned to this POS profile.") }}
					</div>
				</div>

				<v-text-field
					v-model="supervisorPin"
					:type="showPin ? 'text' : 'password'"
					:append-inner-icon="showPin ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
					variant="outlined"
					density="comfortable"
					hide-details="auto"
					class="supervisor-approval-dialog__pin-field"
					:label="__('Supervisor PIN')"
					:disabled="loading"
					@click:append-inner="showPin = !showPin"
					@keyup.enter="handleSubmit"
				/>

				<v-text-field
					v-if="requireReason"
					v-model="reason"
					variant="outlined"
					density="comfortable"
					hide-details="auto"
					class="supervisor-approval-dialog__reason-field"
					:label="__('Reason (optional)')"
					:disabled="loading"
				/>

				<v-alert
					v-if="errorMessage"
					variant="tonal"
					type="error"
					density="comfortable"
					class="supervisor-approval-dialog__error"
				>
					{{ errorMessage }}
				</v-alert>
			</v-card-text>

			<v-card-actions class="supervisor-approval-dialog__actions">
				<v-btn variant="text" :disabled="loading" @click="handleCancel">
					{{ __("Cancel") }}
				</v-btn>
				<v-btn
					color="primary"
					:disabled="!canSubmit"
					:loading="loading"
					@click="handleSubmit"
				>
					{{ __("Approve") }}
				</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useEmployeeStore } from "../../../stores/employeeStore";

declare const frappe: any;
const __ = window.__ || ((text: string, _args?: any[]) => text);

const props = defineProps<{
	modelValue: boolean;
	/** Override type passed to backend (e.g. "return", "delete_invoice") */
	overrideType: string;
	/** Human-readable heading for the dialog */
	title?: string;
	/** Explanatory text shown below the heading */
	description?: string;
	/** Whether to show a reason text field */
	requireReason?: boolean;
	posProfile: any;
}>();

const emit = defineEmits<{
	(e: "update:modelValue", value: boolean): void;
	(e: "approved", payload: {
		supervisor: string;
		supervisor_name: string;
		override_type: string;
		override_reason: string;
	}): void;
	(e: "cancelled"): void;
}>();

const employeeStore = useEmployeeStore();
const { terminalEmployees } = storeToRefs(employeeStore);

const supervisors = computed(() =>
	terminalEmployees.value.filter((e) => e.is_supervisor),
);

const selectedSupervisor = ref<string>("");
const supervisorPin = ref<string>("");
const reason = ref<string>("");
const showPin = ref<boolean>(false);
const loading = ref<boolean>(false);
const errorMessage = ref<string>("");

const canSubmit = computed(
	() => Boolean(selectedSupervisor.value) && supervisorPin.value.length >= 4 && !loading.value,
);

// Reset state when dialog opens
watch(
	() => props.modelValue,
	(open) => {
		if (open) {
			selectedSupervisor.value = supervisors.value.length === 1 ? (supervisors.value[0]?.user ?? "") : "";
			supervisorPin.value = "";
			reason.value = "";
			errorMessage.value = "";
			showPin.value = false;
		}
	},
);

async function handleSubmit() {
	if (!canSubmit.value) return;
	loading.value = true;
	errorMessage.value = "";
	try {
		const profileName =
			typeof props.posProfile === "object"
				? props.posProfile?.name || ""
				: String(props.posProfile || "");

		const { message } = await frappe.call({
			method: "posawesome.posawesome.api.cashier.verify_supervisor_for_action",
			args: {
				pos_profile: profileName,
				supervisor_user: selectedSupervisor.value,
				supervisor_pin: supervisorPin.value,
				override_type: props.overrideType,
				override_reason: reason.value,
			},
		});

		if (message?.approved) {
			emit("approved", {
				supervisor: message.supervisor,
				supervisor_name: message.supervisor_name,
				override_type: message.override_type,
				override_reason: message.override_reason || "",
			});
			emit("update:modelValue", false);
		}
	} catch (err: any) {
		const raw = err?._server_messages || err?.message || "";
		let msg = raw;
		if (raw) {
			try {
				const parsed = JSON.parse(raw);
				if (Array.isArray(parsed) && parsed.length) {
					msg = frappe?.utils?.strip_html ? frappe.utils.strip_html(parsed[0]) : parsed[0];
				}
			} catch {
				/* not json */
			}
		}
		errorMessage.value = msg || __("Supervisor verification failed.");
	} finally {
		loading.value = false;
	}
}

function handleCancel() {
	emit("cancelled");
	emit("update:modelValue", false);
}
</script>

<style scoped>
.supervisor-approval-dialog__title {
	display: flex;
	justify-content: space-between;
	align-items: flex-start;
}
.supervisor-approval-dialog__eyebrow {
	font-size: 0.75rem;
	opacity: 0.6;
	text-transform: uppercase;
	letter-spacing: 0.05em;
}
.supervisor-approval-dialog__description {
	margin-bottom: 12px;
	font-size: 0.9rem;
	opacity: 0.8;
}
.supervisor-approval-dialog__list {
	display: flex;
	flex-direction: column;
	gap: 6px;
	margin-bottom: 14px;
}
.supervisor-approval-dialog__option {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 10px 14px;
	border: 1px solid rgba(0, 0, 0, 0.12);
	border-radius: 8px;
	background: transparent;
	cursor: pointer;
	text-align: left;
	width: 100%;
	transition: background 0.15s;
}
.supervisor-approval-dialog__option:hover {
	background: rgba(0, 0, 0, 0.04);
}
.supervisor-approval-dialog__option--active {
	border-color: rgb(var(--v-theme-primary));
	background: rgba(var(--v-theme-primary), 0.06);
}
.supervisor-approval-dialog__meta {
	font-size: 0.78rem;
	opacity: 0.55;
}
.supervisor-approval-dialog__empty {
	font-size: 0.85rem;
	opacity: 0.6;
	padding: 8px 0;
}
.supervisor-approval-dialog__pin-field {
	margin-bottom: 12px;
}
.supervisor-approval-dialog__reason-field {
	margin-bottom: 12px;
}
.supervisor-approval-dialog__error {
	margin-top: 8px;
}
.supervisor-approval-dialog__actions {
	justify-content: flex-end;
	gap: 8px;
	padding: 8px 16px 16px;
}
</style>
