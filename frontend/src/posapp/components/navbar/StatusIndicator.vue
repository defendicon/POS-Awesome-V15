<template>
	<div class="status-section-enhanced mx-1">
		<v-tooltip location="bottom" max-width="320">
			<template #activator="{ props: tooltipProps }">
				<v-btn
					v-bind="tooltipProps"
					icon
					:title="combinedStatusText"
					:aria-label="combinedStatusText"
					:class="[
						'status-btn-enhanced',
						{
							'status-btn-enhanced--checking': props.serverConnecting,
						},
					]"
					:color="statusColor"
					aria-haspopup="dialog"
					@click="emit('toggle-panel')"
				>
					<span
						v-if="props.serverConnecting"
						data-test="status-checking-indicator"
						class="status-checking-indicator"
					/>
					<span
						v-if="props.bootstrapWarningActive"
						data-test="status-bootstrap-warning-indicator"
						class="status-bootstrap-warning-indicator"
					/>
					<v-icon :color="statusColor">{{ statusIcon }}</v-icon>
				</v-btn>
			</template>
			<div class="status-tooltip">
				<div class="status-tooltip__line status-tooltip__line--primary">
					{{ statusText }}
				</div>
				<div
					v-if="
						props.bootstrapWarningActive &&
						bootstrapWarningTooltipLines.length
					"
					class="status-tooltip__warning"
				>
					<div
						v-for="line in bootstrapWarningTooltipLines"
						:key="line"
						class="status-tooltip__line status-tooltip__line--warning"
					>
						{{ line }}
					</div>
				</div>
			</div>
		</v-tooltip>
		<div class="status-info-always-visible">
			<div
				class="status-title-inline"
				:class="{
					'status-connected': statusColor === 'green',
					'status-offline': statusColor === 'red',
				}"
			>
				{{ connectivityLabel }}
			</div>
			<div v-if="props.serverConnecting" class="status-subtitle-inline">
				{{ __("Rechecking connection") }}
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from "vue";

defineOptions({
	name: "StatusIndicator",
});

interface Props {
	networkOnline?: boolean;
	serverOnline?: boolean;
	serverConnecting?: boolean;
	isIpHost?: boolean;
	bootstrapWarningActive?: boolean;
	bootstrapWarningTooltip?: string;
}

const props = withDefaults(defineProps<Props>(), {
	networkOnline: false,
	serverOnline: false,
	serverConnecting: false,
	isIpHost: false,
	bootstrapWarningActive: false,
	bootstrapWarningTooltip: "",
});
const emit = defineEmits<{
	(e: "toggle-panel"): void;
}>();

// @ts-ignore
const __ = (window as any).__ || ((text: string) => text);
const DEBUG = false;

const statusColor = computed(() => {
	/**
	 * Determines the color of the status icon based on current network and server connectivity.
	 * @returns {string} A Vuetify color string ('green', 'red').
	 */
	if (DEBUG) {
		console.log(
			"StatusIndicator - Network:",
			props.networkOnline,
			"Server:",
			props.serverOnline,
			"Connecting:",
			props.serverConnecting,
			"IP Host:",
			props.isIpHost,
			"Host:",
			window.location.hostname,
		);
	}

	// Show yellow/orange when connecting
	if (props.serverConnecting) {
		return "orange";
	}

	// For IP hosts (localhost, 127.0.0.1, IP addresses), prioritize network status
	if (props.isIpHost) {
		return props.networkOnline ? "green" : "red";
	}

	// For domain hosts, require both network and server connectivity
	if (props.networkOnline && props.serverOnline) {
		return "green";
	}

	// Network online but server offline
	if (props.networkOnline && !props.serverOnline) {
		return "orange";
	}

	// Network offline
	return "red";
});

const statusIcon = computed(() => {
	/**
	 * Determines the Material Design Icon to display based on network and server status.
	 * @returns {string} A Material Design Icon class string.
	 */
	if (DEBUG) {
		console.log(
			"StatusIndicator - Determining icon for network:",
			props.networkOnline,
			"server:",
			props.serverOnline,
			"connecting:",
			props.serverConnecting,
		);
	}

	// Show loading icon when connecting
	if (props.serverConnecting) {
		return "mdi-wifi-sync";
	}

	// For IP hosts, show based on network status
	if (props.isIpHost) {
		return props.networkOnline ? "mdi-wifi" : "mdi-wifi-off";
	}

	// Full connectivity
	if (props.networkOnline && props.serverOnline) {
		return "mdi-wifi";
	}

	// Network online but server issues
	if (props.networkOnline && !props.serverOnline) {
		return "mdi-wifi-strength-alert-outline";
	}

	// Network offline
	return "mdi-wifi-off";
});

