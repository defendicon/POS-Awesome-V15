<template>
	<div class="perf-diagnostics">
		<div class="perf-diagnostics__header">
			<div>
				<p class="perf-diagnostics__eyebrow">{{ __("Diagnostics") }}</p>
				<h1>{{ __("POS Performance") }}</h1>
			</div>
			<div class="perf-diagnostics__actions">
				<v-chip size="small" :color="online ? 'success' : 'warning'" variant="flat">
					{{ online ? __("Online") : __("Offline") }}
				</v-chip>
				<v-btn size="small" variant="outlined" prepend-icon="mdi-refresh" @click="refresh">
					{{ __("Refresh") }}
				</v-btn>
				<v-btn size="small" color="error" variant="tonal" prepend-icon="mdi-delete-sweep" @click="reset">
					{{ __("Reset") }}
				</v-btn>
			</div>
		</div>

		<v-alert v-if="!authorized" type="warning" variant="tonal" class="mb-4">
			{{ __("Performance diagnostics are disabled for this session.") }}
		</v-alert>

		<template v-else>
			<div class="perf-grid perf-grid--stats">
				<section class="perf-panel">
					<span>{{ __("Samples") }}</span>
					<strong>{{ events.length }}</strong>
				</section>
				<section class="perf-panel">
					<span>{{ __("Outbox") }}</span>
					<strong>{{ outboxCount }}</strong>
				</section>
				<section class="perf-panel">
					<span>{{ __("Item Cache") }}</span>
					<strong>{{ cacheState.items }}</strong>
				</section>
				<section class="perf-panel">
					<span>{{ __("Customer Cache") }}</span>
					<strong>{{ cacheState.customers }}</strong>
				</section>
			</div>

			<div class="perf-grid">
				<section class="perf-panel perf-panel--wide">
					<div class="perf-panel__title">
						<h2>{{ __("Metric Percentiles") }}</h2>
						<span>{{ __("p50 / p95 / p99") }}</span>
					</div>
					<v-table density="compact" fixed-header height="360">
						<thead>
							<tr>
								<th>{{ __("Metric") }}</th>
								<th>{{ __("Count") }}</th>
								<th>{{ __("Fail") }}</th>
								<th>p50</th>
								<th>p95</th>
								<th>p99</th>
								<th>{{ __("Slowest") }}</th>
							</tr>
						</thead>
						<tbody>
							<tr v-for="row in summaries" :key="row.name">
								<td class="metric-name">{{ row.name }}</td>
								<td>{{ row.count }}</td>
								<td>{{ row.failures }}</td>
								<td>{{ formatDuration(row.p50) }}</td>
								<td>{{ formatDuration(row.p95) }}</td>
								<td>{{ formatDuration(row.p99) }}</td>
								<td>{{ formatDuration(row.slowest) }}</td>
							</tr>
						</tbody>
					</v-table>
				</section>

				<section class="perf-panel">
					<div class="perf-panel__title">
						<h2>{{ __("Boot") }}</h2>
						<span>{{ __("latest") }}</span>
					</div>
					<ul class="perf-list">
						<li v-for="event in bootEvents" :key="event.id">
							<span>{{ event.name }}</span>
							<strong>{{ formatDuration(event.durationMs) }}</strong>
						</li>
					</ul>
				</section>
			</div>

			<section class="perf-panel">
				<div class="perf-panel__title">
					<h2>{{ __("Latest Measurements") }}</h2>
					<span>{{ __("bounded in memory") }}</span>
				</div>
				<v-table density="compact">
					<thead>
						<tr>
							<th>{{ __("Metric") }}</th>
							<th>{{ __("Duration") }}</th>
							<th>{{ __("Status") }}</th>
							<th>{{ __("Tags") }}</th>
						</tr>
					</thead>
					<tbody>
						<tr v-for="event in latestEvents" :key="event.id">
							<td class="metric-name">{{ event.name }}</td>
							<td>{{ formatDuration(event.durationMs) }}</td>
							<td>{{ event.status }}</td>
							<td class="metric-tags">{{ formatTags(event.tags) }}</td>
						</tr>
					</tbody>
				</v-table>
			</section>
		</template>
	</div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import {
	getPerfConfig,
	getPerfEvents,
	getPerfSummaries,
	resetPerfEvents,
	subscribePerfEvents,
	type PerfEvent,
} from "../../utils/perf";
import {
	getQueuedPayloadCount,
	memory,
	type OfflineEntityType,
} from "../../../offline";

