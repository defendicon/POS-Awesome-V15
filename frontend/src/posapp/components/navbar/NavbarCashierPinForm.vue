<template>
	<div class="navbar-cashier-pin-form">
		<div class="navbar-cashier-pin-form__toolbar">
			<button
				v-if="showBack"
				type="button"
				class="navbar-cashier-pin-form__back"
				data-test="cashier-pin-back"
				@click="$emit('back')"
			>
				{{ __("Back") }}
			</button>
		</div>

		<div
			v-if="!hasRequiredContext"
			class="navbar-cashier-pin-form__alert navbar-cashier-pin-form__alert--warning"
			data-test="cashier-pin-empty-state"
		>
			{{ __("Load a POS profile and cashier first.") }}
		</div>

		<template v-else>
			<div class="navbar-cashier-pin-form__summary">
				<div class="navbar-cashier-pin-form__summary-label">{{ __("Cashier") }}</div>
				<div class="navbar-cashier-pin-form__summary-value">
					{{ currentCashierDisplay || __("Not selected") }}
				</div>
			</div>

			<div
				v-if="pinMessage"
				class="navbar-cashier-pin-form__alert"
				:class="`navbar-cashier-pin-form__alert--${pinMessageType}`"
				data-test="cashier-pin-message"
			>
				{{ pinMessage }}
			</div>

			<div
				v-if="pinStatus.has_pin"
				class="navbar-cashier-pin-form__field"
				data-test="cashier-pin-current-input"
			>
				<label class="navbar-cashier-pin-form__label" :for="inputId('current')">
					{{ __("Current PIN") }}
				</label>
				<div class="navbar-cashier-pin-form__input-wrap">
					<input
						:id="inputId('current')"
						v-model="pinForm.current_pin"
						class="navbar-cashier-pin-form__input"
						:type="pinVisibility.current_pin ? 'text' : 'password'"
						:disabled="pinStatusLoading || pinSubmitting"
					/>
					<button
						type="button"
						class="navbar-cashier-pin-form__toggle"
						@click="togglePinVisibility('current_pin')"
					>
						{{ pinVisibility.current_pin ? __("Hide") : __("Show") }}
					</button>
				</div>
			</div>

			<div class="navbar-cashier-pin-form__field" data-test="cashier-pin-new-input">
				<label class="navbar-cashier-pin-form__label" :for="inputId('new')">
					{{ pinStatus.has_pin ? __("New PIN") : __("Create PIN") }}
				</label>
				<div class="navbar-cashier-pin-form__input-wrap">
					<input
						:id="inputId('new')"
						v-model="pinForm.new_pin"
						class="navbar-cashier-pin-form__input"
						:type="pinVisibility.new_pin ? 'text' : 'password'"
						:disabled="pinStatusLoading || pinSubmitting"
					/>
					<button
						type="button"
						class="navbar-cashier-pin-form__toggle"
						@click="togglePinVisibility('new_pin')"
					>
						{{ pinVisibility.new_pin ? __("Hide") : __("Show") }}
					</button>
				</div>
			</div>

			<div class="navbar-cashier-pin-form__field" data-test="cashier-pin-confirm-input">
				<label class="navbar-cashier-pin-form__label" :for="inputId('confirm')">
					{{ __("Confirm PIN") }}
				</label>
				<div class="navbar-cashier-pin-form__input-wrap">
					<input
						:id="inputId('confirm')"
						v-model="pinForm.confirm_pin"
						class="navbar-cashier-pin-form__input"
						:type="pinVisibility.confirm_pin ? 'text' : 'password'"
						:disabled="pinStatusLoading || pinSubmitting"
					/>
					<button
						type="button"
						class="navbar-cashier-pin-form__toggle"
						@click="togglePinVisibility('confirm_pin')"
					>
						{{ pinVisibility.confirm_pin ? __("Hide") : __("Show") }}
					</button>
				</div>
			</div>

			<div class="navbar-cashier-pin-form__help">
				{{ __("Use a 4 to 8 digit PIN for cashier switching and terminal unlock.") }}
			</div>

			<div class="navbar-cashier-pin-form__actions">
				<button
					type="button"
					class="navbar-cashier-pin-form__save"
					:disabled="!hasRequiredContext"
					data-test="cashier-pin-save"
					@click="saveCashierPin"
				>
					<span v-if="pinSubmitting || pinStatusLoading">{{ __("Saving...") }}</span>
					{{ pinStatus.has_pin ? __("Update PIN") : __("Create PIN") }}
				</button>
			</div>
		</template>
	</div>
