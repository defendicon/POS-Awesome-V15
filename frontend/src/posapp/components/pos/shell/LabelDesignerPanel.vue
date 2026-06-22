<template>
	<div class="panel-root">
		<div class="panel-header px-3 py-2">
			<strong>{{ __("Properties") }}</strong>
		</div>

		<div v-if="!obj" class="panel-empty px-3 py-4 text-medium-emphasis text-caption">
			{{ __("Select an object on the canvas") }}
		</div>

		<template v-else>
			<div class="panel-section px-3 py-2">
				<div class="text-caption font-weight-bold mb-1">{{ __("Position (mm)") }}</div>
				<div class="d-flex ga-2">
					<v-text-field v-model.number="obj.x" :label="__('X')" type="number" hide-details density="compact" variant="outlined" @update:modelValue="onChange"></v-text-field>
					<v-text-field v-model.number="obj.y" :label="__('Y')" type="number" hide-details density="compact" variant="outlined" @update:modelValue="onChange"></v-text-field>
				</div>
			</div>

			<div class="panel-section px-3 py-2">
				<div class="text-caption font-weight-bold mb-1">{{ __("Size (mm)") }}</div>
				<div class="d-flex ga-2">
					<v-text-field v-model.number="obj.width" :label="__('W')" type="number" hide-details density="compact" variant="outlined" :min="3" @update:modelValue="onChange"></v-text-field>
					<v-text-field v-model.number="obj.height" :label="__('H')" type="number" hide-details density="compact" variant="outlined" :min="3" @update:modelValue="onChange"></v-text-field>
				</div>
			</div>

			<div class="panel-section px-3 py-2">
				<div class="d-flex ga-2 align-center">
					<v-text-field v-model.number="obj.rotation" :label="__('Rotation')" type="number" hide-details density="compact" variant="outlined" suffix="°" @update:modelValue="onChange" class="flex-grow-1"></v-text-field>
					<v-text-field v-model.number="obj.zIndex" :label="__('Z')" type="number" hide-details density="compact" variant="outlined" @update:modelValue="onChange" class="flex-shrink-0" style="width:60px"></v-text-field>
				</div>
			</div>

			<v-divider></v-divider>

			<template v-if="obj.type === 'text'">
				<div class="panel-section px-3 py-2">
					<div class="text-caption font-weight-bold mb-1">{{ __("Text Content") }}</div>
					<v-textarea v-model="obj.content" hide-details density="compact" variant="outlined" rows="2" @update:modelValue="onChange" class="mb-1"></v-textarea>
					<div class="text-caption text-medium-emphasis">{{ __("Use {variable} placeholders") }}</div>
				</div>
				<div class="panel-section px-3 py-2">
					<v-select v-model="obj.fontFamily" :items="['Arial','Helvetica','Times New Roman','Courier New','Verdana','Georgia']" :label="__('Font')" hide-details density="compact" variant="outlined" @update:modelValue="onChange"></v-select>
				</div>
				<div class="panel-section px-3 py-2">
					<div class="d-flex ga-2">
						<v-text-field v-model.number="obj.fontSize" :label="__('Size (mm)')" type="number" hide-details density="compact" variant="outlined" :min="1" :max="50" @update:modelValue="onChange" class="flex-grow-1"></v-text-field>
						<v-btn-toggle v-model="textAlignVal" density="compact" variant="outlined" @update:modelValue="onTextAlignChange" mandatory class="flex-shrink-0">
							<v-btn value="left" icon="mdi-format-align-left" size="small"></v-btn>
							<v-btn value="center" icon="mdi-format-align-center" size="small"></v-btn>
							<v-btn value="right" icon="mdi-format-align-right" size="small"></v-btn>
						</v-btn-toggle>
					</div>
				</div>
				<div class="panel-section px-3 py-2">
					<div class="d-flex ga-2">
						<v-checkbox v-model="obj.fontBold" :label="__('Bold')" hide-details density="compact" @update:modelValue="onChange"></v-checkbox>
						<v-checkbox v-model="obj.fontItalic" :label="__('Italic')" hide-details density="compact" @update:modelValue="onChange"></v-checkbox>
						<v-checkbox v-model="obj.fontUnderline" :label="__('Underline')" hide-details density="compact" @update:modelValue="onChange"></v-checkbox>
					</div>
				</div>
				<div v-if="hasDatePlaceholder" class="panel-section px-3 py-2">
					<v-select v-model="obj.dateFormat" :items="['YYYY-MM-DD','DD/MM/YYYY','MM/DD/YYYY','DD.MM.YYYY','DD-MM-YYYY','YYYY/MM/DD']" :label="__('Date Format')" hide-details density="compact" variant="outlined" @update:modelValue="onChange"></v-select>
				</div>
				<div class="panel-section px-3 py-2">
					<div class="d-flex ga-2 align-center">
						<span class="text-caption mr-2">{{ __("Color") }}</span>
						<input type="color" :value="obj.color || '#000000'" @input="onColorChange($event, 'color')" class="color-picker" />
					</div>
				</div>
			</template>

			<template v-else-if="obj.type === 'barcode'">
				<div class="panel-section px-3 py-2">
					<div class="text-caption font-weight-bold mb-1">{{ __("Barcode Data") }}</div>
					<v-text-field v-model="obj.content" hide-details density="compact" variant="outlined" @update:modelValue="onChange"></v-text-field>
					<div class="text-caption text-medium-emphasis">{{ __("Use {barcode} for item barcode") }}</div>
				</div>
				<div class="panel-section px-3 py-2">
					<v-select v-model="obj.symbology" :items="['CODE128','EAN13','EAN8','UPC','ITF14','ITF','GS1_128','CODE39','CODABAR']" :label="__('Symbology')" hide-details density="compact" variant="outlined" @update:modelValue="onChange"></v-select>
				</div>
				<div class="panel-section px-3 py-2">
					<v-checkbox v-model="obj.humanReadable" :label="__('Show human-readable')" hide-details density="compact" @update:modelValue="onChange"></v-checkbox>
				</div>
			</template>

			<template v-else-if="obj.type === 'shape'">
				<div class="panel-section px-3 py-2">
					<v-select v-model="obj.shapeType" :items="[{title:'Rectangle',value:'rect'},{title:'Ellipse',value:'ellipse'}]" item-title="title" item-value="value" :label="__('Shape')" hide-details density="compact" variant="outlined" @update:modelValue="onChange"></v-select>
				</div>
				<div class="panel-section px-3 py-2">
					<div class="d-flex ga-2 align-center">
						<span class="text-caption mr-2">{{ __("Fill") }}</span>
						<input type="color" :value="obj.color || '#transparent'" @input="onColorChange($event, 'color')" class="color-picker" />
						<span class="text-caption mr-2 ml-2">{{ __("Border") }}</span>
						<input type="color" :value="obj.borderColor || '#000000'" @input="onColorChange($event, 'borderColor')" class="color-picker" />
					</div>
				</div>
				<div class="panel-section px-3 py-2">
					<v-text-field v-model.number="obj.borderWidth" :label="__('Border Width (mm)')" type="number" hide-details density="compact" variant="outlined" :min="0" :max="5" step="0.1" @update:modelValue="onChange"></v-text-field>
				</div>
			</template>

			<template v-else-if="obj.type === 'line'">
				<div class="panel-section px-3 py-2">
					<v-select v-model="obj.lineDirection" :items="[{title:'Horizontal',value:'horizontal'},{title:'Vertical',value:'vertical'}]" item-title="title" item-value="value" :label="__('Direction')" hide-details density="compact" variant="outlined" @update:modelValue="onChange"></v-select>
				</div>
				<div class="panel-section px-3 py-2">
					<div class="d-flex ga-2 align-center">
						<span class="text-caption mr-2">{{ __("Color") }}</span>
						<input type="color" :value="obj.borderColor || '#000000'" @input="onColorChange($event, 'borderColor')" class="color-picker" />
					</div>
				</div>
				<div class="panel-section px-3 py-2">
					<v-text-field v-model.number="obj.borderWidth" :label="__('Thickness (mm)')" type="number" hide-details density="compact" variant="outlined" :min="0.1" :max="5" step="0.1" @update:modelValue="onChange"></v-text-field>
				</div>
			</template>

			<template v-else-if="obj.type === 'image'">
				<div class="panel-section px-3 py-2">
					<v-btn variant="outlined" block @click="$emit('uploadImage')">
						<v-icon start>mdi-upload</v-icon>
						{{ __("Upload Image") }}
					</v-btn>
				</div>
			</template>

			<v-divider></v-divider>

			<div class="panel-section px-3 py-2">
				<v-text-field v-model="obj.condition" :label="__('Show condition')" hide-details density="compact" variant="outlined" placeholder="{price} > 0" @update:modelValue="onChange" class="mb-1"></v-text-field>
				<div class="text-caption text-medium-emphasis">{{ __("Leave empty to always show") }}</div>
			</div>
		</template>
	</div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { LabelObject } from "../../../composables/pos/items/useLabelDesigner";

