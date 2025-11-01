<template>
	<v-app-bar
		app
		flat
		:height="isMobile ? 64 : 56"
		:class="[
			'pos-navbar-enhanced elevation-2 pos-themed-card pos-theme-immediate',
			rtlClasses,
			isRtl ? 'rtl-app-bar' : 'ltr-app-bar',
			isMobile ? 'mobile-navbar' : 'desktop-navbar',
		]"
		:style="[rtlStyles, { flexDirection: isRtl ? 'row-reverse' : 'row' }]"
	>
		<!-- Brand Section (left in LTR, right in RTL) -->
		<div :class="['pos-navbar-brand-section', isRtl ? 'rtl-brand-section' : 'ltr-brand-section']">
			<v-app-bar-nav-icon
				ref="navIcon"
				@click="$emit('nav-click')"
				:aria-label="__('Toggle navigation drawer')"
				:size="isMobile ? 'default' : 'large'"
				:class="['pos-text-primary nav-icon', isRtl ? 'rtl-nav-icon' : 'ltr-nav-icon']"
			/>

			<v-img
				:src="posLogo"
				alt="POS Awesome"
				:max-width="isMobile ? 24 : 32"
				:class="['pos-navbar-logo', isRtl ? 'rtl-logo' : 'ltr-logo']"
				loading="lazy"
			/>

			<v-toolbar-title
				@click="$emit('go-desk')"
				@keydown.enter="$emit('go-desk')"
				:class="[
					'text-h6 font-weight-bold text-primary pos-navbar-title',
					isRtl ? 'rtl-title' : 'ltr-title',
				]"
				style="cursor: pointer; text-decoration: none"
				tabindex="0"
				:aria-label="__('Go to Frappe Desk')"
				role="button"
			>
				<template v-if="isMobile">
					<span class="pos-navbar-title-compact">{{ __("POS") }}</span>
				</template>
				<template v-else>
					<span class="font-weight-light pos-navbar-title-light">{{ __("POS") }}</span
					><span class="pos-navbar-title-bold">{{ __("Awesome") }}</span>
				</template>
			</v-toolbar-title>
		</div>

		<v-spacer />

		<!-- Actions Section (right in LTR, left in RTL) -->
		<div :class="['pos-navbar-actions-section', isRtl ? 'rtl-actions-section' : 'ltr-actions-section']">
			<!-- Mobile: Show only essential items, others in menu -->
			<template v-if="isMobile">
				<!-- Always visible status indicator -->
				<slot name="status-indicator"></slot>

				<!-- Offline Invoices with higher priority on mobile -->
				<v-btn
					icon
					size="small"
					:class="[
						'offline-invoices-btn mobile-btn pos-themed-button',
						isRtl ? 'rtl-offline-btn' : 'ltr-offline-btn',
						{ 'has-pending': pendingInvoices > 0 },
					]"
					:aria-label="__('View offline invoices') + ` (${pendingInvoices})`"
					@click="$emit('show-offline-invoices')"
				>
					<v-badge v-if="pendingInvoices > 0" :content="pendingInvoices" color="error" overlap>
						<v-icon class="pos-text-primary">mdi-file-document-multiple-outline</v-icon>
					</v-badge>
					<v-icon v-else class="pos-text-primary">mdi-file-document-multiple-outline</v-icon>
					<v-tooltip activator="parent" location="bottom">
						{{ __("Offline Invoices") }} ({{ pendingInvoices }})
					</v-tooltip>
				</v-btn>

				<!-- Mobile Menu - contains all other items -->
				<slot name="menu"></slot>
			</template>

			<!-- Desktop: Show all items normally -->
			<template v-else>
				<!-- Enhanced connectivity status indicator -->
				<div class="gadget-wrapper status-gadget">
					<slot name="status-indicator"></slot>
				</div>

				<!-- Cache Usage Meter -->
				<div class="gadget-wrapper cache-gadget">
					<slot name="cache-usage-meter"></slot>
				</div>

				<!-- Database Usage Gadget -->
				<div class="gadget-wrapper db-gadget">
					<slot name="db-usage-gadget"></slot>
				</div>

				<!-- CPU Load Gadget -->
				<div class="gadget-wrapper cpu-gadget">
					<slot name="cpu-gadget"></slot>
				</div>

				<div :class="['profile-section', isRtl ? 'rtl-profile-section' : 'ltr-profile-section']">
					<v-chip
						variant="outlined"
						:class="[
							'profile-chip pos-themed-card',
							isRtl ? 'rtl-profile-chip' : 'ltr-profile-chip',
						]"
					>
						<v-icon
							:start="!isRtl"
							:end="isRtl"
							:class="['pos-text-primary', isRtl ? 'rtl-profile-icon' : 'ltr-profile-icon']"
						>
							mdi-account-circle
						</v-icon>
						<span :class="['pos-text-primary', isRtl ? 'rtl-profile-text' : 'ltr-profile-text']">
							{{ displayName }}
						</span>
					</v-chip>
				</div>

				<v-btn
					icon
					:class="[
						'offline-invoices-btn pos-themed-button',
						isRtl ? 'rtl-offline-btn' : 'ltr-offline-btn',
						{ 'has-pending': pendingInvoices > 0 },
					]"
					:aria-label="__('View offline invoices') + ` (${pendingInvoices})`"
					:aria-describedby="'offline-invoices-tooltip'"
					@click="$emit('show-offline-invoices')"
					@keydown.enter="$emit('show-offline-invoices')"
					tabindex="0"
				>
					<v-badge v-if="pendingInvoices > 0" :content="pendingInvoices" color="error" overlap>
						<v-icon class="pos-text-primary">mdi-file-document-multiple-outline</v-icon>
					</v-badge>
					<v-icon v-else class="pos-text-primary">mdi-file-document-multiple-outline</v-icon>
					<v-tooltip
						id="offline-invoices-tooltip"
						activator="parent"
						:location="isRtl ? 'bottom start' : 'bottom end'"
						:open-delay="500"
						:close-delay="200"
					>
						{{ __("Offline Invoices") }} ({{ pendingInvoices }})
					</v-tooltip>
				</v-btn>

				<!-- Menu component slot -->
				<slot name="menu"></slot>
			</template>
		</div>

		<!-- Glass Morphism Loading Bar -->
		<transition name="loading-fade">
			<div v-if="loadingActive" class="loading-container">
				<div class="glass-card">
					<span class="loading-message">{{ loadingMessage }}</span>
					<div class="progress-badge">{{ loadingProgress }}%</div>
				</div>
				<v-progress-linear
					:model-value="loadingProgress"
					color="primary"
					height="4"
					absolute
					location="bottom"
					class="glass-progress"
				/>
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
	data() {
		return {
			windowWidth: window.innerWidth,
			resizeRafId: null,
		};
	},
	mounted() {
		this.updateWindowWidth();
		window.addEventListener("resize", this.updateWindowWidth, { passive: true });
		this.$el.addEventListener("keydown", this.handleKeyboardNavigation, { passive: false });
	},
	beforeUnmount() {
		window.removeEventListener("resize", this.updateWindowWidth);
		if (this.$el && this.$el.removeEventListener) {
			this.$el.removeEventListener("keydown", this.handleKeyboardNavigation);
		}
		if (this.resizeRafId) {
			cancelAnimationFrame(this.resizeRafId);
			this.resizeRafId = null;
		}
	},
	props: {
		posProfile: {
			type: Object,
			default: () => ({}),
		},
		pendingInvoices: {
			type: Number,
			default: 0,
		},
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
			default: "Loading app data...",
		},
	},
	computed: {
		appBarColor() {
			return this.$theme.isDark ? this.$vuetify.theme.themes.dark.colors.surface : "white";
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

		// Mobile breakpoint detection
		isMobile() {
			return this.windowWidth < 768;
		},

		isTablet() {
			return this.windowWidth >= 768 && this.windowWidth < 1024;
		},

		isDesktop() {
			return this.windowWidth >= 1024;
		},
	},

	methods: {
		updateWindowWidth() {
			if (this.resizeRafId) {
				cancelAnimationFrame(this.resizeRafId);
			}
			this.resizeRafId = requestAnimationFrame(() => {
				this.windowWidth = window.innerWidth;
			});
		},

		// Enhanced accessibility helper
		handleKeyboardNavigation(event) {
			if (event.key === "Tab") {
				// Ensure proper tab order
				const focusableElements = this.$el.querySelectorAll(
					'button, [tabindex="0"], [role="button"]',
				);
				if (focusableElements.length > 0) {
					// Tab navigation is handled by browser, just ensure visibility
					this.$nextTick(() => {
						const activeElement = document.activeElement;
						if (activeElement && this.$el.contains(activeElement)) {
							activeElement.scrollIntoView({
								block: "nearest",
								inline: "nearest",
							});
						}
					});
				}
			}
		},
	},
	emits: ["nav-click", "go-desk", "show-offline-invoices"],
};
</script>