const __ = (globalThis as any).__ || ((text: string) => text);

const events = ref<PerfEvent[]>(getPerfEvents());
const summaries = ref(getPerfSummaries());
const online = ref(typeof navigator === "undefined" ? true : navigator.onLine);

function hasRole(role: string) {
	const roles = (globalThis as any).frappe?.boot?.user?.roles || (globalThis as any).frappe?.boot?.roles || [];
	return Array.isArray(roles) && roles.includes(role);
}

const authorized = computed(() => {
	const config = getPerfConfig();
	const boot = (globalThis as any).frappe?.boot || {};
	return Boolean(
		config.enabled ||
			boot.developer_mode ||
			boot.sysdefaults?.developer_mode ||
			hasRole("System Manager"),
	);
});

const latestEvents = computed(() => events.value.slice(-40).reverse());
const bootEvents = computed(() =>
	events.value
		.filter((event) => event.name.startsWith("pos.boot.") || event.name === "pos.app.mount")
		.slice(-12)
		.reverse(),
);

const outboxCount = computed(() => {
	const entityTypes: OfflineEntityType[] = ["invoice", "customer", "payment", "cash_movement"];
	return entityTypes.reduce((total, type) => total + getQueuedPayloadCount(type), 0);
});

const cacheState = computed(() => ({
	items: memory.items_last_sync ? __("Ready") : __("Cold"),
	customers: memory.customers_last_sync ? __("Ready") : __("Cold"),
}));

function refresh() {
	events.value = getPerfEvents();
	summaries.value = getPerfSummaries();
	online.value = typeof navigator === "undefined" ? true : navigator.onLine;
}

function reset() {
	resetPerfEvents();
	refresh();
}

function formatDuration(value: number | null) {
	if (value === null || value === undefined) return "-";
	return `${Number(value).toFixed(value >= 100 ? 0 : 1)} ms`;
}

function formatTags(tags: Record<string, unknown>) {
	return Object.entries(tags || {})
		.filter(([, value]) => value !== null && value !== undefined && value !== "")
		.map(([key, value]) => `${key}:${value}`)
		.join("  ");
}

let unsubscribe: (() => void) | null = null;

onMounted(() => {
	unsubscribe = subscribePerfEvents(refresh);
	window.addEventListener("online", refresh);
	window.addEventListener("offline", refresh);
	refresh();
});

onBeforeUnmount(() => {
	unsubscribe?.();
	window.removeEventListener("online", refresh);
	window.removeEventListener("offline", refresh);
});
</script>

<style scoped>
.perf-diagnostics {
	min-height: 100%;
	padding: 20px;
	background: #f5f7f9;
	color: #1f2933;
}

.perf-diagnostics__header,
.perf-panel__title,
.perf-diagnostics__actions,
.perf-list li {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
}

.perf-diagnostics__header {
	margin-bottom: 16px;
}

.perf-diagnostics__eyebrow {
	margin: 0 0 2px;
	color: #64748b;
	font-size: 12px;
	text-transform: uppercase;
}

h1,
h2 {
	margin: 0;
	font-weight: 700;
	letter-spacing: 0;
}

h1 {
	font-size: 24px;
}

h2 {
	font-size: 15px;
}

.perf-grid {
	display: grid;
	grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr);
	gap: 14px;
	margin-bottom: 14px;
}

.perf-grid--stats {
	grid-template-columns: repeat(4, minmax(0, 1fr));
}

.perf-panel {
	border: 1px solid #d8dee7;
	border-radius: 8px;
	background: #ffffff;
	padding: 14px;
	box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}

.perf-panel--wide {
	min-width: 0;
}

.perf-panel > span,
.perf-panel__title span {
	color: #64748b;
	font-size: 12px;
}

.perf-panel > strong {
	display: block;
	margin-top: 6px;
	font-size: 22px;
}

.perf-list {
	margin: 12px 0 0;
	padding: 0;
	list-style: none;
}

.perf-list li {
	border-top: 1px solid #edf1f5;
	padding: 9px 0;
	font-size: 13px;
}

.metric-name {
	font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
	font-size: 12px;
}

.metric-tags {
	max-width: 420px;
	color: #64748b;
	font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
	font-size: 11px;
	white-space: normal;
	word-break: break-word;
}

@media (max-width: 960px) {
	.perf-grid,
	.perf-grid--stats {
		grid-template-columns: 1fr;
	}

	.perf-diagnostics__header {
		align-items: flex-start;
		flex-direction: column;
	}
}
</style>
