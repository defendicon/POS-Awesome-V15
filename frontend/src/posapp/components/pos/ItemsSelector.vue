<template>
	<div :style="responsiveStyles">
		<v-dialog v-model="scanErrorDialog" persistent max-width="420" content-class="scan-error-dialog">
			<v-card>
				<v-card-title class="d-flex align-center text-error text-h6">
					<v-icon color="error" class="mr-2">mdi-alert-octagon</v-icon>
					{{ __("Scan Error") }}
				</v-card-title>
				<v-divider></v-divider>
				<v-card-text>
					<p class="scan-error-message">{{ scanErrorMessage }}</p>
					<p v-if="scanErrorCode" class="scan-error-code mt-2 mb-0">
						<strong>{{ __("Scanned Code:") }}</strong>
						<span>{{ scanErrorCode }}</span>
					</p>
					<p v-if="scanErrorDetails" class="scan-error-details mt-4 mb-0">
						{{ scanErrorDetails }}
					</p>
				</v-card-text>
				<v-card-actions class="justify-end">
					<v-btn color="primary" variant="tonal" autofocus @click="acknowledgeScanError">
						{{ __("OK") }}
					</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>
		<v-card
			:class="[
				'selection mx-auto my-0 py-0 mt-3 pos-card dynamic-card resizable pos-themed-card',
				rtlClasses,
			]"
			:style="{
				height: responsiveStyles['--container-height'],
				maxHeight: responsiveStyles['--container-height'],
				resize: 'vertical',
				overflow: 'auto',
				position: 'relative',
			}"
		>
			<v-progress-linear
				:active="loading"
				:indeterminate="loading"
				absolute
				location="top"
				color="info"
			></v-progress-linear>

			<!-- Add dynamic-padding wrapper like Invoice component -->
			<div class="dynamic-padding">
				<div class="sticky-header">
					<v-row class="items">
						<v-col class="pb-0">
							<v-text-field
								density="compact"
								clearable
								autofocus
								variant="solo"
								color="primary"
								:label="frappe._('Search Items')"
								hint="Search by item code, serial number, batch no or barcode"
								hide-details
								v-model="debounce_search"
								@keydown.esc="esc_event"
								@keydown.enter="search_onchange"
								@click:clear="clearSearch"
								prepend-inner-icon="mdi-magnify"
								@focus="handleItemSearchFocus"
								ref="debounce_search"
							>
								<template v-slot:append-inner>
									<v-btn
										:icon="showManualScanInput ? 'mdi-barcode-off' : 'mdi-barcode-scan'"
										size="small"
										color="primary"
										:variant="showManualScanInput ? 'tonal' : 'text'"
										class="mr-1"
										@click.stop="toggleManualScanInput"
										:title="
											showManualScanInput
												? __('Hide Manual Entry')
												: __('Show Manual Entry')
										"
									>
									</v-btn>
									<v-btn
										v-if="pos_profile.posa_enable_camera_scanning"
										icon="mdi-camera"
										size="small"
										color="primary"
										variant="text"
										:disabled="scannerLocked"
										@click="startCameraScanning"
										:title="
											scannerLocked
												? __('Acknowledge the error to resume scanning')
												: __('Scan with Camera')
										"
									>
									</v-btn>
								</template>
							</v-text-field>
							<v-expand-transition>
								<div v-if="showManualScanInput" class="manual-scan-container mt-2">
									<div class="manual-scan-text mb-3">
										<div class="text-subtitle-2 font-weight-medium">
											{{ __("Manual or Hardware Scanner Input") }}
										</div>
										<div class="text-body-2 text-medium-emphasis">
											{{
												__(
													"Scan with a hardware scanner or type the code, then press Enter.",
												)
											}}
										</div>
									</div>
									<v-text-field
										density="comfortable"
										variant="outlined"
										color="primary"
										clearable
										hide-details
										:label="__('Enter Code Manually')"
										v-model="manualScanValue"
										@keydown.enter.prevent="submitManualScan"
										@click:clear="manualScanValue = ''"
										autocomplete="off"
										ref="manualScanInput"
										prepend-inner-icon="mdi-barcode-scan"
									>
										<template #append-inner>
											<v-btn
												icon="mdi-check"
												variant="tonal"
												color="primary"
												size="small"
												@click="submitManualScan"
												:title="__('Submit Code')"
											></v-btn>
										</template>
									</v-text-field>
								</div>
							</v-expand-transition>
						</v-col>
						<v-col cols="3" class="pb-0" v-if="pos_profile.posa_input_qty">
							<v-text-field
								density="compact"
								variant="solo"
								color="primary"
								:label="frappe._('QTY')"
								hide-details
								v-model="debounce_qty"
								type="text"
								@keydown.enter="enter_event"
								@keydown.esc="esc_event"
								@focus="clearQty"
							></v-text-field>
						</v-col>
						<v-col cols="2" class="pb-0" v-if="pos_profile.posa_new_line">
							<v-checkbox
								v-model="new_line"
								color="accent"
								value="true"
								label="NLine"
								density="default"
								hide-details
							></v-checkbox>
						</v-col>
						<v-col cols="12" class="dynamic-margin-xs">
							<div class="settings-container">
								<v-btn
									density="compact"
									variant="text"
									color="primary"
									prepend-icon="mdi-cog-outline"
									@click="toggleItemSettings"
									class="settings-btn"
								>
									{{ __("Settings") }}
								</v-btn>
								<v-spacer></v-spacer>
								<v-btn
									density="compact"
									variant="text"
									color="primary"
									prepend-icon="mdi-refresh"
									@click="forceReloadItems"
									class="settings-btn"
								>
									{{ __("Reload Items") }}
								</v-btn>

								<v-dialog v-model="show_item_settings" max-width="400px">
									<v-card>
										<v-card-title class="text-h6 pa-4 d-flex align-center">
											<span>{{ __("Item Selector Settings") }}</span>
											<v-spacer></v-spacer>
											<v-btn
												icon="mdi-close"
												variant="text"
												density="compact"
												@click="show_item_settings = false"
											>
											</v-btn>
										</v-card-title>
										<v-divider></v-divider>
										<v-card-text class="pa-4">
											<v-switch
												v-model="temp_hide_qty_decimals"
												:label="__('Hide quantity decimals')"
												hide-details
												density="compact"
												color="primary"
												class="mb-2"
											></v-switch>
											<v-switch
												v-model="temp_hide_zero_rate_items"
												:label="__('Hide zero rated items')"
												hide-details
												density="compact"
												color="primary"
											></v-switch>
											<v-switch
												v-model="temp_enable_custom_items_per_page"
												:label="__('Custom items per page')"
												hide-details
												density="compact"
												color="primary"
												class="mb-2"
											>
											</v-switch>
											<v-checkbox
												v-model="temp_force_server_items"
												:label="
													__('Always fetch items from server (ignore local cache)')
												"
												hide-details
												density="compact"
												color="primary"
												class="mb-2"
											></v-checkbox>
											<v-text-field
												v-if="temp_enable_custom_items_per_page"
												v-model="temp_items_per_page"
												type="number"
												density="compact"
												variant="outlined"
												color="primary"
												hide-details
												:label="__('Items per page')"
												class="mb-2 pos-themed-input"
											>
											</v-text-field>
										</v-card-text>
										<v-card-actions class="pa-4 pt-0">
											<v-btn color="error" variant="text" @click="cancelItemSettings"
												>{{ __("Cancel") }}
											</v-btn>
											<v-spacer></v-spacer>
											<v-btn color="primary" variant="tonal" @click="applyItemSettings"
												>{{ __("Apply") }}
											</v-btn>
										</v-card-actions>
									</v-card>
								</v-dialog>
							</div>
						</v-col>
					</v-row>
				</div>
				<v-row class="items">
					<v-col cols="12" class="pt-0 mt-0">
						<div v-if="items_view == 'card'" class="items-card-container">
							<div v-if="loading" class="items-card-grid">
								<Skeleton v-for="n in 8" :key="n" class="mb-4" height="120" />
							</div>
							<RecycleScroller
								v-else
								ref="itemsContainer"
								class="virtual-scroller"
								:list-class="['items-card-grid', { 'item-container': isOverflowing }]"
								:items="displayedItems"
								key-field="item_code"
								:item-size="cardRowHeight"
								:grid-items="cardColumns"
								:item-secondary-size="cardColumnWidth"
								:buffer="virtualScrollBuffer"
								:emit-update="true"
								@update="onVirtualRangeUpdate"
							>
								<template #default="{ item }">
									<div
										v-if="item"
										:key="item.item_code"
										class="card-item-card"
										@click="select_item($event, item)"
										:draggable="true"
										@dragstart="onDragStart($event, item)"
										@dragend="onDragEnd"
									>
										<div class="card-item-image-container">
											<v-img
												:src="item.image || placeholderImage"
												class="card-item-image"
												aspect-ratio="1"
												:alt="item.item_name"
											>
												<template #placeholder>
													<div class="image-placeholder">
														<v-icon size="40" color="grey-lighten-2">
															mdi-image
														</v-icon>
													</div>
												</template>
											</v-img>
										</div>
										<div class="card-item-content">
											<div class="card-item-header">
												<h4 class="card-item-name">{{ item.item_name }}</h4>
												<span class="card-item-code">{{ item.item_code }}</span>
											</div>
											<div class="card-item-details">
												<div class="card-item-price">
													<div class="primary-price">
														<span class="currency-symbol">
															{{
																currencySymbol(
																	item.original_currency ||
																		pos_profile.currency,
																)
															}}
														</span>
														<span class="price-amount">
															{{
																format_currency(
																	item.base_price_list_rate ??
																		item.rate ??
																		0,
																	item.original_currency ||
																		pos_profile.currency,
																	ratePrecision(
																		item.base_price_list_rate ??
																			item.rate ??
																			0,
																	),
																)
															}}
														</span>
													</div>
													<div
														v-if="
															pos_profile.posa_allow_multi_currency &&
															selected_currency !== pos_profile.currency
														"
														class="secondary-price"
													>
														<span class="currency-symbol">
															{{ currencySymbol(selected_currency) }}
														</span>
														<span class="price-amount">
															{{
																format_currency(
																	item.rate,
																	selected_currency,
																	ratePrecision(item.rate),
																)
															}}
														</span>
													</div>
												</div>
												<div class="card-item-stock">
													<v-icon size="small" class="stock-icon">
														mdi-package-variant
													</v-icon>
													<span
														class="stock-amount"
														:class="{
															'negative-number': isNegative(item.actual_qty),
														}"
													>
														{{
															format_number(
																item.actual_qty,
																hide_qty_decimals ? 0 : 4,
															) || 0
														}}
													</span>
													<span class="stock-uom">{{ item.stock_uom || "" }}</span>
												</div>
											</div>
										</div>
									</div>
								</template>
							</RecycleScroller>
						</div>
						<div v-else class="items-table-container">
							<v-data-table-virtual
								:headers="headers"
								:items="displayedItems"
								class="sleek-data-table overflow-y-auto"
								:style="{ height: 'calc(100% - 80px)' }"
								item-key="item_code"
								fixed-header
								height="100%"
								:header-props="headerProps"
								:no-data-text="__('No items found')"
								@click:row="click_item_row"
								@scroll.passive="onListScroll"
							>
								<template v-slot:item.rate="{ item }">
									<div>
										<div class="text-primary">
											{{
												currencySymbol(item.original_currency || pos_profile.currency)
											}}
											{{
												format_currency(
													item.base_price_list_rate ?? item.rate ?? 0,
													item.original_currency || pos_profile.currency,
													ratePrecision(
														item.base_price_list_rate ?? item.rate ?? 0,
													),
												)
											}}
										</div>
										<div
											v-if="
												pos_profile.posa_allow_multi_currency &&
												selected_currency !== pos_profile.currency
											"
											class="text-success"
										>
											{{ currencySymbol(selected_currency) }}
											{{
												format_currency(
													item.rate,
													selected_currency,
													ratePrecision(item.rate),
												)
											}}
										</div>
									</div>
								</template>
								<template v-slot:item.actual_qty="{ item }">
									<span
										class="golden--text"
										:class="{ 'negative-number': isNegative(item.actual_qty) }"
										>{{ format_number(item.actual_qty, hide_qty_decimals ? 0 : 4) }}</span
									>
								</template>
							</v-data-table-virtual>
						</div>
					</v-col>
				</v-row>
			</div>
		</v-card>
		<v-card class="cards mb-0 mt-3 dynamic-padding resizable" style="resize: vertical; overflow: auto">
			<v-row no-gutters align="center" justify="center" class="dynamic-spacing-sm">
				<v-col cols="12" class="mb-2">
					<v-select
						:items="items_group"
						:label="frappe._('Items Group')"
						density="compact"
						variant="solo"
						hide-details
						v-model="item_group"
					></v-select>
				</v-col>
				<v-col cols="12" class="mb-2" v-if="pos_profile.posa_enable_price_list_dropdown !== false">
					<v-text-field
						density="compact"
						variant="solo"
						color="primary"
						:label="frappe._('Price List')"
						hide-details
						:model-value="active_price_list"
						readonly
					></v-text-field>
				</v-col>
				<v-col cols="3" class="dynamic-margin-xs">
					<v-btn-toggle v-model="items_view" color="primary" group density="compact" rounded>
						<v-btn size="small" value="list">{{ __("List") }}</v-btn>
						<v-btn size="small" value="card">{{ __("Card") }}</v-btn>
					</v-btn-toggle>
				</v-col>
				<v-col cols="5" class="dynamic-margin-xs">
					<v-btn
						size="small"
						block
						color="warning"
						variant="text"
						@click="show_offers"
						class="action-btn-consistent"
					>
						{{ offersCount }} {{ __("Offers") }}
					</v-btn>
				</v-col>
				<v-col cols="4" class="dynamic-margin-xs">
					<v-btn
						size="small"
						block
						color="primary"
						variant="text"
						@click="show_coupons"
						class="action-btn-consistent"
						>{{ couponsCount }} {{ __("Coupons") }}</v-btn
					>
				</v-col>
			</v-row>
		</v-card>

		<!-- Camera Scanner Component -->
		<CameraScanner
			v-if="pos_profile.posa_enable_camera_scanning"
			ref="cameraScanner"
			:scan-type="pos_profile.posa_camera_scan_type || 'Both'"
			@barcode-scanned="onBarcodeScanned"
			@scanner-opened="onScannerOpened"
			@scanner-closed="onScannerClosed"
		/>
	</div>
</template>

<script type="module">
/* eslint-disable no-unused-vars */
/* global frappe, __, setLocalStockCache, flt, onScan, get_currency_symbol, current_items, wordCount */
import format from "../../format";
import _ from "lodash";
import CameraScanner from "./CameraScanner.vue";
import { ensurePosProfile } from "../../../utils/pos_profile.js";
import "vue-virtual-scroller/dist/vue-virtual-scroller.css";
import { RecycleScroller } from "vue-virtual-scroller";
import {
	saveItemUOMs,
	getItemUOMs,
	getLocalStock,
	isOffline,
	getStoredItemsCount,
	initializeStockCache,
	saveItemsBulk,
	saveItems,
	clearStoredItems,
	getLocalStockCache,
	setLocalStockCache,
	initPromise,
	memoryInitPromise,
	checkDbHealth,
	getCachedPriceListItems,
	savePriceListItems,
	clearPriceListCache,
	updateLocalStockCache,
	isStockCacheReady,
	getCachedItemDetails,
	saveItemDetailsCache,
	saveItemGroups,
	getCachedItemGroups,
	getItemsLastSync,
	setItemsLastSync,
	forceClearAllCache,
} from "../../../offline/index.js";
import { useResponsive } from "../../composables/useResponsive.js";
import { useRtl } from "../../composables/useRtl.js";
import { useFlyAnimation } from "../../composables/useFlyAnimation.js";
import { withPerf, perfMarkStart, perfMarkEnd, scheduleFrame } from "../../utils/perf.js";
import { useCartValidation } from "../../composables/useCartValidation.js";
import { useItemsIntegration } from "../../composables/useItemsIntegration.js";
import { parseBooleanSetting, formatStockShortageError } from "../../utils/stock.js";
import placeholderImage from "./placeholder-image.png";
import Skeleton from "../ui/Skeleton.vue";
import { useCustomersStore } from "../../stores/customersStore.js";
import { storeToRefs } from "pinia";

