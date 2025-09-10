<template>
	<v-overlay
		:model-value="loading"
		class="d-flex flex-column align-center justify-center fancy-overlay"
		contained
	>
		<div v-for="(value, name) in sources" :key="name" class="mb-4 w-100">
			<div class="d-flex justify-space-between">
				<span class="text-subtitle-2">{{ getLabel(name) }}</span>
				<span v-if="value >= 100" class="text-caption text-success">{{ __("Ready") }}</span>
			</div>
			<v-progress-linear
				:model-value="value"
				height="8"
				color="primary"
				rounded
				class="elegant-progress"
			/>
		</div>
		<div class="mt-4 text-subtitle-1">{{ message }}</div>
	</v-overlay>
</template>

<script>
export default {
	name: "LoadingOverlay",
	props: {
		loading: {
			type: Boolean,
			default: false,
		},
		message: {
			type: String,
			default: "",
		},
		progress: {
			type: Number,
			default: 0,
		},
		sources: {
			type: Object,
			default: () => ({}),
		},
		sourceMessages: {
			type: Object,
			default: () => ({}),
		},
	},
	methods: {
		getLabel(name) {
			return this.sourceMessages[name] || name;
		},
	},
};
</script>

<style scoped>
.fancy-overlay {
	backdrop-filter: blur(2px);
}
.elegant-progress {
	width: 100%;
	max-width: 320px;
}
</style>
