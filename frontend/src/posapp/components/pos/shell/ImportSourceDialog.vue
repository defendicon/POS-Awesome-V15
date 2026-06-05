<template>
	<v-dialog v-model="dialog" max-width="800">
		<v-card>
			<v-card-title class="bg-primary text-white">
				{{ __("Import Labels from {0}", [sourceTypeLabel]) }}
			</v-card-title>

			<v-card-text class="pt-4">
				<v-tabs v-model="activeTab" class="mb-4">
					<v-tab value="Sales Order">{{ __("Sales Order") }}</v-tab>
					<v-tab value="Delivery Note">{{ __("Delivery Note") }}</v-tab>
					<v-tab value="BOM">{{ __("BOM") }}</v-tab>
				</v-tabs>

				<v-text-field
					v-model="searchTerm"
					:label="__('Search by name or customer')"
					prepend-inner-icon="mdi-magnify"
					density="compact"
					variant="outlined"
					@keydown.enter="searchDocuments"
					:loading="searching"
					hide-details
				/>

				<v-list v-if="documents.length" density="compact" class="border rounded mt-2">
					<v-list-item
						v-for="doc in documents"
						:key="doc.name"
						:active="selectedDoc?.name === doc.name"
						@click="selectDocument(doc)"
						cursor="pointer"
					>
						<v-list-item-title>{{ doc.name }}</v-list-item-title>
						<v-list-item-subtitle>
							{{ doc.customer || doc.item }} &bull; {{ formatDate(doc.transaction_date || doc.posting_date) }}
						</v-list-item-subtitle>
						<template v-slot:append>
							<v-chip size="small" :color="statusColor(doc.status)">{{ doc.status }}</v-chip>
						</template>
					</v-list-item>
				</v-list>

				<v-text-field
					v-if="activeTab === 'BOM'"
					v-model.number="bomForQty"
					:label="__('Production Quantity')"
					type="number"
					min="1"
					density="compact"
					variant="outlined"
					class="mt-4"
					hide-details
				/>

				<v-data-table
					v-if="previewItems.length"
					:headers="previewHeaders"
					:items="previewItems"
					density="compact"
					class="mt-4 border rounded"
					hide-default-footer
				>
					<template v-slot:item.qty="{ item }">
						<v-text-field
							v-model.number="item.qty"
							type="number"
							min="1"
							density="compact"
							variant="outlined"
							hide-details
							class="pos-themed-input"
						/>
					</template>
					<template v-slot:item.barcode="{ item }">
						<span v-if="item.barcode" class="text-caption">{{ item.barcode }}</span>
						<v-chip v-else size="x-small" color="warning">{{ __("No Barcode") }}</v-chip>
					</template>
				</v-data-table>
			</v-card-text>

			<v-card-actions class="justify-end">
				<v-btn variant="text" @click="dialog = false">{{ __("Cancel") }}</v-btn>
				<v-btn
					color="primary"
					:disabled="!previewItems.length"
					:loading="importing"
					@click="importItems"
				>
					{{ __("Import {0} Items", [previewItems.length]) }}
				</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";

declare const frappe: any;
declare const __: (_str: string, _args?: any[]) => string;

const props = defineProps<{
	modelValue: boolean;
}>();

const emit = defineEmits<{
	(e: "update:modelValue", val: boolean): void;
	(e: "import", items: any[]): void;
}>();

const dialog = computed({
	get: () => props.modelValue,
	set: (val) => emit("update:modelValue", val),
});

const activeTab = ref("Sales Order");
const searchTerm = ref("");
const searching = ref(false);
const importing = ref(false);
const documents = ref<any[]>([]);
const selectedDoc = ref<any>(null);
const previewItems = ref<any[]>([]);
const bomForQty = ref(1);

const sourceTypeLabel = computed(() => {
	const labels: Record<string, string> = {
		"Sales Order": "Sales Order",
		"Delivery Note": "Delivery Note",
		BOM: "Bill of Materials",
	};
	return labels[activeTab.value] || activeTab.value;
});

const previewHeaders = [
	{ title: __("Item Code"), key: "item_code" },
	{ title: __("Item Name"), key: "item_name" },
	{ title: __("Qty"), key: "qty", align: "center" as const },
	{ title: __("UOM"), key: "uom" },
	{ title: __("Barcode"), key: "barcode" },
];

const searchDocuments = async () => {
	if (!searchTerm.value.trim()) return;
	searching.value = true;
	try {
		const { message } = await frappe.call({
			method: "posawesome.posawesome.api.label_data_sources.search_label_source_documents",
			args: {
				source_type: activeTab.value,
				search_term: searchTerm.value,
			},
		});
		documents.value = Array.isArray(message) ? message : [];
	} catch {
		documents.value = [];
	} finally {
		searching.value = false;
	}
};

const selectDocument = async (doc: any) => {
	selectedDoc.value = doc;

	const methodMap: Record<string, string> = {
		"Sales Order": "get_sales_order_items",
		"Delivery Note": "get_delivery_note_items",
		BOM: "get_bom_items",
	};

	const method = methodMap[activeTab.value];
	if (!method) return;

	const args: Record<string, any> = { name: doc.name };
	if (activeTab.value === "BOM") {
		args.bom = doc.name;
		args.for_qty = bomForQty.value;
	}

	try {
		const { message } = await frappe.call({
			method: `posawesome.posawesome.api.label_data_sources.${method}`,
			args,
		});
		previewItems.value = (Array.isArray(message) ? message : []).map((item: any) => ({
			...item,
			_source_doc: doc.name,
			_source_type: activeTab.value,
		}));
	} catch {
		previewItems.value = [];
	}
};

const importItems = () => {
	importing.value = true;
	try {
		emit("import", previewItems.value);
		dialog.value = false;
	} finally {
		importing.value = false;
	}
};

watch(dialog, (val) => {
	if (val) {
		searchTerm.value = "";
		documents.value = [];
		selectedDoc.value = null;
		previewItems.value = [];
		bomForQty.value = 1;
	}
});

watch(activeTab, () => {
	documents.value = [];
	selectedDoc.value = null;
	previewItems.value = [];
	searchTerm.value = "";
});

watch(bomForQty, (val) => {
	if (selectedDoc.value && activeTab.value === "BOM") {
		selectDocument(selectedDoc.value);
	}
});

const formatDate = (d: string) => {
	if (!d) return "";
	if (typeof frappe?.datetime?.str_to_user === "function") {
		return frappe.datetime.str_to_user(d);
	}
	return d;
};

const statusColor = (s: string) => {
	const map: Record<string, string> = {
		"To Deliver and Bill": "warning",
		"To Deliver": "info",
		"Not Delivered": "error",
		"Partly Delivered": "warning",
		Submitted: "success",
	};
	return map[s] || "default";
};
</script>
