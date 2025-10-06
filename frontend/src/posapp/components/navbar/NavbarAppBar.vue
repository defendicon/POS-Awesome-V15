<template>
	<v-app-bar app flat height="56" :color="appBarColor" :theme="isDark ? 'dark' : 'light'"
		:class="['navbar-enhanced elevation-2 px-2 pb-1', rtlClasses, isRtl ? 'rtl-app-bar' : 'ltr-app-bar']"
		:style="[rtlStyles, { flexDirection: isRtl ? 'row-reverse' : 'row' }]">
		<!-- Brand Section (left in LTR, right in RTL) -->
		<div :class="['navbar-brand-section', isRtl ? 'rtl-brand-section' : 'ltr-brand-section']">
			<v-app-bar-nav-icon ref="navIcon" @click="$emit('nav-click')"
				:class="['text-secondary nav-icon', isRtl ? 'rtl-nav-icon' : 'ltr-nav-icon']" />

                        <v-img :src="posLogo" alt="POS Awesome" max-width="32"
                                :class="['navbar-logo', isRtl ? 'rtl-logo' : 'ltr-logo']" />

			<v-toolbar-title @click="$emit('go-desk')"
				:class="['text-h6 font-weight-bold text-primary navbar-title', isRtl ? 'rtl-title' : 'ltr-title']"
				style="cursor: pointer; text-decoration: none">
				<span class="font-weight-light navbar-title-light">{{ __("POS") }}</span><span
					class="navbar-title-bold">{{ __("Awesome") }}</span>
			</v-toolbar-title>
		</div>

		<v-spacer />

		<!-- Actions Section (right in LTR, left in RTL) -->
		<div :class="['navbar-actions-section', isRtl ? 'rtl-actions-section' : 'ltr-actions-section']">
			<!-- Enhanced connectivity status indicator - Always visible -->
			<slot name="status-indicator"></slot>

			<!-- Cache Usage Meter -->
			<slot name="cache-usage-meter"></slot>

			<!-- Database Usage Gadget -->
			<slot name="db-usage-gadget"></slot>

			<!-- CPU Load Gadget -->
			<slot name="cpu-gadget"></slot>

			<div :class="['profile-section', isRtl ? 'rtl-profile-section' : 'ltr-profile-section']">
				<v-chip color="primary" variant="outlined"
					:class="['profile-chip', isRtl ? 'rtl-profile-chip' : 'ltr-profile-chip']">
					<v-icon :start="!isRtl" :end="isRtl" :class="isRtl ? 'rtl-profile-icon' : 'ltr-profile-icon'">
						mdi-account-circle
					</v-icon>
					<span :class="isRtl ? 'rtl-profile-text' : 'ltr-profile-text'">
						{{ displayName }}
					</span>
				</v-chip>
			</div>

			<v-btn icon color="primary"
				:class="['offline-invoices-btn', isRtl ? 'rtl-offline-btn' : 'ltr-offline-btn', { 'has-pending': pendingInvoices > 0 }]"
				@click="$emit('show-offline-invoices')">
				<v-badge v-if="pendingInvoices > 0" :content="pendingInvoices" color="error" overlap>
					<v-icon>mdi-file-document-multiple-outline</v-icon>
				</v-badge>
				<v-icon v-else>mdi-file-document-multiple-outline</v-icon>
				<v-tooltip activator="parent" :location="isRtl ? 'bottom start' : 'bottom end'">
					{{ __("Offline Invoices") }} ({{ pendingInvoices }})
				</v-tooltip>
			</v-btn>

			<!-- Menu component slot -->
			<slot name="menu"></slot>
		</div>

		<!-- Glass Morphism Loading Bar -->
		<transition name="loading-fade">
			<div v-if="loadingActive" class="loading-container">
				<div class="glass-card">
					<span class="loading-message">{{ loadingMessage }}</span>
					<div class="progress-badge">{{ loadingProgress }}%</div>
				</div>
				<v-progress-linear :model-value="loadingProgress" color="primary" height="4" absolute location="bottom"
					class="glass-progress" />
			</div>
		</transition>
	</v-app-bar>
</template>

<script>
import { useRtl } from "../../composables/useRtl.js";
import posLogo from "../pos/pos.png";