export default {
	mixins: [format],
	setup() {
		const responsive = useResponsive();
		const rtl = useRtl();
		const { fly } = useFlyAnimation();
		const cartValidation = useCartValidation();

		// Initialize Pinia store integration
		const itemsIntegration = useItemsIntegration({
			enableDebounce: true,
			debounceDelay: 300,
		});

		const customersStore = useCustomersStore();
		const { selectedCustomer } = storeToRefs(customersStore);

		return {
			...responsive,
			...rtl,
			fly,
			cartValidation,
			...itemsIntegration,
			selectedCustomer,
		};
	},
	components: {
		CameraScanner,
		Skeleton,
		RecycleScroller,
	},
	data: () => ({
		pos_profile: {},
		stock_settings: {},
		flags: {},
		customer: "",
		items_view: "list",
		first_search: "",
		search_backup: "",
		// Limit the displayed items to avoid overly large lists
		itemsPerPage: 50,
		offersCount: 0,
		appliedOffersCount: 0,
		couponsCount: 0,
		appliedCouponsCount: 0,
		new_line: false,
		qty: 1,
		refresh_interval: null,
		abortController: null,
		itemDetailsRequestCache: { key: null, promise: null, result: null },
		itemDetailsRetryCount: 0,
		itemDetailsRetryTimeout: null,
		selected_currency: "",
		exchange_rate: 1,
		prePopulateInProgress: false,
		itemWorker: null,
		flyConfig: { speed: 0.6, easing: "ease-in-out" },
		storageAvailable: true,
		localStorageAvailable: true,
		items_request_token: 0,
		pendingGetItems: null,
		lastGetItemsKey: "",
		show_item_settings: false,
		hide_qty_decimals: false,
		temp_hide_qty_decimals: false,
		hide_zero_rate_items: false,
		temp_hide_zero_rate_items: false,
		isDragging: false,
		// Items per page configuration
		enable_custom_items_per_page: false,
		temp_enable_custom_items_per_page: false,
		items_per_page: 50,
		temp_items_per_page: 50,
		temp_force_server_items: false,
		// Performance optimizations
		searchCache: new Map(),
		barcodeIndex: new Map(),
		itemCache: new Map(),
		virtualScrollEnabled: true,
		virtualScrollBuffer: 200,
		renderBuffer: 10,
		lastScrollTop: 0,
		scrollThrottle: null,
		searchDebounce: null,
		// Prevent repeated server fetches when local storage is empty
		fallbackAttempted: false,
		cardContainerWidth: 0,
		virtualScrollPending: false,
		metricsRaf: null,
		// Fixed page size for incremental item loading to avoid
		// pulling the entire catalog at once.
		itemsPageLimit: 100,
		// Track if the current search was triggered by a scanner
		search_from_scanner: false,
		currentPage: 0,
		isOverflowing: false,
		// Track background loading state and pending searches
		isBackgroundLoading: false,
		pendingItemSearch: null,
		loadProgress: 0,
		totalItemCount: 0,
		scanErrorDialog: false,
		scanErrorMessage: "",
		scanErrorDetails: "",
		scanErrorCode: "",
		scannerLocked: false,
		cameraScannerActive: false,
		showManualScanInput: false,
		manualScanValue: "",
		scanAudioContext: null,
		pendingScanCode: "",
		awaitingScanResult: false,
		scanDebounceId: null,
		scanQueuedCode: "",
		refreshInFlight: false,
		clearingSearch: false,
	}),

	watch: {
		showManualScanInput(newVal) {
			if (newVal) {
				this.queueManualScanFocus();
			} else {
				this.manualScanValue = "";
				if (!this.cameraScannerActive) {
					this.$nextTick(() => this.focusItemSearch());
				}
			}
		},
		customer: _.debounce(function () {
			if (this.pos_profile.posa_force_reload_items) {
				if (this.pos_profile.posa_smart_reload_mode) {
					// When limit search is enabled there may be no items yet.
					// Fallback to full reload if nothing is loaded
					if (!this.itemsLoaded || !this.displayedItems.length) {
						if (!isOffline()) {
							this.get_items(true);
						} else {
							if (
								this.pos_profile &&
								(!this.pos_profile.posa_local_storage || !this.storageAvailable)
							) {
								this.get_items(true);
							} else {
								this.get_items();
							}
						}
					} else {
						// Only refresh prices for visible items when smart reload is enabled
						this.$nextTick(() => this.refreshPricesForVisibleItems());
					}
				} else {
					// Fall back to full reload
					if (!isOffline()) {
						this.get_items(true);
					} else {
						if (
							this.pos_profile &&
							(!this.pos_profile.posa_local_storage || !this.storageAvailable)
						) {
							this.get_items(true);
						} else {
							this.get_items();
						}
					}
				}
				return;
			}
			// When the customer changes, avoid reloading all items.
			// Simply refresh prices for visible items only
			if (this.itemsLoaded && this.displayedItems && this.displayedItems.length > 0) {
				this.$nextTick(() => this.refreshPricesForVisibleItems());
			} else {
				if (this.pos_profile && (!this.pos_profile.posa_local_storage || !this.storageAvailable)) {
					this.get_items(true);
				} else {
					this.get_items();
				}
			}
		}, 300),
		customer_price_list: _.debounce(async function () {
			if (this.pos_profile.posa_force_reload_items) {
				if (this.pos_profile.posa_smart_reload_mode) {
					// When limit search is enabled there may be no items yet.
					// Fallback to full reload if nothing is loaded
					if (!this.itemsLoaded || !this.items.length) {
						if (!isOffline()) {
							this.get_items(true);
						} else {
							this.get_items();
						}
					} else {
						// Only refresh prices for visible items when smart reload is enabled
						this.$nextTick(() => this.refreshPricesForVisibleItems());
					}
				} else {
					// Fall back to full reload
					if (!isOffline()) {
						this.get_items(true);
					} else {
						this.get_items();
					}
				}
				return;
			}
			// Apply cached rates if available for immediate update
			if (this.itemsLoaded && this.items && this.items.length > 0) {
				const cached = await getCachedPriceListItems(this.customer_price_list);
				if (cached && cached.length) {
					const map = {};
					cached.forEach((ci) => {
						map[ci.item_code] = ci;
					});
					this.items.forEach((it) => {
						const ci = map[it.item_code];
						if (ci) {
							const force =
								this.pos_profile?.posa_force_price_from_customer_price_list !== false;
							const price = ci.price_list_rate ?? ci.rate ?? 0;
							if (force || price) {
								it.rate = price;
								it.price_list_rate = price;
							}
						}
					});
					this.eventBus.emit("set_all_items", this.items);
					this.update_items_details(this.items);
					return;
				}
			}
			// No cache found - force a reload so prices are updated
			if (!isOffline()) {
				this.get_items(true);
			} else {
				if (this.pos_profile && (!this.pos_profile.posa_local_storage || !this.storageAvailable)) {
					this.get_items(true);
				} else {
					this.get_items();
				}
			}
		}, 300),
		new_line() {
			this.eventBus.emit("set_new_line", this.new_line);
		},
		item_group(newValue, oldValue) {
			if (this.usesLimitSearch && newValue !== oldValue) {
				if (this.pos_profile && (!this.pos_profile.posa_local_storage || !this.storageAvailable)) {
					this.get_items(true);
				} else {
					this.get_items();
				}
			} else if (this.pos_profile && this.pos_profile.posa_local_storage && newValue !== oldValue) {
				if (this.storageAvailable) {
					this.loadVisibleItems(true);
				} else {
					this.get_items(true);
				}
			}
		},
		displayedItems(new_value, old_value) {
			// Update item details if items changed
			if (!this.usesLimitSearch && new_value.length !== old_value.length) {
				this.update_items_details(new_value);
			}
			this.$nextTick(() => {
				this.checkItemContainerOverflow();
				this.scheduleCardMetricsUpdate();
			});
		},
		// Automatically search when the query has at least 3 characters
		first_search: _.debounce(function (val, oldVal) {
			if (this.clearingSearch) {
				return;
			}
			const newLen = (val || "").trim().length;
			const oldLen = (oldVal || "").trim().length;

			// When limit search is enabled, wait for an explicit Enter key press
			if (this.usesLimitSearch) {
				if (oldLen >= 3 && newLen === 0) {
					// Reset items only when search is fully cleared
					this.clearSearch();
				}
				return;
			}

			if (newLen >= 3) {
				// Call without arguments so search_onchange treats it like an Enter key
				this.search_onchange();
			} else if (oldLen >= 3 && newLen === 0) {
				// Reset items only when search is fully cleared
				this.clearSearch();
			}
		}, 300),

		// Refresh item prices whenever the user changes currency
		selected_currency() {
			this.applyCurrencyConversionToItems();
		},

		// Also react when exchange rate is adjusted manually
		exchange_rate() {
			this.applyCurrencyConversionToItems();
		},
		windowWidth() {
			// Keep the configured items per page on resize
			this.itemsPerPage = this.items_per_page;
			this.scheduleCardMetricsUpdate();
		},
		windowHeight() {
			// Maintain the configured items per page on resize
			this.itemsPerPage = this.items_per_page;
			this.scheduleCardMetricsUpdate();
		},
		itemsLoaded(val) {
			if (val) {
				this.eventBus.emit("itemsLoaded");
				this.eventBus.emit("data-loaded", "items");
			}
		},
		items_view() {
			this.$nextTick(() => {
				if (this.items_view === "card") {
					this.checkItemContainerOverflow();
					this.scheduleCardMetricsUpdate();
				} else {
					this.isOverflowing = false;
				}
			});
		},
	},

	methods: {
		// Performance optimization: Memoized search function
		memoizedSearch(searchTerm, itemGroup) {
			const cacheKey = `${searchTerm || ""}_${itemGroup || "ALL"}`;

			// Check if we have a cached result
			if (this.searchCache && this.searchCache.has(cacheKey)) {
				const cachedResult = this.searchCache.get(cacheKey);
				return cachedResult;
			}

			// Perform the search
			const result = this.performSearch(searchTerm, itemGroup);

			// Cache the result
			if (this.searchCache) {
				this.searchCache.set(cacheKey, result);
			}

			return result;
		},

		performSearch(searchTerm, itemGroup) {
			const mark = perfMarkStart("pos:search-filter");
			if (!this.items || !this.items.length) {
				perfMarkEnd("pos:search-filter", mark);
				return [];
			}

			let filtered = this.items;

			// Filter by item group
			if (itemGroup !== "ALL") {
				filtered = filtered.filter(
					(item) =>
						item.item_group && item.item_group.toLowerCase().includes(itemGroup.toLowerCase()),
				);
			}

			// Filter by search term only if it exists and is long enough
			if (searchTerm && searchTerm.trim() && searchTerm.trim().length >= 3) {
				const term = searchTerm.toLowerCase();
				filtered = filtered.filter((item) => {
					if (!searchWords.length) {
						return true;
					}

					const name = (item.item_name || "").toLowerCase();
					const code = (item.item_code || "").toLowerCase();

					const barcodeValues = [];
					if (Array.isArray(item.item_barcode)) {
						item.item_barcode.forEach((b) => {
							if (b?.barcode) {
								barcodeValues.push(String(b.barcode).toLowerCase());
							}
						});
					}
					if (Array.isArray(item.barcodes)) {
						item.barcodes.forEach((bc) => {
							if (bc) {
								barcodeValues.push(String(bc).toLowerCase());
							}
						});
					}
					if (item.barcode) {
						barcodeValues.push(String(item.barcode).toLowerCase());
					}

					return searchWords.every((word) => {
						return (
							code.includes(word) ||
							name.includes(word) ||
							barcodeValues.some((barcode) => barcode.includes(word))
						);
					});
				});
			}

			perfMarkEnd("pos:search-filter", mark);
			return filtered;
		},

		async fetchServerItemsTimestamp() {
			try {
				const { message } = await frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype: "Item",
						fields: ["modified"],
						order_by: "modified desc",
						limit_page_length: 1,
					},
				});
				return message && message[0] && message[0].modified;
			} catch (e) {
				console.error("Failed to fetch server items timestamp", e);
				return null;
			}
		},

		scheduleCardMetricsUpdate() {
			if (this.metricsRaf) {
				cancelAnimationFrame(this.metricsRaf);
			}
			this.metricsRaf = requestAnimationFrame(() => {
				this.metricsRaf = null;
				this.updateCardContainerMetrics();
			});
		},
		updateCardContainerMetrics() {
			this.$nextTick(() => {
				const ref = this.$refs.itemsContainer;
				const el = ref && ref.$el ? ref.$el : ref;
				if (!el || typeof el.getBoundingClientRect !== "function") {
					return;
				}
				const { width } = el.getBoundingClientRect();
				if (width && Math.round(width) !== Math.round(this.cardContainerWidth)) {
					this.cardContainerWidth = width;
				}
			});
		},
		async onVirtualRangeUpdate(_startIndex, _endIndex, _visibleStartIndex, visibleEndIndex) {
			const total = this.displayedItems ? this.displayedItems.length : 0;
			if (!total) {
				this.scheduleCardMetricsUpdate();
				return;
			}

			const threshold = Math.max(1, this.cardColumns * 2);
			const nearEnd = visibleEndIndex >= total - threshold;

			if (nearEnd && this.hasMoreCachedItems && !this.virtualScrollPending && !this.loading) {
				this.virtualScrollPending = true;
				try {
					await this.appendCachedItemsPage();
				} catch (error) {
					console.warn("Failed to append cached items page", error);
				} finally {
					this.virtualScrollPending = false;
					this.scheduleCardMetricsUpdate();
				}
			} else {
				this.scheduleCardMetricsUpdate();
			}
		},

		// Optimized scroll handler with throttling
		onCardScroll() {
			if (this.scrollThrottle) return;

			this.scrollThrottle = requestAnimationFrame(() => {
				try {
					const el = this.$refs.itemsContainer;
					if (!el) return;

					const scrollTop = el.scrollTop;
					const clientHeight = el.clientHeight;
					const scrollHeight = el.scrollHeight;

					// Only trigger load more if we're near the bottom
					if (scrollTop + clientHeight >= scrollHeight - 50) {
						this.currentPage += 1;
						this.loadVisibleItems();
					}

					this.lastScrollTop = scrollTop;
				} catch (error) {
					console.error("Error in card scroll handler:", error);
				} finally {
					this.scrollThrottle = null;
				}
			});
		},
		markStorageUnavailable(localOnly = false) {
			if (localOnly) {
				this.localStorageAvailable = false;
				return;
			}
			this.storageAvailable = false;
			this.localStorageAvailable = false;
			this.itemsPageLimit = null;
			if (this.itemWorker) {
				this.itemWorker.terminate();
				this.itemWorker = null;
			}
			if (this.pos_profile) {
				this.pos_profile.posa_local_storage = false;
			}
		},
		async ensureStorageHealth() {
			let localHealthy = true;
			try {
				if (typeof localStorage !== "undefined") {
					const t = "posa_test";
					localStorage.setItem(t, "1");
					localStorage.removeItem(t);
				}
			} catch (e) {
				console.warn("localStorage unavailable", e);
				localHealthy = false;
			}
			const dbHealthy = await checkDbHealth().catch(() => false);
			if (dbHealthy) {
				this.storageAvailable = true;
				if (!localHealthy) {
					this.markStorageUnavailable(true);
				} else {
					this.localStorageAvailable = true;
				}
				if (
					this.pos_profile &&
					this.pos_profile.posa_local_storage &&
					typeof Worker !== "undefined" &&
					!this.itemWorker
				) {
					try {
						const workerUrl = "/assets/posawesome/dist/js/posapp/workers/itemWorker.js";
						this.itemWorker = new Worker(workerUrl, { type: "classic" });
						this.itemWorker.onerror = function (event) {
							console.error("Worker error:", event);
							console.error("Message:", event.message);
							console.error("Filename:", event.filename);
							console.error("Line number:", event.lineno);
						};
					} catch (e) {
						console.error("Failed to start item worker", e);
						this.itemWorker = null;
					}
				}
			} else {
				this.markStorageUnavailable();
			}
			return dbHealthy;
		},
		async loadVisibleItems(reset = false) {
			this.loadProgress = 0;
			this.eventBus.emit("data-load-progress", { name: "items", progress: 0 });
			await initPromise;
			await this.ensureStorageHealth();

			if (reset) {
				this.currentPage = 0;
				await this.loadItems({
					searchValue: this.get_search(this.first_search),
					groupFilter: this.item_group,
					limit: this.usesLimitSearch ? this.limitSearchCap : undefined,
				});
			}

			const pageItems = await this.appendCachedItemsPage();

			if (Array.isArray(pageItems) && pageItems.length) {
				this.eventBus.emit("set_all_items", this.items);
				await this.update_items_details(pageItems);

				this.loadProgress = this.totalItemCount
					? Math.round((this.items.length / this.totalItemCount) * 100)
					: 100;

				this.eventBus.emit("data-load-progress", {
					name: "items",
					progress: this.loadProgress,
				});
			}
		},
		onListScroll(event) {
			if (this.scrollThrottle) return;

			this.scrollThrottle = requestAnimationFrame(() => {
				try {
					const el = event.target;
					if (el.scrollTop + el.clientHeight >= el.scrollHeight - 50) {
						this.currentPage += 1;
						this.loadVisibleItems();
					}
				} catch (error) {
					console.error("Error in list scroll handler:", error);
				} finally {
					this.scrollThrottle = null;
				}
			});
		},

		checkItemContainerOverflow() {
			const ref = this.$refs.itemsContainer;
			const el = ref && ref.$el ? ref.$el : ref;
			if (!el) {
				this.isOverflowing = false;
				return;
			}

			const containerHeight = parseFloat(getComputedStyle(el).getPropertyValue("--container-height"));
			if (isNaN(containerHeight)) {
				this.isOverflowing = false;
				return;
			}

			const stickyHeader = el.closest(".dynamic-padding")?.querySelector(".sticky-header");
			const headerHeight = stickyHeader ? stickyHeader.offsetHeight : 0;
			const availableHeight = containerHeight - headerHeight;

			el.style.maxHeight = `${availableHeight}px`;
			this.isOverflowing = el.scrollHeight > availableHeight;
			this.scheduleCardMetricsUpdate();
		},

		async fetchItemDetails(items) {
			if (!items || items.length === 0) {
				return [];
			}

			const key = [
				this.pos_profile.name,
				this.active_price_list,
				items.map((i) => i.item_code).join(","),
			].join(":");

			if (this.itemDetailsRequestCache.key === key && this.itemDetailsRequestCache.result) {
				return this.itemDetailsRequestCache.result;
			}

			if (this.itemDetailsRequestCache.key === key && this.itemDetailsRequestCache.promise) {
				return this.itemDetailsRequestCache.promise;
			}

			this.cancelItemDetailsRequest();
			this.itemDetailsRequestCache.key = key;

			this.abortController = new AbortController();
			const requestPromise = frappe.call({
				method: "posawesome.posawesome.api.items.get_items_details",
				args: {
					pos_profile: JSON.stringify(this.pos_profile),
					items_data: JSON.stringify(items),
					price_list: this.active_price_list,
				},
				freeze: false,
				signal: this.abortController.signal,
			});

			this.itemDetailsRequestCache.promise = requestPromise;

			try {
				const r = await requestPromise;
				const msg = (r && r.message) || [];
				if (this.itemDetailsRequestCache.key === key) {
					this.itemDetailsRequestCache.result = msg;
				}
				return msg;
			} catch (err) {
				if (err.name !== "AbortError") {
					console.error("Error fetching item details:", err);
				}
				throw err;
			} finally {
				if (this.itemDetailsRequestCache.key === key) {
					this.itemDetailsRequestCache.promise = null;
				}
				this.abortController = null;
			}
		},
		cancelItemDetailsRequest() {
			if (this.abortController) {
				this.abortController.abort();
				this.abortController = null;
			}
			if (this.itemDetailsRequestCache) {
				this.itemDetailsRequestCache.key = null;
				this.itemDetailsRequestCache.promise = null;
				this.itemDetailsRequestCache.result = null;
			}
		},
		async refreshPricesForVisibleItems() {
			const vm = this;
			if (!vm.displayedItems || vm.displayedItems.length === 0) return;

			if (vm.refreshInFlight) {
				return;
			}

			vm.refreshInFlight = true;
			const wasLoading = vm.loading;
			if (!wasLoading) {
				vm.loading = true;
			}
			const releaseLoading = () => {
				if (!wasLoading) {
					vm.loading = false;
				}
			};

			try {
				const itemCodes = vm.displayedItems.map((it) => it.item_code);
				const cacheResult = await getCachedItemDetails(
					vm.pos_profile.name,
					vm.active_price_list,
					itemCodes,
				);
				const updates = [];

				cacheResult.cached.forEach((det) => {
					const item = vm.displayedItems.find((it) => it.item_code === det.item_code);
					if (item) {
						const upd = { actual_qty: det.actual_qty };
						if (det.item_uoms && det.item_uoms.length > 0) {
							upd.item_uoms = det.item_uoms;
							saveItemUOMs(item.item_code, det.item_uoms);
						}
						if (det.rate !== undefined) {
							const force = vm.pos_profile?.posa_force_price_from_customer_price_list !== false;
							const price = det.price_list_rate ?? det.rate ?? 0;
							if (force || price) {
								upd.rate = price;
								upd.price_list_rate = price;
							}
						}
						if (det.currency) {
							upd.currency = det.currency;
						}
						updates.push({ item, upd });
					}
				});

				if (cacheResult.missing.length === 0) {
					vm.$nextTick(() => {
						updates.forEach(({ item, upd }) => Object.assign(item, upd));
						updateLocalStockCache(cacheResult.cached);
						releaseLoading();
					});
					return;
				}

				const itemsToFetch = vm.displayedItems.filter((it) =>
					cacheResult.missing.includes(it.item_code),
				);

				const details = await vm.fetchItemDetails(itemsToFetch);
				details.forEach((updItem) => {
					const item = vm.displayedItems.find((it) => it.item_code === updItem.item_code);
					if (item) {
						const upd = { actual_qty: updItem.actual_qty };
						if (updItem.item_uoms && updItem.item_uoms.length > 0) {
							upd.item_uoms = updItem.item_uoms;
							saveItemUOMs(item.item_code, updItem.item_uoms);
						}
						if (updItem.rate !== undefined) {
							const force = vm.pos_profile?.posa_force_price_from_customer_price_list !== false;
							const price = updItem.price_list_rate ?? updItem.rate ?? 0;
							if (force || price) {
								upd.rate = price;
								upd.price_list_rate = price;
							}
						}
						if (updItem.currency) {
							upd.currency = updItem.currency;
						}
						if (updItem.batch_no_data) {
							upd.batch_no_data = updItem.batch_no_data;
						}
						if (updItem.serial_no_data) {
							upd.serial_no_data = updItem.serial_no_data;
						}
						updates.push({ item, upd });
					}
				});

				vm.$nextTick(async () => {
					updates.forEach(({ item, upd }) => Object.assign(item, upd));
					updateLocalStockCache(details);
					saveItemDetailsCache(vm.pos_profile.name, vm.active_price_list, details);
					if (
						vm.pos_profile &&
						vm.pos_profile.posa_local_storage &&
						vm.storageAvailable &&
						!vm.usesLimitSearch
					) {
						try {
							await saveItemsBulk(details);
						} catch (e) {
							console.error("Failed to persist item details", e);
							vm.markStorageUnavailable && vm.markStorageUnavailable();
						}
					}
					releaseLoading();
				});
			} catch (err) {
				if (err.name !== "AbortError") {
					console.error("Error fetching item details:", err);
					releaseLoading();
				}
			} finally {
				vm.refreshInFlight = false;
				releaseLoading();
			}
		},

		show_offers() {
			this.eventBus.emit("show_offers", "true");
		},
		show_coupons() {
			this.eventBus.emit("show_coupons", "true");
		},
		async initializeItems() {
			await this.ensureStorageHealth();
			if (
				this.pos_profile &&
				this.pos_profile.posa_local_storage &&
				this.storageAvailable &&
				!this.usesLimitSearch
			) {
				const localCount = await getStoredItemsCount();
				if (localCount > 0) {
					await this.loadVisibleItems(true);
					await this.verifyServerItemCount();
					return;
				}
			}
			await this.get_items(true);

			if (
				this.pos_profile &&
				this.pos_profile.posa_local_storage &&
				this.storageAvailable &&
				!this.usesLimitSearch
			) {
				await this.verifyServerItemCount();
			}
		},
		async forceReloadItems() {
			console.log("[ItemsSelector] forceReloadItems called");
			// Clear cached price list items so the reload always
			// fetches the latest data from the server
			await clearPriceListCache();
			console.log("[ItemsSelector] price list cache cleared");
			await this.ensureStorageHealth();
			console.log("[ItemsSelector] storage health ensured");

			// When no search term is entered, reset the search so
			// we fetch the entire item list from the server.
			if (!this.first_search || !this.first_search.trim()) {
				console.log("[ItemsSelector] resetting empty search before reload");
				this.first_search = "";
				this.search = "";
			}

			console.log("[ItemsSelector] loading items from server");
			await this.get_items(true);
			console.log("[ItemsSelector] forceReloadItems finished");
		},
		async verifyServerItemCount() {
			if (this.usesLimitSearch) {
				console.log("[ItemsSelector] limit search enabled, skipping background reconciliation");
				return;
			}
			if (!this.pos_profile || !this.pos_profile.posa_local_storage || !this.storageAvailable) {
				console.log("[ItemsSelector] local caching disabled, skipping background reconciliation");
				return;
			}
			if (this.isBackgroundLoading) {
				console.log("[ItemsSelector] background load already in progress, skipping reconciliation");
				return;
			}
			if (isOffline()) {
				console.log("[ItemsSelector] offline, skipping server item count check");
				return;
			}
			try {
				const localCount = await getStoredItemsCount();
				console.log("[ItemsSelector] verifying server item count", { localCount });
				const profileGroups = (this.pos_profile?.item_groups || []).map((g) => g.item_group);
				const res = await frappe.call({
					method: "posawesome.posawesome.api.items.get_items_count",
					args: {
						pos_profile: JSON.stringify(this.pos_profile),
						item_groups: profileGroups,
					},
				});
				const serverCount = res.message || 0;
				console.log("[ItemsSelector] server item count result", { serverCount });
				if (typeof serverCount === "number") {
					this.totalItemCount = serverCount;
					if (serverCount <= localCount) {
						this.loadProgress = serverCount
							? Math.min(100, Math.round((localCount / serverCount) * 100))
							: 100;
						this.eventBus.emit("data-load-progress", {
							name: "items",
							progress: this.loadProgress,
						});
						if (serverCount < localCount) {
							console.log("[ItemsSelector] local cache has extra items, forcing reload");
							await this.forceReloadItems();
						}
						return;
					}

					this.loadProgress = serverCount ? Math.round((localCount / serverCount) * 100) : 0;
					this.eventBus.emit("data-load-progress", {
						name: "items",
						progress: this.loadProgress,
					});

					const lastSync = getItemsLastSync();
					const requestToken = ++this.items_request_token;
					await this.backgroundLoadItems();
				}
			} catch (err) {
				console.error("Error checking item count:", err);
			}
		},
		async get_items(force_server = false) {
			if (this.isBackgroundLoading) {
				if (this.pendingGetItems) {
					this.pendingGetItems.force_server = this.pendingGetItems.force_server || force_server;
				} else {
					this.pendingGetItems = { force_server };
				}
				return;
			}

			if (!this.pos_profile || !this.pos_profile.name) {
				console.warn("No POS Profile available, attempting to get it...");
				try {
					if (frappe.boot && frappe.boot.pos_profile) {
						this.pos_profile = frappe.boot.pos_profile;
					} else {
						frappe.msgprint(__("Please configure a POS Profile first"));
						return;
					}
				} catch (error) {
					console.error("Failed to get POS Profile:", error);
					return;
				}
			}

			const searchValue = this.get_search(this.first_search);
			const normalizedGroup =
				typeof this.item_group === "string" && this.item_group.length > 0 ? this.item_group : "ALL";

			console.log("[ItemsSelector] get_items via store", {
				force_server,
				searchValue,
				normalizedGroup,
			});

			this.eventBus.emit("data-load-progress", { name: "items", progress: 0 });
			const requestToken = ++this.items_request_token;

			try {
				const result = await this.loadItems({
					forceServer: force_server,
					searchValue,
					groupFilter: normalizedGroup,
					priceList: this.customer_price_list,
					limit: this.usesLimitSearch ? this.limitSearchCap : undefined,
				});

				const resolvedItems = Array.isArray(result) && result.length ? result : this.items;
				this.replaceBarcodeIndex(resolvedItems);
				this.eventBus.emit("set_all_items", resolvedItems);

				const progress = this.loadProgress
					? this.loadProgress
					: this.totalItemCount
						? Math.round((resolvedItems.length / this.totalItemCount) * 100)
						: 100;

				this.eventBus.emit("data-load-progress", {
					name: "items",
					progress,
				});

				if (!this.usesLimitSearch && this.hasMoreCachedItems) {
					await this.appendCachedItemsPage();
				}

				if (!this.usesLimitSearch && requestToken === this.items_request_token) {
					this.kickoffBackgroundSync();
				}
			} catch (error) {
				console.error("Failed to load items via store:", error);
				frappe.msgprint(__("Failed to load items. Please try again."));
			}
		},
		kickoffBackgroundSync() {
			if (this.isBackgroundLoading || this.usesLimitSearch) {
				return Promise.resolve([]);
			}

			const normalizedSearch = this.get_search(this.first_search || "").trim();

			this.isBackgroundLoading = true;

			return this.backgroundSyncItems({
				groupFilter: this.item_group,
				searchValue: normalizedSearch,
			})
				.then((appended) => {
					if (Array.isArray(appended) && appended.length) {
						this.eventBus.emit("set_all_items", this.items);
					}
					return appended;
				})
				.finally(() => {
					this.finishBackgroundLoad();
				});
		},
		finishBackgroundLoad() {
			this.isBackgroundLoading = false;

			const pendingSearch = this.pendingItemSearch;
			this.pendingItemSearch = null;
			if (pendingSearch) {
				this.search_onchange(pendingSearch);
				if (this.search_onchange.flush) {
					this.search_onchange.flush();
				}
				return;
			}

			if (this.pendingGetItems) {
				const { force_server: forceServer } = this.pendingGetItems;
				this.pendingGetItems = null;
				this.get_items(!!forceServer);
			}
		},
		async backgroundLoadItems() {
			return this.kickoffBackgroundSync();
		},

		get_items_groups() {
			if (!this.pos_profile) {
				console.log("No POS Profile");
				return;
			}
			this.items_group = ["ALL"];
			if (this.pos_profile.item_groups.length > 0) {
				const groups = [];
				this.pos_profile.item_groups.forEach((element) => {
					if (element.item_group !== "All Item Groups") {
						this.items_group.push(element.item_group);
						groups.push(element.item_group);
					}
				});
				saveItemGroups(groups);
			} else if (isOffline()) {
				const cached = getCachedItemGroups();
				cached.forEach((g) => {
					this.items_group.push(g);
				});
			} else {
				const vm = this;
				frappe.call({
					method: "posawesome.posawesome.api.items.get_items_groups",
					args: {},
					callback: function (r) {
						if (r.message) {
							const groups = [];
							r.message.forEach((element) => {
								vm.items_group.push(element.name);
								groups.push(element.name);
							});
							saveItemGroups(groups);
						}
					},
				});
			}
		},
		getItemsHeaders() {
			const items_headers = [
				{
					title: __("Name"),
					align: "start",
					sortable: true,
					key: "item_name",
				},
				{
					title: __("Code"),
					align: "start",
					sortable: true,
					key: "item_code",
				},
				{ title: __("Rate"), key: "rate", align: "start" },
				{ title: __("Available QTY"), key: "actual_qty", align: "start" },
				{ title: __("UOM"), key: "stock_uom", align: "start" },
			];
			if (!this.pos_profile.posa_display_item_code) {
				items_headers.splice(1, 1);
			}

			return items_headers;
		},
		select_item(event, item) {
			const targets = document.querySelectorAll(".items-table-container");
			const target = targets[targets.length - 1];
			const source = event.currentTarget?.querySelector?.(".card-item-image") || event.currentTarget;
			if (target && source && this.fly) {
				this.fly(source, target, this.flyConfig);
			}
			this.add_item(item);
		},
		async click_item_row(event, { item }) {
			const targets = document.querySelectorAll(".items-table-container");
			const target = targets[targets.length - 1];
			if (target && this.fly) {
				const placeholder = document.createElement("div");
				placeholder.style.width = "40px";
				placeholder.style.height = "40px";
				placeholder.style.background = "#ccc";
				placeholder.style.borderRadius = "50%";
				placeholder.style.position = "fixed";
				placeholder.style.top = `${event.clientY - 20}px`;
				placeholder.style.left = `${event.clientX - 20}px`;
				document.body.appendChild(placeholder);
				this.fly(placeholder, target, this.flyConfig);
				placeholder.remove();
			}
			await this.add_item(item);
		},
		async add_item(item, options = {}) {
			const { suppressNegativeWarning = false } = options;
			item = { ...item };

			// Handle variant items
			if (item.has_variants) {
				await this.handleVariantItem(item);
				return;
			}

			// Validate item before adding to cart
			const requestedQty = this.qty != null ? Math.abs(this.qty) : 1;
			const isValid = await this.cartValidation.validateCartItem(
				item,
				requestedQty,
				this.pos_profile,
				this.stock_settings,
				this.eventBus,
				this.blockSaleBeyondAvailableQty,
				!suppressNegativeWarning,
			);

			if (!isValid) {
				// Validation failed, error message already shown by validator
				return;
			}

			// Prepare item for cart
			await this.prepareItemForCart(item, requestedQty);

			// Add item to cart
			const payload = { ...item };
			delete payload._barcode_qty;
			this.eventBus.emit("add_item", payload);
			this.qty = 1;
		},

		/**
		 * Handle variant item selection
		 */
		async handleVariantItem(item) {
			let variants = this.items.filter((it) => it.variant_of == item.item_code);
			let attrsMeta = {};

			// Fetch variants if not already loaded
			if (!variants.length) {
				try {
					const res = await frappe.call({
						method: "posawesome.posawesome.api.items.get_item_variants",
						args: {
							pos_profile: JSON.stringify(this.pos_profile),
							parent_item_code: item.item_code,
							price_list: this.active_price_list,
							customer: this.customer,
						},
					});
					if (res.message) {
						variants = res.message.variants || res.message;
						attrsMeta = res.message.attributes_meta || {};
						this.items.push(...variants);
					}
				} catch (e) {
					console.error("Failed to fetch variants", e);
				}
			}

			// Show variant selection dialog
			this.eventBus.emit("show_message", {
				title: __("This is an item template. Please choose a variant."),
				color: "warning",
			});

			attrsMeta = attrsMeta || {};
			this.eventBus.emit("open_variants_model", item, variants, this.pos_profile, attrsMeta);
		},

		/**
		 * Prepare item for adding to cart (UOMs, currency conversion, etc.)
		 */
		async prepareItemForCart(item, requestedQty) {
			// Ensure UOMs are initialized
			if (!item.item_uoms || item.item_uoms.length === 0) {
				await this.update_items_details([item]);
				if (!item.item_uoms || item.item_uoms.length === 0) {
					item.item_uoms = [{ uom: item.stock_uom, conversion_factor: 1.0 }];
				}
			}

			// Handle multi-currency conversion
			if (this.pos_profile.posa_allow_multi_currency) {
				this.applyCurrencyConversionToItem(item);

				const base_rate =
					item.original_currency === this.pos_profile.currency
						? item.original_rate
						: item.original_rate * (item.plc_conversion_rate || this.exchange_rate);

				item.base_rate = base_rate;
				item.base_price_list_rate = base_rate;
			}

			// Set final quantity
			const hasBarcodeQty = item._barcode_qty;
			if (!item.qty || (item.qty === 1 && !hasBarcodeQty)) {
				let qtyVal = requestedQty;
				if (this.hide_qty_decimals) {
					qtyVal = Math.trunc(qtyVal);
				}
				item.qty = qtyVal;
			}
		},
		async enter_event() {
			if (!this.displayedItems.length || !this.first_search) {
				return;
			}

			// Derive the searchable code and detect scale barcode
			const search = this.get_search(this.first_search);
			const isScaleBarcode =
				this.pos_profile?.posa_scale_barcode_start &&
				this.first_search.startsWith(this.pos_profile.posa_scale_barcode_start);
			this.search = search;

			const qty = parseFloat(this.get_item_qty(this.first_search));
			const new_item = { ...this.displayedItems[0] };
			new_item.qty = flt(qty);
			if (isScaleBarcode) {
				new_item._barcode_qty = true;
			}

			let match = false;
			if (Array.isArray(new_item.item_barcode)) {
				new_item.item_barcode.forEach((element) => {
					if (search === element.barcode) {
						new_item.uom = element.posa_uom;
						match = true;
					}
				});
			}
			if (!match && new_item.barcode === search) {
				match = true;
			}
			if (!match && Array.isArray(new_item.barcodes)) {
				match = new_item.barcodes.some((bc) => String(bc) === search);
			}

			if (this.flags.serial_no) {
				new_item.to_set_serial_no = this.flags.serial_no;
			}
			if (this.flags.batch_no) {
				new_item.to_set_batch_no = this.flags.batch_no;
			}

			if (match) {
				const fromScanner = this.search_from_scanner;
				const scannedCodeForDisplay = this.pendingScanCode || this.first_search || search;
				const availableQty =
					typeof new_item.available_qty === "number"
						? new_item.available_qty
						: typeof new_item.actual_qty === "number"
							? new_item.actual_qty
							: null;
				const requestedQty = Math.abs(new_item.qty || 1);

				if (availableQty !== null && availableQty < requestedQty) {
					const negativeStockEnabled = this.isNegativeStockEnabled();
					const shouldBlock =
						!negativeStockEnabled && (this.blockSaleBeyondAvailableQty || availableQty <= 0);

					if (shouldBlock || negativeStockEnabled) {
						const formattedAvailable = this.format_number
							? this.format_number(
									availableQty,
									this.hide_qty_decimals ? 0 : this.float_precision,
								)
							: availableQty;
						const formattedRequested = this.format_number
							? this.format_number(
									requestedQty,
									this.hide_qty_decimals ? 0 : this.float_precision,
								)
							: requestedQty;

						if (shouldBlock) {
							this.showScanError({
								message: formatStockShortageError(
									new_item.item_name || new_item.item_code || scannedCodeForDisplay,
									availableQty,
									requestedQty,
								),
								code: scannedCodeForDisplay,
								details: this.__("Adjust the quantity or enable negative stock to continue."),
							});
							return;
						}

						// Low stock warnings are suppressed to avoid distracting notifications
					}
				}

				if (fromScanner) {
					this.awaitingScanResult = true;
				}

				try {
					await this.add_item(new_item, { suppressNegativeWarning: true });
					if (fromScanner) {
						this.playScanTone("success");
						this.scannerLocked = false;
						this.pendingScanCode = "";
					}
				} finally {
					if (fromScanner) {
						this.awaitingScanResult = false;
					}
				}

				this.flags.serial_no = null;
				this.flags.batch_no = null;
				this.qty = 1;

				if (fromScanner) {
					this.search_from_scanner = false;
				}

				if (!this.scanErrorDialog) {
					// Clear search field after successfully adding an item
					this.clearSearch();
					this.focusItemSearch();
				}
			}
		},
		search_onchange: _.debounce(
			withPerf("pos:search-trigger", async function (newSearchTerm) {
				const vm = this;

				vm.cancelItemDetailsRequest();

				// Determine the actual query string and trim whitespace
				let query;
				if (typeof newSearchTerm === "string") {
					query = newSearchTerm;
				} else if (newSearchTerm && newSearchTerm.target) {
					query = newSearchTerm.target?.value ?? "";
				} else {
					query = vm.first_search;
				}
				const trimmedQuery = (query || "").trim();

				// Keep first_search in sync with the value we are about to search for
				vm.first_search = trimmedQuery;

				// Require a minimum of three characters before running a search
				if (!trimmedQuery || trimmedQuery.length < 3) {
					vm.search_from_scanner = false;
					return;
				}

				// If background loading is in progress, defer the search without changing the active query
				if (vm.isBackgroundLoading) {
					vm.pendingItemSearch = trimmedQuery;
					return;
				}

				vm.search = trimmedQuery;

				const fromScanner = vm.search_from_scanner;

				if (vm.usesLimitSearch) {
					const shouldForceServer =
						!vm.pos_profile.posa_local_storage || !vm.storageAvailable || !isOffline();
					await vm.get_items(shouldForceServer);
				} else if (vm.pos_profile && vm.pos_profile.posa_local_storage) {
					if (vm.storageAvailable) {
						await vm.loadVisibleItems(true);
						vm.enter_event();
					} else {
						vm.get_items(true);
					}
				} else {
					// When local storage is disabled, always fetch items
					// from the server so searches aren't limited to the
					// initially loaded set.
					await vm.get_items(true);
					vm.enter_event();

					if (vm.displayedItems && vm.displayedItems.length > 0) {
						setTimeout(() => {
							vm.update_items_details(vm.displayedItems);
						}, 300);
					}
				}

				// Clear the input only when triggered via scanner
				if (fromScanner) {
					vm.clearSearch();
					vm.focusItemSearch();
					vm.search_from_scanner = false;
				}
			}),
			300,
		),
		get_item_qty(first_search) {
			const qtyVal = this.qty != null ? this.qty : 1;
			let scal_qty = Math.abs(qtyVal);
			const prefix_len = this.pos_profile.posa_scale_barcode_start?.length || 0;

			if (first_search.startsWith(this.pos_profile.posa_scale_barcode_start)) {
				// Determine item code length dynamically based on EAN-13 structure:
				// prefix + item_code + 5 qty digits + 1 check digit
				const item_code_len = first_search.length - prefix_len - 6;
				let pesokg1 = first_search.substr(prefix_len + item_code_len, 5);
				let pesokg;
				if (pesokg1.startsWith("0000")) {
					pesokg = "0.00" + pesokg1.substr(4);
				} else if (pesokg1.startsWith("000")) {
					pesokg = "0.0" + pesokg1.substr(3);
				} else if (pesokg1.startsWith("00")) {
					pesokg = "0." + pesokg1.substr(2);
				} else if (pesokg1.startsWith("0")) {
					pesokg = pesokg1.substr(1, 1) + "." + pesokg1.substr(2, pesokg1.length);
				} else if (!pesokg1.startsWith("0")) {
					pesokg = pesokg1.substr(0, 2) + "." + pesokg1.substr(2, pesokg1.length);
				}
				scal_qty = pesokg;
			}
			if (this.hide_qty_decimals) {
				scal_qty = Math.trunc(scal_qty);
			}
			return scal_qty;
		},
		get_search(first_search) {
			if (!first_search) return "";
			const prefix_len = this.pos_profile.posa_scale_barcode_start?.length || 0;
			if (!first_search.startsWith(this.pos_profile.posa_scale_barcode_start)) {
				return first_search;
			}
			// Calculate item code length from total barcode length
			const item_code_len = first_search.length - prefix_len - 6;
			return first_search.substr(0, prefix_len + item_code_len);
		},
		esc_event() {
			this.search = null;
			this.first_search = null;
			this.search_backup = null;
			this.qty = 1;
			this.focusItemSearch();
		},
		async update_items_details(items) {
			const vm = this;
			if (!items || !items.length) return;

			// reset any pending retry timer
			if (vm.itemDetailsRetryTimeout) {
				clearTimeout(vm.itemDetailsRetryTimeout);
				vm.itemDetailsRetryTimeout = null;
			}

			const itemCodes = items.map((it) => it.item_code);
			const cacheResult = await getCachedItemDetails(
				vm.pos_profile.name,
				vm.active_price_list,
				itemCodes,
			);
			cacheResult.cached.forEach((det) => {
				const item = items.find((it) => it.item_code === det.item_code);
				if (item) {
					Object.assign(item, {
						actual_qty: det.actual_qty,
						has_batch_no: det.has_batch_no,
						has_serial_no: det.has_serial_no,
					});
					if (det.item_uoms && det.item_uoms.length > 0) {
						item.item_uoms = det.item_uoms;
						saveItemUOMs(item.item_code, det.item_uoms);
					}
					if (det.rate !== undefined) {
						const force = vm.pos_profile?.posa_force_price_from_customer_price_list !== false;
						const price = det.price_list_rate ?? det.rate ?? 0;
						if (force || price) {
							item.rate = price;
							item.price_list_rate = price;
						}
					}
					if (det.currency) {
						item.currency = det.currency;
					}

					if (!item.original_rate) {
						item.original_rate = item.rate;
						item.original_currency = item.currency || vm.pos_profile.currency;
					}

					vm.indexItem(item);
					vm.applyCurrencyConversionToItem(item);
				}
			});

			let allCached = cacheResult.missing.length === 0;
			items.forEach((item) => {
				const localQty = getLocalStock(item.item_code);
				if (localQty !== null) {
					item.actual_qty = localQty;
				} else {
					allCached = false;
				}

				if (!item.item_uoms || item.item_uoms.length === 0) {
					const cachedUoms = getItemUOMs(item.item_code);
					if (cachedUoms.length > 0) {
						item.item_uoms = cachedUoms;
					} else if (isOffline()) {
						item.item_uoms = [{ uom: item.stock_uom, conversion_factor: 1.0 }];
					} else {
						allCached = false;
					}
				}
			});

			// When offline or everything is cached, skip server call
			if (isOffline() || allCached) {
				vm.itemDetailsRetryCount = 0;
				return;
			}

			const itemsToFetch = items.filter(
				(it) => cacheResult.missing.includes(it.item_code) && !it.has_variants,
			);

			if (itemsToFetch.length === 0) {
				vm.itemDetailsRetryCount = 0;
				return;
			}

			try {
				const details = await vm.fetchItemDetails(itemsToFetch);
				if (details && details.length) {
					vm.itemDetailsRetryCount = 0;
					let qtyChanged = false;
					let updatedItems = [];

					items.forEach((item) => {
						const updated_item = details.find((element) => element.item_code == item.item_code);
						if (updated_item) {
							const prev_qty = item.actual_qty;

							updatedItems.push({
								item: item,
								updates: {
									actual_qty: updated_item.actual_qty,
									has_batch_no: updated_item.has_batch_no,
									has_serial_no: updated_item.has_serial_no,
									batch_no_data:
										updated_item.batch_no_data && updated_item.batch_no_data.length > 0
											? updated_item.batch_no_data
											: item.batch_no_data,
									serial_no_data:
										updated_item.serial_no_data && updated_item.serial_no_data.length > 0
											? updated_item.serial_no_data
											: item.serial_no_data,
									item_uoms:
										updated_item.item_uoms && updated_item.item_uoms.length > 0
											? updated_item.item_uoms
											: item.item_uoms,
									rate: updated_item.rate !== undefined ? updated_item.rate : item.rate,
									price_list_rate:
										updated_item.price_list_rate !== undefined
											? updated_item.price_list_rate
											: item.price_list_rate,
									currency: updated_item.currency || item.currency,
								},
							});

							if (prev_qty > 0 && updated_item.actual_qty === 0) {
								qtyChanged = true;
							}

							if (updated_item.item_uoms && updated_item.item_uoms.length > 0) {
								saveItemUOMs(item.item_code, updated_item.item_uoms);
							}
						}
					});

					updatedItems.forEach(({ item, updates }) => {
						Object.assign(item, updates);
						vm.indexItem(item);
						vm.applyCurrencyConversionToItem(item);
					});

					updateLocalStockCache(details);
					saveItemDetailsCache(vm.pos_profile.name, vm.active_price_list, details);

					if (
						vm.pos_profile &&
						vm.pos_profile.posa_local_storage &&
						vm.storageAvailable &&
						!vm.usesLimitSearch
					) {
						try {
							await saveItemsBulk(details);
						} catch (e) {
							console.error("Failed to persist item details", e);
							vm.markStorageUnavailable && vm.markStorageUnavailable();
						}
					}

					if (qtyChanged) {
						vm.$forceUpdate();
					}
				}
			} catch (err) {
				if (err.name !== "AbortError") {
					console.error("Error fetching item details:", err);
					items.forEach((item) => {
						const localQty = getLocalStock(item.item_code);
						if (localQty !== null) {
							item.actual_qty = localQty;
						}
						if (!item.item_uoms || item.item_uoms.length === 0) {
							const cached = getItemUOMs(item.item_code);
							if (cached.length > 0) {
								item.item_uoms = cached;
							}
						}
					});

					if (!isOffline()) {
						vm.itemDetailsRetryCount += 1;
						const delay = Math.min(32000, 1000 * Math.pow(2, vm.itemDetailsRetryCount - 1));
						vm.itemDetailsRetryTimeout = setTimeout(() => {
							vm.update_items_details(items);
						}, delay);
					}
				}
			}

			// Cleanup on component destroy
			this.cleanupBeforeDestroy = () => {
				if (vm.abortController) {
					vm.abortController.abort();
				}
			};
		},
		update_cur_items_details() {
			if (this.displayedItems && this.displayedItems.length > 0) {
				this.update_items_details(this.displayedItems);
			}
		},
		async prePopulateStockCache(items) {
			if (this.prePopulateInProgress) {
				return;
			}
			if (!Array.isArray(items) || items.length === 0) {
				return;
			}
			this.prePopulateInProgress = true;
			try {
				const cache = getLocalStockCache();
				const cacheSize = Object.keys(cache).length;

				if (isStockCacheReady() && cacheSize >= items.length) {
					console.debug("Stock cache already initialized");
					return;
				}

				if (items.length > 500) {
					console.info("Pre-populating stock cache for", items.length, "items in batches");
				} else {
					console.info("Pre-populating stock cache for", items.length, "items");
				}

				await initializeStockCache(items, this.pos_profile);
			} catch (error) {
				console.error("Failed to pre-populate stock cache:", error);
			} finally {
				this.prePopulateInProgress = false;
			}
		},

		applyCurrencyConversionToItems() {
			if (!this.items || !this.items.length) return;
			this.items.forEach((it) => this.applyCurrencyConversionToItem(it));
		},

		applyCurrencyConversionToItem(item) {
			if (!item) return;
			const base = this.pos_profile.currency;

			if (!item.original_rate) {
				item.original_rate = item.rate;
				item.original_currency = item.currency || base;
			}

			// original_rate is in price list currency
			const price_list_rate = item.original_rate;

			// Determine base rate using available conversion info
			const base_rate = price_list_rate * (item.plc_conversion_rate || 1);

			item.base_rate = base_rate;
			item.base_price_list_rate = price_list_rate;

			// If the price list currency matches the selected currency,
			// don't apply any conversion
			const converted_rate =
				item.original_currency === this.selected_currency
					? price_list_rate
					: price_list_rate * (this.exchange_rate || 1);

			item.rate = this.flt(converted_rate, this.currency_precision);
			item.currency = this.selected_currency;
			item.price_list_rate = item.rate;
		},
		scan_barcoud() {
			const vm = this;
			try {
				// Check if scanner is already attached to document
				if (document._scannerAttached) {
					return;
				}

				onScan.attachTo(document, {
					suffixKeyCodes: [],
					keyCodeMapper: function (oEvent) {
						oEvent.stopImmediatePropagation();
						oEvent.preventDefault();
						return onScan.decodeKeyEvent(oEvent);
					},
					onScan: function (sCode) {
						if (vm.scannerLocked) {
							vm.playScanTone("error");
							return;
						}
						vm.trigger_onscan(sCode);
					},
				});

				// Mark document as having scanner attached
				document._scannerAttached = true;
			} catch (error) {
				console.warn("Scanner initialization error:", error.message);
			}
		},
		trigger_onscan(sCode) {
			if (this.scannerLocked) {
				this.playScanTone("error");
				return;
			}
			// indicate this search came from a scanner
			this.search_from_scanner = true;
			// apply scanned code as search term
			this.first_search = sCode;
			this.search = sCode;
			this.pendingScanCode = sCode;

			this.$nextTick(() => {
				if (this.displayedItems.length == 0) {
					this.eventBus.emit("show_message", {
						title: `No Item has this barcode "${sCode}"`,
						color: "error",
					});
					this.showScanError({
						message: `${this.__("Item not found")}: ${sCode}`,
						code: sCode,
						details: this.__("Please verify the barcode or search manually."),
					});
				} else {
					this.enter_event();
				}

				// clear search field for next scan and refocus input
				if (!this.scanErrorDialog) {
					this.clearSearch();
					this.focusItemSearch();
				}
			});
		},
		generateWordCombinations(inputString) {
			const words = inputString.split(" ");
			const wordCount = words.length;
			const combinations = [];

			// Helper function to generate all permutations
			function permute(arr, m = []) {
				if (arr.length === 0) {
					combinations.push(m.join(" "));
				} else {
					for (let i = 0; i < arr.length; i++) {
						const current = arr.slice();
						const next = current.splice(i, 1);
						permute(current.slice(), m.concat(next));
					}
				}
			}

			permute(words);

			return combinations;
		},
		clearSearch() {
			if (this.clearingSearch) {
				return;
			}

			const hadQuery = Boolean(
				(this.first_search && this.first_search.trim()) || (this.search && this.search.trim()),
			);
			const shouldReload = hadQuery || !this.itemsLoaded || !this.items.length;

			this.search_backup = this.first_search;
			this.clearingSearch = true;
			this.first_search = "";
			this.search = "";

			const release = () => {
				this.$nextTick(() => {
					this.clearingSearch = false;
				});
			};

			if (this.usesLimitSearch) {
				const preservedItems =
					this.clearLimitSearchResults({ preserveItems: true }) || this.items || [];
				this.resetBarcodeIndex();

				if (Array.isArray(preservedItems) && preservedItems.length) {
					this.eventBus.emit("set_all_items", preservedItems);
				} else if (Array.isArray(this.items) && this.items.length) {
					this.eventBus.emit("set_all_items", this.items);
				}

				if (shouldReload) {
					this.eventBus.emit("data-load-progress", { name: "items", progress: 0 });
					const reloadPromise = this.get_items(true);
					if (reloadPromise && typeof reloadPromise.finally === "function") {
						reloadPromise.finally(release);
						return reloadPromise;
					}
				}

				release();
				return;
			}

			if (!shouldReload) {
				release();
				return;
			}

			if (this.pos_profile?.posa_local_storage && this.storageAvailable) {
				this.loadVisibleItems(true);
				if (!this.isBackgroundLoading) {
					this.verifyServerItemCount();
				}
				release();
				return;
			}

			if (this.isBackgroundLoading) {
				if (this.pendingGetItems) {
					this.pendingGetItems.force_server = this.pendingGetItems.force_server || false;
				} else {
					this.pendingGetItems = { force_server: false };
				}
				release();
				return;
			}

			if (!this.itemsLoaded || !this.items.length) {
				this.get_items(true);
			} else {
				this.eventBus.emit("set_all_items", this.items);
			}

			release();
		},

		restoreSearch() {
			if (this.first_search === "") {
				this.first_search = this.search_backup;
				this.search = this.search_backup;
				// No need to reload items when focus is lost
			}
		},
		handleItemSearchFocus() {
			this.first_search = "";
			this.search = "";
			// Optionally, you might want to also clear search_backup if the behaviour should be a full reset on focus
			// this.search_backup = "";
		},

		focusItemSearch() {
			if (this.cameraScannerActive) {
				return;
			}
			this.$nextTick(() => {
				if (this.cameraScannerActive) {
					return;
				}
				if (this.showManualScanInput) {
					this.queueManualScanFocus();
					return;
				}
				const input = this.$refs.debounce_search;
				if (input && typeof input.focus === "function") {
					input.focus();
				}
			});
		},

		blurItemSearch() {
			const input = this.$refs.debounce_search;
			if (input && typeof input.blur === "function") {
				input.blur();
			}
		},

		clearQty() {
			this.qty = null;
		},

		ensureScanAudioContext() {
			if (typeof window === "undefined") {
				return null;
			}
			if (!this.scanAudioContext) {
				const AudioContext = window.AudioContext || window.webkitAudioContext;
				if (!AudioContext) {
					return null;
				}
				this.scanAudioContext = new AudioContext();
			}
			if (this.scanAudioContext?.state === "suspended") {
				this.scanAudioContext.resume().catch(() => {});
			}
			return this.scanAudioContext;
		},
		playScanTone(type = "success") {
			if (typeof window === "undefined") {
				return;
			}
			try {
				const ctx = this.ensureScanAudioContext();
				if (!ctx) {
					if (frappe?.utils?.play_sound) {
						frappe.utils.play_sound(type === "success" ? "submit" : "error");
					}
					return;
				}
				const now = ctx.currentTime;
				const duration = type === "success" ? 0.16 : 0.35;
				const oscillator = ctx.createOscillator();
				const gainNode = ctx.createGain();
				oscillator.type = "sine";
				oscillator.frequency.value = type === "success" ? 880 : 220;
				gainNode.gain.setValueAtTime(type === "success" ? 0.18 : 0.28, now);
				gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);
				oscillator.connect(gainNode);
				gainNode.connect(ctx.destination);
				oscillator.start(now);
				oscillator.stop(now + duration);
			} catch (error) {
				console.warn("Scan tone playback failed:", error);
				if (frappe?.utils?.play_sound) {
					frappe.utils.play_sound(type === "success" ? "submit" : "error");
				}
			}
		},
		showScanError({ message, code = "", details = "" } = {}) {
			this.scanErrorMessage = message || this.__("Unable to add scanned item.");
			this.scanErrorCode = code;
			this.scanErrorDetails = details;
			if (code) {
				this.pendingScanCode = code;
			}
			this.awaitingScanResult = false;
			this.search_from_scanner = false;
			this.scanErrorDialog = true;
			this.scannerLocked = true;
			if (this.$refs.cameraScanner?.pauseForExternalLock) {
				this.$refs.cameraScanner.pauseForExternalLock();
			}
			this.playScanTone("error");
			if (frappe?.show_alert) {
				frappe.show_alert(
					{
						message: this.scanErrorMessage,
						indicator: "red",
					},
					5,
				);
			}
		},
		handleScanPipelineError(error, code = "") {
			const normalizedCode = code || this.pendingScanCode || "";
			console.error("Unexpected barcode processing error:", error);
			const details =
				error && typeof error.message === "string" && error.message.trim()
					? error.message
					: this.__("Please try again or enter the item manually.");
			this.showScanError({
				message: this.__("Unable to add scanned item."),
				code: normalizedCode,
				details,
			});
		},
		acknowledgeScanError() {
			this.scanErrorDialog = false;
			this.scannerLocked = false;
			this.scanErrorMessage = "";
			this.scanErrorCode = "";
			this.scanErrorDetails = "";
			this.pendingScanCode = "";
			this.awaitingScanResult = false;
			if (this.$refs.cameraScanner?.resumeFromExternalLock) {
				this.$refs.cameraScanner.resumeFromExternalLock();
			}
			this.focusItemSearch();
		},

		toggleManualScanInput() {
			this.showManualScanInput = !this.showManualScanInput;
			if (this.showManualScanInput) {
				this.queueManualScanFocus();
			} else {
				this.focusItemSearch();
			}
		},

		submitManualScan() {
			const code = (this.manualScanValue ?? "").toString().trim();
			if (!code) {
				return;
			}
			if (this.scannerLocked) {
				this.onBarcodeScanned(code);
				this.queueManualScanFocus();
				return;
			}
			this.manualScanValue = "";
			this.onBarcodeScanned(code);
			this.queueManualScanFocus();
		},

		focusManualScanInput() {
			const input = this.$refs.manualScanInput;
			if (input && typeof input.focus === "function") {
				input.focus();
			}
		},

		queueManualScanFocus() {
			this.$nextTick(() => {
				const scheduler =
					typeof requestAnimationFrame === "function"
						? requestAnimationFrame
						: (cb) => setTimeout(cb, 16);
				scheduler(() => {
					this.focusManualScanInput();
				});
			});
		},

		onScannerOpened() {
			this.cameraScannerActive = true;
			this.showManualScanInput = false;
			this.manualScanValue = "";
			this.blurItemSearch();
		},

		onScannerClosed() {
			this.cameraScannerActive = false;
			this.focusItemSearch();
		},

		startCameraScanning() {
			if (this.scannerLocked) {
				this.playScanTone("error");
				return;
			}
			if (this.$refs.cameraScanner) {
				this.$refs.cameraScanner.startScanning();
			}
		},
		onBarcodeScanned(scannedCode) {
			if (this.scannerLocked) {
				this.playScanTone("error");
				if (frappe?.show_alert) {
					frappe.show_alert(
						{
							message: this.__("Acknowledge the error to resume scanning."),
							indicator: "red",
						},
						3,
					);
				}
				return;
			}

			const runScanPipeline = async (code) => {
				const mark = perfMarkStart("pos:scan-handler");
				try {
					console.log("Barcode scanned:", code);
					this.pendingScanCode = code;

					// mark this search as coming from a scanner
					this.search_from_scanner = true;

					// Clear any previous search
					this.search = "";
					this.first_search = "";

					// Set the scanned code as search term
					this.first_search = code;
					this.search = code;

					// Show scanning feedback
					if (this.eventBus?.emit) {
						this.eventBus.emit("show_message", {
							title: this.__("Scanning for: {0}", [code]),
							summary: this.__("Scanning items"),
							detail: code,
							color: "info",
							timeout: 2000,
							groupId: "scanner-progress",
						});
					} else if (frappe?.show_alert) {
						frappe.show_alert(
							{
								message: `Scanning for: ${code}`,
								indicator: "blue",
							},
							2,
						);
					}

					// Enhanced item search and submission logic
					await this.processScannedItem(code);
				} catch (error) {
					this.handleScanPipelineError(error, code);
				} finally {
					perfMarkEnd("pos:scan-handler", mark);
				}
			};

			if (this.scanDebounceId) {
				clearTimeout(this.scanDebounceId);
			}
			this.scanQueuedCode = scannedCode;
			this.scanDebounceId = setTimeout(() => {
				this.scanDebounceId = null;
				const code = this.scanQueuedCode || scannedCode;
				this.scanQueuedCode = "";
				scheduleFrame(() => {
					const maybePromise = runScanPipeline(code);
					if (maybePromise && typeof maybePromise.catch === "function") {
						maybePromise.catch((error) => {
							this.handleScanPipelineError(error, code);
						});
					}
				});
			}, 12);
		},
		async processScannedItem(scannedCode) {
			const mark = perfMarkStart("pos:scan-process");
			this.pendingScanCode = scannedCode;
			// Handle scale barcodes by extracting the item code and quantity
			let searchCode = scannedCode;
			let qtyFromBarcode = null;
			if (
				this.pos_profile?.posa_scale_barcode_start &&
				scannedCode.startsWith(this.pos_profile.posa_scale_barcode_start)
			) {
				searchCode = this.get_search(scannedCode);
				qtyFromBarcode = parseFloat(this.get_item_qty(scannedCode));
			}

			// First try to find exact match by processed code using the pre-built index
			const barcodeIndex = this.ensureBarcodeIndex();
			let foundItem = this.lookupItemByBarcode(searchCode);

			if (!foundItem && barcodeIndex.size === 0) {
				// Index not populated yet, build it and fall back to a direct scan once
				this.replaceBarcodeIndex(this.items);
				foundItem = this.items.find((item) => {
					const barcodeMatch =
						item.barcode === searchCode ||
						(Array.isArray(item.item_barcode) &&
							item.item_barcode.some((b) => b.barcode === searchCode)) ||
						(Array.isArray(item.barcodes) &&
							item.barcodes.some((bc) => String(bc) === searchCode));
					return barcodeMatch || item.item_code === searchCode;
				});
			}

			if (foundItem) {
				console.log("Found item by processed code:", foundItem);
				await this.addScannedItemToInvoice(foundItem, searchCode, qtyFromBarcode);
				return;
			}

			// If not found locally, attempt to fetch from server using processed code
			try {
				const res = await frappe.call({
					method: "posawesome.posawesome.api.items.get_items_from_barcode",
					args: {
						selling_price_list: this.active_price_list,
						currency: this.pos_profile.currency,
						barcode: searchCode,
					},
				});

				if (res && res.message) {
					const newItem = res.message;
					this.items.push(newItem);
					this.indexItem(newItem);

					if (this.searchCache) {
						this.searchCache.clear();
					}

					await saveItems(this.items);
					await savePriceListItems(this.customer_price_list, this.items);
					this.eventBus.emit("set_all_items", this.items);
					await this.update_items_details([newItem]);
					await this.addScannedItemToInvoice(newItem, searchCode, qtyFromBarcode);
					return;
				}

				this.first_search = scannedCode;
				this.search = scannedCode;
				this.showScanError({
					message: `${this.__("Item not found")}: ${scannedCode}`,
					code: scannedCode,
					details: this.__("Please verify the barcode or check the item's availability."),
				});
				return;
			} catch (e) {
				console.error("Error fetching item from barcode:", e);
				this.first_search = scannedCode;
				this.search = scannedCode;
				this.showScanError({
					message: `${this.__("Item not found")}: ${scannedCode}`,
					code: scannedCode,
					details: this.__("The system could not retrieve the item details. Please try again."),
				});
				return;
			} finally {
				perfMarkEnd("pos:scan-process", mark);
			}
		},
		searchItemsByCode(code) {
			return this.items.filter((item) => {
				const searchTerm = code.toLowerCase();
				const barcodeMatch =
					(item.barcode && item.barcode.toLowerCase().includes(searchTerm)) ||
					(Array.isArray(item.barcodes) &&
						item.barcodes.some((bc) => String(bc).toLowerCase().includes(searchTerm))) ||
					(Array.isArray(item.item_barcode) &&
						item.item_barcode.some(
							(b) => b.barcode && b.barcode.toLowerCase().includes(searchTerm),
						));
				return (
					item.item_code.toLowerCase().includes(searchTerm) ||
					item.item_name.toLowerCase().includes(searchTerm) ||
					barcodeMatch
				);
			});
		},
		// PERF: maintain a barcode index so unfound scans do not walk the full list
		ensureBarcodeIndex() {
			if (!this.barcodeIndex || typeof this.barcodeIndex.set !== "function") {
				this.barcodeIndex = new Map();
			}
			return this.barcodeIndex;
		},
		resetBarcodeIndex() {
			const index = this.ensureBarcodeIndex();
			index.clear();
		},
		indexItem(item) {
			if (!item) {
				return;
			}
			const index = this.ensureBarcodeIndex();
			const register = (code) => {
				if (code === undefined || code === null) {
					return;
				}
				const normalized = String(code).trim();
				if (!normalized) {
					return;
				}
				if (!index.has(normalized)) {
					index.set(normalized, item);
				}
				const lower = normalized.toLowerCase();
				if (!index.has(lower)) {
					index.set(lower, item);
				}
			};
			register(item.item_code);
			register(item.barcode);
			if (Array.isArray(item.item_barcode)) {
				item.item_barcode.forEach((barcode) => register(barcode?.barcode));
			}
			if (Array.isArray(item.barcodes)) {
				item.barcodes.forEach((barcode) => register(barcode));
			}
			if (Array.isArray(item.serial_no_data)) {
				item.serial_no_data.forEach((serial) => register(serial?.serial_no));
			}
			if (Array.isArray(item.batch_no_data)) {
				item.batch_no_data.forEach((batch) => register(batch?.batch_no));
			}
		},
		replaceBarcodeIndex(items = this.items) {
			this.resetBarcodeIndex();
			items.forEach((item) => this.indexItem(item));
		},
		lookupItemByBarcode(code) {
			if (code === undefined || code === null) {
				return null;
			}
			const index = this.ensureBarcodeIndex();
			const normalized = String(code).trim();
			if (!normalized) {
				return null;
			}
			return index.get(normalized) || index.get(normalized.toLowerCase()) || null;
		},
		async addScannedItemToInvoice(item, scannedCode, qtyFromBarcode = null) {
			console.log("Adding scanned item to invoice:", item, scannedCode);

			// Clone the item to avoid mutating list data
			const newItem = { ...item };

			// If the scanned barcode has a specific UOM, apply it
			if (Array.isArray(newItem.item_barcode)) {
				const barcodeMatch = newItem.item_barcode.find((b) => b.barcode === scannedCode);
				if (barcodeMatch && barcodeMatch.posa_uom) {
					newItem.uom = barcodeMatch.posa_uom;

					// Try fetching the rate for this UOM from the active price list
					try {
						const res = await frappe.call({
							method: "posawesome.posawesome.api.items.get_price_for_uom",
							args: {
								item_code: newItem.item_code,
								price_list: this.active_price_list,
								uom: barcodeMatch.posa_uom,
							},
						});
						if (res.message) {
							const price = parseFloat(res.message);
							newItem.rate = price;
							newItem.price_list_rate = price;
							newItem.base_rate = price;
							newItem.base_price_list_rate = price;
							newItem._manual_rate_set = true;
							newItem.skip_force_update = true;
						}
					} catch (e) {
						console.error("Failed to fetch UOM price", e);
					}
				}
			}

			// Apply quantity from scale barcode if available
			if (qtyFromBarcode !== null && !isNaN(qtyFromBarcode)) {
				newItem.qty = qtyFromBarcode;
				newItem._barcode_qty = true;
			}

			const requestedQtyRaw =
				qtyFromBarcode !== null && !isNaN(qtyFromBarcode) ? qtyFromBarcode : (newItem.qty ?? 1);
			const requestedQty = Math.abs(requestedQtyRaw || 1);
			const availableQty =
				typeof newItem.available_qty === "number"
					? newItem.available_qty
					: typeof newItem.actual_qty === "number"
						? newItem.actual_qty
						: null;

			if (availableQty !== null && availableQty < requestedQty) {
				const formattedAvailable = this.format_number
					? this.format_number(availableQty, this.hide_qty_decimals ? 0 : this.float_precision)
					: availableQty;
				const formattedRequested = this.format_number
					? this.format_number(requestedQty, this.hide_qty_decimals ? 0 : this.float_precision)
					: requestedQty;
				const negativeStockEnabled = this.isNegativeStockEnabled();
				const shouldBlock =
					!negativeStockEnabled && (this.blockSaleBeyondAvailableQty || availableQty <= 0);

				if (shouldBlock) {
					this.showScanError({
						message: formatStockShortageError(
							newItem.item_name || newItem.item_code || scannedCode,
							availableQty,
							requestedQty,
						),
						code: scannedCode,
						details: this.__("Adjust the quantity or enable negative stock to continue."),
					});
					return;
				}

				// Suppress low stock notifications when negative stock is allowed
			}

			this.awaitingScanResult = true;

			try {
				// Use existing add_item method with enhanced feedback
				await this.add_item(newItem, {
					suppressNegativeWarning: true,
					skipNotification: true,
				});
				this.playScanTone("success");
				this.scannerLocked = false;
				this.search_from_scanner = false;
				this.pendingScanCode = "";

				// Show success message
				const itemName = newItem.item_name || newItem.item_code || scannedCode || this.__("Item");
				const rawPrecision = Number(this.float_precision);
				const precision = Number.isInteger(rawPrecision) ? Math.min(Math.max(rawPrecision, 0), 6) : 2;
				const displayQty = Number.isInteger(requestedQty)
					? requestedQty
					: Number(requestedQty.toFixed(precision));

				if (this.eventBus?.emit) {
					this.eventBus.emit("show_message", {
						title: this.__("Item {0} added to invoice", [itemName]),
						summary: this.__("Items added to invoice"),
						detail: this.__("{0} (Qty: {1})", [itemName, displayQty]),
						color: "success",
						groupId: "invoice-item-added",
					});
				} else if (frappe?.show_alert) {
					frappe.show_alert(
						{
							message: `Added: ${itemName}`,
							indicator: "green",
						},
						3,
					);
				}

				// Clear search after successful addition and refocus input
				this.clearSearch();
				this.focusItemSearch();
			} finally {
				this.awaitingScanResult = false;
			}
		},
		isNegativeStockEnabled() {
			return parseBooleanSetting(this.stock_settings?.allow_negative_stock);
		},
		showMultipleItemsDialog(items, scannedCode) {
			// Create a dialog to let user choose from multiple matches
			const dialog = new frappe.ui.Dialog({
				title: __("Multiple Items Found"),
				fields: [
					{
						fieldtype: "HTML",
						fieldname: "items_html",
						options: this.generateItemSelectionHTML(items, scannedCode),
					},
				],
				primary_action_label: __("Cancel"),
				primary_action: () => dialog.hide(),
			});

			dialog.show();

			// Add click handlers for item selection
			setTimeout(() => {
				items.forEach((item, index) => {
					const button = dialog.$wrapper.find(`[data-item-index="${index}"]`);
					button.on("click", () => {
						this.addScannedItemToInvoice(item, scannedCode);
						dialog.hide();
					});
				});
			}, 100);
		},
		generateItemSelectionHTML(items, scannedCode) {
			let html = `<div class="mb-3"><strong>Scanned Code:</strong> ${scannedCode}</div>`;
			html += '<div class="item-selection-list">';

			items.forEach((item, index) => {
				html += `
		<div class="item-option p-3 mb-2 border rounded cursor-pointer" data-item-index="${index}" style="border: 1px solid #ddd; cursor: pointer;">
			<div class="d-flex align-items-center">
			<img src="${item.image || placeholderImage}"
				style="width: 50px; height: 50px; object-fit: cover; margin-right: 15px;" />
			<div>
				<div class="font-weight-bold">${item.item_name}</div>
				<div class="text-muted small">${item.item_code}</div>
				<div class="text-primary">${this.format_currency(item.rate, this.pos_profile.currency, this.ratePrecision(item.rate))}</div>
			</div>
			</div>
		</div>
		`;
			});

			html += "</div>";
			return html;
		},
		handleItemNotFound(scannedCode) {
			console.warn("Item not found for scanned code:", scannedCode);

			this.first_search = scannedCode;
			this.search = scannedCode;
			this.showScanError({
				message: `${this.__("Item not found")}: ${scannedCode}`,
				code: scannedCode,
				details: this.__("This barcode could not be matched to any item."),
			});
		},

		currencySymbol(currency) {
			return get_currency_symbol(currency);
		},
		format_currency(value, currency, precision) {
			const prec = typeof precision === "number" ? precision : this.currency_precision;
			return this.formatCurrencyPlain(value, prec);
		},
		ratePrecision(value) {
			const numericValue = typeof value === "string" ? parseFloat(value) : value;
			return Number.isInteger(numericValue) ? 0 : this.currency_precision;
		},
		format_number(value, precision) {
			const prec = typeof precision === "number" ? precision : this.float_precision;
			return this.formatFloatPlain(value, prec);
		},
		hasDecimalPrecision(value) {
			// Check if the value has any decimal precision when converted by exchange rate
			if (this.exchange_rate && this.exchange_rate !== 1) {
				let convertedValue = value * this.exchange_rate;
				return !Number.isInteger(convertedValue);
			}
			return !Number.isInteger(value);
		},

		// Force load quantities for all visible items
		forceLoadQuantities() {
			if (this.displayedItems && this.displayedItems.length > 0) {
				// Set default quantities if not available
				this.displayedItems.forEach((item) => {
					if (item.actual_qty === undefined || item.actual_qty === null) {
						item.actual_qty = 0;
					}
				});
				// Force update quantities from server
				this.update_items_details(this.displayedItems);
			}
		},

		// Ensure all items have quantities set
		ensureAllItemsHaveQuantities() {
			if (this.items && this.items.length > 0) {
				this.items.forEach((item) => {
					if (item.actual_qty === undefined || item.actual_qty === null) {
						item.actual_qty = 0;
					}
				});
			}
			if (this.displayedItems && this.displayedItems.length > 0) {
				this.displayedItems.forEach((item) => {
					if (item.actual_qty === undefined || item.actual_qty === null) {
						item.actual_qty = 0;
					}
				});
			}
		},

		toggleItemSettings() {
			this.temp_hide_qty_decimals = this.hide_qty_decimals;
			this.temp_hide_zero_rate_items = this.hide_zero_rate_items;
			this.temp_enable_custom_items_per_page = this.enable_custom_items_per_page;
			this.temp_items_per_page = this.items_per_page;
			this.temp_force_server_items = !!(this.pos_profile && this.pos_profile.posa_force_server_items);
			this.show_item_settings = true;
		},
		cancelItemSettings() {
			this.show_item_settings = false;
		},
		applyItemSettings() {
			this.hide_qty_decimals = this.temp_hide_qty_decimals;
			this.hide_zero_rate_items = this.temp_hide_zero_rate_items;
			this.enable_custom_items_per_page = this.temp_enable_custom_items_per_page;
			if (this.enable_custom_items_per_page) {
				this.items_per_page = parseInt(this.temp_items_per_page) || 50;
			} else {
				this.items_per_page = 50;
			}
			this.itemsPerPage = this.items_per_page;
			this.pos_profile.posa_force_server_items = this.temp_force_server_items ? 1 : 0;
			this.savePosProfileSetting("posa_force_server_items", this.pos_profile.posa_force_server_items);
			this.saveItemSettings();
			this.show_item_settings = false;
		},
		onDragStart(event, item) {
			this.isDragging = true;

			// Set drag data
			event.dataTransfer.setData(
				"application/json",
				JSON.stringify({
					type: "item-from-selector",
					item: item,
				}),
			);

			// Set drag effect
			event.dataTransfer.effectAllowed = "copy";

			// Emit event to show drop feedback in ItemsTable
			this.eventBus.emit("item-drag-start", item);
		},
		onDragEnd(event) {
			this.isDragging = false;

			// Emit event to hide drop feedback
			this.eventBus.emit("item-drag-end");
		},
		saveItemSettings() {
			if (!this.localStorageAvailable) return;
			try {
				const settings = {
					hide_qty_decimals: this.hide_qty_decimals,
					hide_zero_rate_items: this.hide_zero_rate_items,
					enable_custom_items_per_page: this.enable_custom_items_per_page,
					items_per_page: this.items_per_page,
				};
				localStorage.setItem("posawesome_item_selector_settings", JSON.stringify(settings));
			} catch (e) {
				console.error("Failed to save item selector settings:", e);
			}
		},
		savePosProfileSetting(field, value) {
			if (!this.pos_profile || !this.pos_profile.name) {
				return;
			}
			frappe.db.set_value("POS Profile", this.pos_profile.name, field, value ? 1 : 0).catch((e) => {
				console.error("Failed to save POS Profile setting", e);
			});
		},
		loadItemSettings() {
			if (!this.localStorageAvailable) return;
			try {
				const saved = localStorage.getItem("posawesome_item_selector_settings");
				if (saved) {
					const opts = JSON.parse(saved);
					if (typeof opts.hide_qty_decimals === "boolean") {
						this.hide_qty_decimals = opts.hide_qty_decimals;
					}
					if (typeof opts.hide_zero_rate_items === "boolean") {
						this.hide_zero_rate_items = opts.hide_zero_rate_items;
					}
					if (typeof opts.enable_custom_items_per_page === "boolean") {
						this.enable_custom_items_per_page = opts.enable_custom_items_per_page;
					}
					if (typeof opts.items_per_page === "number") {
						this.items_per_page = opts.items_per_page;
						this.itemsPerPage = this.items_per_page;
					}
				}
			} catch (e) {
				console.error("Failed to load item selector settings:", e);
			}
		},
	},

	computed: {
		usesLimitSearch() {
			const rawValue =
				this.pos_profile?.pose_use_limit_search ?? this.pos_profile?.posa_use_limit_search;

			if (typeof rawValue === "string") {
				const normalized = rawValue.trim().toLowerCase();
				return normalized === "1" || normalized === "true" || normalized === "yes";
			}

			if (typeof rawValue === "number") {
				return rawValue === 1;
			}

			return Boolean(rawValue);
		},
		limitSearchCap() {
			if (!this.usesLimitSearch) {
				return null;
			}

			const rawLimit = this.pos_profile?.posa_search_limit;
			const parsed = parseInt(rawLimit, 10);

			if (Number.isFinite(parsed) && parsed > 0) {
				return parsed;
			}

			return 500;
		},
		blockSaleBeyondAvailableQty() {
			return (
				Boolean(this.pos_profile?.posa_block_sale_beyond_available_qty) &&
				!this.isNegativeStockEnabled()
			);
		},
		headers() {
			return this.getItemsHeaders();
		},
		cardColumns() {
			if (this.windowWidth <= 768) {
				return 1;
			}
			if (this.windowWidth <= 1200) {
				return 2;
			}
			return 3;
		},
		cardGap() {
			if (this.windowWidth <= 768) {
				return 10;
			}
			if (this.windowWidth <= 1200) {
				return 12;
			}
			return 16;
		},
		cardPadding() {
			if (this.windowWidth <= 768) {
				return 10;
			}
			if (this.windowWidth <= 1200) {
				return 12;
			}
			return 16;
		},
		cardRowHeight() {
			if (this.windowWidth <= 768) {
				return 220;
			}
			if (this.windowWidth <= 1200) {
				return 240;
			}
			return 260;
		},
		cardColumnWidth() {
			const columns = Math.max(1, this.cardColumns);
			const containerWidth = this.cardContainerWidth || 0;
			if (!containerWidth) {
				return 240;
			}

			const gapTotal = this.cardGap * (columns - 1);
			const paddingTotal = this.cardPadding * 2;
			const available = Math.max(0, containerWidth - gapTotal - paddingTotal);
			const width = Math.floor(available / columns);
			return Math.max(180, width);
		},
		displayedItems() {
			const baseItems = Array.isArray(this.filteredItems) ? [...this.filteredItems] : [];

			if (!baseItems.length) {
				return [];
			}

			const searchTerm = this.get_search(this.first_search).trim().toLowerCase();
			let filteredItems = baseItems;

			// Apply search filter only for queries with at least three characters
			if (searchTerm.length >= 3) {
				const searchTerms = Array.from(new Set(searchTerm.split(/\s+/).filter(Boolean)));

				filteredItems = filteredItems.filter((item) => {
					const barcodeList = [];
					if (Array.isArray(item.item_barcode)) {
						barcodeList.push(...item.item_barcode.map((b) => b.barcode).filter(Boolean));
					} else if (item.item_barcode) {
						barcodeList.push(String(item.item_barcode));
					}
					if (Array.isArray(item.barcodes)) {
						barcodeList.push(...item.barcodes.map((b) => String(b)).filter(Boolean));
					}

					const searchFields = [
						item.item_code,
						item.item_name,
						item.barcode,
						item.description,
						...barcodeList,
						...(this.pos_profile?.posa_search_serial_no && Array.isArray(item.serial_no_data)
							? item.serial_no_data.map((s) => s.serial_no)
							: []),
						...(this.pos_profile?.posa_search_batch_no && Array.isArray(item.batch_no_data)
							? item.batch_no_data.map((b) => b.batch_no)
							: []),
					]
						.filter(Boolean)
						.map((field) => field.toLowerCase());

					if (!searchTerms.length) {
						return true;
					}

					return searchTerms.every((term) => searchFields.some((field) => field.includes(term)));
				});
			}

			// Apply item group filter
			if (this.item_group !== "ALL") {
				filteredItems = filteredItems.filter(
					(item) =>
						item.item_group && item.item_group.toLowerCase() === this.item_group.toLowerCase(),
				);
			}

			// Apply zero rate filter
			if (this.hide_zero_rate_items) {
				filteredItems = filteredItems.filter((item) => parseFloat(item.rate || 0) > 0);
			}

			// Apply template/variant filter
			if (this.pos_profile?.posa_hide_variants_items) {
				filteredItems = filteredItems.filter((item) => !item.variant_of);
			}

			// Apply pagination
			const limit = this.enable_custom_items_per_page ? this.items_per_page : this.itemsPerPage;
			filteredItems = filteredItems.slice(0, limit);

			// Ensure quantities are defined
			filteredItems.forEach((item) => {
				if (item.actual_qty === undefined || item.actual_qty === null) {
					item.actual_qty = 0;
				}
			});

			return filteredItems;
		},
		debounce_search: {
			get() {
				return this.first_search;
			},
			set: _.debounce(function (newValue) {
				this.first_search = (newValue || "").trim();
			}, 200),
		},
		debounce_qty: {
			get() {
				// Display the raw quantity while typing to avoid forced decimal format
				if (this.qty === null || this.qty === "") return "";
				return this.hide_qty_decimals ? Math.trunc(this.qty) : this.qty;
			},
			set: _.debounce(function (value) {
				let parsed = parseFloat(String(value).replace(/,/g, ""));
				if (isNaN(parsed)) {
					parsed = null;
				}
				if (this.hide_qty_decimals && parsed != null) {
					parsed = Math.trunc(parsed);
				}
				this.qty = parsed;
			}, 200),
		},
		active_price_list() {
			return this.customer_price_list || (this.pos_profile && this.pos_profile.selling_price_list);
		},
	},

	async created() {
		console.log("ItemsSelector created - starting initialization with Pinia store");

		// Initialize the Pinia store with existing POS profile data
		if (this.pos_profile && this.pos_profile.name) {
			await this.initializeStore(this.pos_profile, this.customer, this.customer_price_list);
			console.log("Pinia store initialized successfully");
		} else {
			console.warn("No POS Profile available for store initialization");
		}

		// Keep legacy initialization for backward compatibility
		this.replaceBarcodeIndex(this.items || []);

		// Setup search debounce (now handled by store, but keeping for compatibility)
		this.searchDebounce = _.debounce(() => {
			this.get_items();
		}, 300);

		// Load settings
		this.loadItemSettings();

		// Initialize after memory is ready
		memoryInitPromise.then(async () => {
			try {
				// Ensure POS profile is available
				if (!this.pos_profile || !this.pos_profile.name) {
					// Try to get POS profile from boot or current route
					if (frappe.boot && frappe.boot.pos_profile) {
						this.pos_profile = frappe.boot.pos_profile;
					} else if (frappe.router && frappe.router.current_route) {
						// Get from current route context
						const route_context = frappe.router.current_route;
						if (route_context.pos_profile) {
							this.pos_profile = route_context.pos_profile;
						}
					}

					// Final fallback to server/cache
					if (!this.pos_profile || !this.pos_profile.name) {
						this.pos_profile = await ensurePosProfile();
					}

					// Initialize store with fallback profile
					if (this.pos_profile && this.pos_profile.name) {
						await this.initializeStore(this.pos_profile, this.customer, this.customer_price_list);
					}
				}

				// Load initial items if we have a profile (now handled by store)
				if (this.pos_profile && this.pos_profile.name) {
					console.log("Loading items with POS Profile:", this.pos_profile.name);
					this.get_items_groups();
					// Store handles item loading automatically, but keep legacy method for compatibility
					await this.initializeItems();
				} else {
					console.warn("No POS Profile available during initialization");
				}
			} catch (error) {
				console.error("Error during initialization:", error);
			}
		});

		// Event listeners
		this.eventBus.on("register_pos_profile", async (data) => {
			this.pos_profile = data.pos_profile;
			this.stock_settings = data.stock_settings || {};
			this.get_items_groups();
			await this.initializeItems();
			this.items_view = this.pos_profile.posa_default_card_view ? "card" : "list";
		});
		this.eventBus.on("update_cur_items_details", () => {
			this.update_cur_items_details();
		});
		this.eventBus.on("update_offers_counters", (data) => {
			this.offersCount = data.offersCount;
			this.appliedOffersCount = data.appliedOffersCount;
		});
		this.eventBus.on("update_coupons_counters", (data) => {
			this.couponsCount = data.couponsCount;
			this.appliedCouponsCount = data.appliedCouponsCount;
		});
                this.eventBus.on("update_customer_price_list", (data) => {
                        const fallback = this.pos_profile?.selling_price_list || null;
                        if (data === null || data === undefined) {
                                this.customer_price_list = fallback;
                                return;
                        }
                        this.customer_price_list = data;
                });
		this.eventBus.on("focus_item_search", () => {
			this.focusItemSearch();
		});

		// Manually trigger a full item reload when requested
		this.eventBus.on("force_reload_items", async () => {
			await this.ensureStorageHealth();
			if (!isOffline()) {
				if (this.pos_profile && (!this.pos_profile.posa_local_storage || !this.storageAvailable)) {
					await forceClearAllCache();
				}
				await this.get_items(true);
			} else {
				if (this.pos_profile && (!this.pos_profile.posa_local_storage || !this.storageAvailable)) {
					await forceClearAllCache();
					await this.get_items(true);
				} else {
					await this.get_items();
				}
			}
		});

		// Refresh item quantities when connection to server is restored
		this.eventBus.on("server-online", async () => {
			if (this.items && this.items.length > 0) {
				await this.update_items_details(this.items);
			}
		});

		if (typeof Worker !== "undefined") {
			try {
				// Use the plain URL so the service worker can match the cached file
				// even when offline. Using a query string causes cache lookups to fail
				// which results in "Failed to fetch a worker script" errors.
				const workerUrl = "/assets/posawesome/dist/js/posapp/workers/itemWorker.js";
				this.itemWorker = new Worker(workerUrl, { type: "classic" });

				this.itemWorker.onerror = function (event) {
					console.error("Worker error:", event);
					console.error("Message:", event.message);
					console.error("Filename:", event.filename);
					console.error("Line number:", event.lineno);
				};
				console.log("Created worker");
			} catch (e) {
				console.error("Failed to start item worker", e);
				this.itemWorker = null;
			}
		}

		if (typeof Worker !== "undefined") {
			try {
				// Use the plain URL so the service worker can match the cached file
				// even when offline. Using a query string causes cache lookups to fail
				// which results in "Failed to fetch a worker script" errors.
				const workerUrl = "/assets/posawesome/dist/js/posapp/workers/itemWorker.js";
				this.itemWorker = new Worker(workerUrl, { type: "classic" });

				this.itemWorker.onerror = function (event) {
					console.error("Worker error:", event);
					console.error("Message:", event.message);
					console.error("Filename:", event.filename);
					console.error("Line number:", event.lineno);
				};
				console.log("Created worker");
			} catch (e) {
				console.error("Failed to start item worker", e);
				this.itemWorker = null;
			}
		}

		// Setup auto-refresh for item quantities
		// Trigger an immediate refresh once items are available
		this.update_cur_items_details();
		this.refresh_interval = setInterval(() => {
			if (this.displayedItems && this.displayedItems.length > 0) {
				this.update_cur_items_details();
			}
		}, 30000); // Refresh every 30 seconds after the initial fetch

		// Add new event listener for currency changes
		this.eventBus.on("update_currency", (data) => {
			this.selected_currency = data.currency;
			this.exchange_rate = data.exchange_rate;

			// Refresh visible item prices when currency changes
			this.applyCurrencyConversionToItems();
			this.update_cur_items_details();
		});
	},

	async mounted() {
		this.$watch(
			() => this.selectedCustomer,
			(newCustomer) => {
				const normalized = newCustomer || "";
				if (this.customer !== normalized) {
					this.customer = normalized;
				}
			},
			{ immediate: true },
		);
		// Ensure POS profile is available
		if (!this.pos_profile || !this.pos_profile.name) {
			try {
				// Try to get from global frappe context
				if (frappe.boot && frappe.boot.pos_profile) {
					this.pos_profile = frappe.boot.pos_profile;
				} else if (window.cur_pos && window.cur_pos.pos_profile) {
					this.pos_profile = window.cur_pos.pos_profile;
				}
			} catch (error) {
				console.warn("Could not get POS profile in mounted:", error);
			}
		}

		// Load items if we have a profile and haven't loaded yet
		if (this.pos_profile && this.pos_profile.name && !this.itemsLoaded) {
			this.get_items_groups();
			await this.get_items();
		}

		// Setup barcode scanner if enabled
		if (this.pos_profile?.posa_enable_barcode_scanning) {
			this.scan_barcoud();
		}

		// Apply the configured items per page on mount
		this.itemsPerPage = this.items_per_page;
		window.addEventListener("resize", this.checkItemContainerOverflow);
		this.$nextTick(() => {
			this.checkItemContainerOverflow();
			this.scheduleCardMetricsUpdate();
		});
	},

	beforeUnmount() {
		// Clear interval when component is destroyed
		if (this.refresh_interval) {
			clearInterval(this.refresh_interval);
		}

		if (this.itemDetailsRetryTimeout) {
			clearTimeout(this.itemDetailsRetryTimeout);
		}
		this.itemDetailsRetryCount = 0;

		// Call cleanup function for abort controller
		if (this.cleanupBeforeDestroy) {
			this.cleanupBeforeDestroy();
		}

		// Detach scanner if it was attached
		if (document._scannerAttached) {
			try {
				onScan.detachFrom(document);
				document._scannerAttached = false;
			} catch (error) {
				console.warn("Scanner detach error:", error.message);
			}
		}

		if (this.itemWorker) {
			this.itemWorker.terminate();
		}

		if (this.scanAudioContext) {
			try {
				this.scanAudioContext.close();
			} catch (error) {
				console.warn("Scan audio context close failed:", error);
			}
			this.scanAudioContext = null;
		}

		this.eventBus.off("update_currency");
		this.eventBus.off("server-online");
		this.eventBus.off("register_pos_profile");
		this.eventBus.off("update_cur_items_details");
		this.eventBus.off("update_offers_counters");
		this.eventBus.off("update_coupons_counters");
		this.eventBus.off("update_customer_price_list");
		this.eventBus.off("force_reload_items");
		this.eventBus.off("focus_item_search");
		window.removeEventListener("resize", this.checkItemContainerOverflow);
		if (this.metricsRaf) {
			cancelAnimationFrame(this.metricsRaf);
			this.metricsRaf = null;
		}
	},
};
</script>

