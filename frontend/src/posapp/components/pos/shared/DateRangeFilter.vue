<template>
	<div class="date-range-filter">
		<div class="date-range-filter__picker">
			<v-icon size="18" class="date-range-filter__icon">mdi-calendar-range-outline</v-icon>
			<VueDatePicker
				v-model="rangeValue"
				range
				:partial-range="false"
				:enable-time-picker="false"
				auto-apply
				teleport
				model-type="yyyy-MM-dd"
				format="dd MMM yyyy"
				:placeholder="placeholder"
				:aria-label="ariaLabel"
				class="date-range-filter__input"
			/>
		</div>

		<div class="date-range-filter__presets" :aria-label="presetLabel">
			<v-btn
				v-for="preset in presets"
				:key="preset.key"
				size="x-small"
				:color="isPresetActive(preset.days) ? color : undefined"
				:variant="isPresetActive(preset.days) ? 'flat' : 'text'"
				@click="applyPreset(preset.days)"
			>
				{{ preset.label }}
			</v-btn>
			<v-btn
				v-if="fromDate || toDate"
				size="x-small"
				variant="text"
				color="error"
				prepend-icon="mdi-close-circle-outline"
				@click="clearRange"
			>
				{{ clearLabel }}
			</v-btn>
		</div>
	</div>
</template>

<script>
import VueDatePicker from "@vuepic/vue-datepicker";

function formatLocalDate(date) {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function presetRange(days, today = new Date()) {
	const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
	const start = new Date(end);
	start.setDate(start.getDate() - Math.max(Number(days) - 1, 0));
	return [formatLocalDate(start), formatLocalDate(end)];
}

export { formatLocalDate, presetRange };

export default {
	name: "DateRangeFilter",
	components: { VueDatePicker },
	props: {
		fromDate: { type: String, default: "" },
		toDate: { type: String, default: "" },
		color: { type: String, default: "primary" },
		placeholder: { type: String, default: "Select date range" },
		ariaLabel: { type: String, default: "Date range" },
		presetLabel: { type: String, default: "Quick date ranges" },
		todayLabel: { type: String, default: "Today" },
		sevenDaysLabel: { type: String, default: "7 days" },
		thirtyDaysLabel: { type: String, default: "30 days" },
		clearLabel: { type: String, default: "Clear" },
	},
	emits: ["update:fromDate", "update:toDate"],
	computed: {
		rangeValue: {
			get() {
				return this.fromDate || this.toDate
					? [this.fromDate || this.toDate, this.toDate || this.fromDate]
					: null;
			},
			set(value) {
				const range = Array.isArray(value) ? value : [];
				this.$emit("update:fromDate", range[0] || "");
				this.$emit("update:toDate", range[1] || "");
			},
		},
		presets() {
			return [
				{ key: "today", days: 1, label: this.todayLabel },
				{ key: "seven-days", days: 7, label: this.sevenDaysLabel },
				{ key: "thirty-days", days: 30, label: this.thirtyDaysLabel },
			];
		},
	},
	methods: {
		applyPreset(days) {
			const [fromDate, toDate] = presetRange(days);
			this.$emit("update:fromDate", fromDate);
			this.$emit("update:toDate", toDate);
		},
		clearRange() {
			this.$emit("update:fromDate", "");
			this.$emit("update:toDate", "");
		},
		isPresetActive(days) {
			const [fromDate, toDate] = presetRange(days);
			return this.fromDate === fromDate && this.toDate === toDate;
		},
	},
};
</script>

<style scoped>
.date-range-filter {
	display: flex;
	min-width: min(100%, 320px);
	min-height: 40px;
	align-items: center;
	gap: 8px;
	padding: 5px 8px 5px 12px;
	border: 1px solid rgba(148, 163, 184, 0.32);
	border-radius: 12px;
	background: color-mix(in srgb, var(--pos-surface-raised) 94%, transparent);
}

.date-range-filter:focus-within {
	border-color: rgb(var(--v-theme-primary));
	box-shadow: 0 0 0 2px rgba(var(--v-theme-primary), 0.12);
}

.date-range-filter__picker {
	display: flex;
	min-width: 180px;
	flex: 1 1 220px;
	align-items: center;
	gap: 7px;
}

.date-range-filter__icon {
	color: rgb(var(--v-theme-primary));
}

.date-range-filter__input {
	min-width: 0;
	flex: 1;
}

.date-range-filter__presets {
	display: flex;
	flex: 0 0 auto;
	align-items: center;
	gap: 2px;
	padding-left: 6px;
	border-left: 1px solid rgba(148, 163, 184, 0.24);
}

:deep(.dp__main) {
	font-family: inherit;
}

:deep(.dp__input) {
	min-height: 28px;
	padding: 2px 30px 2px 4px;
	border: 0;
	background: transparent;
	color: var(--pos-text-primary);
	font-size: 0.82rem;
	font-weight: 650;
	box-shadow: none;
}

:deep(.dp__input_icon) {
	display: none;
}

:deep(.dp__clear_icon) {
	right: 4px;
	color: var(--pos-text-secondary);
}

@media (max-width: 720px) {
	.date-range-filter {
		align-items: stretch;
		flex-direction: column;
		padding: 8px 10px;
	}

	.date-range-filter__picker {
		width: 100%;
		flex-basis: auto;
	}

	.date-range-filter__presets {
		justify-content: flex-start;
		padding-top: 5px;
		padding-left: 0;
		border-top: 1px solid rgba(148, 163, 184, 0.24);
		border-left: 0;
	}
}
</style>
