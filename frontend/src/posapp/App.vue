<template>
	<template v-if="standaloneCustomerDisplayMode">
		<CustomerDisplayLayout>
			<transition name="fade-page" mode="out-in">
				<CustomerDisplay class="app-route-view" />
			</transition>
		</CustomerDisplayLayout>
	</template>
	<router-view v-else v-slot="{ Component, route }">
		<component :is="layoutComponent" :key="layoutName">
			<transition name="fade-page" mode="out-in">
				<component :is="Component" class="app-route-view" />
			</transition>
		</component>
	</router-view>
</template>

<script setup>
import { computed, defineAsyncComponent } from "vue";
import { useRoute } from "vue-router";
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

.app-route-view {
	width: 100%;
	min-width: 0;
	min-height: 0;
}
</style>
