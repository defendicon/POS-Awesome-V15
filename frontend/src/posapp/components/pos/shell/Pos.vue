<template>
	<div
		class="pos-main-container dynamic-container"
		:class="rtlClasses"
		:style="[responsiveStyles, rtlStyles]"
	>
		<Drafts></Drafts>
		<SalesOrders></SalesOrders>
		<Returns></Returns>
		<NewAddress></NewAddress>
		<MpesaPayments></MpesaPayments>
		<Variants></Variants>
		<OpeningDialog
			v-if="dialog"
			:dialog="dialog"
			@close="closeOpeningDialog"
			@register="handleRegisterPosData"
		></OpeningDialog>
		<v-row v-show="!dialog" dense class="ma-0 dynamic-main-row">
			<v-col
				v-show="activeView === 'items'"
				xl="5"
				lg="5"
				md="5"
				sm="5"
				cols="12"
				class="pos dynamic-col"
			>
				<ItemsSelector context="pos" class="dynamic-panel" />
			</v-col>
			<v-col
				v-show="activeView === 'offers'"
				xl="5"
				lg="5"
				md="5"
				sm="5"
				cols="12"
				class="pos dynamic-col"
			>
				<PosOffers class="dynamic-panel"></PosOffers>
			</v-col>
			<v-col
				v-show="activeView === 'coupons'"
				xl="5"
				lg="5"
				md="5"
				sm="5"
				cols="12"
				class="pos dynamic-col"
			>
				<PosCoupons class="dynamic-panel"></PosCoupons>
			</v-col>
			<v-col
				v-show="activeView === 'payment'"
				xl="5"
				lg="5"
				md="5"
				sm="5"
				cols="12"
				class="pos dynamic-col"
			>
				<Payments class="dynamic-panel"></Payments>
			</v-col>

			<v-col xl="7" lg="7" md="7" sm="7" cols="12" class="pos dynamic-col">
				<Invoice class="dynamic-panel"></Invoice>
			</v-col>
		</v-row>
	</div>
</template>

<script>
import ItemsSelector from "../items/ItemsSelector.vue";
import Invoice from "../Invoice.vue";
import OpeningDialog from "../shift/OpeningDialog.vue";
import Payments from "../Payments.vue";
import PosOffers from "../offers/PosOffers.vue";
import PosCoupons from "../offers/PosCoupons.vue";
import Drafts from "../flows/Drafts.vue";
import SalesOrders from "../flows/SalesOrders.vue";
import NewAddress from "../customer/NewAddress.vue";
import Variants from "../items/Variants.vue";
import Returns from "../flows/Returns.vue";
import MpesaPayments from "../payments/Mpesa-Payments.vue";
import { inject, ref, onMounted, onBeforeUnmount } from "vue";
import { usePosShift } from "../../../composables/pos/shared/usePosShift";
import { useOffers } from "../../../composables/pos/shared/useOffers";
// Import the cache cleanup function
import { clearExpiredCustomerBalances } from "../../../../offline/index";
import { useResponsive } from "../../../composables/core/useResponsive";
import { useRtl } from "../../../composables/core/useRtl";
import { useCustomersStore } from "../../../stores/customersStore.js";
import { useUIStore } from "../../../stores/uiStore.js";
import { useInvoiceStore } from "../../../stores/invoiceStore.js";
import { useItemsStore } from "../../../stores/itemsStore.js";
import { storeToRefs } from "pinia";
import { useCustomerDisplayPublisher } from "../../../composables/pos/shared/useCustomerDisplayPublisher";

