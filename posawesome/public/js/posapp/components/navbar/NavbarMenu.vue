<template>
	<v-menu :min-width="240" :close-on-content-click="true" location="bottom end" :offset="[0, 4]">
		<template #activator="{ props }">
			<v-btn v-bind="props" color="primary" variant="elevated" class="menu-btn-compact">
				{{ __("Menu") }}
				<v-icon end size="16" class="ml-1">mdi-menu-down</v-icon>
			</v-btn>
		</template>
		<v-card class="menu-card-compact" elevation="12">
			<div class="menu-header-compact">
				<v-icon color="primary" size="20">mdi-menu</v-icon>
				<span class="menu-header-text-compact">{{ __("Actions") }}</span>
			</div>
			<v-list density="compact" class="menu-list-compact">
				<v-list-item
					v-if="!posProfile.posa_hide_closing_shift"
					@click="$emit('close-shift')"
					class="menu-item-compact primary-action"
				>
					<template v-slot:prepend>
						<div class="menu-icon-wrapper-compact primary-icon">
							<v-icon color="white" size="16">mdi-content-save-move-outline</v-icon>
						</div>
					</template>
					<div class="menu-content-compact">
						<v-list-item-title class="menu-item-title-compact">{{
							__("Close Shift")
						}}</v-list-item-title>
						<v-list-item-subtitle class="menu-item-subtitle-compact">{{
							__("End current session")
						}}</v-list-item-subtitle>
					</div>
				</v-list-item>

				<v-list-item
					v-if="posProfile.posa_allow_print_last_invoice"
					@click="$emit('print-last-invoice')"
					:disabled="!lastInvoiceId"
					class="menu-item-compact secondary-action"
				>
					<template v-slot:prepend>
						<div class="menu-icon-wrapper-compact secondary-icon">
							<v-icon color="white" size="16">mdi-printer</v-icon>
						</div>
					</template>
					<div class="menu-content-compact">
						<v-list-item-title class="menu-item-title-compact">{{
							__("Print Last Invoice")
						}}</v-list-item-title>
						<v-list-item-subtitle class="menu-item-subtitle-compact">{{
							__("Reprint previous transaction")
						}}</v-list-item-subtitle>
					</div>
				</v-list-item>

				<v-list-item @click="$emit('sync-invoices')" class="menu-item-compact info-action">
					<template v-slot:prepend>
						<div class="menu-icon-wrapper-compact info-icon">
							<v-icon color="white" size="16">mdi-sync</v-icon>
						</div>
					</template>
					<div class="menu-content-compact">
						<v-list-item-title class="menu-item-title-compact">{{
							__("Sync Offline Invoices")
						}}</v-list-item-title>
						<v-list-item-subtitle class="menu-item-subtitle-compact">{{
							__("Upload pending transactions")
						}}</v-list-item-subtitle>
					</div>
				</v-list-item>

				<v-list-item @click="$emit('toggle-offline')" class="menu-item-compact warning-action">
					<template v-slot:prepend>
						<div class="menu-icon-wrapper-compact warning-icon">
							<v-icon color="white" size="16">mdi-wifi-off</v-icon>
						</div>
					</template>
					<div class="menu-content-compact">
						<v-list-item-title class="menu-item-title-compact">{{
							manualOffline ? __("Go Online") : __("Go Offline")
						}}</v-list-item-title>
						<v-list-item-subtitle class="menu-item-subtitle-compact">
							{{
								manualOffline
									? __("Disable offline mode")
									: __("Work without server connection")
							}}
						</v-list-item-subtitle>
					</div>
				</v-list-item>

				<v-list-item
					@click="$emit('clear-cache')"
					:disabled="manualOffline || !networkOnline || !serverOnline"
					class="menu-item-compact neutral-action"
				>
					<template v-slot:prepend>
						<div class="menu-icon-wrapper-compact neutral-icon">
							<v-icon color="white" size="16">mdi-delete-sweep-outline</v-icon>
						</div>
					</template>
					<div class="menu-content-compact">
						<v-list-item-title class="menu-item-title-compact">{{
							__("Clear Cache")
						}}</v-list-item-title>
						<v-list-item-subtitle class="menu-item-subtitle-compact">{{
							__("Remove local data and refresh")
						}}</v-list-item-subtitle>
					</div>
				</v-list-item>

				<v-divider class="menu-section-divider-compact"></v-divider>

				<v-list-item @click="$emit('show-about')" class="menu-item-compact neutral-action">
					<template v-slot:prepend>
						<div class="menu-icon-wrapper-compact neutral-icon">
							<v-icon color="white" size="16">mdi-information-outline</v-icon>
						</div>
					</template>
					<div class="menu-content-compact">
						<v-list-item-title class="menu-item-title-compact">{{
							__("About")
						}}</v-list-item-title>
						<v-list-item-subtitle class="menu-item-subtitle-compact">{{
							__("App information")
						}}</v-list-item-subtitle>
					</div>
				</v-list-item>

				<!-- Theme toggle menu item -->
				<v-list-item @click="$emit('toggle-theme')" class="menu-item-compact info-action">
					<template v-slot:prepend>
						<div class="menu-icon-wrapper-compact info-icon">
							<v-icon color="white" size="16">{{
								isDark ? "mdi-white-balance-sunny" : "mdi-moon-waning-crescent"
							}}</v-icon>
						</div>
					</template>
					<div class="menu-content-compact">
						<v-list-item-title class="menu-item-title-compact">{{
							isDark ? __("Light Mode") : __("Dark Mode")
						}}</v-list-item-title>
						<v-list-item-subtitle class="menu-item-subtitle-compact">{{
							__("Switch theme appearance")
						}}</v-list-item-subtitle>
					</div>
				</v-list-item>

				<v-list-item @click="$emit('logout')" class="menu-item-compact danger-action">
					<template v-slot:prepend>
						<div class="menu-icon-wrapper-compact danger-icon">
							<v-icon color="white" size="16">mdi-logout</v-icon>
						</div>
					</template>
					<div class="menu-content-compact">
						<v-list-item-title class="menu-item-title-compact">{{
							__("Logout")
						}}</v-list-item-title>
						<v-list-item-subtitle class="menu-item-subtitle-compact">{{
							__("Sign out of session")
						}}</v-list-item-subtitle>
					</div>
				</v-list-item>
			</v-list>
		</v-card>
	</v-menu>
