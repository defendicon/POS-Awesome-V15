<template>
	<div class="register-setup-page">
		<v-container fluid class="register-setup-page__container">
			<v-row class="register-setup-page__row" align="stretch">
				<v-col cols="12" lg="4" class="register-setup-page__summary-col">
					<section class="register-summary-card">
						<div class="register-summary-card__eyebrow">
							{{ __("Register Setup") }}
						</div>
						<h1 class="register-summary-card__title">
							{{ __("Start your cashier session") }}
						</h1>
						<p class="register-summary-card__subtitle">
							{{ __("Select the company, choose the POS profile, and confirm opening balances before continuing to POS.") }}
						</p>

						<div class="register-summary-card__status">
							<span class="register-summary-card__status-label">
								{{ __("Current status") }}
							</span>
							<strong>{{ statusLabel }}</strong>
						</div>

						<ul class="register-summary-card__facts">
							<li>
								<span>{{ __("Company") }}</span>
								<strong>{{ state.company || __("Not selected") }}</strong>
							</li>
							<li>
								<span>{{ __("POS Profile") }}</span>
								<strong>{{ state.posProfile || __("Not selected") }}</strong>
							</li>
							<li>
								<span>{{ __("Payment Methods") }}</span>
								<strong>{{ state.paymentMethods.length }}</strong>
							</li>
						</ul>

						<div class="register-summary-card__note">
							<v-icon icon="mdi-wifi-check" size="18" />
							<span>
								{{ __("Cached setup data is used instantly when available, then online data refreshes in the background.") }}
							</span>
						</div>
					</section>
				</v-col>

				<v-col cols="12" lg="8" class="register-setup-page__form-col">
					<section class="register-form-card">
						<div class="register-form-card__header">
							<div>
								<h2 class="register-form-card__title">
									{{ __("Opening Details") }}
								</h2>
								<p class="register-form-card__subtitle">
									{{ __("These values create the opening shift for the current cashier.") }}
								</p>
							</div>
							<div class="register-form-card__actions">
								<v-btn
									variant="text"
									color="secondary"
									prepend-icon="mdi-close-circle-outline"
									@click="goDesk"
								>
									{{ __("Close") }}
								</v-btn>
								<v-btn
									variant="text"
									color="secondary"
									prepend-icon="mdi-logout"
									@click="logout"
								>
									{{ __("Logout") }}
								</v-btn>
							</div>
						</div>

						<v-alert
							v-if="state.errorMessage"
							type="error"
							variant="tonal"
							border="start"
							class="mb-4"
						>
							{{ state.errorMessage }}
						</v-alert>

						<v-row>
							<v-col cols="12" md="6">
								<v-autocomplete
									:model-value="state.company"
									:items="state.companies"
									:label="__('Company')"
									prepend-inner-icon="mdi-domain"
									variant="outlined"
									density="comfortable"
									data-test="register-setup-company"
									@update:model-value="handleCompanyChange"
								/>
							</v-col>
							<v-col cols="12" md="6">
								<v-autocomplete
									:model-value="state.posProfile"
									:items="state.posProfiles"
									:label="__('POS Profile')"
									prepend-inner-icon="mdi-point-of-sale"
									variant="outlined"
									density="comfortable"
									data-test="register-setup-profile"
									@update:model-value="handlePosProfileChange"
								/>
							</v-col>
						</v-row>

						<div class="register-form-card__table-header">
							<h3>{{ __("Opening Balances") }}</h3>
							<span>{{ __("Per payment method") }}</span>
						</div>

						<v-data-table
							:headers="paymentMethodHeaders"
							:items="state.paymentMethods"
							item-key="mode_of_payment"
							hide-default-footer
							class="register-form-card__table"
						>
							<template #item.amount="{ item }">
								<v-text-field
									v-model="item.amount"
									type="number"
									variant="outlined"
									density="compact"
									hide-details
									:prefix="currencySymbol(item.currency)"
								/>
							</template>
						</v-data-table>

						<div class="register-form-card__footer">
							<div class="register-form-card__footer-copy">
								<strong>{{ __("Ready to continue") }}</strong>
								<span>{{ __("Once submitted, the session will redirect to the POS screen.") }}</span>
							</div>
							<v-btn
								color="primary"
								size="large"
								prepend-icon="mdi-check-circle-outline"
								:loading="state.stage === 'submitting'"
								:disabled="state.stage === 'submitting'"
								data-test="register-setup-submit"
								@click="submit"
							>
								{{ __("Create Opening Shift") }}
							</v-btn>
						</div>
					</section>
				</v-col>
			</v-row>
		</v-container>
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRouter } from "vue-router";