export default {
	name: "NavbarAppBar",
        setup() {
                const { isRtl, rtlStyles, rtlClasses } = useRtl();
                return {
                        isRtl,
                        rtlStyles,
                        rtlClasses,
                        posLogo,
                };
        },
	props: {
		posProfile: {
			type: Object,
			default: () => ({}),
		},
		pendingInvoices: {
			type: Number,
			deflt: 0,
		},
		isDark: Boolean,
		loadingProgress: {
			type: Number,
			default: 0,
		},
		loadingActive: {
			type: Boolean,
			default: false,
		},
		loadingMessage: {
			type: String,
			default: 'Loading app data...',
		},
	},
	computed: {
		appBarColor() {
			return this.isDark ? this.$vuetify.theme.themes.dark.colors.surface : "white";
		},

		displayName() {
			// Show POS profile name if available, otherwise show user name
			if (this.posProfile && this.posProfile.name) {
				return this.posProfile.name;
			}

			// Fallback to Frappe user
			if (frappe.session && frappe.session.user_fullname) {
				return frappe.session.user_fullname;
			}

			if (frappe.session && frappe.session.user) {
				return frappe.session.user;
			}

			return "User";
		},
	},

	emits: ["nav-click", "go-desk", "show-offline-invoices"],
};
</script>

<style scoped>
/* Enhanced Navbar Styling */
.navbar-enhanced {
	background-image: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%) !important;
	background-color: #ffffff !important;
	border-bottom: 2px solid #e3f2fd !important;
	backdrop-filter: blur(10px);
	transition: all 0.3s ease;
	padding-bottom: 4px !important;
	overflow: visible !important;
}

/* RTL/LTR App Bar Layout */
.rtl-app-bar {
	direction: rtl;
}

.ltr-app-bar {
	direction: ltr;
}

/* Brand Section Styling */
.navbar-brand-section {
	display: flex;
	align-items: center;
	gap: 12px;
	flex-direction: row;
	/* Default to normal row */
	flex-shrink: 0;
	min-width: max-content;
}

.rtl-brand-section {
	flex-direction: row-reverse;
}

.ltr-brand-section {
	flex-direction: row;
	/* Explicit normal row for LTR */
}

/* Actions Section Styling */
.navbar-actions-section {
	display: flex;
	align-items: center;
	gap: 8px;
	flex-direction: row;
	/* Default to normal row */
}

.rtl-actions-section {
	flex-direction: row-reverse;
}

.ltr-actions-section {
	flex-direction: row;
	/* Explicit normal row for LTR */
}

/* LTR Actions ordering for proper sequence */
.ltr-actions-section> :nth-child(1) {
	/* status-indicator */
	order: 1;
}

.ltr-actions-section> :nth-child(2) {
	/* cache-usage-meter */
	order: 2;
}

.ltr-actions-section> :nth-child(3) {
	/* db-usage-gadget */
	order: 3;
}

.ltr-actions-section> :nth-child(4) {
	/* cpu-gadget */
	order: 4;
}

.ltr-actions-section .profile-section {
	order: 5;
}

.ltr-actions-section .offline-invoices-btn {
	order: 6;
}

/* Menu should be the last element */
.ltr-actions-section> :last-child,
/* menu slot */
.ltr-actions-section .v-menu,
.ltr-actions-section [role="menu"] {
	order: 7 !important;
}

/* RTL adjustments for gadgets - reverse the order */
.rtl-actions-section> :nth-child(1) {
	order: 6;
	/* Reverse order in RTL */
}

.rtl-actions-section> :nth-child(2) {
	order: 5;
}

.rtl-actions-section> :nth-child(3) {
	order: 4;
}

.rtl-actions-section> :nth-child(4) {
	order: 3;
}

.rtl-actions-section .profile-section {
	order: 2;
}

.rtl-actions-section .offline-invoices-btn {
	order: 1;
}

/* RTL Menu should be first */
.rtl-actions-section> :last-child,
/* menu slot */
.rtl-actions-section .v-menu,
.rtl-actions-section [role="menu"] {
	order: 0 !important;
}

.navbar-enhanced:hover {
	box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1) !important;
}

/* Logo Styling */
.navbar-logo {
	transition: transform 0.3s ease;
}

.rtl-logo {
	margin-left: 12px;
	margin-right: 0;
}

.ltr-logo {
	margin-right: 12px;
	margin-left: 0;
	order: 0;
}

.navbar-logo:hover {
	transform: scale(1.05);
}

/* Brand Title Styling */
.navbar-title {
	text-decoration: none !important;
	border-bottom: none !important;
	transition: color 0.3s ease;
	white-space: nowrap;
	overflow: visible !important;
	display: flex;
	align-items: center;
	min-width: max-content;
	flex-shrink: 0;
}

