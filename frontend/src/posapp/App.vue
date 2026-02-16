<template>
	<router-view v-slot="{ Component, route }">
		<component :is="layoutComponent" :key="layoutName">
			<transition name="fade-page" mode="out-in">
				<component :is="Component" class="mx-4 md-4" />
			</transition>
		</component>
	</router-view>
</template>

<script setup>
import { computed, defineAsyncComponent } from "vue";
import { useRoute } from "vue-router";

const route = useRoute();

const DefaultLayout = defineAsyncComponent(() => import("./layouts/DefaultLayout.vue"));
const CustomerDisplayLayout = defineAsyncComponent(
	() => import("./layouts/CustomerDisplayLayout.vue"),
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
</style>