</template>

<script setup>
import { computed, reactive, ref, watch } from "vue";

defineOptions({
	name: "NavbarCashierPinForm",
});

const props = defineProps({
	posProfile: {
		type: Object,
		default: null,
	},
	currentCashier: {
		type: Object,
		default: null,
	},
	currentCashierDisplay: {
		type: String,
		default: "",
	},
	showBack: {
		type: Boolean,
		default: true,
	},
});

const emit = defineEmits(["back", "saved"]);

const pinStatusLoading = ref(false);
const pinSubmitting = ref(false);
const pinStatus = ref({
	has_pin: false,
});
const pinForm = reactive({
	current_pin: "",
	new_pin: "",
	confirm_pin: "",
});
const pinVisibility = reactive({
	current_pin: false,
	new_pin: false,
	confirm_pin: false,
});
const pinMessage = ref("");
const pinMessageType = ref("info");

const hasRequiredContext = computed(() => Boolean(props.posProfile?.name && props.currentCashier?.user));

const __ = (text, args = []) => {
	if (window.__) {
		const nextArgs = Array.isArray(args) ? args : [args];
		return window.__(text, ...nextArgs);
	}
	return text.replace(/\{(\d+)\}/g, (_, index) => `${args[index] ?? ""}`);
};

watch(
	() => [props.posProfile?.name, props.currentCashier?.user],
	() => {
		resetPinForm();
		if (hasRequiredContext.value) {
			void loadPinStatus();
		}
	},
	{ immediate: true },
);

function resetPinForm() {
	pinForm.current_pin = "";
	pinForm.new_pin = "";
	pinForm.confirm_pin = "";
	pinVisibility.current_pin = false;
	pinVisibility.new_pin = false;
	pinVisibility.confirm_pin = false;
	pinMessage.value = "";
	pinMessageType.value = "info";
}

function togglePinVisibility(field) {
	pinVisibility[field] = !pinVisibility[field];
}

function inputId(name) {
	return `navbar-cashier-pin-${name}`;
}

async function loadPinStatus() {
	pinStatusLoading.value = true;
	try {
		const response = await frappe.call({
			method: "posawesome.posawesome.api.employees.get_cashier_pin_status",
			args: {
				pos_profile: props.posProfile.name,
				user: props.currentCashier.user,
			},
		});
		pinStatus.value = response?.message || { has_pin: false };
		pinMessage.value = pinStatus.value.has_pin
			? __("Enter the current PIN, then choose a new one.")
			: __("No cashier PIN is set yet. Create one now.");
		pinMessageType.value = pinStatus.value.has_pin ? "info" : "warning";
	} catch (error) {
		pinMessage.value = error?.message || __("Unable to load cashier PIN status.");
		pinMessageType.value = "error";
	} finally {
		pinStatusLoading.value = false;
	}
}

function validatePinForm() {
	const nextPin = String(pinForm.new_pin || "").trim();
	if (!nextPin) {
		return __("Enter a PIN.");
	}
	if (!/^\d{4,8}$/.test(nextPin)) {
		return __("PIN must be 4 to 8 digits.");
	}
	if (nextPin !== String(pinForm.confirm_pin || "").trim()) {
		return __("PIN confirmation does not match.");
	}
	if (pinStatus.value.has_pin && !String(pinForm.current_pin || "").trim()) {
		return __("Enter the current PIN first.");
	}
	return "";
}