.navbar-title:hover {
	text-decoration: none !important;
	opacity: 0.8;
}

.rtl-title {
	text-align: right;
	order: -1;
	/* Moves title before logo in RTL */
	flex-direction: row-reverse;
}

.ltr-title {
	text-align: left;
	order: 0;
	/* Normal order in LTR */
	flex-direction: row;
}

/* Title Text Styling */
.navbar-title-light {
	font-weight: 300 !important;
	letter-spacing: 0.5px;
	margin-right: 2px;
	display: inline-block;
	white-space: nowrap;
}

.navbar-title-bold {
	font-weight: 700 !important;
	letter-spacing: 0.25px;
	display: inline-block;
	white-space: nowrap;
}

/* RTL Title Spacing */
.rtl-title .navbar-title-light {
	margin-left: 2px;
	margin-right: 0;
}

.rtl-title .navbar-title-bold {
	margin-right: 2px;
	margin-left: 0;
}

/* Navigation Icon */
.nav-icon {
	border-radius: 12px;
	padding: 8px;
	transition: all 0.3s ease;
	min-width: 40px;
	min-height: 40px;
}

.nav-icon:hover {
	background-color: rgba(25, 118, 210, 0.1);
	transform: scale(1.1);
}

.rtl-nav-icon {
	order: 3;
	/* Last in brand section for RTL */
}

.ltr-nav-icon {
	order: 0;
	/* Normal order for LTR */
}

/* Profile Section */
.profile-section {
	margin: 0;
	order: 2;
	/* Second to last in actions section */
}

.rtl-profile-section {
	order: 2;
}

.ltr-profile-section {
	order: 2;
}

.profile-chip {
	font-weight: 500;
	padding: 8px 16px;
	border-radius: 20px;
	transition: all 0.3s ease;
	display: flex;
	align-items: center;
	gap: 8px;
}

.profile-chip:hover {
	transform: translateY(-2px);
	box-shadow: 0 4px 12px rgba(25, 118, 210, 0.3);
}

/* RTL Profile Chip Styling */
.rtl-profile-chip {
	flex-direction: row-reverse;
	text-align: right;
}

.ltr-profile-chip {
	flex-direction: row;
	text-align: left;
}

/* Profile Icon Positioning */
.rtl-profile-icon {
	margin-left: 8px;
	margin-right: 0;
	order: 2;
}

.ltr-profile-icon {
	margin-right: 8px;
	margin-left: 0;
	order: 0;
	/* Keep normal order for LTR */
}

/* Profile Text Positioning */
.rtl-profile-text {
	order: 1;
	text-align: right;
	margin-right: 4px;
}

.ltr-profile-text {
	order: 0;
	/* Keep normal order for LTR */
	text-align: left;
	margin-left: 4px;
}

/* Override Vuetify's default chip styles for better RTL spacing */
.rtl-profile-chip :deep(.v-chip__content) {
	flex-direction: row-reverse;
	gap: 8px;
}

.ltr-profile-chip :deep(.v-chip__content) {
	flex-direction: row;
	gap: 8px;
}

/* Force proper icon spacing in Vuetify chips */
.rtl-profile-chip :deep(.v-icon) {
	margin-left: 6px !important;
	margin-right: 0 !important;
}

.ltr-profile-chip :deep(.v-icon) {
	margin-right: 6px !important;
	margin-left: 0 !important;
}

/* Offline Invoices Button Enhancement */
.offline-invoices-btn {
	position: relative;
	transition: all 0.3s ease;
	padding: 4px;
	min-width: 40px;
	min-height: 40px;
}

.rtl-offline-btn {
	order: 3;
	/* Last in actions section for RTL */
}

.ltr-offline-btn {
	order: 3;
	/* Last in actions section for LTR */
}

.offline-invoices-btn:hover {
	transform: scale(1.05);
}

.offline-invoices-btn.has-pending {
	animation: pulse 2s infinite;
}

@keyframes pulse {
	0% {
		box-shadow: 0 0 0 0 rgba(244, 67, 54, 0.4);
	}

	70% {
		box-shadow: 0 0 0 10px rgba(244, 67, 54, 0);
	}

	100% {
		box-shadow: 0 0 0 0 rgba(244, 67, 54, 0);
	}
}

