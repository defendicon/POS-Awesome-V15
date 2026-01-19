<template>
	<v-app-bar
		flat
		:height="isMobile ? 64 : 64"
		:class="[
			'pos-navbar-glass elevation-0',
			rtlClasses,
			isRtl ? 'rtl-app-bar' : 'ltr-app-bar',
			isMobile ? 'mobile-navbar' : 'desktop-navbar',
		]"
		:style="[rtlStyles, { flexDirection: isRtl ? 'row-reverse' : 'row' }]"
	>
		<!-- Brand Section -->
		<div :class="['pos-navbar-brand-section', isRtl ? 'rtl-brand-section' : 'ltr-brand-section']">
			<v-btn
				icon
				variant="text"
				@click="$emit('nav-click')"
				:aria-label="__('Toggle navigation')"
				class="glass-icon-btn nav-trigger"
			>
				<v-icon size="default">mdi-menu</v-icon>
			</v-btn>

			<div class="brand-logo-wrapper" @click="$emit('go-desk')">
				<v-img
					:src="posLogo"
					alt="POS"
					width="32"
					height="32"
					class="brand-logo"
				/>
				<div class="brand-text" v-if="!isMobile">
					<span class="font-weight-bold text-primary">POS</span>
					<span class="font-weight-light text-high-emphasis">Awesome</span>
				</div>
			</div>
		</div>

		<v-spacer />

		<!-- Center Island (Desktop Only) - e.g. Search or Status -->
		<div class="navbar-center-island" v-if="!isMobile">
			<slot name="status-indicator"></slot>
		</div>

		<v-spacer />

		<!-- Actions Section -->
		<div :class="['pos-navbar-actions-section', isRtl ? 'rtl-actions-section' : 'ltr-actions-section']">

			<!-- Desktop Gadgets -->
			<template v-if="!isMobile">
				<div class="glass-gadget-container">
					<NavbarInfoGadgets :class="['info-gadgets-wrapper', isRtl ? 'rtl-info-gadgets' : 'ltr-info-gadgets']">
						<template #cache-usage-meter><slot name="cache-usage-meter"></slot></template>
						<template #db-usage-gadget><slot name="db-usage-gadget"></slot></template>
						<template #cpu-gadget><slot name="cpu-gadget"></slot></template>
					</NavbarInfoGadgets>
				</div>
			</template>

			<!-- Profile Pill -->
			<div class="profile-pill glass-pill" v-if="!isMobile">
				<v-avatar size="24" color="primary" class="mr-2">
					<span class="text-caption text-white font-weight-bold">{{ getInitials(displayName) }}</span>
				</v-avatar>
				<span class="text-caption font-weight-medium truncate profile-name">{{ displayName }}</span>
			</div>

			<!-- Quick Actions -->
			<div class="action-buttons d-flex align-center gap-2">
				<v-btn
					icon
					size="small"
					class="glass-icon-btn"
					@click="$emit('show-offline-invoices')"
					:class="{ 'has-pending': pendingInvoices > 0 }"
				>
					<v-badge v-if="pendingInvoices > 0" :content="pendingInvoices" color="error" dot>
						<v-icon>mdi-cloud-upload-outline</v-icon>
					</v-badge>
					<v-icon v-else>mdi-cloud-check-outline</v-icon>
				</v-btn>

				<div class="notification-wrapper">
					<slot name="notification-bell"></slot>
				</div>

				<div class="menu-wrapper">
					<slot name="menu"></slot>
				</div>
			</div>
		</div>

		<!-- Glass Progress Bar -->
		<transition name="fade">
			<div v-if="loadingActive" class="glass-progress-overlay">
				<v-progress-linear
					:model-value="loadingProgress"
					color="primary"
					height="3"
					class="glass-progress-line"
				></v-progress-linear>
			</div>
		</transition>
	</v-app-bar>
</template>

<script>
/* global frappe */
import { useRtl } from "../../composables/useRtl.js";
import posLogo from "../pos/pos.png";
import NavbarInfoGadgets from "./NavbarInfoGadgets.vue";