const statusText = computed(() => {
	/**
	 * Provides a descriptive text for the tooltip that appears when hovering over the status icon.
	 * This text is also used for the `title` attribute of the button.
	 * @returns {string} A localized status message.
	 */
	const hostname = window.location.hostname;
	const hostType = props.isIpHost ? "Local/IP Host" : "Domain Host";

	if (props.serverConnecting) {
		return __(`Connecting to server... (${hostType}: ${hostname})`);
	}

	if (!props.networkOnline) {
		return __(`No Internet Connection (${hostType}: ${hostname})`);
	}

	if (props.isIpHost) {
		return __(`Connected to ${hostname}`);
	}

	if (props.serverOnline) {
		return __(`Connected to Server (${hostname})`);
	}

	return __(`Server Offline (${hostname})`);
});

const bootstrapWarningTooltipLines = computed(() => {
	if (!props.bootstrapWarningActive || !props.bootstrapWarningTooltip) {
		return [];
	}

	return props.bootstrapWarningTooltip
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
});

const combinedStatusText = computed(() =>
	[statusText.value, ...bootstrapWarningTooltipLines.value].join(" "),
);

const connectivityLabel = computed(() => {
	/**
	 * Short, user-friendly connectivity label for the navbar.
	 * @returns {string}
	 */
	if (props.serverConnecting) {
		return __("Checking...");
	}

	if (!props.networkOnline) {
		return __("Offline");
	}

	if (props.networkOnline && props.serverOnline) {
		return __("Online");
	}

	// Network is available but server is not responding
	return __("Limited");
});
</script>

<style scoped>
/* Enhanced Status Section */
.status-section-enhanced {
	display: flex;
	align-items: center;
	gap: 8px;
	/* Reduced gap */
	margin-right: 8px;
	/* Reduced margin */
}

.status-btn-enhanced {
	background: var(--pos-hover-bg) !important;
	border: 1px solid var(--pos-border);
	transition: all 0.3s ease;
	padding: 4px;
	position: relative;
	/* Reduced padding */
}

.status-btn-enhanced:hover {
	background: var(--pos-focus-bg) !important;
	transform: scale(1.05);
}

.status-btn-enhanced--checking {
	box-shadow: 0 0 0 2px rgba(255, 152, 0, 0.18);
}

.status-checking-indicator {
	position: absolute;
	inset: 3px;
	border: 2px solid rgba(255, 152, 0, 0.35);
	border-top-color: rgba(255, 152, 0, 0.95);
	border-radius: 999px;
	animation: status-spin 0.9s linear infinite;
	pointer-events: none;
}

.status-bootstrap-warning-indicator {
	position: absolute;
	top: 4px;
	right: 4px;
	width: 9px;
	height: 9px;
	border-radius: 999px;
	background: #ff9800;
	box-shadow: 0 0 0 2px var(--pos-hover-bg);
	pointer-events: none;
}

.status-info-always-visible {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	min-width: 120px;
}

.status-tooltip {
	display: grid;
	gap: 4px;
	max-width: 280px;
}

.status-tooltip__warning {
	display: grid;
	gap: 4px;
	padding-top: 4px;
	border-top: 1px solid rgba(255, 152, 0, 0.24);
}

.status-tooltip__line {
	white-space: normal;
	overflow-wrap: anywhere;
	word-break: break-word;
}

.status-tooltip__line--primary {
	font-weight: 600;
}

.status-tooltip__line--warning {
	color: rgba(255, 152, 0, 0.98);
}

.status-title-inline {
	font-size: 12px;
	font-weight: 600;
	line-height: 1.2;
	transition: color 0.3s ease;
}

.status-title-inline.status-connected {
	color: #4caf50;
}

.status-title-inline.status-offline {
	color: #f44336;
}

.status-subtitle-inline {
	font-size: 11px;
	line-height: 1.15;
	color: rgba(255, 152, 0, 0.92);
	letter-spacing: 0.01em;
}

.status-section-enhanced .status-info-always-visible {
	min-width: unset;
}

@keyframes status-spin {
	from {
		transform: rotate(0deg);
	}
	to {
		transform: rotate(360deg);
	}
}
</style>
