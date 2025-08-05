<template>
	<div class="db-gadget-section mx-1">
		<v-tooltip location="bottom">
			<template #activator="{ props }">
				<div v-bind="props" class="db-meter-container">
					<v-icon size="22" color="info">mdi-database</v-icon>
					<span class="db-current-size">{{ formattedDbSize }}</span>
				</div>
			</template>
			<div class="db-tooltip-content p-3 min-w-[220px]">
				<div class="db-tooltip-title flex items-center font-semibold text-[14px] mb-2">
					<v-icon size="16" color="info" class="mr-1">mdi-database-settings</v-icon>
					{{ __("Database Health") }}
				</div>
				<v-divider class="my-2" />
				<div v-if="loading" class="db-tooltip-detail">{{ __("Loading database stats...") }}</div>
				<div v-else-if="error" class="db-tooltip-warning">{{ error }}</div>
				<div v-else>
					<div class="db-tooltip-section-title mb-1">{{ __("Database Info") }}</div>
					<div class="db-tooltip-sparkline mb-2">
						<svg :width="120" :height="32" class="db-sparkline">
							<polyline
								:points="sparklinePoints"
								fill="none"
								stroke="#1976d2"
								stroke-width="2"
							/>
						</svg>
					</div>
					<div class="db-tooltip-detail flex items-center mb-1">
						<v-icon size="14" color="info" class="mr-1">mdi-database-settings</v-icon>
						<b>{{ dbStats.db_engine }}</b>
						<span class="ml-2">{{ dbStats.db_version }}</span>
					</div>
					<v-divider class="my-2" />
					<div class="db-tooltip-section-title mb-1">{{ __("Usage Stats") }}</div>
					<div class="db-tooltip-detail flex items-center mb-1">
						<v-icon size="14" color="info" class="mr-1">mdi-database</v-icon>
						{{ __("Size:") }} <b>{{ formattedDbSize }}</b>
						<span class="ml-2 flex items-center"
							><v-icon size="14" color="info" class="mr-1">mdi-table</v-icon
							>{{ __("Tables:") }} <b>{{ dbStats.db_table_count }}</b></span
						>
						<span class="ml-2 flex items-center"
							><v-icon size="14" color="info" class="mr-1">mdi-format-list-numbered</v-icon
							>{{ __("Rows:") }} <b>{{ dbStats.db_total_rows }}</b></span
						>
					</div>
					<div class="db-tooltip-detail flex items-center mb-1">
						<v-icon size="14" color="info" class="mr-1">mdi-connection</v-icon>
						{{ __("Connections:") }} <b>{{ dbStats.db_connections }}</b>
						<span class="ml-2 flex items-center"
							><v-icon size="14" color="warning" class="mr-1">mdi-timer-sand</v-icon
							>{{ __("Slow Queries:") }} <b>{{ dbStats.db_slow_queries }}</b></span
						>
					</div>
					<v-divider class="my-2" />
					<div v-if="dbStats.db_top_tables && dbStats.db_top_tables.length">
						<div class="db-tooltip-section-title mb-1 flex items-center">
							<v-icon size="14" color="info" class="mr-1">mdi-database-outline</v-icon>
							{{ __("Top Tables") }}
						</div>
						<ul class="db-top-tables ml-2">
							<li
								v-for="t in dbStats.db_top_tables"
								:key="t.name"
								class="flex items-center mb-1"
							>
								<v-icon size="12" color="info" class="mr-1">mdi-table</v-icon>
								<b>{{ t.name }}</b
								>: {{ formatBytes(t.size) }}
							</li>
						</ul>
					</div>
				</div>
				<v-divider class="my-2" />
				<div class="db-tooltip-tip mt-2 flex items-center">
					<v-icon size="14" color="primary" class="mr-1">mdi-lightbulb-on-outline</v-icon>
					{{ __("Tip: Monitor slow queries and table size for optimal performance.") }}
				</div>
				<div class="db-tooltip-explanation mt-2 flex items-center">
					<v-icon size="14" color="info" class="mr-1">mdi-database</v-icon>
					{{ __("Database health affects overall system speed and reliability.") }}
				</div>
			</div>
		</v-tooltip>
	</div>
