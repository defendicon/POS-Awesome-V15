<template>
	<v-card class="pa-4 pos-themed-card">
		<div class="d-flex flex-wrap align-center justify-space-between ga-3 mb-1">
			<div class="text-h6">{{ __("Cash Movement") }}</div>
			<div style="min-width: 190px; max-width: 220px; width: 100%;">
				<v-text-field
					v-model="postingDate"
					type="date"
					variant="outlined"
					density="compact"
					hide-details
					:label="__('Posting Date')"
					:disabled="submitting || !enabled"
				/>
			</div>
		</div>
		<div class="text-body-2 text-grey mb-4">
			{{ __("Book expense or deposit from active shift.") }}
		</div>

		<v-alert
			v-if="enabled && !allowExpense && !allowDeposit"
			type="warning"
			variant="tonal"
			density="compact"
			class="mb-3"
		>
			{{ __("No cash movement type is allowed for this POS Profile.") }}
		</v-alert>

		<v-row dense>
			<v-col cols="12" md="4">
				<v-text-field
					v-model="againstName"
					variant="outlined"
					density="compact"
					:label="__('Against Name')"
					:disabled="submitting || !enabled"
				/>
			</v-col>
			<v-col cols="12" md="4">
				<v-select
					v-model="movementType"
					:items="movementTypes"
					variant="outlined"
					density="compact"
					:label="__('Movement Type')"
					:disabled="submitting || !enabled || movementTypes.length === 0"
				/>
			</v-col>
			<v-col cols="12" md="4">
				<v-text-field
					v-model.number="amount"
					type="number"
					min="0"
					step="0.01"
					variant="outlined"
					density="compact"
					:label="__('Amount')"
					:disabled="submitting || !enabled"
					@focus="onAmountFocus"
					@blur="onAmountBlur"
					@update:model-value="onAmountInput"
				/>
			</v-col>
			<v-col cols="12" md="4" v-if="allowSourceAccountOverride">
				<v-autocomplete
					v-model="sourceAccount"
					:items="sourceAccountOptions"
					:loading="sourceAccountLoading"
					:search="sourceAccountSearch"
					@update:search="onSourceSearch"
					@focus="loadSourceAccounts('')"
					no-filter
					clearable
					hide-no-data
					variant="outlined"
					density="compact"
					:label="__('Source Cash Account (Optional Override)')"
					:disabled="submitting || !enabled"
				/>
			</v-col>
			<v-col cols="12" md="4" v-if="movementType === 'Expense'">
				<v-autocomplete
					v-model="expenseAccount"
					:items="expenseAccountOptions"
					:loading="expenseAccountLoading"
					:search="expenseAccountSearch"
					@update:search="onExpenseSearch"
					@focus="loadExpenseAccounts('')"
					no-filter
					clearable
					hide-no-data
					variant="outlined"
					density="compact"
					:label="__('Expense Account (Optional Override)')"
					:disabled="submitting || !enabled"
				/>
			</v-col>
			<v-col cols="12" md="4" v-if="movementType === 'Deposit'">
				<v-autocomplete
					v-model="targetAccount"
					:items="targetAccountOptions"
					:loading="targetAccountLoading"
					:search="targetAccountSearch"
					@update:search="onTargetSearch"
					@focus="loadTargetAccounts('')"
					no-filter
					:clearable="!targetAccountLocked"
					hide-no-data
					variant="outlined"
					density="compact"
					:label="targetAccountLocked ? __('Back Office Cash Account') : __('Back Office Cash Account (Optional Override)')"
					:disabled="submitting || !enabled || targetAccountLocked"
				/>
			</v-col>
			<v-col cols="12">
				<v-textarea
					v-model="remarks"
					variant="outlined"
					density="compact"
					rows="2"
					auto-grow
					:label="__('Remarks')"
					:disabled="submitting || !enabled"
				/>
			</v-col>
			<v-col cols="12" class="d-flex ga-2">
				<v-btn
					color="primary"
					:disabled="submitting || !enabled || !allowExpense || movementType !== 'Expense'"
					:loading="submitting && movementType === 'Expense'"
					@click="onSubmit('Expense')"
				>
					{{ __("Submit Expense") }}
				</v-btn>
				<v-btn
					color="secondary"
					:disabled="submitting || !enabled || !allowDeposit || movementType !== 'Deposit'"
					:loading="submitting && movementType === 'Deposit'"
					@click="onSubmit('Deposit')"
				>
					{{ __("Submit Deposit") }}
				</v-btn>
			</v-col>
		</v-row>
	</v-card>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";