import {
	checkDbHealth,
	getBootstrapSnapshot,
	getOpeningDialogStorage,
	initPromise,
	setBootstrapSnapshot,
	setOpeningDialogStorage,
	setOpeningStorage,
} from "../../../../offline/index";
import { createRegisterSetupPage } from "../../../domain/session/registerSetupPage";

declare const frappe: any;
declare const __BUILD_VERSION__: string;

defineOptions({
	name: "RegisterSetupPage",
});

const router = useRouter();
const __ = window.__ || ((value: string) => value);
const buildVersion =
	typeof __BUILD_VERSION__ !== "undefined" ? __BUILD_VERSION__ : null;

const paymentMethodHeaders = [
	{
		title: __("Mode of Payment"),
		align: "start" as const,
		sortable: false,
		value: "mode_of_payment",
	},
	{
		title: __("Opening Amount"),
		align: "center" as const,
		sortable: false,
		value: "amount",
	},
];

const page = createRegisterSetupPage({
	getCachedSetupData: () => getOpeningDialogStorage(),
	getServerSetupData: async () => {
		const response = await frappe.call({
			method: "posawesome.posawesome.api.shifts.get_opening_dialog_data",
			args: {},
		});
		return response?.message || null;
	},
	saveSetupCache: (data) => {
		if (data) {
			setOpeningDialogStorage(data);
		}
	},
	submitOpeningShift: async (payload) => {
		const response = await frappe.call(
			"posawesome.posawesome.api.shifts.create_opening_voucher",
			{
				pos_profile: payload.posProfile,
				company: payload.company,
				balance_details: payload.balanceDetails,
			},
		);
		return response?.message || null;
	},
	saveOpeningStorage: (data) => setOpeningStorage(data),
	getBootstrapSnapshot: () => getBootstrapSnapshot(),
	setBootstrapSnapshot: (snapshot) => setBootstrapSnapshot(snapshot),
	buildVersion,
});

const state = computed(() => page.state.value);

const statusLabel = computed(() => {
	switch (state.value.stage) {
		case "loading":
			return __("Loading setup data");
		case "submitting":
			return __("Submitting opening shift");
		case "submitted":
			return __("Opening shift created");
		case "error":
			return __("Needs attention");
		default:
			return __("Ready for setup");
	}
});

const currencySymbol = (currency: string) =>
	window.get_currency_symbol?.(currency) || "";

async function loadPage() {
	await initPromise;
	await checkDbHealth();
	await page.load();
}

function handleCompanyChange(company: string) {
	page.setCompany(company || "");
}

function handlePosProfileChange(posProfile: string) {
	page.setPosProfile(posProfile || "");
}

async function submit() {
	const submittedRegisterData = await page.submit();
	if (!submittedRegisterData) {
		return;
	}
	await router.replace("/pos");
}

function goDesk() {
	frappe.set_route("/");
	location.reload();
}

function logout() {
	const redirectTarget = "/app/posapp/register";
	const loginPath = `/login?redirect-to=${encodeURIComponent(redirectTarget)}`;
	frappe.call("logout").finally(() => {
		const loginUrl =
			frappe?.utils?.get_url?.(loginPath) ??
			(frappe?.urllib?.get_base_url?.()
				? `${frappe.urllib.get_base_url()}${loginPath}`
				: loginPath);
		window.location.href = loginUrl;
	});
}

onMounted(() => {
	void loadPage();
});
</script>

<style scoped>
.register-setup-page {
	min-height: calc(100dvh - 96px);
	padding: 24px 0 40px;
	background:
		radial-gradient(circle at top left, rgba(12, 163, 135, 0.12), transparent 34%),
		radial-gradient(circle at bottom right, rgba(14, 116, 144, 0.12), transparent 38%),
		linear-gradient(180deg, rgba(247, 250, 252, 0.94), rgba(255, 255, 255, 0.98));
}

