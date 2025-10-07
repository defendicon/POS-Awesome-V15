<template>
	<v-dialog v-model="dialogOpen" max-width="650" persistent>
		<v-card class="about-dialog-card-improved">
			<v-card-title class="about-header-improved pa-5">
				<div class="header-content-improved">
					<div class="header-icon-wrapper-improved">
						<v-icon size="22" class="header-icon">mdi-information-outline</v-icon>
					</div>
					<div class="header-text-improved">
						<h3 class="header-title-improved">{{ __("About") }}</h3>
						<p class="header-subtitle-improved">{{ __("System Information") }}</p>
					</div>
					<div class="header-stats-improved" v-if="!loadingAppInfo && !appInfoError">
						<v-chip size="small" color="primary" variant="tonal" class="status-chip-improved">
							<v-icon start size="14">mdi-application-outline</v-icon>
							{{ appInfo.length }} {{ __("Apps") }}
						</v-chip>
					</div>
				</div>
				<v-btn
					icon="mdi-close"
					variant="text"
					size="default"
					@click="close"
					class="close-btn-improved"
				></v-btn>
			</v-card-title>

			<v-card-text class="pa-0 white-background">
				<div class="content-container-improved">
					<!-- Loading State -->
					<div v-if="loadingAppInfo" class="empty-state-improved text-center">
						<v-progress-circular indeterminate color="primary" size="50"></v-progress-circular>
						<p class="text-body-2 mt-3 mb-0">{{ __("Loading...") }}</p>
					</div>

					<!-- Error State -->
					<div v-else-if="appInfoError" class="empty-state-improved text-center">
						<v-icon size="50" color="error" class="mb-3">mdi-alert-circle-outline</v-icon>
						<p class="text-body-2 mb-3">{{ __("Error Loading Data") }}</p>
						<v-btn color="primary" variant="outlined" size="default" @click="loadAppInfo">
							<v-icon start size="18">mdi-refresh</v-icon>
							{{ __("Retry") }}
						</v-btn>
					</div>

					<!-- Applications List - Improved -->
					<div v-else class="apps-list-improved">
						<div class="apps-header-improved">
							<h4 class="text-h6 mb-2">{{ __("Installed Applications") }}</h4>
						</div>

						<div class="apps-grid-improved">
							<div v-for="app in appInfo" :key="app.app_name" class="app-item-improved">
								<div class="app-icon-improved">
									<v-icon size="18" color="white">mdi-application-outline</v-icon>
								</div>
								<div class="app-details-improved">
									<div class="app-name-improved">{{ app.app_name }}</div>
									<div class="app-version-improved">v{{ app.installed_version }}</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</v-card-text>

			<v-card-actions class="dialog-actions-improved pa-4">
				<div class="footer-info-improved">
					<span class="footer-text-improved">
						<v-icon start size="16" color="error">mdi-heart</v-icon>
						{{ __("Built with Frappe") }}
					</span>
				</div>
				<v-spacer></v-spacer>
				<v-btn color="primary" @click="close" class="close-btn-action-improved">
					{{ __("Close") }}
				</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script>
export default {
	name: "AboutDialog",
	props: {
		modelValue: Boolean,
	},
	data() {
		return {
			dialogOpen: this.modelValue,
			loadingAppInfo: false,
			appInfoError: false,
			appInfo: [],
		};
	},
	watch: {
		modelValue(val) {
			this.dialogOpen = val;
			if (val) {
				this.loadAppInfo();
			}
		},
		dialogOpen(val) {
			this.$emit("update:modelValue", val);
		},
	},
	methods: {
		close() {
			this.dialogOpen = false;
		},
		loadAppInfo() {
			this.loadingAppInfo = true;
			this.appInfoError = false;

			frappe.call({
				method: "posawesome.posawesome.api.utilities.get_app_info",
				callback: (r) => {
					this.loadingAppInfo = false;
					if (Array.isArray(r.message.apps)) {
						this.appInfo = r.message.apps;
					} else {
						this.appInfoError = true;
					}
				},
				error: () => {
					this.loadingAppInfo = false;
					this.appInfoError = true;
				},
			});
		},
	},
};
</script>

<style scoped>
/* About Dialog - Improved Compact Styling */
.about-dialog-card-improved {
	border-radius: 16px !important;
	overflow: hidden;
	background: white;
	box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1) !important;
	max-height: 90vh;
}

/* Improved Header with Better Spacing */
.about-header-improved {
	background: white;
	color: #1a1a1a;
	border-bottom: 1px solid #f0f0f0;
	position: relative;
	min-height: auto !important;
}