export default {
	setup() {
		const eventBus = inject("eventBus");
		const dialog = ref(false);
		const responsive = useResponsive();
		const rtl = useRtl();
		const shift = usePosShift(() => {
			dialog.value = true;
		});
		const offers = useOffers();
		const uiStore = useUIStore();
		const invoiceStore = useInvoiceStore();
		const itemsStore = useItemsStore();
		const { activeView, posProfile } = storeToRefs(uiStore);

		useCustomerDisplayPublisher({
			posProfile,
			eventBus,
		});

		onMounted(() => {
			if (eventBus) {
				eventBus.on("submit_closing_pos", (data) => {
					shift.submit_closing_pos(data);
				});
			}
		});

		onBeforeUnmount(() => {
			if (eventBus) {
				eventBus.off("submit_closing_pos");
			}
		});

		return {
			...responsive,
			...rtl,
			...shift,
			...offers,
			uiStore,
			invoiceStore,
			itemsStore,
			activeView,
			eventBus,
			dialog,
		};
	},
	data: function () {
		return {
			// dialog moved to setup ref
			itemsLoaded: false,
			customersLoaded: false,
		};
	},

	components: {
		ItemsSelector,
		Invoice,
		OpeningDialog,
		Payments,
		Drafts,

		Returns,
		PosOffers,
		PosCoupons,
		NewAddress,
		Variants,
		MpesaPayments,
		SalesOrders,
	},

	methods: {
		create_opening_voucher() {
			this.dialog = true;
		},
		get_pos_setting() {
			frappe.db.get_doc("POS Settings", undefined).then((_doc) => {
				// Update store directly instead of emitting event
				// If Payments.vue or others need this, they should watch uiStore.posSettings
				// For now, we assume uiStore.setStockSettings or similar is sufficient,
				// or we add a new generic settings store.
				// However, the original code used eventBus.emit("set_pos_settings", doc);
				// We'll attach it to uiStore if a suitable method exists, or just log for now as
				// clean separation implies components fetch what they need or use a centralized config store.
				// Assuming uiStore handles global config:
				// this.uiStore.setPosSettings(doc); // We might need to implement this if it doesn't exist
			});
		},
		checkLoadingComplete() {
			if (this.itemsLoaded && this.customersLoaded) {
				// Loading complete logic
			}
		},
		// handleAddItem removed as ItemsSelector handles pos addition internally
		handleRegisterPosData(data) {
			this.pos_profile = data.pos_profile;
			this.get_offers(this.pos_profile.name, this.pos_profile);
			this.pos_opening_shift = data.pos_opening_shift;

			// Update Store
			this.uiStore.setRegisterData(data);
		},
		closeOpeningDialog() {
			this.dialog = false;
		},
	},

	mounted: function () {
		this.$nextTick(function () {
			this.check_opening_entry();
			this.get_pos_setting();

			// Watch store for updates
			this.$watch(
				() => this.uiStore.posProfile,
				async (newProfile) => {
					if (newProfile && newProfile.name) {
						this.pos_profile = newProfile;
						this.get_offers(newProfile.name, newProfile);

						// Initialize Customers Store
						const customersStore = useCustomersStore();
						customersStore.setPosProfile(newProfile);
						await customersStore.get_customer_names();
					}
				},
				{ deep: true, immediate: true },
			);

			// Items loading state check
			const { itemsLoaded } = storeToRefs(this.itemsStore);
			this.$watch(
				() => itemsLoaded.value,
				(val) => {
					if (val) {
						this.itemsLoaded = true;
						this.checkLoadingComplete();
					}
				},
				{ immediate: true },
			);
		});
	},
	// In the created() or mounted() lifecycle hook
	created() {
		// Clean up expired customer balance cache on POS load
		clearExpiredCustomerBalances();
		const customersStore = useCustomersStore();
		const { customersLoaded } = storeToRefs(customersStore);
		this.$watch(
			() => customersLoaded.value,
			(value) => {
				if (value) {
					this.customersLoaded = true;
					this.checkLoadingComplete();
				}
			},
			{ immediate: true },
		);
	},
};
</script>

<style scoped>
.dynamic-container {
	/* add space for the navbar with better spacing */
	/*padding-top: calc(25px + var(--dynamic-lg));*/
	/* Navbar height (25px) + larger spacing */
	transition: all 0.3s ease;
}

.dynamic-main-row {
	padding: 0;
	margin: 0;
	height: calc(100vh - 72px);
	min-height: calc(100vh - 72px);
	align-items: stretch;
	overflow: hidden;
}

.dynamic-col {
	padding: var(--dynamic-sm);
	transition: padding 0.3s ease;
	margin-top: var(--dynamic-sm);
	display: flex;
	flex-direction: column;
	min-height: 0;
	padding-bottom: 0;
	/* Add top margin for better separation */
}

.dynamic-panel {
	flex: 1 1 auto;
	min-height: 0;
	display: flex;
	flex-direction: column;
}

@media (max-width: 768px) {
	.dynamic-container {
		padding-top: calc(56px + var(--dynamic-md));
		/* Consistent navbar height + medium spacing */
	}

	.dynamic-col {
		padding: var(--dynamic-xs);
		margin-top: var(--dynamic-xs);
		padding-bottom: 0;
	}

	.dynamic-main-row {
		min-height: calc(100vh - 64px);
		height: auto;
		overflow: visible;
	}
}
</style>
