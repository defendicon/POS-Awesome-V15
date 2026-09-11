<template>
	<div class="date-range-filter" role="group" :aria-label="ariaLabel">
		<div class="date-range-filter__dates">
			<div class="date-range-filter__field">
				<label class="date-range-filter__label">
					<v-icon size="16">mdi-calendar-start</v-icon>
					{{ startLabel }}
				</label>
				<VueDatePicker
					v-model="startValue"
					:enable-time-picker="false"
					:max-date="toDate || undefined"
					auto-apply
					teleport
					model-type="yyyy-MM-dd"
					format="dd MMM yyyy"
					:placeholder="inputPlaceholder"
					:aria-label="startLabel"
					class="date-range-filter__input"
				/>
			</div>

			<div class="date-range-filter__direction" aria-hidden="true">
				<v-icon size="18">mdi-arrow-right</v-icon>
			</div>

			<div class="date-range-filter__field">
				<label class="date-range-filter__label">
					<v-icon size="16">mdi-calendar-end</v-icon>
					{{ endLabel }}
				</label>
				<VueDatePicker
					v-model="endValue"
					:enable-time-picker="false"
					:min-date="fromDate || undefined"
					auto-apply
					teleport
					model-type="yyyy-MM-dd"
					format="dd MMM yyyy"
					:placeholder="inputPlaceholder"
					:aria-label="endLabel"
					class="date-range-filter__input"
				/>
			</div>
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
		ariaLabel: { type: String, default: "Date range" },
		startLabel: { type: String, default: "Start date" },
		endLabel: { type: String, default: "End date" },
		inputPlaceholder: { type: String, default: "DD-MM-YYYY" },
		presetLabel: { type: String, default: "Quick date ranges" },
		todayLabel: { type: String, default: "Today" },
		sevenDaysLabel: { type: String, default: "7 days" },
		thirtyDaysLabel: { type: String, default: "30 days" },
		clearLabel: { type: String, default: "Clear" },
	},
	emits: ["update:fromDate", "update:toDate"],
	computed: {
		startValue: {
			get() {
				return this.fromDate || null;
			},
			set(value) {
				this.$emit("update:fromDate", value || "");
			},
		},
		endValue: {
			get() {
				return this.toDate || null;
			},
			set(value) {
				this.$emit("update:toDate", value || "");
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
	min-width: min(100%, 460px);
	align-items: stretch;
	flex-direction: column;
	gap: 7px;
	padding: 8px 10px 7px;
	border: 1px solid rgba(148, 163, 184, 0.32);
	border-radius: 12px;
	background: color-mix(in srgb, var(--pos-surface-raised) 94%, transparent);
}

.date-range-filter__dates {
	display: flex;
	align-items: center;
	gap: 8px;
}

.date-range-filter__field {
	min-width: 0;
	flex: 1 1 0;
	padding: 5px 8px 4px;
	border: 1px solid rgba(148, 163, 184, 0.26);
	border-radius: 9px;
	background: rgba(var(--v-theme-surface), 0.5);
}

.date-range-filter__field:focus-within {
	border-color: rgb(var(--v-theme-primary));
	box-shadow: 0 0 0 2px rgba(var(--v-theme-primary), 0.1);
}

.date-range-filter__label {
	display: flex;
	align-items: center;
	gap: 5px;
	color: var(--pos-text-secondary);
	font-size: 0.67rem;
	font-weight: 800;
	letter-spacing: 0.07em;
	line-height: 1.2;
	text-transform: uppercase;
}

.date-range-filter__label :deep(.v-icon),
.date-range-filter__direction {
	color: rgb(var(--v-theme-primary));
}

.date-range-filter__direction {
	display: grid;
	width: 22px;
	flex: 0 0 22px;
	place-items: center;
}

.date-range-filter__input {
	min-width: 0;
	flex: 1;
}

.date-range-filter__presets {
	display: flex;
	align-items: center;
	gap: 2px;
	min-height: 24px;
}

:deep(.dp__main) {
	font-family: inherit;
}

:deep(.dp__input) {
	min-height: 25px;
	padding: 2px 26px 0 0;
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
	.date-range-filter__dates {
		align-items: stretch;
		flex-direction: column;
	}

	.date-range-filter__direction {
		width: 100%;
		min-height: 14px;
		transform: rotate(90deg);
	}
}
</style>