<style scoped>
/* "dynamic-card" no longer composes from pos-card; the pos-card class is added directly in the template */
.dynamic-padding {
	/* Equal spacing on all sides for consistent alignment */
	padding: var(--dynamic-sm);
}

.manual-scan-container {
	padding: 16px;
	border-radius: 12px;
	border: 1px solid var(--pos-border, rgba(0, 0, 0, 0.08));
	background-color: var(--pos-card-bg, rgba(255, 255, 255, 0.96));
	box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45);
	transition:
		background-color 0.2s ease,
		border-color 0.2s ease;
}

.manual-scan-text .text-body-2 {
	color: rgba(0, 0, 0, 0.6);
}

:deep(.v-theme--dark) .manual-scan-container {
	background-color: rgba(30, 30, 30, 0.92);
	border-color: rgba(255, 255, 255, 0.12);
	box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

:deep(.v-theme--dark) .manual-scan-text .text-body-2 {
	color: rgba(255, 255, 255, 0.7);
}

.scan-error-dialog {
	border-radius: 16px;
}

.scan-error-dialog .scan-error-message {
	font-weight: 600;
	font-size: 1.05rem;
	margin: 0;
}

.scan-error-dialog .scan-error-code {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	font-family:
		"Roboto Mono", "Fira Code", "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono",
		"Courier New", monospace;
	font-size: 0.95rem;
	padding: 6px 10px;
	border-radius: 6px;
	background-color: rgba(244, 67, 54, 0.12);
}

.scan-error-dialog .scan-error-details {
	margin-top: 12px;
	color: rgba(0, 0, 0, 0.72);
	line-height: 1.4;
}

:deep(.v-theme--dark) .scan-error-dialog .scan-error-code {
	background-color: rgba(244, 67, 54, 0.25);
	color: #ffebee;
}

:deep(.v-theme--dark) .scan-error-dialog .scan-error-details {
	color: rgba(255, 255, 255, 0.7);
}

.sticky-header {
	position: sticky;
	top: 0;
	z-index: 100;
	background-color: var(--surface-primary, #fff);
	padding: var(--dynamic-sm);
	margin: 0;
	border-bottom: 1px solid rgba(0, 0, 0, 0.1);
	/* Performance optimizations for theme switching */
	contain: layout style;
	will-change: background-color;
	transition:
		background-color 0.15s ease,
		border-color 0.15s ease;
}

.sticky-header {
	background-color: var(--pos-card-bg);
	border-bottom: 1px solid var(--pos-border);
}

.dynamic-scroll {
	transition: max-height 0.2s cubic-bezier(0.4, 0, 0.2, 1);
	padding-bottom: var(--dynamic-sm);
	contain: layout style;
}

.item-container {
	overflow-y: auto;
	scrollbar-gutter: stable;
}

.items-grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
	gap: var(--dynamic-sm);
	align-items: start;
	align-content: start;
	justify-content: flex-start;
}

.dynamic-item-card {
	transition:
		transform 0.2s cubic-bezier(0.4, 0, 0.2, 1),
		box-shadow 0.2s ease;
	background-color: var(--surface-secondary);
	display: flex;
	flex-direction: column;
	height: auto;
	max-width: 180px;
	box-sizing: border-box;
	will-change: transform;
	backface-visibility: hidden;
	transform: translate3d(0, 0, 0);
}

.dynamic-item-card .v-img {
	object-fit: contain;
	will-change: auto;
}

.dynamic-item-card:hover {
	transform: translate3d(0, -2px, 0) scale(1.02);
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.text-success {
	color: #4caf50 !important;
}

/* Enhanced Arabic number support for ItemsSelector */
.text-primary,
.text-success,
.golden--text {
	/* Enhanced Arabic number font stack for maximum clarity */
	font-family:
		"SF Pro Display", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "Noto Sans Arabic", "Tahoma",
		sans-serif;
	/* Force lining numbers for consistent height and alignment */
	font-variant-numeric: lining-nums tabular-nums;
	/* Additional OpenType features for better Arabic number rendering */
	font-feature-settings:
		"tnum" 1,
		"lnum" 1,
		"kern" 1;
	/* Ensure crisp rendering */
	-webkit-font-smoothing: antialiased;
	-moz-osx-font-smoothing: grayscale;
	/* Better number spacing */
	letter-spacing: 0.02em;
}

/* Enhanced negative number styling for Arabic context */
.negative-number {
	color: #d32f2f !important;
	font-weight: 600;
	/* Same enhanced font stack for negative numbers */
	font-family:
		"SF Pro Display", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "Noto Sans Arabic", "Tahoma",
		sans-serif;
	font-variant-numeric: lining-nums tabular-nums;
	font-feature-settings:
		"tnum" 1,
		"lnum" 1,
		"kern" 1;
	-webkit-font-smoothing: antialiased;
	-moz-osx-font-smoothing: grayscale;
}

/* Enhanced input fields for Arabic number support */
.v-text-field :deep(input),
.v-select :deep(input),
.v-autocomplete :deep(input) {
	/* Enhanced Arabic number font stack for input fields */
	font-family:
		"SF Pro Display", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "Noto Sans Arabic", "Tahoma",
		sans-serif;
	font-variant-numeric: lining-nums tabular-nums;
	font-feature-settings:
		"tnum" 1,
		"lnum" 1,
		"kern" 1;
	-webkit-font-smoothing: antialiased;
	-moz-osx-font-smoothing: grayscale;
	letter-spacing: 0.01em;
}

/* Enhanced card text for better Arabic number display */
.dynamic-item-card .v-card-text {
	font-family:
		"SF Pro Display", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "Noto Sans Arabic", "Tahoma",
		sans-serif;
	font-variant-numeric: lining-nums tabular-nums;
	font-feature-settings:
		"tnum" 1,
		"lnum" 1,
		"kern" 1;
	-webkit-font-smoothing: antialiased;
	-moz-osx-font-smoothing: grayscale;
}

/* Enhanced Card View Grid Layout - 3 items per row */
.items-card-grid {
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: 16px;
	padding: 16px;
	height: calc(100% - 80px);
	overflow-y: auto;
	scrollbar-width: thin;
	scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
	/* Performance optimizations */
	contain: layout style;
	will-change: scroll-position;
	transform: translate3d(0, 0, 0);
}

.virtual-scroller {
	height: calc(100% - 80px);
	overflow-y: auto;
	position: relative;
}

.virtual-scroller .items-card-grid {
	height: auto;
	overflow: visible;
}

.virtual-scroller .vue-recycle-scroller__item-wrapper {
	display: contents;
}

.items-card-grid::-webkit-scrollbar {
	width: 8px;
}

.items-card-grid::-webkit-scrollbar-track {
	background: transparent;
}

.items-card-grid::-webkit-scrollbar-thumb {
	background-color: rgba(0, 0, 0, 0.2);
	border-radius: 4px;
}

.card-item-card {
	background-color: var(--surface-secondary, #ffffff);
	border-radius: 12px;
	border: 1px solid rgba(0, 0, 0, 0.08);
	overflow: hidden;
	transition:
		transform 0.2s cubic-bezier(0.4, 0, 0.2, 1),
		box-shadow 0.2s ease,
		border-color 0.2s ease;
	cursor: pointer;
	display: flex;
	flex-direction: column;
	height: auto;
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
	will-change: transform;
	backface-visibility: hidden;
	transform: translate3d(0, 0, 0);
}

.card-item-card:hover {
	transform: translate3d(0, -2px, 0);
	box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
	border-color: var(--primary-color, #1976d2);
}

.card-item-image-container {
	position: relative;
	height: 120px;
	overflow: hidden;
	background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
}

.card-item-image {
	width: 100%;
	height: 100%;
	object-fit: cover;
	transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
	will-change: transform;
	backface-visibility: hidden;
}

.card-item-card:hover .card-item-image {
	transform: scale3d(1.05, 1.05, 1);
}

.image-placeholder {
	display: flex;
	align-items: center;
	justify-content: center;
	height: 100%;
	background: linear-gradient(135deg, #f5f5f5 0%, #eeeeee 100%);
}

.card-item-content {
	padding: 12px 16px 16px;
	flex: 1;
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.card-item-header {
	border-bottom: 1px solid rgba(0, 0, 0, 0.06);
	padding-bottom: 8px;
	margin-bottom: 4px;
}

.card-item-name {
	font-size: 0.9rem;
	font-weight: 600;
	color: var(--text-primary, #2c3e50);
	margin: 0 0 4px 0;
	line-height: 1.3;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
	text-overflow: ellipsis;
	/* Enhanced Arabic font support */
	font-family:
		"SF Pro Display", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "Noto Sans Arabic", "Tahoma",
		sans-serif;
}

.card-item-code {
	font-size: 0.75rem;
	color: var(--pos-text-secondary, #6c757d);
	font-weight: 500;
	background: rgba(0, 0, 0, 0.04);
	padding: 2px 6px;
	border-radius: 4px;
	/* Enhanced Arabic font support */
	font-family:
		"SF Pro Display", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "Noto Sans Arabic", "Tahoma",
		sans-serif;
}

.card-item-details {
	display: flex;
	flex-direction: column;
	gap: 8px;
	flex: 1;
}

.card-item-price {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.primary-price {
	display: flex;
	align-items: center;
	gap: 2px;
	font-weight: 600;
	color: var(--primary-color, #1976d2);
}

.secondary-price {
	display: flex;
	align-items: center;
	gap: 2px;
	font-weight: 500;
	color: #4caf50;
	font-size: 0.875rem;
}

.currency-symbol {
	opacity: 0.8;
	font-size: 0.85em;
	font-family:
		"SF Pro Display", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "Noto Sans Arabic", "Tahoma",
		sans-serif;
}

.price-amount {
	font-family:
		"SF Pro Display", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "Noto Sans Arabic", "Tahoma",
		sans-serif;
	font-variant-numeric: lining-nums tabular-nums;
	font-feature-settings:
		"tnum" 1,
		"lnum" 1,
		"kern" 1;
	-webkit-font-smoothing: antialiased;
	-moz-osx-font-smoothing: grayscale;
}

.card-item-stock {
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 6px 8px;
	background: rgba(0, 0, 0, 0.02);
	border-radius: 6px;
	margin-top: auto;
}

.stock-icon {
	color: var(--pos-text-secondary, #6c757d);
}

.stock-amount {
	font-weight: 600;
	font-family:
		"SF Pro Display", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "Noto Sans Arabic", "Tahoma",
		sans-serif;
	font-variant-numeric: lining-nums tabular-nums;
	font-feature-settings:
		"tnum" 1,
		"lnum" 1,
		"kern" 1;
	-webkit-font-smoothing: antialiased;
	-moz-osx-font-smoothing: grayscale;
}

.stock-uom {
	font-size: 0.75rem;
	color: var(--pos-text-secondary, #6c757d);
	font-weight: 500;
}

/* Dark theme support for card view */
:deep([data-theme="dark"]) .card-item-card,
:deep(.v-theme--dark) .card-item-card {
	background-color: var(--surface-secondary, #2c2c2c);
	border-color: rgba(255, 255, 255, 0.12);
}

:deep([data-theme="dark"]) .card-item-card:hover,
:deep(.v-theme--dark) .card-item-card:hover {
	border-color: var(--primary-color, #90caf9);
}

:deep([data-theme="dark"]) .card-item-image-container,
:deep(.v-theme--dark) .card-item-image-container {
	background: linear-gradient(135deg, #3a3a3a 0%, #2c2c2c 100%);
}

:deep([data-theme="dark"]) .image-placeholder,
:deep(.v-theme--dark) .image-placeholder {
	background: linear-gradient(135deg, #404040 0%, #353535 100%);
}

:deep([data-theme="dark"]) .card-item-name,
:deep(.v-theme--dark) .card-item-name {
	color: var(--text-primary, #ffffff);
}

:deep([data-theme="dark"]) .card-item-code,
:deep(.v-theme--dark) .card-item-code {
	background: rgba(255, 255, 255, 0.08);
	color: var(--pos-text-secondary, #e0e0e0);
}

:deep([data-theme="dark"]) .card-item-stock,
:deep(.v-theme--dark) .card-item-stock {
	background: rgba(255, 255, 255, 0.05);
}

.sleek-data-table {
	/* composes: pos-table; */
	margin: 0;
	background-color: transparent;
	border-radius: 0;
	overflow: hidden;
	border: none;
	height: 100%;
	display: flex;
	flex-direction: column;
	transition: all 0.3s ease;
}

.sleek-data-table:hover {
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
}

/* Enhanced table header styling with modern gradients and Arabic support */
.sleek-data-table :deep(th) {
	font-weight: 700;
	font-size: 0.875rem;
	text-transform: uppercase;
	letter-spacing: 1px;
	padding: 16px 20px;
	transition: all 0.3s ease;
	border-bottom: 3px solid #1976d2;
	background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 50%, #dee2e6 100%);
	color: #2c3e50;
	position: sticky !important;
	top: 0 !important;
	z-index: 10 !important;
	backdrop-filter: blur(10px);
	-webkit-backdrop-filter: blur(10px);
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
	text-shadow: 0 1px 2px rgba(255, 255, 255, 0.8);
	/* Enhanced Arabic number font stack */
	font-family:
		"SF Pro Display", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "Noto Sans Arabic", "Tahoma",
		sans-serif;
	font-variant-numeric: lining-nums tabular-nums;
	font-feature-settings:
		"tnum" 1,
		"lnum" 1,
		"kern" 1;
	-webkit-font-smoothing: antialiased;
	-moz-osx-font-smoothing: grayscale;
}

/* Enhanced dark theme header styling */
:deep([data-theme="dark"]) .sleek-data-table th,
:deep(.v-theme--dark) .sleek-data-table th {
	background: linear-gradient(135deg, #2c3e50 0%, #34495e 50%, #2c3e50 100%) !important;
	border-bottom: 3px solid #3498db;
	color: #ecf0f1;
	text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

/* Table wrapper styling */
.sleek-data-table :deep(.v-data-table__wrapper),
.sleek-data-table :deep(.v-table__wrapper) {
	border-radius: var(--border-radius-sm);
	height: 100%;
	overflow-y: auto;
	scrollbar-width: thin;
	position: relative;
}

/* Ensure the table container has proper height */
.sleek-data-table :deep(.v-data-table) {
	height: 100%;
	display: flex;
	flex-direction: column;
}

/* Table body should scroll while header stays fixed */
.sleek-data-table :deep(.v-data-table__wrapper tbody) {
	overflow-y: auto;
	max-height: calc(100% - 60px);
	/* Adjust based on header height */
}

/* Table row styling with gray theme */
.sleek-data-table :deep(tr) {
	transition: all 0.2s ease;
	border-bottom: 1px solid #e0e0e0;
	background-color: #fafafa;
}

.sleek-data-table :deep(tr:hover) {
	background-color: #f0f0f0;
	transform: translateY(-1px);
	box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
}

/* Table cell styling with Arabic number support */
.sleek-data-table :deep(td) {
	padding: 12px 16px;
	vertical-align: middle;
	color: #424242;
	/* Enhanced Arabic number font stack */
	font-family:
		"SF Pro Display", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "Noto Sans Arabic", "Tahoma",
		sans-serif;
	font-variant-numeric: lining-nums tabular-nums;
	font-feature-settings:
		"tnum" 1,
		"lnum" 1,
		"kern" 1;
	-webkit-font-smoothing: antialiased;
	-moz-osx-font-smoothing: grayscale;
	letter-spacing: 0.01em;
}

/* Dark theme row styling */
:deep([data-theme="dark"]) .sleek-data-table tr,
:deep(.v-theme--dark) .sleek-data-table tr {
	background-color: #2d2d2d;
	border-bottom: 1px solid #424242;
}

:deep([data-theme="dark"]) .sleek-data-table tr:hover,
:deep(.v-theme--dark) .sleek-data-table tr:hover {
	background-color: #3d3d3d;
}

:deep([data-theme="dark"]) .sleek-data-table td,
:deep(.v-theme--dark) .sleek-data-table td {
	color: #ffffff;
}

.settings-container {
	display: flex;
	align-items: center;
}

.truncate {
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

/* Light mode card backgrounds */
.selection,
.cards {
	background-color: var(--surface-secondary) !important;
}

/* Consistent spacing with navbar and system */
.dynamic-spacing-sm {
	padding: var(--dynamic-sm) !important;
}

.action-btn-consistent {
	margin-top: var(--dynamic-xs) !important;
	padding: var(--dynamic-xs) var(--dynamic-sm) !important;
	transition: var(--transition-normal) !important;
}

.action-btn-consistent:hover {
	background-color: rgba(25, 118, 210, 0.1) !important;
	transform: translateY(-1px) !important;
}

/* Ensure consistent spacing with navbar pattern */
.cards {
	margin-top: var(--dynamic-sm) !important;
	padding: var(--dynamic-sm) !important;
}

/* Responsive breakpoints */
@media (max-width: 1200px) {
	.items-card-grid {
		grid-template-columns: repeat(2, 1fr);
		gap: 12px;
		padding: 12px;
	}
}

@media (max-width: 768px) {
	.dynamic-padding {
		/* Reduce spacing uniformly on smaller screens */
		padding: var(--dynamic-xs);
	}

	.dynamic-spacing-sm {
		padding: var(--dynamic-xs) !important;
	}

	.action-btn-consistent {
		padding: var(--dynamic-xs) !important;
		font-size: 0.875rem !important;
	}

	.items-card-grid {
		grid-template-columns: 1fr;
		gap: 10px;
		padding: 10px;
	}

	.card-item-image-container {
		height: 100px;
	}

	.card-item-content {
		padding: 10px 12px 12px;
	}

	.card-item-name {
		font-size: 0.85rem;
	}

	.card-item-code {
		font-size: 0.7rem;
	}
}

@media (max-width: 480px) {
	.dynamic-padding {
		padding: var(--dynamic-xs);
	}

	.cards {
		padding: var(--dynamic-xs) !important;
	}
}

/* ===============================================================
   PERFORMANCE OPTIMIZATIONS FOR THEME SWITCHING
   =============================================================== */

/* Reduce paint and layout operations during theme transitions */
* {
	/* Optimize font rendering to reduce repaints */
	-webkit-font-smoothing: antialiased;
	-moz-osx-font-smoothing: grayscale;
}

/* Enable hardware acceleration for better performance */
.dynamic-item-card,
.card-item-card,
.items-card-grid,
.sticky-header {
	/* Force hardware acceleration */
	transform: translate3d(0, 0, 0);
	-webkit-transform: translate3d(0, 0, 0);
	/* Improve compositing performance */
	backface-visibility: hidden;
	-webkit-backface-visibility: hidden;
}

/* Optimize theme-sensitive elements */
[data-theme] .dynamic-item-card,
[data-theme] .card-item-card,
[data-theme] .sticky-header {
	/* Minimize reflow during theme changes */
	will-change: background-color, border-color, color;
	transition:
		background-color 0.15s cubic-bezier(0.4, 0, 0.2, 1),
		border-color 0.15s cubic-bezier(0.4, 0, 0.2, 1),
		color 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Prevent layout shifts during image loading */
.card-item-image,
.dynamic-item-card .v-img {
	content-visibility: auto;
	contain-intrinsic-size: 120px 120px;
}

/* Optimize scrolling performance */
.items-card-grid,
.item-container {
	/* Improve scroll performance */
	overscroll-behavior: contain;
	scroll-behavior: smooth;
	/* Enable scroll anchoring */
	overflow-anchor: auto;
}

/* Defer non-critical paint operations */
.card-item-content,
.dynamic-item-card .v-card-text {
	contain: style;
	will-change: auto;
}

/* Reduce complexity of hover effects */
@media (hover: hover) {
	.dynamic-item-card:hover,
	.card-item-card:hover {
		/* Use GPU-accelerated transforms only */
		transition:
			transform 0.2s cubic-bezier(0.4, 0, 0.2, 1),
			box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1);
	}
}

/* Disable animations on reduced motion preference */
@media (prefers-reduced-motion: reduce) {
	.dynamic-item-card,
	.card-item-card,
	.card-item-image,
	.sticky-header {
		transition: none !important;
		animation: none !important;
		transform: none !important;
	}
}
</style>