declare const __: (_str: string, _args?: any[]) => string;

const props = defineProps<{
	object: LabelObject | null;
}>();

const emit = defineEmits<{
	(e: "change", id: string, updates: Partial<LabelObject>): void;
	(e: "uploadImage"): void;
}>();

const obj = ref<LabelObject | null>(null);

const textAlignVal = ref<string>("left");

const hasDatePlaceholder = computed(() => {
	if (!obj.value) return false;
	const c = obj.value.content || "";
	return /\{date(?::[^}]*)?\}/.test(c) || c.includes("{time}");
});

watch(
	() => props.object,
	(newObj) => {
		if (newObj) {
			obj.value = JSON.parse(JSON.stringify(newObj));
			textAlignVal.value = newObj.textAlign || "left";
		} else {
			obj.value = null;
		}
	},
	{ immediate: true, deep: true },
);

const onChange = () => {
	if (!obj.value || !props.object) return;
	emit("change", props.object.id, {
		x: obj.value.x,
		y: obj.value.y,
		width: obj.value.width,
		height: obj.value.height,
		rotation: obj.value.rotation,
		zIndex: obj.value.zIndex,
		content: obj.value.content,
		fontFamily: obj.value.fontFamily,
		fontSize: obj.value.fontSize,
		fontBold: obj.value.fontBold,
		fontItalic: obj.value.fontItalic,
		fontUnderline: obj.value.fontUnderline,
		textAlign: obj.value.textAlign,
		color: obj.value.color,
		backgroundColor: obj.value.backgroundColor,
		borderColor: obj.value.borderColor,
		borderWidth: obj.value.borderWidth,
		symbology: obj.value.symbology,
		humanReadable: obj.value.humanReadable,
		shapeType: obj.value.shapeType,
		lineDirection: obj.value.lineDirection,
		condition: obj.value.condition,
		dateFormat: obj.value.dateFormat,
	});
};

const onColorChange = (e: Event, field: string) => {
	if (!obj.value) return;
	const target = e.target as HTMLInputElement;
	(obj.value as any)[field] = target.value;
	onChange();
};

const onTextAlignChange = (val: string) => {
	if (!obj.value) return;
	obj.value.textAlign = val as "left" | "center" | "right";
	onChange();
};
</script>

<style scoped>
.panel-root {
	height: 100%;
	overflow-y: auto;
	border-left: 1px solid var(--pos-border-light, #e0e0e0);
	background: var(--pos-surface, #fff);
}

.panel-header {
	border-bottom: 1px solid var(--pos-border-light, #e0e0e0);
	background: var(--pos-surface-variant, #fafafa);
}

.panel-section + .panel-section {
	border-top: none;
}

.panel-empty {
	color: #999;
	font-size: 13px;
}

.color-picker {
	width: 30px;
	height: 30px;
	border: 1px solid #ccc;
	border-radius: 4px;
	padding: 0;
	cursor: pointer;
}
</style>
