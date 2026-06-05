<template>
	<v-dialog v-model="visible" max-width="600">
		<v-card>
			<v-card-title class="bg-primary text-white d-flex align-center">
				<span class="text-h6">{{ __("Label Template Library") }}</span>
				<v-spacer></v-spacer>
				<v-btn icon="mdi-close" variant="text" color="white" @click="close"></v-btn>
			</v-card-title>
			<v-card-text class="pa-4">
				<div v-if="loading" class="d-flex justify-center pa-8">
					<v-progress-circular indeterminate color="primary"></v-progress-circular>
				</div>
				<div v-else-if="error" class="text-center pa-4">
					<v-icon color="error" size="48" class="mb-2">mdi-alert-circle</v-icon>
					<div class="text-body-1">{{ error }}</div>
				</div>
				<div v-else-if="templates.length === 0" class="text-center pa-8 text-medium-emphasis">
					<v-icon size="48" class="mb-2">mdi-ruler-square</v-icon>
					<div class="text-body-1">{{ __("No templates saved yet") }}</div>
				</div>
				<v-list v-else lines="two">
					<v-list-item
						v-for="tpl in templates"
						:key="tpl.name"
						:title="tpl.title"
						:subtitle="`${tpl.label_size} · ${__(tpl.description || 'No description')}`"
						@click="selectTemplate(tpl)"
						class="mb-1 border rounded"
					>
						<template v-slot:prepend>
							<v-icon>mdi-ruler-square</v-icon>
						</template>
						<template v-slot:append>
							<v-btn
								icon="mdi-delete"
								variant="text"
								size="small"
								color="error"
								@click.stop="deleteTemplate(tpl)"
							></v-btn>
						</template>
					</v-list-item>
				</v-list>
			</v-card-text>
			<v-card-actions class="justify-end pa-4 pt-0">
				<v-btn variant="text" @click="close">{{ __("Close") }}</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { useToastStore } from "../../../stores/toastStore";

declare const __: (_str: string, _args?: any[]) => string;
declare const frappe: any;

const props = defineProps<{
	modelValue: boolean;
}>();
const emit = defineEmits<{
	(e: "update:modelValue", v: boolean): void;
	(e: "load", template: any): void;
}>();

const visible = ref(props.modelValue);
watch(() => props.modelValue, (v) => { visible.value = v; });
watch(visible, (v) => { emit("update:modelValue", v); });

const templates = ref<any[]>([]);
const loading = ref(false);
const error = ref("");

const fetchTemplates = async () => {
	loading.value = true;
	error.value = "";
	try {
		const res = await frappe.call({
			method: "posawesome.posawesome.api.label_templates.get_label_templates",
			args: {},
			silent: true,
		});
		templates.value = res.message || [];
	} catch (e: any) {
		error.value = String(e?.message || e);
	} finally {
		loading.value = false;
	}
};

watch(visible, (v) => {
	if (v) fetchTemplates();
});

const selectTemplate = async (tpl: any) => {
	try {
		const res = await frappe.call({
			method: "posawesome.posawesome.api.label_templates.get_label_template_detail",
			args: { name: tpl.name },
			silent: true,
		});
		if (res.message) {
			emit("load", res.message);
			visible.value = false;
			useToastStore().show({ title: __("Template loaded: {0}", [res.message?.title || res.message?.name || "Unknown"]), color: "success" });
		}
	} catch (e: any) {
		useToastStore().show({ title: __("Failed to load template"), color: "error" });
	}
};

const deleteTemplate = async (tpl: any) => {
	try {
		await frappe.call({
			method: "posawesome.posawesome.api.label_templates.delete_label_template",
			args: { name: tpl.name },
			silent: true,
		});
		templates.value = templates.value.filter((t) => t.name !== tpl.name);
		useToastStore().show({ title: __("Template deleted"), color: "success" });
	} catch (e: any) {
		useToastStore().show({ title: __("Failed to delete template"), color: "error" });
	}
};

const close = () => {
	visible.value = false;
};
</script>