.about-header-improved::before {
	content: "";
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	height: 3px;
	background: linear-gradient(90deg, #1976d2 0%, #42a5f5 100%);
}

.header-content-improved {
	display: flex;
	align-items: center;
	gap: 16px;
	padding-right: 60px;
	/* Space for close button */
}

.header-icon-wrapper-improved {
	background: linear-gradient(135deg, #1976d2 0%, #42a5f5 100%);
	border-radius: 14px;
	padding: 10px;
	display: flex;
	align-items: center;
	justify-content: center;
	box-shadow: 0 2px 8px rgba(25, 118, 210, 0.3);
}

.header-icon {
	color: white;
}

.header-text-improved {
	flex: 1;
}

.header-title-improved {
	margin: 0 0 4px 0;
	font-weight: 600;
	color: #1a1a1a;
	font-size: 1.25rem;
	line-height: 1.2;
}

.header-subtitle-improved {
	margin: 0;
	font-size: 14px;
	color: #666;
	font-weight: 400;
	line-height: 1.2;
}

.header-stats-improved {
	display: flex;
	gap: 8px;
}

.status-chip-improved {
	font-weight: 600;
	border-radius: 10px;
	height: 28px !important;
}

.close-btn-improved {
	position: absolute;
	top: 12px;
	right: 12px;
	color: #666 !important;
}

.white-background {
	background: white;
}

/* Improved Content */
.content-container-improved {
	padding: 20px;
	max-height: 55vh;
	overflow-y: auto;
}

.empty-state-improved {
	padding: 30px;
}

/* Apps List - Improved Grid Layout */
.apps-list-improved {
	width: 100%;
}

.apps-header-improved {
	margin-bottom: 16px;
	padding-bottom: 12px;
	border-bottom: 1px solid #f0f0f0;
}

.apps-grid-improved {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
	gap: 12px;
	max-height: 350px;
	overflow-y: auto;
}

.app-item-improved {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 12px 16px;
	background: #f8f9fa;
	border-radius: 10px;
	border: 1px solid #e9ecef;
	transition: all 0.2s ease;
}

.app-item-improved:hover {
	background: #e3f2fd;
	border-color: #1976d2;
	transform: translateY(-1px);
	box-shadow: 0 2px 8px rgba(25, 118, 210, 0.15);
}

.app-icon-improved {
	background: linear-gradient(135deg, #1976d2 0%, #42a5f5 100%);
	border-radius: 8px;
	padding: 8px;
	display: flex;
	align-items: center;
	justify-content: center;
	min-width: 34px;
	height: 34px;
}

.app-details-improved {
	flex: 1;
	min-width: 0;
}

.app-name-improved {
	font-weight: 500;
	font-size: 14px;
	color: #1a1a1a;
	line-height: 1.3;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.app-version-improved {
	font-size: 12px;
	color: #666;
	font-weight: 400;
	line-height: 1.3;
	margin-top: 2px;
}

/* Improved Footer */
.dialog-actions-improved {
	background: #f8f9fa;
	border-top: 1px solid #f0f0f0;
	min-height: auto !important;
}

.footer-info-improved {
	display: flex;
	align-items: center;
}

.footer-text-improved {
	font-size: 13px;
	color: #666;
	display: flex;
	align-items: center;
	gap: 6px;
}

.close-btn-action-improved {
	border-radius: 10px;
	font-weight: 600;
	text-transform: none;
	height: 36px;
	padding: 0 20px;
}

/* Responsive Design */
@media (max-width: 700px) {
	.about-dialog-card-improved {
		margin: 16px;
		max-height: 85vh;
	}

	.apps-grid-improved {
		grid-template-columns: 1fr;
		max-height: 300px;
	}

	.header-content-improved {
		gap: 12px;
		padding-right: 50px;
	}

	.content-container-improved {
		padding: 16px;
		max-height: 50vh;
	}
}

/* Scrollbar Styling */
.content-container-improved::-webkit-scrollbar,
.apps-grid-improved::-webkit-scrollbar {
	width: 6px;
}

.content-container-improved::-webkit-scrollbar-track,
.apps-grid-improved::-webkit-scrollbar-track {
	background: #f1f1f1;
	border-radius: 3px;
}

.content-container-improved::-webkit-scrollbar-thumb,
.apps-grid-improved::-webkit-scrollbar-thumb {
	background: #c1c1c1;
	border-radius: 3px;
}

.content-container-improved::-webkit-scrollbar-thumb:hover,
.apps-grid-improved::-webkit-scrollbar-thumb:hover {
	background: #a8a8a8;
}
</style>