async function saveCashierPin() {
	const validationError = validatePinForm();
	if (validationError) {
		pinMessage.value = validationError;
		pinMessageType.value = "error";
		return;
	}

	pinSubmitting.value = true;
	try {
		const response = await frappe.call({
			method: "posawesome.posawesome.api.employees.save_cashier_pin",
			args: {
				pos_profile: props.posProfile.name,
				user: props.currentCashier.user,
				current_pin: pinForm.current_pin,
				new_pin: pinForm.new_pin,
			},
		});
		pinStatus.value = response?.message || { has_pin: true };
		pinMessage.value = __("Cashier PIN saved successfully.");
		pinMessageType.value = "success";
		emit("saved", pinStatus.value);
	} catch (error) {
		pinMessage.value = error?.message || __("Unable to save cashier PIN.");
		pinMessageType.value = "error";
	} finally {
		pinSubmitting.value = false;
	}
}
</script>

<style scoped>
.navbar-cashier-pin-form,
.navbar-cashier-pin-form__actions {
	display: grid;
	gap: 14px;
}

.navbar-cashier-pin-form__toolbar {
	display: flex;
	justify-content: flex-start;
}

.navbar-cashier-pin-form__back {
	width: fit-content;
	border: 1px solid var(--pos-border);
	background: rgba(25, 118, 210, 0.06);
	color: var(--pos-text-primary);
	border-radius: 999px;
	padding: 8px 12px;
	font-size: 12px;
	font-weight: 600;
}

.navbar-cashier-pin-form__summary {
	display: grid;
	gap: 4px;
	padding: 14px 16px;
	border: 1px solid var(--pos-border);
	border-radius: 18px;
	background: rgba(25, 118, 210, 0.04);
}

.navbar-cashier-pin-form__summary-label {
	font-size: 11px;
	font-weight: 700;
	letter-spacing: 0.06em;
	text-transform: uppercase;
	color: var(--pos-text-secondary);
}

.navbar-cashier-pin-form__summary-value {
	font-size: 14px;
	font-weight: 700;
	color: var(--pos-text-primary);
}

.navbar-cashier-pin-form__alert {
	padding: 12px 14px;
	border-radius: 16px;
	border: 1px solid var(--pos-border);
	font-size: 12px;
	line-height: 1.5;
}

.navbar-cashier-pin-form__alert--warning {
	background: rgba(255, 152, 0, 0.1);
	color: #8a5600;
}

.navbar-cashier-pin-form__alert--info {
	background: rgba(25, 118, 210, 0.08);
	color: var(--pos-text-primary);
}

.navbar-cashier-pin-form__alert--error {
	background: rgba(211, 47, 47, 0.08);
	color: #a12727;
}

.navbar-cashier-pin-form__alert--success {
	background: rgba(46, 125, 50, 0.1);
	color: #256628;
}

.navbar-cashier-pin-form__field {
	display: grid;
	gap: 6px;
}

.navbar-cashier-pin-form__label {
	font-size: 12px;
	font-weight: 600;
	color: var(--pos-text-primary);
}

.navbar-cashier-pin-form__input-wrap {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	gap: 8px;
	align-items: center;
}

.navbar-cashier-pin-form__input {
	border: 1px solid var(--pos-border);
	background: var(--pos-card-bg);
	color: var(--pos-text-primary);
	border-radius: 14px;
	padding: 10px 12px;
	font-size: 13px;
}

.navbar-cashier-pin-form__toggle,
.navbar-cashier-pin-form__save {
	border: 1px solid var(--pos-border);
	border-radius: 14px;
	padding: 10px 12px;
	font-size: 12px;
	font-weight: 600;
}

.navbar-cashier-pin-form__toggle {
	background: rgba(25, 118, 210, 0.04);
	color: var(--pos-text-primary);
}

.navbar-cashier-pin-form__help {
	font-size: 12px;
	line-height: 1.5;
	color: var(--pos-text-secondary);
}

.navbar-cashier-pin-form__save {
	background: var(--pos-primary);
	color: white;
	justify-self: start;
}
</style>