type MovementType = "Expense" | "Deposit";
type AccountSearchType = "expense" | "cash";

const __ = window.__ || ((text: string, _args?: any[]) => text);

const props = defineProps<{
	context: any;
	submitting: boolean;
	resetToken?: number;
	prefillToken?: number;
	prefillData?: any;
}>();

const emit = defineEmits<{
	(e: "submit", payload: any): void;
}>();

const movementType = ref<MovementType | null>("Expense");
const amount = ref<number | string | null>(0);
const postingDate = ref<string>(getTodayDate());
const remarks = ref<string>("");
const againstName = ref<string>("");
const sourceAccount = ref<string>("");
const expenseAccount = ref<string>("");
const targetAccount = ref<string>("");
const sourceAccountOptions = ref<string[]>([]);
const expenseAccountOptions = ref<string[]>([]);
const targetAccountOptions = ref<string[]>([]);
const sourceAccountSearch = ref("");
const expenseAccountSearch = ref("");
const targetAccountSearch = ref("");
const sourceAccountLoading = ref(false);
const expenseAccountLoading = ref(false);
const targetAccountLoading = ref(false);
let sourceSearchTimer: ReturnType<typeof setTimeout> | null = null;
let expenseSearchTimer: ReturnType<typeof setTimeout> | null = null;
let targetSearchTimer: ReturnType<typeof setTimeout> | null = null;
let previousAmount = 0;
let amountEdited = false;

const enabled = computed(() => !!props.context?.enable_cash_movement);
const allowExpense = computed(() => !!props.context?.allow_pos_expense);
const allowDeposit = computed(() => !!props.context?.allow_cash_deposit);
const allowSourceAccountOverride = computed(() => !!props.context?.allow_source_account_override);
const targetAccountLocked = computed(() => !!props.context?.back_office_cash_account);
const allowedExpenseAccounts = computed(() =>
	normalizeAllowedAccountList(props.context?.allowed_expense_accounts),
);
const allowedSourceAccounts = computed(() =>
	normalizeAllowedAccountList(props.context?.allowed_source_accounts),
);
const movementTypes = computed(() => {
	const types: Array<{ title: string; value: MovementType }> = [];
	if (allowExpense.value) {
		types.push({ title: __("Expense"), value: "Expense" });
	}
	if (allowDeposit.value) {
		types.push({ title: __("Deposit"), value: "Deposit" });
	}
	return types;
});

watch(
	() => props.context,
	async (newContext) => {
		if (!newContext) return;
		sourceAccount.value = resolveInitialSourceAccount(newContext);
		expenseAccount.value = resolveInitialExpenseAccount(newContext);
		targetAccount.value = newContext.back_office_cash_account || "";
		if (sourceAccount.value) {
			ensureOptionExists(sourceAccountOptions.value, sourceAccount.value);
		}
		if (expenseAccount.value) {
			ensureOptionExists(expenseAccountOptions.value, expenseAccount.value);
		}
		if (targetAccount.value) {
			ensureOptionExists(targetAccountOptions.value, targetAccount.value);
		}
		await Promise.all([loadSourceAccounts(""), loadExpenseAccounts(""), loadTargetAccounts("")]);
	},
	{ immediate: true, deep: true },
);

watch(
	movementTypes,
	(types) => {
		const selectedIsAllowed = types.some((type) => type.value === movementType.value);
		if (!selectedIsAllowed && types.length) {
			const firstType = types[0];
			movementType.value = firstType ? firstType.value : null;
		}
	},
	{ immediate: true },
);

