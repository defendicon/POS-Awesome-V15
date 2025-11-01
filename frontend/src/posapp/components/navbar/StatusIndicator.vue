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
				{{ statusText }}
			</div>
			<div class="status-detail-inline">{{ syncInfoText }}</div>
		</div>
	</div>
</template>

<script>
// Avoid relying on `import.meta` so the file can be bundled with older
// JavaScript targets without warnings from esbuild. Debug logging can be
// toggled by changing this flag during development.
const DEBUG = false;

export default {
	name: "StatusIndicator",
	props: {
		networkOnline: Boolean,
		serverOnline: Boolean,
		serverConnecting: Boolean,
		isIpHost: Boolean,
		syncTotals: Object,
		cacheReady: Boolean,
	},
	computed: {
		/**
		 * Determines the color of the status icon based on current network and server connectivity.
		 * @returns {string} A Vuetify color string ('green', 'red').
		 */
		statusColor() {
			// Enhanced debugging with more context
			if (DEBUG) {
				console.log(
					"StatusIndicator - Network:",
					this.networkOnline,
					"Server:",
					this.serverOnline,
					"Connecting:",
					this.serverConnecting,
					"IP Host:",
					this.isIpHost,
					"Host:",
					window.location.hostname,
				);
			}

			// Show yellow/orange when connecting
			if (this.serverConnecting) {
				return "orange";
			}

			// For IP hosts (localhost, 127.0.0.1, IP addresses), prioritize network status
			if (this.isIpHost) {
				return this.networkOnline ? "green" : "red";
			}

			// For domain hosts, require both network and server connectivity
			if (this.networkOnline && this.serverOnline) {
				return "green";
			}

			// Network online but server offline
			if (this.networkOnline && !this.serverOnline) {
				return "orange";
			}

			// Network offline
			return "red";
		},
		/**
		 * Determines the Material Design Icon to display based on network and server status.
		 * @returns {string} A Material Design Icon class string.
		 */
		statusIcon() {
			if (DEBUG) {
				console.log(
					"StatusIndicator - Determining icon for network:",
					this.networkOnline,
					"server:",
					this.serverOnline,
					"connecting:",
					this.serverConnecting,
				);
			}

			// Show loading icon when connecting
			if (this.serverConnecting) {
				return "mdi-wifi-sync";
			}

			// For IP hosts, show based on network status
			if (this.isIpHost) {
				return this.networkOnline ? "mdi-wifi" : "mdi-wifi-off";
			}

			// Full connectivity
			if (this.networkOnline && this.serverOnline) {
				return "mdi-wifi";
			}

			// Network online but server issues
			if (this.networkOnline && !this.serverOnline) {
				return "mdi-wifi-strength-alert-outline";
			}

			// Network offline
			return "mdi-wifi-off";
		},
		/**
		 * Provides a descriptive text for the tooltip that appears when hovering over the status icon.
		 * This text is also used for the `title` attribute of the button.
		 * @returns {string} A localized status message.
		 */
		statusText() {
			const hostname = window.location.hostname;
			const hostType = this.isIpHost ? "Local/IP Host" : "Domain Host";

			if (this.serverConnecting) {
				return this.__(`Connecting to server... (${hostType}: ${hostname})`);
			}

			if (!this.networkOnline) {
				return this.__(`No Internet Connection (${hostType}: ${hostname})`);
			}

			if (this.isIpHost) {
				return this.__(`Connected to ${hostname}`);
			}

			if (this.serverOnline) {
				return this.__(`Connected to Server (${hostname})`);
			}

			return this.__(`Server Offline (${hostname})`);
		},
		/**
		 * Returns a short string summarizing the last offline invoice sync results.
		 */
		syncInfoText() {
			const { pending, synced, drafted } = this.syncTotals;

			if (!this.cacheReady) {
				return this.__("Loading cache...");
			}

			// Ensure we have valid numbers
			const pendingCount = pending || 0;
			const syncedCount = synced || 0;
			const draftedCount = drafted || 0;

			if (!this.networkOnline) {
				// In offline mode, show all available information
				if (pendingCount > 0 || syncedCount > 0 || draftedCount > 0) {
					return `Pending: ${pendingCount} | Synced: ${syncedCount} | Draft: ${draftedCount}`;
				} else {
					return "Offline Mode";
				}
			}

			// Online mode - show full status
			return `To Sync: ${pendingCount} | Synced: ${syncedCount} | Draft: ${draftedCount}`;
		},
	},
};
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

.status-detail-inline {
	font-size: 11px;
	color: #666;
	line-height: 1.2;
	margin-top: 2px;
}

/* Responsive Design */
@media (max-width: 768px) {
	.status-info-always-visible {
		display: none;
	}

	.status-section-enhanced {
		margin-right: 4px;
		/* Further reduced for mobile */
	}
}
</style>
