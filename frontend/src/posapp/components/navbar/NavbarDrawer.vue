<template>
        <v-navigation-drawer
                v-model="drawerOpen"
                rail
                width="72"
		:class="['drawer-custom', { 'drawer-visible': drawerOpen }, rtlClasses]"
		@mouseleave="handleMouseLeave"
		temporary
		:location="isRtl ? 'right' : 'left'"
		:scrim="scrimColor"
	>
                <div class="drawer-header-mini">
                        <v-avatar size="40">
                                <v-img :src="companyImg" alt="Company logo" />
                        </v-avatar>
                </div>

                <v-divider />

                <v-list density="compact" nav v-model:selected="activeItem" selected-class="active-item">
                        <v-tooltip
                                v-for="(item, index) in items"
                                :key="item.text"
                                location="right"
                                :text="item.text"
                                open-delay="150"
                        >
                                <template #activator="{ props }">
                                        <v-list-item
                                                v-bind="props"
                                                :value="index"
                                                @click="changePage(item.text)"
                                                class="drawer-item"
                                        >
                                                <template #prepend>
                                                        <v-icon class="drawer-icon">{{ item.icon }}</v-icon>
                                                </template>
                                        </v-list-item>
                                </template>
                        </v-tooltip>
                </v-list>
		<!-- Sport section, hidden by default -->
		<div v-if="showSport">
			<!-- Sport content goes here -->
		</div>
	</v-navigation-drawer>
</template>

<script>
import { useRtl } from "../../composables/useRtl.js";

export default {
	name: "NavbarDrawer",
	setup() {
		const { isRtl, rtlStyles, rtlClasses } = useRtl();
		return {
			isRtl,
			rtlStyles,
			rtlClasses,
		};
	},
	props: {
		drawer: Boolean,
		company: String,
		companyImg: String,
		items: Array,
		item: Number,
		isDark: Boolean,
	},
	data() {
                return {
                        drawerOpen: this.drawer,
			activeItem: this.item,
			showSport: true,
		};
	},
	computed: {
		scrimColor() {
			// Use an opaque background in light mode so that
			// underlying content doesn't show through the drawer
			return this.isDark ? true : "rgba(255,255,255,1)";
		},
	},
	watch: {
                drawer(val) {
                        this.drawerOpen = val;
                },
		drawerOpen(val) {
			document.body.style.overflow = val ? "hidden" : "";
			this.$emit("update:drawer", val);
		},
		item(val) {
			this.activeItem = val;
		},
		activeItem(val) {
			this.$emit("update:item", val);
		},
	},
	mounted() {},
	methods: {
		handleMouseLeave() {
			if (!this.drawerOpen) return;
                        clearTimeout(this._closeTimeout);
                        this._closeTimeout = setTimeout(() => {
                                this.drawerOpen = false;
                        }, 250);
		},
		changePage(key) {
			this.$emit("change-page", key);
			// Close drawer after selection
			if (window.innerWidth < 1024) {
				this.closeDrawer();
			}
		},
		closeDrawer() {
                        this.drawerOpen = false;
                },
        },
};
</script>

<style scoped>
/* Custom styling for the navigation drawer */
.drawer-custom {
	background-color: var(--surface-secondary, #ffffff);
	transition: var(--transition-normal, all 0.3s ease);
	z-index: 1005 !important; /* Higher than navbar but lower than dialogs */
}

/* Styling for the header section of the mini navigation drawer */
.drawer-header-mini {
        display: flex;
        justify-content: center;
        align-items: center;
        height: 64px;
        background: linear-gradient(135deg, #f8f9fa 0%, #e3f2fd 100%);
        border-bottom: 1px solid rgba(0, 0, 0, 0.1);
}

/* Styling for icons within the navigation drawer list items */
.drawer-icon {
        font-size: 24px;
        color: var(--pos-primary);
}

/* Styling for the navigation drawer list items */
.drawer-item {
        justify-content: center;
        padding-inline: 0;
        min-height: 56px;
}

/* Hover effect for all list items in the navigation drawer */
.v-list-item:hover {
	background-color: rgba(25, 118, 210, 0.08) !important;
}

/* Styling for the actively selected list item in the navigation drawer */
.active-item {
	background-color: rgba(25, 118, 210, 0.12) !important;
	border-right: 3px solid #1976d2;
}

/* Theme-aware drawer styling */
.drawer-custom {
	background-color: var(--pos-navbar-bg) !important;
	color: var(--pos-text-primary) !important;
}

.drawer-header-mini {
        background: var(--pos-navbar-bg) !important;
        border-bottom: 1px solid var(--pos-border);
}

:deep([data-theme="dark"]) .drawer-icon,
:deep(.v-theme--dark) .drawer-icon {
        color: var(--pos-primary) !important;
        font-size: 24px;
}

:deep([data-theme="dark"]) .v-list-item:hover,
:deep(.v-theme--dark) .v-list-item:hover {
	background-color: rgba(144, 202, 249, 0.08) !important;
}

:deep([data-theme="dark"]) .active-item,
:deep(.v-theme--dark) .active-item {
	background-color: rgba(144, 202, 249, 0.12) !important;
	border-right: 3px solid #90caf9;
}

:deep([data-theme="dark"]) .v-divider,
:deep(.v-theme--dark) .v-divider {
	border-color: rgba(255, 255, 255, 0.12) !important;
}

/* Hide drawer by default, show only when activated */
.drawer-custom {
	display: none !important;
}
.drawer-custom.drawer-visible {
	display: block !important;
	width: 72px !important;
}

/* Responsive adjustments for width and dark theme */
@media (max-width: 1024px) {
	.drawer-custom.drawer-visible {
		background-color: var(--pos-navbar-bg) !important;
	}
}
</style>
