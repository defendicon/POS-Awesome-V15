<template>
	<div class="status-section-enhanced mx-1">
		<v-btn icon :title="statusText" class="status-btn-enhanced" :color="statusColor">
			<v-icon :color="statusColor">{{ statusIcon }}</v-icon>
		</v-btn>
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
}

const props = withDefaults(defineProps<Props>(), {
	networkOnline: false,
	serverOnline: false,
	serverConnecting: false,
	isIpHost: false,
});

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

const connectivityLabel = computed(() => {
	/**
	 * Short, user-friendly connectivity label for the navbar.
	 * @returns {string}
	 */
	if (props.serverConnecting) {
		return __("Connecting");
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
	background: rgba(25, 118, 210, 0.1) !important;
	border: 1px solid rgba(25, 118, 210, 0.3);
	transition: all 0.3s ease;
	padding: 4px;
	/* Reduced padding */
}

.status-btn-enhanced:hover {
	background: rgba(25, 118, 210, 0.2) !important;
	transform: scale(1.05);
}

.status-info-always-visible {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	min-width: 120px;
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

.status-section-enhanced .status-info-always-visible {
	min-width: unset;
}
</style>