</template>

<script>
export default {
	name: "NavbarMenu",
	props: {
		posProfile: {
			type: Object,
			default: () => ({}),
		},
		lastInvoiceId: String,
		manualOffline: Boolean,
		networkOnline: Boolean,
		serverOnline: Boolean,
		isDark: Boolean,
	},
	emits: [
		"close-shift",
		"print-last-invoice",
		"sync-invoices",
		"toggle-offline",
		"clear-cache",
		"show-about",
		"toggle-theme",
		"logout",
	],
};
</script>

<style scoped>
/* Compact Menu Button - Better Navbar Integration */
.menu-btn-compact {
	margin-left: 8px;
	margin-right: 4px;
	padding: 6px 16px;
	border-radius: 20px;
	font-weight: 600;
	text-transform: none;
	font-size: 13px;
	letter-spacing: 0.3px;
	box-shadow: 0 2px 8px rgba(25, 118, 210, 0.2);
	transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	background: linear-gradient(135deg, #1976d2 0%, #42a5f5 100%);
	min-width: 90px;
	height: 36px;
}

.menu-btn-compact:hover {
	transform: translateY(-1px) scale(1.02);
	box-shadow: 0 4px 12px rgba(25, 118, 210, 0.3);
	background: linear-gradient(135deg, #1565c0 0%, #1976d2 100%);
}

/* Compact Menu Card - Smaller and Better Positioned */
.menu-card-compact {
	border-radius: 16px;
	overflow: hidden;
	background: #ffffff;
	border: none;
	box-shadow:
		0 8px 24px rgba(0, 0, 0, 0.12),
		0 2px 6px rgba(0, 0, 0, 0.08);
	backdrop-filter: blur(8px);
	min-width: 260px;
	max-width: 280px;
	margin-top: 2px;
}

/* Compact Menu Header */
.menu-header-compact {
	padding: 12px 16px 10px;
	background: linear-gradient(135deg, #f8f9fa 0%, #e3f2fd 100%);
	display: flex;
	align-items: center;
	gap: 10px;
	border-bottom: 1px solid rgba(25, 118, 210, 0.06);
}

.menu-header-text-compact {
	font-size: 14px;
	font-weight: 600;
	color: #1976d2;
	letter-spacing: 0.3px;
}

/* Compact Menu List */
.menu-list-compact {
	padding: 8px 6px 12px;
	background: #ffffff;
}

/* Compact Menu Items */
.menu-item-compact {
	border-radius: 12px;
	margin: 3px 0;
	padding: 12px 16px;
	transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	cursor: pointer;
	position: relative;
	overflow: hidden;
	min-height: 56px;
	display: flex;
	align-items: center;
	gap: 12px;
}

.menu-item-compact::before {
	content: "";
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	background: transparent;
	transition: all 0.3s ease;
	z-index: 0;
	border-radius: 12px;
}

.menu-item-compact:hover::before {
	background: linear-gradient(135deg, rgba(25, 118, 210, 0.05) 0%, rgba(66, 165, 245, 0.08) 100%);
}

.menu-item-compact:hover {
	transform: translateX(3px) scale(1.01);
	box-shadow: 0 3px 12px rgba(0, 0, 0, 0.08);
}

/* Compact Icon Wrapper */
.menu-icon-wrapper-compact {
	width: 32px;
	height: 32px;
	border-radius: 10px;
	display: flex;
	align-items: center;
	justify-content: center;
	transition: all 0.3s ease;
	position: relative;
	z-index: 1;
	flex-shrink: 0;
}

/* Compact Content Wrapper */
.menu-content-compact {
	flex: 1;
	display: flex;
	flex-direction: column;
	gap: 2px;
	position: relative;
	z-index: 1;
}

/* Compact Icon Colors */
.primary-icon {
	background: linear-gradient(135deg, #1976d2 0%, #42a5f5 100%);
	box-shadow: 0 2px 6px rgba(25, 118, 210, 0.2);
}

.secondary-icon {
	background: linear-gradient(135deg, #7b1fa2 0%, #ba68c8 100%);
	box-shadow: 0 2px 6px rgba(123, 31, 162, 0.2);
}

.info-icon {
	background: linear-gradient(135deg, #0288d1 0%, #4fc3f7 100%);
	box-shadow: 0 2px 6px rgba(2, 136, 209, 0.2);
}

.neutral-icon {
	background: linear-gradient(135deg, #616161 0%, #9e9e9e 100%);
	box-shadow: 0 2px 6px rgba(97, 97, 97, 0.2);
}

.danger-icon {
	background: linear-gradient(135deg, #d32f2f 0%, #f44336 100%);
	box-shadow: 0 2px 6px rgba(211, 47, 47, 0.2);
}

.warning-icon {
	background: linear-gradient(135deg, #ff9800 0%, #ffc107 100%);
	box-shadow: 0 2px 6px rgba(255, 152, 0, 0.2);
}

/* Compact Text Styling */
.menu-item-title-compact {
	font-weight: 600;
	font-size: 14px;
	color: #212121;
	line-height: 1.2;
	margin-bottom: 1px;
}

.menu-item-subtitle-compact {
	font-size: 11px;
	color: #666666;
	line-height: 1.3;
	font-weight: 400;
}

/* Compact Section Divider */
.menu-section-divider-compact {
	margin: 8px 10px;
	opacity: 0.12;
	border-color: #1976d2;
}

/* Compact Hover Effects */
.primary-action:hover .primary-icon {
	transform: scale(1.1) rotate(5deg);
	box-shadow: 0 3px 8px rgba(25, 118, 210, 0.25);
}

.secondary-action:hover .secondary-icon {
	transform: scale(1.1) rotate(-5deg);
	box-shadow: 0 3px 8px rgba(123, 31, 162, 0.25);
}

.info-action:hover .info-icon {
	transform: scale(1.1) rotate(360deg);
	box-shadow: 0 3px 8px rgba(2, 136, 209, 0.25);
}

.neutral-action:hover .neutral-icon {
	transform: scale(1.1);
	box-shadow: 0 3px 8px rgba(97, 97, 97, 0.25);
}

.danger-action:hover .danger-icon {
	transform: scale(1.1) rotate(-5deg);
	box-shadow: 0 3px 8px rgba(211, 47, 47, 0.25);
}

.danger-action:hover::before {
	background: linear-gradient(135deg, rgba(211, 47, 47, 0.05) 0%, rgba(244, 67, 54, 0.08) 100%) !important;
}

.warning-action:hover .warning-icon {
	transform: scale(1.1) rotate(-5deg);
	box-shadow: 0 3px 8px rgba(255, 152, 0, 0.25);
}

.warning-action:hover::before {
	background: linear-gradient(135deg, rgba(255, 152, 0, 0.05) 0%, rgba(255, 193, 7, 0.08) 100%) !important;
}

/* Compact Responsive Design */
@media (max-width: 768px) {
	.menu-card-compact {
		min-width: 240px;
		max-width: 260px;
		border-radius: 14px;
	}

	.menu-item-compact {
		padding: 10px 14px;
		min-height: 52px;
		gap: 10px;
	}

	.menu-icon-wrapper-compact {
		width: 30px;
		height: 30px;
	}

	.menu-header-compact {
		padding: 10px 14px 8px;
	}

	.menu-btn-compact {
		margin-left: 6px;
		padding: 5px 14px;
		min-width: 85px;
		height: 34px;
		font-size: 12px;
	}
}

@media (max-width: 480px) {
	.menu-card-compact {
		min-width: 220px;
		max-width: 240px;
	}

	.menu-item-compact {
		padding: 9px 12px;
		min-height: 48px;
		gap: 9px;
	}

	.menu-header-compact {
		padding: 9px 12px 7px;
	}

	.menu-btn-compact {
		min-width: 80px;
		height: 32px;
	}
}

/* Compact Animation for Menu Appearance */
.v-overlay__content {
	animation: menuSlideInCompact 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes menuSlideInCompact {
	from {
		opacity: 0;
		transform: translateY(-8px) scale(0.95);
	}

	to {
		opacity: 1;
		transform: translateY(0) scale(1);
	}
}

/* Compact Focus States */
.menu-item-compact:focus-visible {
	outline: 1px solid #1976d2;
	outline-offset: 1px;
}

.menu-btn-compact:focus-visible {
	outline: 1px solid #1976d2;
	outline-offset: 2px;
}

/* Dark Theme Adjustments */
:deep([data-theme="dark"]) .menu-btn-compact,
:deep(.v-theme--dark) .menu-btn-compact {
	background: linear-gradient(135deg, #90caf9 0%, #42a5f5 100%);
	color: #1e1e1e !important;
}

:deep([data-theme="dark"]) .menu-btn-compact:hover,
:deep(.v-theme--dark) .menu-btn-compact:hover {
	background: linear-gradient(135deg, #64b5f6 0%, #1976d2 100%);
	box-shadow: 0 4px 12px rgba(144, 202, 249, 0.3);
}

:deep([data-theme="dark"]) .menu-card-compact,
:deep(.v-theme--dark) .menu-card-compact {
	background: var(--surface-primary, #1e1e1e) !important;
	border: 1px solid rgba(255, 255, 255, 0.12);
	box-shadow:
		0 8px 24px rgba(0, 0, 0, 0.4),
		0 2px 6px rgba(0, 0, 0, 0.2);
}

:deep([data-theme="dark"]) .menu-header-compact,
:deep(.v-theme--dark) .menu-header-compact {
	background: linear-gradient(135deg, #2d2d2d 0%, #1e1e1e 100%) !important;
	border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}

:deep([data-theme="dark"]) .menu-header-text-compact,
:deep(.v-theme--dark) .menu-header-text-compact {
	color: var(--primary-light, #90caf9) !important;
}

:deep([data-theme="dark"]) .menu-list-compact,
:deep(.v-theme--dark) .menu-list-compact {
	background: var(--surface-primary, #1e1e1e) !important;
}

:deep([data-theme="dark"]) .menu-item-title-compact,
:deep(.v-theme--dark) .menu-item-title-compact {
	color: var(--text-primary, #ffffff) !important;
}

:deep([data-theme="dark"]) .menu-item-subtitle-compact,
:deep(.v-theme--dark) .menu-item-subtitle-compact {
	color: var(--text-secondary, #b0b0b0) !important;
}

:deep([data-theme="dark"]) .menu-section-divider-compact,
:deep(.v-theme--dark) .menu-section-divider-compact {
	border-color: rgba(255, 255, 255, 0.12) !important;
}

:deep([data-theme="dark"]) .menu-item-compact:hover::before,
:deep(.v-theme--dark) .menu-item-compact:hover::before {
	background: linear-gradient(
		135deg,
		rgba(144, 202, 249, 0.05) 0%,
		rgba(144, 202, 249, 0.08) 100%
	) !important;
}

/* Dark mode icon adjustments */
:deep([data-theme="dark"]) .primary-icon,
:deep(.v-theme--dark) .primary-icon {
	background: linear-gradient(135deg, #90caf9 0%, #42a5f5 100%);
	box-shadow: 0 2px 6px rgba(144, 202, 249, 0.3);
}

:deep([data-theme="dark"]) .secondary-icon,
:deep(.v-theme--dark) .secondary-icon {
	background: linear-gradient(135deg, #ce93d8 0%, #ba68c8 100%);
	box-shadow: 0 2px 6px rgba(206, 147, 216, 0.3);
}

:deep([data-theme="dark"]) .info-icon,
:deep(.v-theme--dark) .info-icon {
	background: linear-gradient(135deg, #81d4fa 0%, #4fc3f7 100%);
	box-shadow: 0 2px 6px rgba(129, 212, 250, 0.3);
}

:deep([data-theme="dark"]) .neutral-icon,
:deep(.v-theme--dark) .neutral-icon {
	background: linear-gradient(135deg, #bdbdbd 0%, #9e9e9e 100%);
	box-shadow: 0 2px 6px rgba(189, 189, 189, 0.3);
}

:deep([data-theme="dark"]) .danger-icon,
:deep(.v-theme--dark) .danger-icon {
	background: linear-gradient(135deg, #ef5350 0%, #f44336 100%);
	box-shadow: 0 2px 6px rgba(239, 83, 80, 0.3);
}

:deep([data-theme="dark"]) .warning-icon,
:deep(.v-theme--dark) .warning-icon {
	background: linear-gradient(135deg, #ffb74d 0%, #ffc107 100%);
	box-shadow: 0 2px 6px rgba(255, 183, 77, 0.3);
}
</style>
