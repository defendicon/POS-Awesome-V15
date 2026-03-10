<template>
	<div
		class="pos-main-container dynamic-container"
		:class="rtlClasses"
		:style="[responsiveStyles, rtlStyles]"
	>
		<Drafts></Drafts>
		<InvoiceManagement></InvoiceManagement>
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
		<v-dialog
			v-if="usePaymentDialog"
			v-model="paymentDialogOpen"
			:retain-focus="false"
			width="96vw"
			max-width="1480"
			scrim="rgba(15, 23, 42, 0.55)"
			class="payment-dialog"
			@update:model-value="handlePaymentDialogUpdate"
		>
			<Payments dialog-mode />
		</v-dialog>
		<div v-if="!dialog && useCompactPosSwitcher && !useMobileActionBar" class="compact-pos-switcher">
			<v-btn-toggle
				:model-value="compactPanel"
				mandatory
				divided
				class="compact-pos-switcher__toggle pos-themed-card"
			>
				<v-btn
					value="selector"
					class="compact-pos-switcher__btn"
					prepend-icon="mdi-view-grid-outline"
					@click="setCompactPanel('selector')"
				>
					{{ __("Item Selector") }}
				</v-btn>
				<v-btn
					value="invoice"
					class="compact-pos-switcher__btn"
					data-fly-target="invoice-tab"
					prepend-icon="mdi-receipt-text-outline"
					@click="setCompactPanel('invoice')"
				>
					<span class="compact-pos-switcher__btn-content">
						<span>{{ __("Invoice") }}</span>
						<span
							v-if="hasCartBadge"
							:class="['tab-count-badge', { 'tab-count-badge--pulse': cartBadgePulse }]"
							data-fly-target="invoice-tab-badge"
						>
							{{ cartBadgeLabel }}
						</span>
					</span>
				</v-btn>
				</v-btn-toggle>
		</div>
		<div v-if="!dialog && useMobileActionBar" class="mobile-action-bar pos-themed-card">
			<button
				type="button"
				class="mobile-action-bar__item"
				:class="{ 'mobile-action-bar__item--active': activeMobileAction === 'search' }"
				@click="activateMobileAction('search')"
			>
				<v-icon size="18">mdi-magnify</v-icon>
				<span>{{ __("Search") }}</span>
			</button>
			<button
				type="button"
				class="mobile-action-bar__item"
				:class="{ 'mobile-action-bar__item--active': activeMobileAction === 'invoice' }"
				data-fly-target="invoice-tab"
				@click="activateMobileAction('invoice')"
			>
				<v-icon size="18">mdi-receipt-text-outline</v-icon>
				<span class="mobile-action-bar__label">
					<span>{{ __("Invoice") }}</span>
					<span
						v-if="hasCartBadge"
						:class="['tab-count-badge', { 'tab-count-badge--pulse': cartBadgePulse }]"
						data-fly-target="invoice-tab-badge"
					>
						{{ cartBadgeLabel }}
					</span>
				</span>
			</button>
		</div>
		<v-row v-show="!dialog" dense class="ma-0 dynamic-main-row">
			<v-col
				v-show="(!useCompactPosSwitcher || compactPanel === 'selector') && activeView === 'items'"
				:xl="useCompactPosSwitcher ? 12 : 5"
				:lg="useCompactPosSwitcher ? 12 : 5"
				:md="useCompactPosSwitcher ? 12 : 5"
				:sm="useCompactPosSwitcher ? 12 : 5"
				cols="12"
				class="pos dynamic-col"
			>
				<ItemsSelector context="pos" />
			</v-col>
			<v-col
				v-show="(!useCompactPosSwitcher || compactPanel === 'selector') && activeView === 'offers'"
				:xl="useCompactPosSwitcher ? 12 : 5"
				:lg="useCompactPosSwitcher ? 12 : 5"
				:md="useCompactPosSwitcher ? 12 : 5"
				:sm="useCompactPosSwitcher ? 12 : 5"
				cols="12"
				class="pos dynamic-col"
			>
				<PosOffers></PosOffers>
			</v-col>
			<v-col
				v-show="(!useCompactPosSwitcher || compactPanel === 'selector') && activeView === 'coupons'"
				:xl="useCompactPosSwitcher ? 12 : 5"
				:lg="useCompactPosSwitcher ? 12 : 5"
				:md="useCompactPosSwitcher ? 12 : 5"
				:sm="useCompactPosSwitcher ? 12 : 5"
				cols="12"
				class="pos dynamic-col"
			>
				<PosCoupons></PosCoupons>
			</v-col>
			<v-col
				v-show="(!useCompactPosSwitcher || compactPanel === 'selector') && activeView === 'payment' && !usePaymentDialog"
				:xl="useCompactPosSwitcher ? 12 : 5"
				:lg="useCompactPosSwitcher ? 12 : 5"
				:md="useCompactPosSwitcher ? 12 : 5"
				:sm="useCompactPosSwitcher ? 12 : 5"
				cols="12"
				class="pos dynamic-col"
			>
				<Payments></Payments>
			</v-col>

			<v-col
				v-show="!useCompactPosSwitcher || compactPanel === 'invoice'"
				:xl="useCompactPosSwitcher ? 12 : 7"
				:lg="useCompactPosSwitcher ? 12 : 7"
				:md="useCompactPosSwitcher ? 12 : 7"
				:sm="useCompactPosSwitcher ? 12 : 7"
				cols="12"
				class="pos dynamic-col"
			>
				<Invoice></Invoice>
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
import InvoiceManagement from "../flows/InvoiceManagement.vue";
import SalesOrders from "../flows/SalesOrders.vue";
import NewAddress from "../customer/NewAddress.vue";
import Variants from "../items/Variants.vue";
import Returns from "../flows/Returns.vue";
import MpesaPayments from "../payments/Mpesa-Payments.vue";
import { inject, ref, onMounted, onBeforeUnmount, computed, watch, nextTick } from "vue";
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
		const __ = window.__;
		const { activeView, posProfile, paymentDialogOpen } = storeToRefs(uiStore);
		const { itemsCount, totalQty } = storeToRefs(invoiceStore);
		const usePaymentDialog = computed(() => responsive.windowWidth.value >= 992);
		const useMobileActionBar = computed(() => responsive.windowWidth.value < 768);
		const useCompactPosSwitcher = computed(() => responsive.windowWidth.value < 1280);
		const cartBadgePulse = ref(false);
		let cartBadgePulseTimeout = null;
		const hasCartBadge = computed(() => Math.abs(Number(totalQty.value || 0)) > 0);
		const cartBadgeLabel = computed(() => {
			const qty = Math.abs(Number(totalQty.value || itemsCount.value || 0));
			if (!qty) {
				return "";
			}
			if (qty >= 100) {
				return "99+";
			}
			if (Number.isInteger(qty)) {
				return String(qty);
			}
			return qty.toFixed(qty < 10 ? 1 : 0).replace(/\.0$/, "");
		});
		const triggerCartBadgePulse = () => {
			cartBadgePulse.value = false;
			if (cartBadgePulseTimeout) {
				clearTimeout(cartBadgePulseTimeout);
			}
			requestAnimationFrame(() => {
				cartBadgePulse.value = true;
				cartBadgePulseTimeout = setTimeout(() => {
					cartBadgePulse.value = false;
					cartBadgePulseTimeout = null;
				}, 520);
			});
		};
		const compactPanel = ref("selector");
		const activeMobileAction = computed(() => {
			if (compactPanel.value === "invoice" || activeView.value === "payment") {
				return "invoice";
			}
			return "search";
		});

		const handlePaymentDialogUpdate = (value) => {
			if (value || !usePaymentDialog.value) {
				return;
			}
			uiStore.closePaymentDialog();
			nextTick(() => {
				uiStore.triggerItemSearchFocus();
			});
		};

		const setCompactPanel = (panel) => {
			compactPanel.value = panel;
			if (panel === "selector" && activeView.value === "items") {
				nextTick(() => {
					uiStore.triggerItemSearchFocus();
				});
			}
		};

		const activateMobileAction = (action) => {
			if (action === "invoice") {
				uiStore.closePaymentDialog();
				setCompactPanel("invoice");
				return;
			}

			if (action === "pay") {
				if (usePaymentDialog.value) {
					uiStore.openPaymentDialog();
					uiStore.setActiveView("items");
					return;
				}
				uiStore.closePaymentDialog();
				uiStore.setActiveView("payment");
				setCompactPanel("selector");
				return;
			}

			uiStore.closePaymentDialog();
			if (activeView.value !== "items") {
				uiStore.setActiveView("items");
			}
			setCompactPanel("selector");
			nextTick(() => {
				uiStore.triggerItemSearchFocus();
			});
		};

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
			if (cartBadgePulseTimeout) {
				clearTimeout(cartBadgePulseTimeout);
				cartBadgePulseTimeout = null;
			}
			if (eventBus) {
				eventBus.off("submit_closing_pos");
			}
		});

		watch(usePaymentDialog, (enabled) => {
			if (enabled && activeView.value === "payment") {
				uiStore.openPaymentDialog();
				uiStore.setActiveView("items");
				return;
			}

			if (!enabled && paymentDialogOpen.value) {
				uiStore.closePaymentDialog();
				uiStore.setActiveView("payment");
			}
		});

		watch(activeView, (view) => {
			if (!useCompactPosSwitcher.value) {
				return;
			}

			if (["items", "offers", "coupons", "payment"].includes(view)) {
				compactPanel.value = "selector";
			}
		});

		watch(useCompactPosSwitcher, (enabled) => {
			if (!enabled) {
				compactPanel.value = "selector";
				return;
			}

			if (["offers", "coupons", "payment"].includes(activeView.value)) {
				compactPanel.value = "selector";
			}
		});

		watch(totalQty, (next, previous) => {
			const currentQty = Math.abs(Number(next || 0));
			const previousQty = Math.abs(Number(previous || 0));
			if (currentQty > previousQty && currentQty > 0) {
				triggerCartBadgePulse();
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
			__,
			activeView,
			paymentDialogOpen,
			usePaymentDialog,
			useMobileActionBar,
			useCompactPosSwitcher,
			cartBadgePulse,
			hasCartBadge,
			cartBadgeLabel,
			compactPanel,
			activeMobileAction,
			setCompactPanel,
			activateMobileAction,
			handlePaymentDialogUpdate,
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
		InvoiceManagement,

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
.payment-dialog :deep(.v-overlay__content) {
	max-height: calc(100vh - 24px);
}

.compact-pos-switcher {
	padding: 0 var(--dynamic-sm);
	margin-top: var(--dynamic-sm);
}

.mobile-action-bar {
	position: sticky;
	bottom: max(12px, env(safe-area-inset-bottom));
	z-index: 12;
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 8px;
	margin: var(--dynamic-sm) var(--dynamic-sm) 0;
	padding: 8px;
	border-radius: 20px;
	background: color-mix(in srgb, var(--pos-card-bg) 92%, white 8%) !important;
	border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
	box-shadow: 0 18px 38px rgba(15, 23, 42, 0.12);
	backdrop-filter: blur(18px);
}

.mobile-action-bar__item {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	flex-direction: column;
	gap: 4px;
	min-height: 52px;
	padding: 8px 6px;
	border: 0;
	border-radius: 16px;
	background: transparent;
	color: var(--pos-text-secondary);
	font-size: 0.78rem;
	font-weight: 600;
	letter-spacing: 0.01em;
	transition:
		background-color 0.2s ease,
		color 0.2s ease,
		transform 0.2s ease;
}

.mobile-action-bar__label,
.compact-pos-switcher__btn-content {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	min-width: 0;
}

.mobile-action-bar__item--active {
	background: rgba(var(--v-theme-primary), 0.12);
	color: rgb(var(--v-theme-primary));
}

.mobile-action-bar__item:focus-visible {
	outline: 2px solid rgba(var(--v-theme-primary), 0.85);
	outline-offset: 2px;
}

.mobile-action-bar__item:active {
	transform: translateY(1px);
}

.compact-pos-switcher__toggle {
	display: grid !important;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	width: 100%;
	padding: 4px;
	border-radius: 18px;
	background: var(--pos-card-bg) !important;
	border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
	box-shadow: 0 10px 30px rgba(15, 23, 42, 0.05);
}

.compact-pos-switcher__btn {
	min-height: 44px;
	text-transform: none !important;
	letter-spacing: 0 !important;
	font-weight: 600 !important;
}

.tab-count-badge {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-width: 22px;
	height: 22px;
	padding: 0 7px;
	border-radius: 999px;
	background: rgb(var(--v-theme-primary));
	color: rgb(var(--v-theme-on-primary));
	font-size: 0.72rem;
	font-weight: 800;
	line-height: 1;
	box-shadow: 0 8px 18px rgba(var(--v-theme-primary), 0.24);
}

.tab-count-badge--pulse {
	animation: tab-count-badge-pulse 0.52s cubic-bezier(0.2, 0.8, 0.2, 1);
}

@keyframes tab-count-badge-pulse {
	0% {
		transform: scale(1);
		box-shadow: 0 8px 18px rgba(var(--v-theme-primary), 0.18);
	}

	35% {
		transform: scale(1.22);
		box-shadow:
			0 0 0 10px rgba(var(--v-theme-primary), 0.12),
			0 12px 26px rgba(var(--v-theme-primary), 0.3);
	}

	100% {
		transform: scale(1);
		box-shadow: 0 8px 18px rgba(var(--v-theme-primary), 0.24);
	}
}

@media (prefers-reduced-motion: reduce) {
	.tab-count-badge--pulse {
		animation: none;
	}
}

.compact-pos-switcher__toggle :deep(.v-btn--active) {
	background: rgba(var(--v-theme-primary), 0.12) !important;
	color: rgb(var(--v-theme-primary)) !important;
}
</style>

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
}

.dynamic-col {
	padding: var(--dynamic-sm);
	transition: padding 0.3s ease;
	margin-top: var(--dynamic-sm);
	/* Add top margin for better separation */
}

@media (max-width: 768px) {
	.dynamic-container {
		padding-top: calc(56px + var(--dynamic-md));
		padding-bottom: calc(92px + env(safe-area-inset-bottom));
		/* Consistent navbar height + medium spacing */
	}

	.dynamic-col {
		padding: var(--dynamic-xs);
		margin-top: var(--dynamic-xs);
	}
}
</style>