</template>

<script setup>
import { computed, inject } from "vue";
import { useDatabaseStats } from "../../composables/useDatabaseStats";

const { dbStats, history, loading, error } = useDatabaseStats(10000, 30);
const __ = inject("__", (txt) => txt);

const formattedDbSize = computed(() => formatBytes(dbStats.value?.db_size));

function formatBytes(bytes) {
	if (bytes == null) return "N/A";
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

const sparklinePoints = computed(() => {
	const arr = history.value.map((h) => h.db_size || 0);
	const w = 120,
		h = 32;
	if (!arr.length) return "";
	const max = Math.max(...arr, 100);
	const min = 0;
	const step = arr.length > 1 ? w / (arr.length - 1) : w;
	return arr.map((v, i) => `${i * step},${h - ((v - min) / (max - min || 1)) * h}`).join(" ");
});
</script>

<style scoped>
.db-gadget-section {
	display: flex;
	align-items: center;
	margin: 0 8px;
}
.db-meter-container {
	cursor: pointer;
	position: relative;
	display: flex;
	align-items: center;
	justify-content: center;
	transition: all 0.3s ease;
}
.db-meter-container:hover {
	transform: scale(1.1);
}
.db-current-size {
	font-size: 13px;
	font-weight: 600;
	color: #1976d2;
	min-width: 48px;
	text-align: right;
}
.db-tooltip-content {
	padding: 14px;
	min-width: 220px;
}
.db-tooltip-title {
	font-weight: 600;
	font-size: 14px;
	margin-bottom: 8px;
	color: var(--primary);
}
.db-tooltip-detail {
	font-size: 12px;
	margin-bottom: 8px;
	line-height: 1.5;
}
.db-tooltip-section-title {
	font-weight: 600;
	font-size: 13px;
	margin-bottom: 4px;
	color: var(--primary);
	opacity: 0.85;
}
.db-tooltip-subtitle {
	font-size: 12px;
	font-weight: 600;
	color: #1976d2;
}
.db-top-tables {
	list-style: none;
	padding: 0;
	margin: 0;
}
.db-top-tables li {
	font-size: 12px;
	margin-bottom: 2px;
	display: flex;
	align-items: center;
}
.db-tooltip-warning {
	color: #d32f2f;
	font-size: 12px;
	display: flex;
	align-items: center;
	margin-bottom: 4px;
}
.db-tooltip-tip {
	color: #1976d2;
	font-size: 12px;
	display: flex;
	align-items: center;
}
.db-tooltip-explanation {
	color: #0288d1;
	font-size: 12px;
	display: flex;
	align-items: center;
}
/* Match ServerUsageGadget tooltip background and text color */
:deep(.v-tooltip .v-overlay__content),
:deep(.v-overlay__content) {
	background: #e3f2fd !important;
	color: #1a237e !important;
	box-shadow: 0 4px 16px rgba(25, 118, 210, 0.1) !important;
	border: 1px solid #90caf9 !important;
}

.db-tooltip-title,
.db-tooltip-tip,
.db-tooltip-explanation {
	color: #1a237e !important;
}

:deep([data-theme="dark"]) .v-tooltip .v-overlay__content,
:deep(.v-theme--dark) .v-tooltip .v-overlay__content,
:deep([data-theme="dark"]) .v-overlay__content,
:deep(.v-theme--dark) .v-overlay__content {
	background: #26344d !important;
	color: #fff !important;
	border: 1px solid #1976d2 !important;
}

:deep([data-theme="dark"]) .db-tooltip-title,
:deep(.v-theme--dark) .db-tooltip-title,
:deep([data-theme="dark"]) .db-tooltip-tip,
:deep(.v-theme--dark) .db-tooltip-tip,
:deep([data-theme="dark"]) .db-tooltip-explanation,
:deep(.v-theme--dark) .db-tooltip-explanation {
	color: #fff !important;
}
</style>
