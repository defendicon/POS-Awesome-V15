<template>
	<v-snackbar
		model-value="true"
		v-if="visible"
		class="pos-update-snackbar"
		:location="isRtl ? 'bottom left' : 'bottom right'"
		:timeout="-1"
		color="primary"
		elevation="8"
	>
		<div class="pos-update-message">
			<v-icon size="20" class="mr-2">mdi-alert-decagram</v-icon>
			<div>
				<div class="text-subtitle-2 font-weight-medium">
					{{ __("New version ready") }}
				</div>
				<div class="text-caption text-white text-opacity-80" v-if="label">
					{{ label }}
				</div>
			</div>
		</div>
		<template #actions>
			<v-btn variant="text" color="white" class="mr-2" @click="snooze">
				{{ __("Later") }}
			</v-btn>
			<v-btn variant="elevated" color="white" class="text-primary" @click="reload">
				{{ updateStore.reloading ? __("Updating...") : __("Reload Now") }}
			</v-btn>
		</template>
	</v-snackbar>
</template>

<script>
import { computed, watch, ref } from "vue";
import { useUpdateStore } from "../../stores/updateStore.js";
import { useRtl } from "../../composables/useRtl.js";

export default {
	name: "UpdatePrompt",
	setup() {
		const updateStore = useUpdateStore();
		const { isRtl } = useRtl();
		const visible = ref(false);

		watch(
			() => updateStore.shouldPrompt,
			(shouldShow) => {
				visible.value = shouldShow;
			},
			{ immediate: true },
		);

		const label = computed(() => updateStore.formattedAvailableVersion);

		function reload() {
			updateStore.resetSnooze();
			updateStore.reloadNow();
		}

		function snooze() {
			updateStore.snooze();
			visible.value = false;
		}

		return {
			updateStore,
			visible,
			label,
			reload,
			snooze,
			isRtl,
		};
	},
};
</script>

<style scoped>
.pos-update-snackbar {
	max-width: 360px;
}

.pos-update-message {
	display: flex;
	align-items: center;
	gap: 12px;
}
</style>
