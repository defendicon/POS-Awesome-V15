<template>
	<v-dialog
		:model-value="modelValue"
		max-width="330"
		@update:model-value="$emit('update:modelValue', $event)"
	>
		<v-card>
			<v-card-title class="text-h5">
				<span class="text-h5 text-primary">{{ __("Cancel Sale ?") }}</span>
			</v-card-title>
			<v-card-text>
				This would cancel and delete the current sale. To save it as Draft, click the "Save and Clear"
				instead.
			</v-card-text>
			<v-card-actions>
				<v-spacer></v-spacer>
				<v-btn color="error" @click="onConfirm">{{ __("Yes, Cancel sale") }}</v-btn>
				<v-btn color="warning" @click="$emit('update:modelValue', false)">{{ __("Back") }}</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script>
export default {
	props: {
		modelValue: Boolean,
	},
	emits: ["update:modelValue", "confirm"],
	methods: {
		onConfirm() {
			this.$emit("confirm");
		},
	},
};
</script>