<style scoped>
/* Enhanced Navbar Styling */
.pos-navbar-enhanced {
	background-image: linear-gradient(
		135deg,
		var(--pos-bg-primary) 0%,
		var(--pos-bg-secondary) 100%
	) !important;
	background-color: var(--pos-bg-primary) !important;
	border-bottom: 2px solid var(--pos-border) !important;
	backdrop-filter: blur(10px);
	transition: all 0.3s ease;
	padding-bottom: 4px !important;
	overflow: visible !important;
	color: var(--pos-text-primary) !important;
}

/* RTL/LTR App Bar Layout */
.rtl-app-bar {
	direction: rtl;
}

.ltr-app-bar {
	direction: ltr;
}

/* Brand Section Styling */
.pos-navbar-brand-section {
	display: flex;
	align-items: center;
	gap: 12px;
	flex-direction: row;
	/* Default to normal row */
	flex-shrink: 0;
	min-width: max-content;
}

.pos-navbar-title-compact {
	font-weight: 600;
	font-size: 1.05rem;
	letter-spacing: 0.03em;
}

.rtl-brand-section {
	flex-direction: row-reverse;
}

.ltr-brand-section {
	flex-direction: row;
	/* Explicit normal row for LTR */
}

/* Actions Section Styling */
.pos-navbar-actions-section {
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
.ltr-actions-section > :nth-child(1) {
	/* status-indicator */
	order: 1;
}

.ltr-actions-section > :nth-child(2) {
	/* cache-usage-meter */
	order: 2;
}

.ltr-actions-section > :nth-child(3) {
	/* db-usage-gadget */
	order: 3;
}

.ltr-actions-section > :nth-child(4) {
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
.rtl-actions-section > :nth-child(1) {
	order: 6;
	/* Reverse order in RTL */
}

.rtl-actions-section > :nth-child(2) {
	order: 5;
}

.rtl-actions-section > :nth-child(3) {
	order: 4;
}

.rtl-actions-section > :nth-child(4) {
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

.pos-navbar-enhanced:hover {
	box-shadow: 0 4px 20px var(--pos-shadow) !important;
}

/* Logo Styling */
.pos-navbar-logo {
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

.pos-navbar-logo:hover {
	transform: scale(1.05);
}

@media (max-width: 960px) {
	.pos-navbar-brand-section {
		gap: 8px;
		min-width: 0;
	}
	.pos-navbar-actions-section {
		gap: 6px;
	}
}

@media (max-width: 768px) {
	.mobile-navbar .pos-navbar-brand-section {
		flex: 1;
	}
	.mobile-navbar .pos-navbar-actions-section {
		gap: 4px;
	}
}

@media (max-width: 600px) {
	.pos-navbar-title {
		font-size: 1rem !important;
	}
	.nav-icon {
		margin-inline-end: 0;
	}
}

/* Brand Title Styling */
.pos-navbar-title {
	text-decoration: none !important;
	border-bottom: none !important;
	transition: color 0.3s ease;
	white-space: nowrap;
	overflow: visible !important;
	display: flex;
	align-items: center;
	min-width: max-content;
	flex-shrink: 0;
	/* Use same blue as Menu button - matching gradient blue */
	color: #1976d2 !important;
}

.pos-navbar-title:hover {
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
.pos-navbar-title-light {
	font-weight: 300 !important;
	letter-spacing: 0.5px;
	margin-right: 2px;
	display: inline-block;
	white-space: nowrap;
}

.pos-navbar-title-bold {
	font-weight: 700 !important;
	letter-spacing: 0.25px;
	display: inline-block;
	white-space: nowrap;
}

/* RTL Title Spacing */
.rtl-title .pos-navbar-title-light {
	margin-left: 2px;
	margin-right: 0;
}

.rtl-title .pos-navbar-title-bold {
	margin-right: 2px;
	margin-left: 0;
}

/* Navigation Icon - Elite Style */
.nav-icon {
	border-radius: 12px;
	padding: 8px;
	transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
	min-width: 40px;
	min-height: 40px;
	color: #1976d2 !important;
	background: rgba(25, 118, 210, 0.08) !important;
	border: 1px solid rgba(25, 118, 210, 0.12);
	backdrop-filter: blur(8px);
}

.nav-icon:hover {
	background: rgba(25, 118, 210, 0.12) !important;
	color: #1565c0 !important;
	border-color: rgba(25, 118, 210, 0.2);
	transform: translateY(-1px);
	box-shadow: 0 4px 12px rgba(25, 118, 210, 0.15);
}

.rtl-nav-icon {
	order: 3;
	/* Last in brand section for RTL */
}

.ltr-nav-icon {
	order: 0;
	/* Normal order for LTR */
}

/* Gadget Wrapper Styling for Consistency */
.gadget-wrapper {
	display: flex;
	align-items: center;
	min-height: 40px;
	transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.gadget-wrapper:empty {
	display: none;
}

/* Individual gadget responsiveness */
@media (max-width: 1200px) {
	.db-gadget {
		display: none;
	}
}

@media (max-width: 1024px) {
	.cpu-gadget {
		display: none;
	}
}

@media (max-width: 900px) {
	.cache-gadget {
		display: none;
	}
}

/* Profile Section */
.profile-section {
	margin: 0;
	order: 2;
	/* Second to last in actions section */
}

.profile-chip {
	color: #1976d2 !important;
	border-color: rgba(25, 118, 210, 0.2) !important;
	background: rgba(25, 118, 210, 0.06) !important;
	backdrop-filter: blur(8px);
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
	transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
	display: flex;
	align-items: center;
	gap: 8px;
}

.profile-chip:hover {
	transform: translateY(-1px);
	background: rgba(25, 118, 210, 0.1) !important;
	border-color: rgba(25, 118, 210, 0.25) !important;
	box-shadow: 0 4px 12px rgba(25, 118, 210, 0.12);
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

/* Offline Invoices Button Enhancement - Elite Style */
.offline-invoices-btn {
	position: relative;
	transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
	padding: 4px;
	min-width: 40px;
	min-height: 40px;
	background: rgba(25, 118, 210, 0.08) !important;
	border: 1px solid rgba(25, 118, 210, 0.12);
	border-radius: 12px;
	backdrop-filter: blur(8px);
}

.offline-invoices-btn .pos-text-primary {
	color: #1976d2 !important;
}

/* Elite styling for navbar text and icons */
.pos-navbar-enhanced .pos-text-primary {
	color: #1976d2 !important;
}

/* Ensure profile text and icons use elite colors */
.profile-chip .pos-text-primary,
.profile-chip .ltr-profile-text,
.profile-chip .rtl-profile-text {
	color: #1976d2 !important;
	font-weight: 500;
}

/* Navbar icons with refined styling */
.pos-navbar-enhanced .v-icon.pos-text-primary,
.pos-navbar-enhanced .mdi-menu-down,
.pos-navbar-enhanced .v-icon--end.pos-text-primary {
	color: #1976d2 !important;
	transition: color 0.25s ease;
}

.pos-navbar-enhanced .v-icon.pos-text-primary:hover {
	color: #1565c0 !important;
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
	transform: translateY(-1px);
	background: rgba(25, 118, 210, 0.12) !important;
	border-color: rgba(25, 118, 210, 0.2);
	box-shadow: 0 4px 12px rgba(25, 118, 210, 0.15);
}

.offline-invoices-btn:hover .pos-text-primary {
	color: #1565c0 !important;
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
		color: var(--pos-primary);
	}

	.progress-badge {
		background: var(--pos-primary);
		color: var(--pos-text-primary);
	}
}

/* Mobile Navbar Styles */
.mobile-navbar {
	padding: 0 8px !important;
}

.mobile-navbar .pos-navbar-brand-section {
	gap: 8px;
	flex-shrink: 0;
}

.mobile-navbar .pos-navbar-logo {
	max-width: 28px !important;
}

.mobile-navbar .pos-navbar-title {
	font-size: 1rem !important;
}

.mobile-navbar .pos-navbar-title-light,
.mobile-navbar .pos-navbar-title-bold {
	font-size: 0.9rem !important;
}

.mobile-navbar .pos-navbar-actions-section {
	gap: 6px;
}

.mobile-navbar .mobile-btn {
	min-width: 36px !important;
	min-height: 36px !important;
	padding: 6px !important;
}

.mobile-navbar .nav-icon {
	min-width: 36px !important;
	min-height: 36px !important;
	padding: 6px !important;
}

/* Desktop Navbar Styles */
.desktop-navbar {
	padding: 0 16px 4px !important;
}

/* Enhanced mobile responsiveness */
@media (max-width: 480px) {
	.mobile-navbar {
		padding: 0 4px !important;
		height: 56px !important;
	}

	.mobile-navbar .pos-navbar-brand-section {
		gap: 6px;
	}

	.mobile-navbar .pos-navbar-logo {
		max-width: 24px !important;
	}

	.mobile-navbar .pos-navbar-title {
		font-size: 0.9rem !important;
	}

	.mobile-navbar .pos-navbar-title-light {
		display: none !important; /* Hide "POS" part on very small screens */
	}

	.mobile-navbar .mobile-btn,
	.mobile-navbar .nav-icon {
		min-width: 32px !important;
		min-height: 32px !important;
		padding: 4px !important;
	}

	/* Hide hamburger icon text on very small screens */
	.mobile-navbar .v-app-bar-nav-icon .v-icon {
		font-size: 20px !important;
	}
}

/* Touch-friendly interactions for mobile */
@media (hover: none) and (pointer: coarse) {
	.nav-icon,
	.offline-invoices-btn,
	.mobile-btn {
		min-width: 44px !important;
		min-height: 44px !important;
		-webkit-tap-highlight-color: rgba(25, 118, 210, 0.1);
	}

	.pos-navbar-title {
		min-height: 44px;
		display: flex;
		align-items: center;
	}
}

/* Reduced motion accessibility */
@media (prefers-reduced-motion: reduce) {
	.pos-navbar-enhanced,
	.nav-icon,
	.offline-invoices-btn,
	.profile-chip,
	.pos-navbar-logo,
	.gadget-wrapper {
		transition: none !important;
		animation: none !important;
	}

	.offline-invoices-btn.has-pending {
		animation: none !important;
	}
}

/* Tablet optimizations */
@media (min-width: 768px) and (max-width: 1023px) {
	.pos-navbar-actions-section {
		gap: 6px;
	}

	.profile-chip {
		padding: 6px 12px !important;
		font-size: 0.9rem !important;
	}
}

/* Original responsive adjustments for loading bar */
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
}

/* High DPI display adjustments */
@media (-webkit-min-device-pixel-ratio: 2), (min-resolution: 192dpi) {
	.mobile-navbar .pos-navbar-logo,
	.mobile-navbar .v-icon {
		image-rendering: -webkit-optimize-contrast;
		image-rendering: crisp-edges;
	}
}

/* Landscape mobile adjustments */
@media (max-height: 500px) and (orientation: landscape) {
	.mobile-navbar {
		height: 48px !important;
	}

	.mobile-navbar .pos-navbar-title {
		font-size: 0.8rem !important;
	}

	.mobile-navbar .mobile-btn,
	.mobile-navbar .nav-icon {
		min-width: 28px !important;
		min-height: 28px !important;
	}
}
</style>
