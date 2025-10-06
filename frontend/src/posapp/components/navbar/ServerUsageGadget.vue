<template>
	<div class="cpu-gadget-section mx-1">
		<v-tooltip location="bottom">
			<template #activator="{ props }">
				<div v-bind="props" class="cpu-meter-container">
					<v-icon size="22" color="primary">mdi-server</v-icon>
					<span class="cpu-current-lag">{{ cpuLag.toFixed(1) }} ms</span>
				</div>
			</template>
			<div class="cpu-tooltip-content">
				<div class="cpu-tooltip-title">
					<v-icon size="16" color="primary" class="mr-1">mdi-server</v-icon>
					{{ __("Server Health") }}
				</div>
				<v-divider class="my-2" />
				<div class="cpu-tooltip-section-title mb-1">{{ __("Server Metrics") }}</div>
				<div class="cpu-tooltip-peak mb-1">
					<v-icon size="14" color="success" class="mr-1">mdi-arrow-up-bold</v-icon>
					{{ __("Peak:") }}
					<b>{{ peakLag.toFixed(1) }} ms</b>
					({{ peakPercent }}%)
				</div>
				<div class="cpu-tooltip-sparkline mb-2">
					<svg :width="180" :height="40" class="cpu-sparkline-large">
						<defs>
							<linearGradient id="cpuAreaGradient" x1="0" y1="0" x2="0" y2="1">
								<stop offset="0%" stop-color="#4caf50" stop-opacity="0.35" />
								<stop offset="100%" stop-color="#4caf50" stop-opacity="0" />
							</linearGradient>
						</defs>
						<polyline
							:points="sparklinePointsLarge"
							fill="none"
							stroke="#4caf50"
							stroke-width="2"
						/>
						<polygon :points="areaPointsLarge" fill="url(#cpuAreaGradient)" stroke="none" />
					</svg>
				</div>
				<div class="cpu-tooltip-detail">
					<v-icon size="14" color="primary" class="mr-1">mdi-chip</v-icon>
					{{ __("Current Event Loop Lag:") }} <b>{{ cpuLag.toFixed(1) }}</b> ms
				</div>
				<div v-if="cpuLag >= 80" class="cpu-tooltip-warning">
					<v-icon size="14" color="error" class="mr-1">mdi-alert</v-icon>
					{{ __("Warning: High lag may indicate heavy processing or browser slowness.") }}
				</div>
				<div v-if="serverLoading" class="cpu-tooltip-detail">
					{{ __("Loading server CPU/memory usage...") }}
				</div>
				<div v-else-if="serverError" class="cpu-tooltip-warning">{{ serverError }}</div>
				<div v-else>
					<div class="cpu-tooltip-detail">
						<v-icon size="14" color="primary" class="mr-1">mdi-chip</v-icon>
						{{ __("Server CPU Usage:") }}
						<b>{{ serverCpu !== null ? serverCpu.toFixed(1) + "%" : "N/A" }}</b>
						<span class="ml-2"
							>{{ __("Peak Server:") }} <b>{{ serverPeak.toFixed(1) }}%</b></span
						>
					</div>
					<div class="cpu-tooltip-detail">
						<v-icon size="14" color="primary" class="mr-1">mdi-memory</v-icon>
						{{ __("Server Memory Usage:") }}
						<b>{{ serverMemory !== null ? serverMemory.toFixed(1) + "%" : "N/A" }}</b>
						<span class="ml-2"
							>{{ __("Peak Memory:") }} <b>{{ serverMemoryPeak.toFixed(1) }}%</b></span
						>
					</div>
					<div class="cpu-tooltip-bar">
						<div class="cpu-bar-bg">
							<div
								class="cpu-bar-fill"
								:style="{
									width: (serverMemory || 0) + '%',
									background: 'linear-gradient(90deg,#1976d2 0%,#42a5f5 100%)',
								}"
							></div>
						</div>
						<span class="cpu-bar-label">{{
							serverMemory !== null ? serverMemory.toFixed(1) + "%" : "N/A"
						}}</span>
					</div>
					<div class="cpu-tooltip-detail">
						<v-icon size="14" color="primary" class="mr-1">mdi-database</v-icon>
						{{ __("Total:") }} <b>{{ formatBytes(memoryTotal) }}</b>
						<span class="ml-2"
							>{{ __("Used:") }} <b>{{ formatBytes(memoryUsed) }}</b></span
						>
						<span class="ml-2"
							>{{ __("Available:") }} <b>{{ formatBytes(memoryAvailable) }}</b></span
						>
					</div>
					<div class="cpu-tooltip-detail">
						<v-icon size="14" color="primary" class="mr-1">mdi-timer-outline</v-icon>
						{{ __("Server Uptime:") }} <b>{{ formatUptime(serverUptime) }}</b>
					</div>
				</div>
				<v-divider class="my-2" />
				<div class="cpu-tooltip-section-title mb-1">{{ __("Client Metrics") }}</div>
				<div class="cpu-tooltip-detail">
					<v-icon size="14" color="primary" class="mr-1">mdi-monitor</v-icon>
					{{ __("Client CPU Lag:") }} <b>{{ cpuLag.toFixed(1) }}</b> ms
				</div>
				<div class="cpu-tooltip-detail">
					<v-icon size="14" color="primary" class="mr-1">mdi-memory</v-icon>
					{{ __("Client Memory Usage:") }} <b>{{ formatBytes(memoryUsage) }}</b>
				</div>
				<div class="cpu-tooltip-detail">
					<v-icon size="14" color="primary" class="mr-1">mdi-chip</v-icon>
					{{ __("CPU Cores:") }} <b>{{ device.cores }}</b>
					<span v-if="device.gbMemory" class="ml-2"
						>{{ __("Device Memory:") }} <b>{{ device.gbMemory }} GB</b></span
					>
				</div>
				<v-divider class="my-2" />
				<div class="cpu-tooltip-tip mt-2">
					<v-icon size="14" color="primary" class="mr-1">mdi-lightbulb-on-outline</v-icon>
					{{ __("Tip: Close unused tabs or apps to reduce lag.") }}
				</div>
				<div class="cpu-tooltip-explanation mt-2">
					<v-icon size="14" color="info" class="mr-1">mdi-chip</v-icon>
					{{ __("Event-loop lag measures how busy your browser is. Lower is better.") }}
				</div>
				<div class="cpu-tooltip-action mt-2">
					<v-icon size="14" class="mr-1">mdi-refresh</v-icon>
					{{ __("Updates automatically") }}
				</div>
			</div>
		</v-tooltip>
	</div>