function ensureOptionExists(options: string[], value: string) {
	if (!value) return;
	if (!options.includes(value)) {
		options.unshift(value);
	}
}

function normalizeAllowedAccountList(values: any): string[] {
	const result: string[] = [];
	for (const value of values || []) {
		const account = String(value || "").trim();
		if (account && !result.includes(account)) {
			result.push(account);
		}
	}
	return result;
}

function filterAllowedAccounts(allowedAccounts: string[], searchText: string): string[] {
	const query = (searchText || "").trim().toLowerCase();
	if (!query) {
		return [...allowedAccounts];
	}
	return allowedAccounts.filter((account) => account.toLowerCase().includes(query));
}

function resolveInitialExpenseAccount(context: any) {
	const allowed = normalizeAllowedAccountList(context?.allowed_expense_accounts);
	const preferred = String(context?.default_expense_account || "");
	if (allowed.length > 0 && preferred && !allowed.includes(preferred)) {
		return allowed[0] || "";
	}
	return preferred;
}

function resolveInitialSourceAccount(context: any) {
	const preferred = String(context?.default_source_account || "");
	return preferred;
}

function normalizeSearchResults(rows: any[]): string[] {
	const result: string[] = [];
	for (const row of rows || []) {
		let value = "";
		if (typeof row === "string") {
			value = row;
		} else if (Array.isArray(row) && row.length) {
			value = String(row[0] || "");
		} else if (row?.value) {
			value = String(row.value);
		} else if (row?.name) {
			value = String(row.name);
		}
		if (value && !result.includes(value)) {
			result.push(value);
		}
	}
	return result;
}

async function fetchAccountOptions(searchText: string, type: AccountSearchType): Promise<string[]> {
	const company = props.context?.company;
	const filters: Record<string, any> = {
		is_group: 0,
	};
	if (company) {
		filters.company = company;
	}
	if (type === "expense") {
		filters.root_type = "Expense";
	} else {
		filters.account_type = "Cash";
	}

	const response = await frappe.call({
		method: "frappe.desk.search.search_link",
		args: {
			doctype: "Account",
			txt: searchText || "",
			page_length: 20,
			filters,
		},
	});
	return normalizeSearchResults(response?.message || []);
}

async function loadExpenseAccounts(searchText = "") {
	if (!enabled.value || !allowExpense.value) return;
	if (allowedExpenseAccounts.value.length > 0) {
		expenseAccountOptions.value = filterAllowedAccounts(allowedExpenseAccounts.value, searchText);
		ensureOptionExists(expenseAccountOptions.value, expenseAccount.value);
		return;
	}
	expenseAccountLoading.value = true;
	try {
		const results = await fetchAccountOptions(searchText, "expense");
		expenseAccountOptions.value = results;
		ensureOptionExists(expenseAccountOptions.value, expenseAccount.value);
	} finally {
		expenseAccountLoading.value = false;
	}
}

async function loadSourceAccounts(searchText = "") {
	if (!enabled.value || !allowSourceAccountOverride.value) return;
	if (allowedSourceAccounts.value.length > 0) {
		sourceAccountOptions.value = filterAllowedAccounts(allowedSourceAccounts.value, searchText);
		ensureOptionExists(sourceAccountOptions.value, sourceAccount.value);
		return;
	}
	sourceAccountLoading.value = true;
	try {
		const results = await fetchAccountOptions(searchText, "cash");
		sourceAccountOptions.value = results;
		ensureOptionExists(sourceAccountOptions.value, sourceAccount.value);
	} finally {
		sourceAccountLoading.value = false;
	}
}

