<template>
	<v-navigation-drawer
		v-model="drawerOpen"
		:rail="mini"
		expand-on-hover
		width="220"
		:class="['drawer-custom', { 'drawer-visible': drawerOpen }, rtlClasses]"
		@mouseleave="handleMouseLeave"
		temporary
		:location="isRtl ? 'right' : 'left'"
		:scrim="scrimColor"
	>
		<div v-if="!mini" class="drawer-header">
			<v-avatar size="40">
				<v-img :src="companyImg" alt="Company logo" />
			</v-avatar>
			<span class="drawer-company">{{ company }}</span>
		</div>
		<div v-else class="drawer-header-mini">
			<v-avatar size="40">
				<v-img :src="companyImg" alt="Company logo" />
			</v-avatar>
		</div>

		<v-divider />

		<v-list density="compact" nav v-model:selected="activeItem" selected-class="active-item">
			<v-list-item
				v-for="(item, index) in items"
				:key="item.text"
				:value="index"
				:to="item.to"
				@click="handleItemClick"
				class="drawer-item"
				active-class="active-item"
			>
				<template v-slot:prepend>
					<v-icon class="drawer-icon">{{ item.icon }}</v-icon>
				</template>
				<v-list-item-title class="drawer-item-title">{{ item.text }}</v-list-item-title>
			</v-list-item>
		</v-list>
		<!-- Sport section, hidden by default -->
		<div v-if="showSport">
			<!-- Sport content goes here -->
		</div>
	</v-navigation-drawer>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { useRtl } from "../../composables/core/useRtl";

defineOptions({
	name: "NavbarDrawer",
});

const props = defineProps({
	drawer: Boolean,
	company: String,
	companyImg: String,
	items: Array,
	item: Number,
	isDark: Boolean,
});

const emit = defineEmits(["update:drawer", "update:item"]);
const { isRtl, rtlClasses } = useRtl();

const mini = ref(false);
const drawerOpen = ref(props.drawer);
const activeItem = ref(props.item);
const showSport = ref(true);
let closeTimeout = null;

const scrimColor = computed(() => {
	// Use an opaque background in light mode so that
	// underlying content doesn't show through the drawer
	return props.isDark ? true : "rgba(255,255,255,1)";
});

watch(
	() => props.drawer,
	(val) => {
		drawerOpen.value = val;
		if (val) {
			mini.value = false;
		}
	},
);

watch(drawerOpen, (val) => {
	document.body.style.overflow = val ? "hidden" : "";
	emit("update:drawer", val);
});

watch(
	() => props.item,
	(val) => {
		activeItem.value = val;
	},
);

watch(activeItem, (val) => {
	emit("update:item", val);
});

function handleMouseLeave() {
	if (!drawerOpen.value) return;
	clearTimeout(closeTimeout);
	closeTimeout = setTimeout(() => {
		drawerOpen.value = false;
		mini.value = true;
	}, 250);
}

function handleItemClick() {
	// Close drawer after selection if mobile
	if (window.innerWidth < 1024) {
		closeDrawer();
	}
}

function closeDrawer() {
	drawerOpen.value = false;
	mini.value = true;
}
</script>

<style scoped>
/* Custom styling for the navigation drawer */
.drawer-custom {
	background-color: var(--surface-secondary, #ffffff);
	transition: var(--transition-normal, all 0.3s ease);
	z-index: 1005 !important; /* Higher than navbar but lower than dialogs */
}

/* Styling for the header section of the expanded navigation drawer */
.drawer-header {
	display: flex;
	align-items: center;
	height: 64px;
	padding: 0 16px;
	background: linear-gradient(135deg, #f8f9fa 0%, #e3f2fd 100%);
	border-bottom: 1px solid rgba(0, 0, 0, 0.1);
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

/* Styling for the company name text within the drawer header */
.drawer-company {
	margin-left: 12px;
	flex: 1;
	font-weight: 500;
	font-size: 1rem;
	color: #0097a7;
	font-family: "Roboto", sans-serif;
}

/* Styling for icons within the navigation drawer list items */
.drawer-icon {
	font-size: 24px;
	color: var(--pos-primary);
}

/* Styling for the title text of navigation drawer list items */
.drawer-item-title {
	margin-left: 8px;
	font-weight: 500;
	font-size: 0.95rem;
	color: var(--pos-text-primary) !important;
	font-family: "Roboto", sans-serif;
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

.drawer-header,
.drawer-header-mini {
	background: var(--pos-navbar-bg) !important;
	border-bottom: 1px solid var(--pos-border);
}

:deep([data-theme="dark"]) .drawer-item-title,
:deep(.v-theme--dark) .drawer-item-title {
	color: var(--pos-text-primary) !important;
	font-weight: 500;
	font-size: 0.95rem;
	font-family: "Roboto", sans-serif;
}

:deep([data-theme="dark"]) .drawer-company,
:deep(.v-theme--dark) .drawer-company {
	color: var(--text-primary, #ffffff) !important;
	font-weight: 500;
	font-size: 1rem;
	font-family: "Roboto", sans-serif;
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
}

/* Responsive adjustments for width and dark theme */
@media (max-width: 900px) and (orientation: landscape) {
	.drawer-custom.drawer-visible {
		width: 180px !important;
	}
}

@media (min-width: 601px) and (max-width: 1024px) {
	.drawer-custom.drawer-visible {
		width: 240px !important;
	}
}

@media (min-width: 1025px) {
	.drawer-custom.drawer-visible {
		width: 300px !important;
	}
}

@media (max-width: 1024px) {
	.drawer-custom.drawer-visible {
		background-color: var(--pos-navbar-bg) !important;
	}
}
</style>