export default {
	name: "NavbarAppBar",
	components: {
		NavbarInfoGadgets,
	},
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
		};
	},
	mounted() {
		window.addEventListener("resize", this.updateWindowWidth);
	},
	beforeUnmount() {
		window.removeEventListener("resize", this.updateWindowWidth);
	},
	props: {
		posProfile: Object,
		pendingInvoices: Number,
		loadingProgress: Number,
		loadingActive: Boolean,
		loadingMessage: String,
	},
	computed: {
		displayName() {
			if (this.posProfile && this.posProfile.name) return this.posProfile.name;
			if (frappe.session && frappe.session.user_fullname) return frappe.session.user_fullname;
			return "User";
		},
		isMobile() {
			return this.windowWidth < 768;
		},
	},
	methods: {
		updateWindowWidth() {
			this.windowWidth = window.innerWidth;
		},
		getInitials(name) {
			return (name || "U").charAt(0).toUpperCase();
		},
	},
	emits: ["nav-click", "go-desk", "show-offline-invoices"],
};
</script>

<style scoped>
/* Glass Navbar Base */
.pos-navbar-glass {
	background: rgba(15, 23, 42, 0.6) !important; /* Semi-transparent dark */
	backdrop-filter: blur(16px);
	-webkit-backdrop-filter: blur(16px);
	border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
	color: var(--pos-text-primary) !important;
	transition: all 0.3s ease;
}

/* Brand Section */
.pos-navbar-brand-section {
	display: flex;
	align-items: center;
	gap: 16px;
	padding-left: 12px;
}

.glass-icon-btn {
	color: var(--pos-text-secondary);
	border-radius: 12px;
	background: rgba(255, 255, 255, 0.03);
	transition: all 0.2s ease;
}

.glass-icon-btn:hover {
	color: var(--pos-primary);
	background: rgba(255, 255, 255, 0.1);
	transform: translateY(-1px);
}

.brand-logo-wrapper {
	display: flex;
	align-items: center;
	gap: 12px;
	cursor: pointer;
	padding: 4px 8px;
	border-radius: 8px;
	transition: background 0.2s ease;
}

.brand-logo-wrapper:hover {
	background: rgba(255, 255, 255, 0.05);
}

.brand-logo {
	filter: drop-shadow(0 0 8px rgba(56, 189, 248, 0.3));
}

.brand-text {
	display: flex;
	flex-direction: column;
	line-height: 1;
	font-size: 1rem;
}

/* Profile Pill */
.glass-pill {
	background: rgba(255, 255, 255, 0.05);
	border: 1px solid rgba(255, 255, 255, 0.05);
	border-radius: 24px;
	padding: 4px 12px 4px 4px;
	display: flex;
	align-items: center;
	margin-right: 16px;
}

.profile-name {
	max-width: 100px;
	color: var(--pos-text-primary);
}

/* Gadgets Container */
.glass-gadget-container {
	margin-right: 16px;
	padding-right: 16px;
	border-right: 1px solid rgba(255, 255, 255, 0.1);
}

/* Pending Indicator Pulse */
.has-pending {
	color: var(--pos-primary) !important;
	animation: pulse-glow 2s infinite;
}

@keyframes pulse-glow {
	0% { box-shadow: 0 0 0 0 rgba(56, 189, 248, 0.4); }
	70% { box-shadow: 0 0 0 10px rgba(56, 189, 248, 0); }
	100% { box-shadow: 0 0 0 0 rgba(56, 189, 248, 0); }
}

/* Progress Line */
.glass-progress-overlay {
	position: absolute;
	bottom: 0;
	left: 0;
	width: 100%;
}

.glass-progress-line {
	box-shadow: 0 0 10px var(--pos-primary);
}

/* Mobile Tweaks */
.mobile-navbar {
	padding: 0 8px !important;
}

/* RTL Specifics */
.rtl-app-bar .glass-gadget-container {
	border-right: none;
	border-left: 1px solid rgba(255, 255, 255, 0.1);
	margin-right: 0;
	margin-left: 16px;
	padding-right: 0;
	padding-left: 16px;
}

.rtl-app-bar .glass-pill {
	margin-right: 0;
	margin-left: 16px;
	padding: 4px 4px 4px 12px;
}

.rtl-app-bar .v-avatar {
	margin-right: 0 !important;
	margin-left: 8px !important;
}
</style>
