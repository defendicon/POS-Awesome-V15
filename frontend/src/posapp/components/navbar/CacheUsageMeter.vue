<template>
	<div class="cache-usage-section mx-1">
		<v-tooltip location="bottom">
			<template v-slot:activator="{ props }">
				<div v-bind="props" class="cache-meter-container" @click="refreshCacheUsage">
					<v-progress-circular
						:model-value="cacheUsage"
						:color="cacheUsageColor"
						:size="32"
						:width="3"
						class="cache-meter"
					>
						<v-icon size="16" color="info">mdi-database-clock</v-icon>
					</v-progress-circular>
				</div>
			</template>
			<div class="cache-tooltip-content">
				<div class="cache-tooltip-title">
					<v-icon size="14" color="info" class="mr-1">mdi-database-clock</v-icon>
					{{ __("Cache Usage") }}
				</div>
				<v-divider class="my-2" />
				<div class="cache-tooltip-section-title mb-1">{{ __("Usage") }}</div>
				<div class="cache-tooltip-bar mb-2">
					<div class="cache-bar-bg">
						<div
							class="cache-bar-fill"
							:style="{ width: cacheUsage + '%', background: cacheBarGradient }"
						>
							<span class="cache-bar-label-inside">{{ cacheUsage }}%</span>
						</div>
						<span class="cache-bar-max">100%</span>
					</div>
				</div>
				<div v-if="!cacheUsageLoading">
					<div class="cache-tooltip-section-title mb-1">{{ __("Breakdown") }}</div>
					<div class="cache-tooltip-detail">
						<v-icon size="14" color="info" class="mr-1">mdi-database-clock</v-icon
						>{{ __("Total Size") }}: <b>{{ formatBytes(cacheUsageDetails.total) }}</b>
					</div>
					<div class="cache-tooltip-detail">
						<v-icon size="14" color="info" class="mr-1">mdi-database</v-icon
						>{{ __("IndexedDB") }}: <b>{{ formatBytes(cacheUsageDetails.indexedDB) }}</b>
					</div>
					<div class="cache-tooltip-detail">
						<v-icon size="14" color="info" class="mr-1">mdi-folder</v-icon
						>{{ __("localStorage") }}: <b>{{ formatBytes(cacheUsageDetails.localStorage) }}</b>
					</div>
				</div>
				<div class="cache-tooltip-detail" v-else>
					{{ __("Calculating...") }}
				</div>
				<v-divider class="my-2" />
				<div v-if="cacheUsage >= 80" class="cache-tooltip-warning">
					<v-icon size="14" color="error" class="mr-1">mdi-alert</v-icon>
					{{ __("Warning: High cache usage may affect performance.") }}
				</div>
				<div class="cache-tooltip-tip mt-2">
					<v-icon size="14" color="primary" class="mr-1">mdi-lightbulb-on-outline</v-icon>
					{{ __("Tip: Clear cache regularly to free up space and keep the app fast.") }}
				</div>
				<div class="cache-tooltip-explanation mt-2">
					<v-icon size="14" color="info" class="mr-1">mdi-database-clock</v-icon>
					{{ __("The app stores data locally for offline use. This is called cache.") }}
				</div>
				<div class="cache-tooltip-action mt-2">
					<v-icon size="14" class="mr-1">mdi-refresh</v-icon>
					{{ __("Click to refresh") }}
				</div>
			</div>
		</v-tooltip>
	</div>
</template>

<script>
export default {
	name: "CacheUsageMeter",
	props: {
		cacheUsage: {
			type: Number,
			default: 0,
		},
		cacheUsageLoading: {
			type: Boolean,
			default: false,
		},
		cacheUsageDetails: {
			type: Object,
			default: () => ({
				total: 0,
				indexedDB: 0,
				localStorage: 0,
			}),
		},
	},
	computed: {
		cacheUsageColor() {
			// Return color based on cache usage percentage
			if (this.cacheUsage < 50) return "success";
			if (this.cacheUsage < 80) return "warning";
			return "error";
		},
		cacheBarGradient() {
			if (this.cacheUsage < 50) {
				return "linear-gradient(90deg, #43e97b 0%, #38f9d7 100%)";
			} else if (this.cacheUsage < 80) {
				return "linear-gradient(90deg, #f7971e 0%, #ffd200 100%)";
			} else {
				return "linear-gradient(90deg, #f953c6 0%, #b91d73 100%)";
			}
		},
	},
	methods: {
		refreshCacheUsage() {
			this.$emit("refresh");
		},
		formatBytes(bytes) {
			if (bytes === 0) return "0 Bytes";
			const k = 1024;
			const sizes = ["Bytes", "KB", "MB", "GB"];
			const i = Math.floor(Math.log(bytes) / Math.log(k));
			return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
		},
	},
};
</script>

<style scoped>
/* Cache Usage Meter Styling */
.cache-usage-section {
	display: flex;
	align-items: center;
	margin: 0 8px;
}

.cache-meter-container {
	cursor: pointer;
	position: relative;
	display: flex;
	align-items: center;
	justify-content: center;
	transition: all 0.3s ease;
}

.cache-meter-container:hover {
	transform: scale(1.1);
}

.cache-meter {
	transition: all 0.3s ease;
}

.cache-tooltip-content {
	padding: 12px;
	min-width: 200px;
}

.cache-tooltip-title {
	font-weight: 600;
	font-size: 14px;
	margin-bottom: 8px;
	color: var(--primary);
}

.cache-tooltip-detail {
	font-size: 12px;
	margin-bottom: 8px;
	line-height: 1.5;
}

.cache-tooltip-action {
	font-size: 11px;
	opacity: 0.7;
	display: flex;
	align-items: center;
	margin-top: 8px;
	color: var(--primary);
}
.cache-tooltip-bar {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-bottom: 4px;
}
.cache-bar-bg {
	width: 80px;
	height: 8px;
	background: #e3f2fd;
	border-radius: 4px;
	overflow: hidden;
	margin-right: 6px;
}
.cache-bar-fill {
	height: 100%;
	background: linear-gradient(90deg, #1976d2 0%, #42a5f5 100%);
	border-radius: 4px;
	transition: width 0.3s;
}
.cache-bar-label {
	font-size: 11px;
	color: #1976d2;
	font-weight: 600;
}
.cache-tooltip-warning {
	color: #d32f2f;
	font-size: 12px;
	display: flex;
	align-items: center;
	margin-bottom: 4px;
}
.cache-tooltip-tip {
	color: #1976d2;
	font-size: 12px;
	display: flex;
	align-items: center;
}
.cache-tooltip-explanation {
	color: #0288d1;
	font-size: 12px;
	display: flex;
	align-items: center;
}
.cache-tooltip-section-title {
	font-weight: 600;
	font-size: 13px;
	margin-bottom: 4px;
	color: var(--primary);
	opacity: 0.85;
}

/* Fix tooltip background and text color in light mode */
:deep(.v-tooltip .v-overlay__content),
:deep(.v-overlay__content) {
	background: #e3f2fd !important;
	color: #1a237e !important;
	box-shadow: 0 4px 16px rgba(25, 118, 210, 0.1) !important;
	border: 1px solid #90caf9 !important;
}

.cache-tooltip-title,
.cache-tooltip-action {
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

:deep([data-theme="dark"]) .cache-tooltip-title,
:deep(.v-theme--dark) .cache-tooltip-title,
:deep([data-theme="dark"]) .cache-tooltip-action,
:deep(.v-theme--dark) .cache-tooltip-action {
	color: #fff !important;
}
</style>