</template>

<script setup lang="ts">
import { computed, inject } from "vue";
import { useClientLoad } from "../../composables/useClientLoad";
import { useServerStats } from "../../composables/useServerStats";

const { cpuLag, history, memoryUsage, device } = useClientLoad(1000, 60);
const __ = inject("__", (txt: string) => txt);

// Use the composable for server CPU and memory
const {
	cpu: serverCpu,
	memory: serverMemory,
	memoryTotal,
	memoryUsed,
	memoryAvailable,
	history: serverHistory,
	loading: serverLoading,
	error: serverError,
} = useServerStats(10000, 60);

const serverPeak = computed(() => Math.max(...serverHistory.value.map((h) => h.cpu ?? 0), 0));
const serverMemoryPeak = computed(() => Math.max(...serverHistory.value.map((h) => h.memory ?? 0), 0));

// Uptime formatting
import { ref, watch } from "vue";
const serverUptime = ref<number | null>(null);
watch(
	serverHistory,
	(hist) => {
		if (hist.length && hist[hist.length - 1].uptime != null) {
			serverUptime.value = hist[hist.length - 1].uptime;
		}
	},
	{ immediate: true, deep: true },
);

function formatUptime(seconds: number | null) {
	if (seconds == null) return "N/A";
	const d = Math.floor(seconds / (3600 * 24));
	const h = Math.floor((seconds % (3600 * 24)) / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	let str = "";
	if (d > 0) str += `${d}d `;
	if (h > 0 || d > 0) str += `${h}h `;
	str += `${m}m`;
	return str.trim();
}

function formatBytes(bytes: number | null) {
	if (bytes == null) return "N/A";
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function getSparklinePoints(arr: number[], w: number, h: number) {
	if (!arr.length) return "";
	const max = Math.max(...arr, 100);
	const min = 0;
	const step = arr.length > 1 ? w / (arr.length - 1) : w;
	return arr.map((v, i) => `${i * step},${h - ((v - min) / (max - min || 1)) * h}`).join(" ");
}

function getAreaPoints(arr: number[], w: number, h: number) {
	if (!arr.length) return "";
	const max = Math.max(...arr, 100);
	const min = 0;
	const step = arr.length > 1 ? w / (arr.length - 1) : w;
	let points = arr.map((v, i) => `${i * step},${h - ((v - min) / (max - min || 1)) * h}`).join(" ");
	// Close the area polygon
	points += ` ${w},${h} 0,${h}`;
	return points;
}

const sparklinePointsLarge = computed(() => getSparklinePoints(history.value, 180, 40));
const areaPointsLarge = computed(() => getAreaPoints(history.value, 180, 40));

// Peak lag in ms and as a percentage (100ms = 100%)
const peakLag = computed(() => Math.max(...history.value, 0));
const peakPercent = computed(() => Math.round(Math.min(peakLag.value, 100)));
</script>

<style scoped>
/* Force LTR formatting for server usage gadget */
.cpu-gadget-section,
.cpu-gadget-section * {
	direction: ltr !important;
	text-align: left !important;
}

.cpu-gadget-section {
	display: flex;
	align-items: center;
	margin: 0 8px;
	direction: ltr;
	text-align: left;
}

.cpu-meter-container {
	cursor: pointer;
	position: relative;
	display: flex;
	align-items: center;
	justify-content: center;
	transition: all 0.3s ease;
}

.cpu-meter-container:hover {
	transform: scale(1.1);
}

.cpu-meter {
	transition: all 0.3s ease;
}

.cpu-tooltip-content {
	@apply p-3 min-w-[180px];
	direction: ltr;
	text-align: left;
}

.cpu-tooltip-title {
	font-weight: 600;
	font-size: 14px;
	margin-bottom: 8px;
	color: var(--primary);
}

.cpu-tooltip-detail {
	font-size: 12px;
	margin-bottom: 8px;
	line-height: 1.5;
	direction: ltr;
	text-align: left;
}

.cpu-tooltip-action {
	font-size: 11px;
	opacity: 0.7;
	display: flex;
	align-items: center;
	margin-top: 8px;
	color: var(--primary);
	direction: ltr;
	text-align: left;
}

.cpu-tooltip-bar {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-bottom: 4px;
}
.cpu-bar-bg {
	width: 80px;
	height: 8px;
	background: #e3f2fd;
	border-radius: 4px;
	overflow: hidden;
	margin-right: 6px;
}
.cpu-bar-fill {
	height: 100%;
	background: linear-gradient(90deg, #7b1fa2 0%, #42a5f5 100%);
	border-radius: 4px;
	transition: width 0.3s;
}
.cpu-bar-label {
	font-size: 11px;
	color: #7b1fa2;
	font-weight: 600;
}
.cpu-tooltip-warning {
	color: #d32f2f;
	font-size: 12px;
	display: flex;
	align-items: center;
	margin-bottom: 4px;
	direction: ltr;
	text-align: left;
}
.cpu-tooltip-tip {
	color: #1976d2;
	font-size: 12px;
	display: flex;
	align-items: center;
	direction: ltr;
	text-align: left;
}
.cpu-tooltip-explanation {
	color: #0288d1;
	font-size: 12px;
	display: flex;
	align-items: center;
	direction: ltr;
	text-align: left;
}

.cpu-sparkline-wrapper {
	display: flex;
	align-items: center;
	gap: 6px;
}
.cpu-sparkline {
	display: block;
	background: none;
}
.cpu-current-lag {
	font-size: 13px;
	font-weight: 600;
	color: #4caf50;
	min-width: 48px;
	text-align: right;
	direction: ltr;
}
.cpu-tooltip-sparkline {
	width: 180px;
	height: 40px;
	margin-bottom: 8px;
}
.cpu-sparkline-large {
	display: block;
	background: none;
}

.cpu-tooltip-legend {
	font-size: 12px;
	margin-bottom: 4px;
	display: flex;
	align-items: center;
	gap: 12px;
}
.legend-dot {
	display: inline-block;
	width: 10px;
	height: 10px;
	border-radius: 50%;
	margin-right: 4px;
}
.legend-dot.client {
	background: #4caf50;
}
.legend-dot.server {
	background: #1976d2;
}

/* Fix tooltip background and text color in light mode */
:deep(.v-tooltip .v-overlay__content),
:deep(.v-overlay__content) {
	background: #e3f2fd !important;
	color: #1a237e !important;
	box-shadow: 0 4px 16px rgba(25, 118, 210, 0.1) !important;
	border: 1px solid #90caf9 !important;
	direction: ltr !important;
	text-align: left !important;
}

.cpu-tooltip-title,
.cpu-tooltip-action {
	color: #1a237e !important;
}

:deep([data-theme="dark"]) .v-tooltip .v-overlay__content,
:deep(.v-theme--dark) .v-tooltip .v-overlay__content,
:deep([data-theme="dark"]) .v-overlay__content,
:deep(.v-theme--dark) .v-overlay__content {
	background: #26344d !important;
	color: #fff !important;
	border: 1px solid #1976d2 !important;
	direction: ltr !important;
	text-align: left !important;
}

:deep([data-theme="dark"]) .cpu-tooltip-title,
:deep(.v-theme--dark) .cpu-tooltip-title,
:deep([data-theme="dark"]) .cpu-tooltip-action,
:deep(.v-theme--dark) .cpu-tooltip-action {
	color: #fff !important;
}
.cpu-tooltip-section-title {
	font-weight: 600;
	font-size: 13px;
	margin-bottom: 4px;
	color: var(--primary);
	opacity: 0.85;
	direction: ltr;
	text-align: left;
}
</style>