async function loadTargetAccounts(searchText = "") {
	if (!enabled.value || !allowDeposit.value) return;
	if (targetAccountLocked.value) {
		targetAccountOptions.value = [];
		ensureOptionExists(targetAccountOptions.value, targetAccount.value);
		return;
	}
	targetAccountLoading.value = true;
	try {
		const results = await fetchAccountOptions(searchText, "cash");
		targetAccountOptions.value = results;
		ensureOptionExists(targetAccountOptions.value, targetAccount.value);
	} finally {
		targetAccountLoading.value = false;
	}
}

function onSourceSearch(value: string) {
	sourceAccountSearch.value = value || "";
	if (sourceSearchTimer) {
		clearTimeout(sourceSearchTimer);
	}
	sourceSearchTimer = setTimeout(() => {
		loadSourceAccounts(sourceAccountSearch.value);
	}, 250);
}

function onExpenseSearch(value: string) {
	expenseAccountSearch.value = value || "";
	if (expenseSearchTimer) {
		clearTimeout(expenseSearchTimer);
	}
	expenseSearchTimer = setTimeout(() => {
		loadExpenseAccounts(expenseAccountSearch.value);
	}, 250);
}

function onTargetSearch(value: string) {
	targetAccountSearch.value = value || "";
	if (targetSearchTimer) {
		clearTimeout(targetSearchTimer);
	}
	targetSearchTimer = setTimeout(() => {
		loadTargetAccounts(targetAccountSearch.value);
	}, 250);
}

function onSubmit(type: MovementType) {
	emit("submit", {
		movementType: type,
		amount: Number(amount.value || 0),
		againstName: againstName.value,
		postingDate: postingDate.value,
		sourceAccount: sourceAccount.value,
		remarks: remarks.value,
		expenseAccount: expenseAccount.value,
		targetAccount: targetAccount.value,
	});
}

function onAmountFocus() {
	previousAmount = Number.isFinite(Number(amount.value)) ? Number(amount.value) : 0;
	amountEdited = false;
	amount.value = null;
}

function onAmountInput(value: number | string | null) {
	if (!amountEdited && (value === null || value === undefined || value === "")) {
		return;
	}
	amountEdited = true;
}

function onAmountBlur() {
	if (!amountEdited && (amount.value === null || amount.value === undefined || amount.value === "")) {
		amount.value = previousAmount;
	}
}

function resetFormState() {
	amount.value = 0;
	postingDate.value = getTodayDate();
	againstName.value = "";
	remarks.value = "";
	sourceAccount.value = resolveInitialSourceAccount(props.context);
	expenseAccount.value = resolveInitialExpenseAccount(props.context);
	targetAccount.value = props.context?.back_office_cash_account || "";

	const allowed = movementTypes.value;
	if (allowed.length > 0) {
		const first = allowed[0];
		movementType.value = first ? first.value : null;
	}
}

function applyPrefillData(data: any) {
	if (!data) return;

	const nextMovementType = data.movementType || data.movement_type;
	if (nextMovementType === "Expense" || nextMovementType === "Deposit") {
		movementType.value = nextMovementType;
	}

	const nextAmount = Number(data.amount);
	if (Number.isFinite(nextAmount) && nextAmount > 0) {
		amount.value = nextAmount;
	}

	postingDate.value = String(data.postingDate || data.posting_date || getTodayDate()).slice(0, 10);
	againstName.value = String(data.againstName || data.against_name || "");
	remarks.value = String(data.remarks || "");
	sourceAccount.value = String(data.sourceAccount || data.source_account || "");
	expenseAccount.value = String(data.expenseAccount || data.expense_account || "");
	targetAccount.value = String(data.targetAccount || data.target_account || "");

	ensureOptionExists(sourceAccountOptions.value, sourceAccount.value);
	ensureOptionExists(expenseAccountOptions.value, expenseAccount.value);
	ensureOptionExists(targetAccountOptions.value, targetAccount.value);
}

function getTodayDate() {
	return new Date().toISOString().slice(0, 10);
}

watch(
	() => props.resetToken,
	() => {
		resetFormState();
	},
);

watch(
	() => props.prefillToken,
	() => {
		applyPrefillData(props.prefillData);
	},
);
</script>
