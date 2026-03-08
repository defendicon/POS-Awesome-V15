<template>
	<template v-if="standaloneCustomerDisplayMode">
		<CustomerDisplayLayout>
			<transition name="fade-page" mode="out-in">
				<CustomerDisplay class="mx-4 md-4" />
			</transition>
		</CustomerDisplayLayout>
	</template>
	<router-view v-else v-slot="{ Component, route }">
		<component :is="layoutComponent" :key="layoutName">
			<transition name="fade-page" mode="out-in">
				<component :is="Component" class="mx-4 md-4" />
			</transition>
		</component>
	</router-view>
	<KeyboardShortcutsDialog />
</template>

<script setup>
import { computed, defineAsyncComponent, onMounted, onBeforeUnmount } from "vue";
import { useRoute } from "vue-router";
import { useUIStore } from "./stores/uiStore";
import {
	isStandaloneCustomerDisplayMode,
} from "./utils/customerDisplay";

const route = useRoute();

const DefaultLayout = defineAsyncComponent(() => import("./layouts/DefaultLayout.vue"));
const CustomerDisplayLayout = defineAsyncComponent(
	() => import("./layouts/CustomerDisplayLayout.vue"),
);
const CustomerDisplay = defineAsyncComponent(
	() => import("./components/customer_display/CustomerDisplay.vue"),
);
const KeyboardShortcutsDialog = defineAsyncComponent(
	() => import("./components/ui/KeyboardShortcutsDialog.vue"),
);
const uiStore = useUIStore();

const standaloneCustomerDisplayMode = computed(() =>
	isStandaloneCustomerDisplayMode(),
);

const layoutComponent = computed(() => {
	const layout = route.meta.layout || "default";
	switch (layout) {
		case "default":
			return DefaultLayout;
		case "display":
			return CustomerDisplayLayout;
		default:
			return DefaultLayout;
	}
});

const layoutName = computed(() => route.meta.layout || "default");

const isEditableElement = (target) => {
	if (!(target instanceof HTMLElement)) return false;
	if (target.isContentEditable) return true;
	const tag = target.tagName.toLowerCase();
	return ["input", "textarea", "select"].includes(tag);
};

const handleGlobalShortcuts = (event) => {
	if (isEditableElement(event.target)) {
		return;
	}

	const key = String(event.key || "").toLowerCase();
	const isQuestionMark = key === "?" || (event.shiftKey && key === "/");
	if (event.key === "F1" || isQuestionMark) {
		event.preventDefault();
		uiStore.toggleShortcutHelp();
		return;
	}

	if ((event.ctrlKey || event.metaKey) && event.shiftKey && key === "d") {
		event.preventDefault();
		uiStore.toggleDensityMode();
		return;
	}

	if ((event.ctrlKey || event.metaKey) && event.shiftKey && key === "l") {
		event.preventDefault();
		uiStore.cycleLayoutProfile();
	}
};

onMounted(() => {
	window.addEventListener("keydown", handleGlobalShortcuts);
});

onBeforeUnmount(() => {
	window.removeEventListener("keydown", handleGlobalShortcuts);
});
</script>

<style>
/* Page Transition Styles - Global or moved here */
.fade-page-enter-active,
.fade-page-leave-active {
	transition:
		opacity 0.2s ease,
		transform 0.2s ease;
}

.fade-page-enter-from,
.fade-page-leave-to {
	opacity: 0;
	transform: translateY(5px);
}
</style>
