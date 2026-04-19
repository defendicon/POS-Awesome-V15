<template>
	<v-container class="offline-route-unavailable" fluid>
		<v-row justify="center">
			<v-col cols="12" md="8" lg="6">
				<v-card class="offline-route-unavailable__card pos-themed-card" elevation="2">
					<v-card-title class="text-h6">
						{{ __("Page unavailable offline") }}
					</v-card-title>
					<v-card-text>
						<p class="mb-3">
							{{ __("This POS page could not be opened offline because its code was not cached on this terminal yet.") }}
						</p>
						<p class="mb-3">
							{{ __("Reconnect and open this page once while online, then offline refreshes will be able to restore it.") }}
						</p>
						<p v-if="targetRoute" class="offline-route-unavailable__target">
							{{ __("Requested route: {0}", [targetRoute]) }}
						</p>
					</v-card-text>
					<v-card-actions class="px-4 pb-4">
						<v-btn color="primary" variant="flat" @click="retryRoute">
							{{ __("Retry route") }}
						</v-btn>
						<v-btn variant="text" @click="goToPosHome">
							{{ __("Open POS home") }}
						</v-btn>
					</v-card-actions>
				</v-card>
			</v-col>
		</v-row>
	</v-container>
</template>

<script setup>
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";

const route = useRoute();
const router = useRouter();
const __ =
	typeof window !== "undefined" && typeof window.__ === "function"
		? window.__
		: (value, args = []) =>
				args.length
					? value.replace(/\{(\d+)\}/g, (_, index) => String(args[index] ?? ""))
					: value;

const targetRoute = computed(() => {
	const rawTarget = route.query.target;
	return typeof rawTarget === "string" && rawTarget.trim() ? rawTarget : "/pos";
});

function retryRoute() {
	void router.replace(targetRoute.value);
}

function goToPosHome() {
	void router.replace("/pos");
}
</script>

<style scoped>
.offline-route-unavailable {
	padding-top: 24px;
	padding-bottom: 24px;
}

.offline-route-unavailable__card {
	border-radius: 18px;
}

.offline-route-unavailable__target {
	font-weight: 600;
	word-break: break-word;
}
</style>
