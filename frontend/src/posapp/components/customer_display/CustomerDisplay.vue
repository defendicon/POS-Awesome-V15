<template>
	<section class="customer-display-screen">
		<header class="display-header">
			<div class="display-title-block">
				<h1>{{ __("Your Cart") }}</h1>
				<p class="display-subtitle">
					{{ customerLabel }}
				</p>
			</div>
			<div class="display-meta">
				<p>{{ __("Items") }}: {{ itemCount }}</p>
				<p>{{ __("Updated") }}: {{ updatedLabel }}</p>
			</div>
		</header>

		<div v-if="!channelId" class="display-empty-state">
			<h2>{{ __("Customer display channel is missing") }}</h2>
			<p>{{ __("Open this screen from POS Menu -> Open Customer Display.") }}</p>
		</div>

		<div v-else-if="!rows.length" class="display-empty-state">
			<h2>{{ __("Waiting for cart items") }}</h2>
			<p>{{ __("Items added in POS will appear here automatically.") }}</p>
		</div>

		<div v-else class="display-table-wrap">
			<table class="display-table">
				<thead>
					<tr>
						<th>{{ __("Item") }}</th>
						<th>{{ __("Qty") }}</th>
						<th>{{ __("Rate") }}</th>
						<th>{{ __("Amount") }}</th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="row in rows" :key="row.id">
						<td>{{ row.item_name }}</td>
						<td>{{ formatQty(row.qty) }}</td>
						<td>{{ formatCurrency(row.rate) }}</td>
						<td>{{ formatCurrency(row.amount) }}</td>
					</tr>
				</tbody>
			</table>
		</div>

		<footer class="display-footer">
			<div class="display-total-label">{{ __("Total") }}</div>
			<div class="display-total-value">{{ formatCurrency(totalAmount) }}</div>
		</footer>
	</section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { createCustomerDisplayTransport, type CustomerDisplaySnapshot } from "../../utils/customerDisplay";

declare const __: (_text: string, _args?: any[]) => string;

const route = useRoute();

const getChannelFromLocation = () => {
	if (typeof window === "undefined") return "";
	const params = new URLSearchParams(window.location.search);
	return String(params.get("channel") || "").trim();
};

const channelId = computed(() => {
	const fromRoute = String(route.query.channel || "").trim();
	if (fromRoute) return fromRoute;
	return getChannelFromLocation();
});

const emptySnapshot = (): CustomerDisplaySnapshot => ({
	channel_id: "",
	currency: "",
	customer_name: "",
	items: [],
	total_qty: 0,
	total_amount: 0,
	updated_at: "",
});

const snapshot = ref<CustomerDisplaySnapshot>(emptySnapshot());

let unsubscribe: (() => void) | null = null;
let transport: ReturnType<typeof createCustomerDisplayTransport> | null = null;

const syncSubscription = () => {
	if (unsubscribe) {
		unsubscribe();
		unsubscribe = null;
	}
	if (transport) {
		transport.close();
		transport = null;
	}

	if (!channelId.value) {
		snapshot.value = emptySnapshot();
		return;
	}

	transport = createCustomerDisplayTransport(channelId.value);
	unsubscribe = transport.subscribe((nextSnapshot) => {
		snapshot.value = nextSnapshot || emptySnapshot();
	});
};

watch(channelId, syncSubscription, { immediate: true });

onBeforeUnmount(() => {
	if (unsubscribe) {
		unsubscribe();
		unsubscribe = null;
	}
	if (transport) {
		transport.close();
		transport = null;
	}
});

const rows = computed(() => snapshot.value.items || []);
const itemCount = computed(() => rows.value.length);
const totalAmount = computed(() =>
	Number.isFinite(Number(snapshot.value.total_amount))
		? Number(snapshot.value.total_amount)
		: rows.value.reduce((sum, row) => sum + Number(row.amount || 0), 0),
);

const customerLabel = computed(() =>
	snapshot.value.customer_name
		? `${__("Customer")}: ${snapshot.value.customer_name}`
		: __("Customer not selected"),
);