.register-setup-page__container {
	max-width: 1520px;
}

.register-setup-page__row {
	min-height: calc(100dvh - 180px);
}

.register-setup-page__summary-col,
.register-setup-page__form-col {
	display: flex;
}

.register-summary-card,
.register-form-card {
	width: 100%;
	border-radius: 28px;
	border: 1px solid rgba(15, 23, 42, 0.08);
	box-shadow: 0 18px 45px rgba(15, 23, 42, 0.08);
}

.register-summary-card {
	display: flex;
	flex-direction: column;
	gap: 18px;
	padding: 28px;
	background: linear-gradient(160deg, #113946, #0f766e);
	color: #f8fafc;
}

.register-summary-card__eyebrow {
	font-size: 0.78rem;
	letter-spacing: 0.12em;
	text-transform: uppercase;
	font-weight: 700;
	opacity: 0.76;
}

.register-summary-card__title {
	margin: 0;
	font-size: clamp(1.8rem, 2.8vw, 2.6rem);
	line-height: 1.05;
}

.register-summary-card__subtitle {
	margin: 0;
	font-size: 0.98rem;
	line-height: 1.7;
	opacity: 0.86;
}

.register-summary-card__status {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 14px 16px;
	border-radius: 18px;
	background: rgba(248, 250, 252, 0.12);
}

.register-summary-card__status-label {
	font-size: 0.76rem;
	text-transform: uppercase;
	letter-spacing: 0.08em;
	opacity: 0.72;
}

.register-summary-card__facts {
	list-style: none;
	padding: 0;
	margin: 0;
	display: grid;
	gap: 14px;
}

.register-summary-card__facts li {
	display: flex;
	justify-content: space-between;
	gap: 12px;
	padding-bottom: 12px;
	border-bottom: 1px solid rgba(248, 250, 252, 0.15);
}

.register-summary-card__facts span {
	opacity: 0.78;
}

.register-summary-card__facts strong {
	text-align: right;
}

.register-summary-card__note {
	display: flex;
	gap: 10px;
	align-items: flex-start;
	padding: 14px 16px;
	border-radius: 18px;
	background: rgba(248, 250, 252, 0.12);
	font-size: 0.92rem;
	line-height: 1.6;
}

.register-form-card {
	display: flex;
	flex-direction: column;
	gap: 20px;
	padding: 28px;
	background: rgba(255, 255, 255, 0.96);
}

.register-form-card__header {
	display: flex;
	justify-content: space-between;
	gap: 16px;
	align-items: flex-start;
}

.register-form-card__title {
	margin: 0;
	font-size: 1.45rem;
	color: #0f172a;
}

.register-form-card__subtitle {
	margin: 6px 0 0;
	color: #475569;
}

.register-form-card__actions {
	display: flex;
	flex-wrap: wrap;
	justify-content: flex-end;
	gap: 8px;
}

.register-form-card__table-header {
	display: flex;
	justify-content: space-between;
	align-items: baseline;
	gap: 16px;
}

.register-form-card__table-header h3 {
	margin: 0;
	font-size: 1rem;
	color: #0f172a;
}

.register-form-card__table-header span {
	color: #64748b;
	font-size: 0.88rem;
}

.register-form-card__table {
	border: 1px solid rgba(148, 163, 184, 0.22);
	border-radius: 18px;
	overflow: hidden;
}

.register-form-card__footer {
	display: flex;
	justify-content: space-between;
	align-items: center;
	gap: 16px;
	padding-top: 8px;
}

.register-form-card__footer-copy {
	display: flex;
	flex-direction: column;
	gap: 4px;
	color: #475569;
}

.register-form-card__footer-copy strong {
	color: #0f172a;
}

@media (max-width: 1264px) {
	.register-setup-page__row {
		min-height: auto;
	}
}

@media (max-width: 960px) {
	.register-setup-page {
		padding-top: 16px;
	}

	.register-summary-card,
	.register-form-card {
		border-radius: 22px;
	}

	.register-form-card__header,
	.register-form-card__footer,
	.register-form-card__table-header {
		flex-direction: column;
		align-items: stretch;
	}

	.register-form-card__actions {
		justify-content: flex-start;
	}
}
</style>
