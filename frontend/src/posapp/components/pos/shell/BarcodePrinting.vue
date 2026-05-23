<template>
	<div class="pa-0 h-100">
		<v-row class="h-100 ma-0">
			<v-col cols="12" md="5" class="h-100 pa-0 border-e d-flex flex-column">
				<ItemsSelector
					context="barcode"
					:showOnlyBarcodeItems="true"
					class="flex-grow-1"
					@add-item="bp.onAddItem"
				/>
			</v-col>

			<v-col cols="12" md="7" class="h-100 pa-0">
				<BarcodePrintingPanel :bp="bp" />
			</v-col>
		</v-row>

		<BarcodePrintingAddItemDialog :bp="bp" />
	</div>
</template>

<script setup lang="ts">
/* global __ */
import ItemsSelector from "../items/ItemsSelector.vue";
import { useBarcodePrinting } from "../../../composables/pos/shell/useBarcodePrinting";
import BarcodePrintingPanel from "./barcode-printing/BarcodePrintingPanel.vue";
import BarcodePrintingAddItemDialog from "./barcode-printing/BarcodePrintingAddItemDialog.vue";

defineOptions({ name: "BarcodePrinting" });

const bp = useBarcodePrinting();
</script>