const updatedLabel = computed(() => {
	if (!snapshot.value.updated_at) return "--";
	const dt = new Date(snapshot.value.updated_at);
	if (Number.isNaN(dt.getTime())) return "--";
	return dt.toLocaleTimeString();
});

const formatQty = (value: number) => {
	const qty = Number(value || 0);
	return qty.toLocaleString(undefined, {
		minimumFractionDigits: Number.isInteger(qty) ? 0 : 2,
		maximumFractionDigits: 3,
	});
};

const formatCurrency = (value: number) => {
	const amount = Number(value || 0);
	const currency = snapshot.value.currency || "";
	if (!currency) {
		return amount.toLocaleString(undefined, {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		});
	}
	try {
		return new Intl.NumberFormat(undefined, {
			style: "currency",
			currency,
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		}).format(amount);
	} catch {
		return amount.toFixed(2);
	}
};
</script>

<style scoped>
.customer-display-screen {
	height: 100%;
	display: grid;
	grid-template-rows: auto 1fr auto;
	gap: 12px;
	color: #f9fafb;
}

.display-header {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	background: rgba(17, 24, 39, 0.82);
	border: 1px solid rgba(148, 163, 184, 0.22);
	border-radius: 14px;
	padding: 16px 20px;
	backdrop-filter: blur(6px);
}

.display-title-block h1 {
	margin: 0;
	font-size: clamp(24px, 2.6vw, 38px);
	font-weight: 800;
}

.display-subtitle {
	margin: 4px 0 0;
	color: #cbd5e1;
	font-size: clamp(14px, 1.2vw, 18px);
}

.display-meta {
	text-align: right;
	color: #e2e8f0;
	font-size: clamp(13px, 1.1vw, 16px);
}

.display-meta p {
	margin: 0;
}

.display-table-wrap {
	overflow: auto;
	border-radius: 14px;
	border: 1px solid rgba(148, 163, 184, 0.2);
	background: rgba(15, 23, 42, 0.78);
}

.display-table {
	width: 100%;
	border-collapse: collapse;
}

.display-table th,
.display-table td {
	padding: 14px 16px;
	border-bottom: 1px solid rgba(148, 163, 184, 0.17);
	font-size: clamp(14px, 1.2vw, 20px);
}

.display-table th {
	position: sticky;
	top: 0;
	background: rgba(15, 23, 42, 0.95);
	text-transform: uppercase;
	font-size: clamp(12px, 1vw, 14px);
	letter-spacing: 0.04em;
}

.display-table td:nth-child(2),
.display-table td:nth-child(3),
.display-table td:nth-child(4),
.display-table th:nth-child(2),
.display-table th:nth-child(3),
.display-table th:nth-child(4) {
	text-align: right;
}

.display-empty-state {
	display: grid;
	place-items: center;
	text-align: center;
	border-radius: 14px;
	padding: 28px;
	border: 1px dashed rgba(148, 163, 184, 0.35);
	background: rgba(15, 23, 42, 0.62);
}

.display-empty-state h2 {
	margin: 0 0 8px;
	font-size: clamp(20px, 2vw, 30px);
}

.display-empty-state p {
	margin: 0;
	color: #cbd5e1;
	font-size: clamp(14px, 1.1vw, 18px);
}

.display-footer {
	display: flex;
	align-items: center;
	justify-content: space-between;
	background: rgba(3, 105, 161, 0.25);
	border: 1px solid rgba(56, 189, 248, 0.38);
	border-radius: 14px;
	padding: 14px 20px;
}

.display-total-label {
	font-size: clamp(16px, 1.6vw, 24px);
	font-weight: 700;
}

.display-total-value {
	font-size: clamp(26px, 3vw, 44px);
	font-weight: 900;
	color: #fef08a;
}

@media (max-width: 768px) {
	.display-header {
		flex-direction: column;
		gap: 8px;
	}

	.display-meta {
		text-align: left;
	}

	.display-table th,
	.display-table td {
		padding: 10px 12px;
	}
}
</style>