/* Dark theme adjustments */
:deep([data-theme="dark"]) .navbar-enhanced,
:deep(.v-theme--dark) .navbar-enhanced {
	background-image: linear-gradient(135deg,
			var(--surface-primary, #1e1e1e) 0%,
			var(--surface-secondary, #2d2d2d) 100%) !important;
	background-color: var(--surface-primary, #1e1e1e) !important;
	border-bottom: 2px solid var(--border-color, rgba(255, 255, 255, 0.12)) !important;
	color: var(--text-primary, #ffffff) !important;
}

:deep([data-theme="dark"]) .navbar-enhanced:hover,
:deep(.v-theme--dark) .navbar-enhanced:hover {
	box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3) !important;
}

:deep([data-theme="dark"]) .nav-icon,
:deep(.v-theme--dark) .nav-icon {
	color: var(--text-primary, #ffffff) !important;
}

:deep([data-theme="dark"]) .nav-icon:hover,
:deep(.v-theme--dark) .nav-icon:hover {
	background-color: rgba(144, 202, 249, 0.1);
}

:deep([data-theme="dark"]) .navbar-title,
:deep(.v-theme--dark) .navbar-title {
	color: var(--text-primary, #ffffff) !important;
}

:deep([data-theme="dark"]) .profile-chip,
:deep(.v-theme--dark) .profile-chip {
	background-color: var(--surface-secondary, #2d2d2d) !important;
	color: var(--text-primary, #ffffff) !important;
	border-color: var(--primary-light, #90caf9) !important;
}

/* ===== GLASS MORPHISM LOADING BAR ===== */
.loading-container {
	position: absolute;
	bottom: 0;
	left: 0;
	right: 0;
	z-index: 1000;
}

.glass-card {
	position: absolute;
	top: -40px;
	left: 12px;
	right: 12px;
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 8px 16px;

	/* Glass morphism effect */
	background: color(from Canvas r g b / 0.8);
	backdrop-filter: blur(20px);
	border-radius: 12px;
	border: 1px solid color(from Canvas r g b / 0.1);

	/* System shadows */
	box-shadow:
		0 8px 32px color(from CanvasText r g b / 0.1),
		0 1px 0 color(from Canvas r g b / 0.5) inset;
}

.loading-message {
	font-size: 12px;
	font-weight: 500;
	color: AccentColor;
	flex: 1;
}

.progress-badge {
	font-size: 11px;
	font-weight: 600;
	color: Canvas;
	background: AccentColor;
	padding: 2px 8px;
	border-radius: 8px;
	min-width: 32px;
	text-align: center;
}

.glass-progress {
	border-radius: 0 !important;
	backdrop-filter: blur(10px);
}

.glass-progress :deep(.v-progress-linear__background) {
	background: color(from CanvasText r g b / 0.1) !important;
}

.glass-progress :deep(.v-progress-linear__determinate) {
	background: AccentColor !important;
	box-shadow: 0 0 12px color(from AccentColor r g b / 0.3);
}

/* Smooth transitions */
.loading-fade-enter-active,
.loading-fade-leave-active {
	transition: all 0.3s ease;
}

.loading-fade-enter-from {
	opacity: 0;
	transform: translateY(8px);
}

.loading-fade-leave-to {
	opacity: 0;
	transform: translateY(-4px);
}

/* Dark theme fallback for older browsers */
@media (prefers-color-scheme: dark) {
	.glass-card {
		background: rgba(30, 30, 30, 0.8);
		border-color: rgba(255, 255, 255, 0.1);
		box-shadow:
			0 8px 32px rgba(0, 0, 0, 0.2),
			0 1px 0 rgba(255, 255, 255, 0.1) inset;
	}

	.loading-message {
		color: #bb86fc;
	}

	.progress-badge {
		background: #bb86fc;
		color: #000;
	}
}

/* Responsive adjustments */
@media (max-width: 768px) {
	.glass-card {
		padding: 6px 12px;
		left: 8px;
		right: 8px;
	}

	.loading-message {
		font-size: 11px;
	}

	.progress-badge {
		font-size: 10px;
		padding: 1px 6px;
		min-width: 28px;
	}

	/* Mobile title adjustments */
	.navbar-title {
		font-size: 1.1rem !important;
		min-width: max-content !important;
		flex-shrink: 0 !important;
	}

	.navbar-title-light {
		font-weight: 300 !important;
		letter-spacing: 0.3px;
		margin-right: 1px;
	}

	.navbar-title-bold {
		font-weight: 600 !important;
		letter-spacing: 0.2px;
	}

	.navbar-brand-section {
		flex-shrink: 0 !important;
		min-width: auto !important;
		gap: 8px;
	}
}
</style>
