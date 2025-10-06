<template>
	<div :style="responsiveStyles">
		<v-card
			:class="[
				'selection mx-auto my-0 py-0 mt-3 pos-card dynamic-card resizable',
				isDarkTheme ? '' : 'bg-grey-lighten-5',
				rtlClasses,
			]"
			:style="{
				height: responsiveStyles['--container-height'],
				maxHeight: responsiveStyles['--container-height'],
				backgroundColor: isDarkTheme ? '#121212' : '',
				resize: 'vertical',
				overflow: 'auto',
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
								<!-- Add camera scan button if enabled -->
								<template v-slot:append-inner v-if="pos_profile.posa_enable_camera_scanning">
									<v-btn
										icon="mdi-camera"
										size="small"
										color="primary"
										variant="text"
										@click="startCameraScanning"
										:title="__('Scan with Camera')"
									>
									</v-btn>
								</template>
							</v-text-field>
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
												:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
												hide-details
												:label="__('Items per page')"
												class="mb-2 dark-field"
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
							<div
								class="items-card-grid"
								ref="itemsContainer"
								@scroll.passive="onCardScroll"
								:class="{ 'item-container': isOverflowing }"
							>
								<div
									v-for="item in filtered_items"
									:key="item.item_code"
									class="card-item-card"
									@click="add_item(item)"
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
											<template v-slot:placeholder>
												<div class="image-placeholder">
													<v-icon size="40" color="grey-lighten-2"
														>mdi-image</v-icon
													>
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
																item.base_price_list_rate || item.rate,
																item.original_currency ||
																	pos_profile.currency,
																ratePrecision(
																	item.base_price_list_rate || item.rate,
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
													<span class="currency-symbol">{{
														currencySymbol(selected_currency)
													}}</span>
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
												<v-icon size="small" class="stock-icon"
													>mdi-package-variant</v-icon
												>
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
							</div>
						</div>
						<div v-else class="items-table-container">
							<v-data-table-virtual
								:headers="headers"
								:items="filtered_items"
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
													item.base_price_list_rate || item.rate,
													item.original_currency || pos_profile.currency,
													ratePrecision(item.base_price_list_rate || item.rate),
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
import {
	saveItemUOMs,
	getItemUOMs,
	getLocalStock,
	isOffline,
	getStoredItemsCount,
	initializeStockCache,
	searchStoredItems,
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
import placeholderImage from "./placeholder-image.png";

export default {
	mixins: [format],
	setup() {
		const responsive = useResponsive();
		const rtl = useRtl();
		return { ...responsive, ...rtl };
	},
	components: {
		CameraScanner,
	},
	data: () => ({
		pos_profile: {},
		flags: {},
		items_view: "list",
		item_group: "ALL",
		loading: false,
		items_group: ["ALL"],
		items: [],
		search: "",
		first_search: "",
		search_backup: "",
		// Limit the displayed items to avoid overly large lists
		itemsPerPage: 50,
		offersCount: 0,
		appliedOffersCount: 0,
		couponsCount: 0,
		appliedCouponsCount: 0,
		customer_price_list: null,
		customer: null,
		new_line: false,
		qty: 1,
		refresh_interval: null,
		abortController: null,
		itemDetailsRequestCache: { key: null, promise: null, result: null },
		itemDetailsRetryCount: 0,
		itemDetailsRetryTimeout: null,
		items_loaded: false,
		selected_currency: "",
		exchange_rate: 1,
		prePopulateInProgress: false,
		itemWorker: null,
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
		itemCache: new Map(),
		virtualScrollEnabled: true,
		renderBuffer: 10,
		lastScrollTop: 0,
		scrollThrottle: null,
		searchDebounce: null,
		// Prevent repeated server fetches when local storage is empty
		fallbackAttempted: false,
		// Fixed page size for incremental item loading to avoid
		// pulling the entire catalog at once.
		itemsPageLimit: 100,
		// Track if the current search was triggered by a scanner
		search_from_scanner: false,
		currentPage: 0,
		isOverflowing: false,
	}),

	watch: {
		customer: _.debounce(function () {
			if (this.pos_profile.posa_force_reload_items) {
				if (this.pos_profile.posa_smart_reload_mode) {
					// When limit search is enabled there may be no items yet.
					// Fallback to full reload if nothing is loaded
					if (!this.items_loaded || !this.filtered_items.length) {
						this.items_loaded = false;
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
					this.items_loaded = false;
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
			if (this.items_loaded && this.filtered_items && this.filtered_items.length > 0) {
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
					if (!this.items_loaded || !this.items.length) {
						this.items_loaded = false;
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
					this.items_loaded = false;
					if (!isOffline()) {
						this.get_items(true);
					} else {
						this.get_items();
					}
				}
				return;
			}
			// Apply cached rates if available for immediate update
			if (this.items_loaded && this.items && this.items.length > 0) {
				const cached = await getCachedPriceListItems(this.customer_price_list);
				if (cached && cached.length) {
					const map = {};
					cached.forEach((ci) => {
						map[ci.item_code] = ci;
					});
					this.items.forEach((it) => {
						const ci = map[it.item_code];
						if (ci) {
							it.rate = ci.rate;
							it.price_list_rate = ci.price_list_rate || ci.rate;
						}
					});
					this.eventBus.emit("set_all_items", this.items);
					this.update_items_details(this.items);
					return;
				}
			}
			// No cache found - force a reload so prices are updated
			this.items_loaded = false;
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
			if (this.pos_profile && this.pos_profile.pose_use_limit_search && newValue !== oldValue) {
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
		filtered_items(new_value, old_value) {
			// Update item details if items changed
			if (
				this.pos_profile &&
				!this.pos_profile.pose_use_limit_search &&
				new_value.length !== old_value.length
			) {
				this.update_items_details(new_value);
			}
			this.$nextTick(this.checkItemContainerOverflow);
		},
		// Automatically search when the query has at least 3 characters
		first_search: _.debounce(function (val, oldVal) {
			const newLen = (val || "").trim().length;
			const oldLen = (oldVal || "").trim().length;
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
		},
		windowHeight() {
			// Maintain the configured items per page on resize
			this.itemsPerPage = this.items_per_page;
		},
		items_loaded(val) {
			if (val) {
				this.eventBus.emit("items_loaded");
				this.eventBus.emit("data-loaded", "items");
			}
		},
		items_view() {
			this.$nextTick(() => {
				if (this.items_view === "card") {
					this.checkItemContainerOverflow();
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
			if (!this.items || !this.items.length) {
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
					const barcodeMatch =
						(Array.isArray(item.item_barcode) &&
							item.item_barcode.some(
								(b) => b.barcode && b.barcode.toLowerCase().includes(term),
							)) ||
						(Array.isArray(item.barcodes) &&
							item.barcodes.some((bc) => String(bc).toLowerCase().includes(term))) ||
						(item.barcode && String(item.barcode).toLowerCase().includes(term));

					return (
						item.item_code.toLowerCase().includes(term) ||
						item.item_name.toLowerCase().includes(term) ||
						barcodeMatch
					);
				});
			}

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
			this.eventBus.emit("data-load-progress", { name: "items", progress: 0 });
			await initPromise;
			await this.ensureStorageHealth();
			if (reset) {
				this.currentPage = 0;
				this.items = [];
			}
			const search = this.get_search(this.first_search);
			const itemGroup = this.item_group !== "ALL" ? this.item_group.toLowerCase() : "";
			const pageItems = await searchStoredItems({
				search,
				itemGroup,
				limit: this.itemsPerPage,
				offset: this.currentPage * this.itemsPerPage,
			});
			const total = pageItems.length || 1;
			pageItems.forEach((it, idx) => {
				this.items.push(it);
				this.eventBus.emit("data-load-progress", {
					name: "items",
					progress: Math.round(((idx + 1) / total) * 100),
				});
			});
			this.eventBus.emit("set_all_items", this.items);
			if (pageItems.length) this.update_items_details(pageItems);
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
			const el = this.$refs.itemsContainer;
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
			if (!vm.filtered_items || vm.filtered_items.length === 0) return;

			vm.loading = true;

			const itemCodes = vm.filtered_items.map((it) => it.item_code);
			const cacheResult = await getCachedItemDetails(
				vm.pos_profile.name,
				vm.active_price_list,
				itemCodes,
			);
			const updates = [];

			cacheResult.cached.forEach((det) => {
				const item = vm.filtered_items.find((it) => it.item_code === det.item_code);
				if (item) {
					const upd = { actual_qty: det.actual_qty };
					if (det.item_uoms && det.item_uoms.length > 0) {
						upd.item_uoms = det.item_uoms;
						saveItemUOMs(item.item_code, det.item_uoms);
					}
					if (det.rate !== undefined) {
						if (det.rate !== 0 || !item.rate) {
							upd.rate = det.rate;
							upd.price_list_rate = det.price_list_rate || det.rate;
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
					vm.loading = false;
				});
				return;
			}

			const itemsToFetch = vm.filtered_items.filter((it) => cacheResult.missing.includes(it.item_code));

			try {
				const details = await vm.fetchItemDetails(itemsToFetch);
				details.forEach((updItem) => {
					const item = vm.filtered_items.find((it) => it.item_code === updItem.item_code);
					if (item) {
						const upd = { actual_qty: updItem.actual_qty };
						if (updItem.item_uoms && updItem.item_uoms.length > 0) {
							upd.item_uoms = updItem.item_uoms;
							saveItemUOMs(item.item_code, updItem.item_uoms);
						}
						if (updItem.rate !== undefined) {
							if (updItem.rate !== 0 || !item.rate) {
								upd.rate = updItem.rate;
								upd.price_list_rate = updItem.price_list_rate || updItem.rate;
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
						!vm.pos_profile.pose_use_limit_search
					) {
						try {
							await saveItemsBulk(details);
						} catch (e) {
							console.error("Failed to persist item details", e);
							vm.markStorageUnavailable && vm.markStorageUnavailable();
						}
					}
					vm.loading = false;
				});
			} catch (err) {
				if (err.name !== "AbortError") {
					console.error("Error fetching item details:", err);
					vm.loading = false;
				}
			}
		},

		show_offers() {
			this.eventBus.emit("show_offers", "true");
		},
		show_coupons() {
			this.eventBus.emit("show_coupons", "true");
		},
		async forceReloadItems() {
			console.log("[ItemsSelector] forceReloadItems called");
			// Clear cached price list items so the reload always
			// fetches the latest data from the server
			await clearPriceListCache();
			console.log("[ItemsSelector] price list cache cleared");
			await this.ensureStorageHealth();
			console.log("[ItemsSelector] storage health ensured");
			this.items_loaded = false;

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
				if (typeof serverCount === "number" && serverCount !== localCount) {
					console.log("[ItemsSelector] count mismatch, forcing reload");
					await this.forceReloadItems();
				}
			} catch (err) {
				console.error("Error checking item count:", err);
			}
		},
		async get_items(force_server = false) {
			console.log("[ItemsSelector] get_items called", {
				force_server,
				first_search: this.first_search,
				item_group: this.item_group,
			});
			// Ensure POS profile is available
			if (!this.pos_profile || !this.pos_profile.name) {
				console.warn("No POS Profile available, attempting to get it...");
				// Try to get the current POS profile
				try {
					if (frappe.boot && frappe.boot.pos_profile) {
						this.pos_profile = frappe.boot.pos_profile;
					} else {
						// If still no profile, show error and return
						console.error("No POS Profile configured");
						frappe.msgprint(__("Please configure a POS Profile first"));
						return;
					}
				} catch (error) {
					console.error("Failed to get POS Profile:", error);
					return;
				}
			}

			const vm = this;

			// Respect POS profile search limit when limit search is enabled
			if (vm.pos_profile?.pose_use_limit_search) {
				vm.itemsPageLimit = parseInt(vm.pos_profile.posa_search_limit) || vm.itemsPageLimit;
			}

			const search = this.get_search(this.first_search);
			const gr = vm.item_group !== "ALL" ? vm.item_group.toLowerCase() : "";
			const sr = search || "";
			const profileGroups = (vm.pos_profile?.item_groups || []).map((g) => g.item_group);
			console.log("[ItemsSelector] prepared fetch params", { search: sr, item_group: gr });

			// Skip if already loading the same data
			if (!force_server && this.items_loaded && this.items.length > 0) {
				console.log("[ItemsSelector] items already loaded, skipping fetch");
				this.loading = false;
				return;
			}

			this.loading = true;
			const requestToken = ++this.items_request_token;
			console.log("[ItemsSelector] sending request", { requestToken });
			this.eventBus.emit("data-load-progress", { name: "items", progress: 0 });
			console.log("[ItemsSelector] data-load-progress emitted", { progress: 0 });

			try {
				// Simple API call to get items
				const response = await frappe.call({
					method: "posawesome.posawesome.api.items.get_items",
					args: {
						pos_profile: JSON.stringify(vm.pos_profile),
						price_list: vm.customer_price_list,
						item_group: gr,
						search_value: sr,
						customer: vm.customer,
						limit: vm.itemsPageLimit,
						start_after: null,
						include_image: 1,
						item_groups: profileGroups,
					},
				});
				console.log("[ItemsSelector] server responded", { count: response.message?.length });

				const items = response.message || [];

				// Process items
				items.forEach((item) => {
					// Ensure UOMs
					if (!item.item_uoms || item.item_uoms.length === 0) {
						item.item_uoms = item.stock_uom
							? [{ uom: item.stock_uom, conversion_factor: 1.0 }]
							: [];
					}

					// Set default quantity
					if (item.actual_qty === undefined) {
						item.actual_qty = 0;
					}
				});

				vm.items = items;
				vm.items_loaded = true;
				vm.eventBus.emit("set_all_items", vm.items);
				console.log("[ItemsSelector] set_all_items emitted", { itemsLength: vm.items.length });

				const hasMore = !vm.pos_profile.pose_use_limit_search && items.length === vm.itemsPageLimit;
				const progress = hasMore
					? Math.min(99, Math.round((items.length / (items.length + vm.itemsPageLimit)) * 100))
					: 100;
				vm.eventBus.emit("data-load-progress", { name: "items", progress });
				console.log("[ItemsSelector] data-load-progress emitted", { progress });

				if (
					vm.pos_profile &&
					vm.pos_profile.posa_local_storage &&
					vm.storageAvailable &&
					!vm.pos_profile.pose_use_limit_search
				) {
					try {
						if (force_server) {
							console.log("[ItemsSelector] clearing local items before save");
							await clearStoredItems();
						}
						await saveItemsBulk(vm.items);
						console.log("[ItemsSelector] items persisted locally", { length: vm.items.length });
					} catch (e) {
						console.error("Failed to persist items locally", e);
						vm.markStorageUnavailable();
					}
				}

				if (hasMore) {
					const last = items[items.length - 1]?.item_name || null;
					console.log("[ItemsSelector] more items available, starting background load", {
						last,
						requestToken,
					});
					this.backgroundLoadItems(last, null, false, requestToken, items.length);
				}
			} catch (error) {
				console.error("Failed to load items:", error);
				frappe.msgprint(__("Failed to load items. Please try again."));
			} finally {
				vm.loading = false;
				console.log("[ItemsSelector] get_items finished");
			}
		},
		async backgroundLoadItems(startAfter, syncSince, clearBefore = false, requestToken, loaded = 0) {
			console.log("[ItemsSelector] backgroundLoadItems called", {
				startAfter,
				syncSince,
				clearBefore,
				requestToken,
				loaded,
			});
			const limit = this.itemsPageLimit;
			const profileGroups = (this.pos_profile?.item_groups || []).map((g) => g.item_group);
			// When the limit is extremely high, treat it as
			// "no incremental loading" and exit early.
			if (!limit || limit >= 10000) {
				console.log("[ItemsSelector] background load skipped due to high limit", { limit });
				return;
			}
			if (this.items_request_token !== requestToken) {
				console.log("[ItemsSelector] background load token mismatch, aborting");
				return;
			}
			const lastSync = syncSince;
			if (this.itemWorker && this.storageAvailable) {
				try {
					const res = await frappe.call({
						method: "posawesome.posawesome.api.items.get_items",
						args: {
							pos_profile: JSON.stringify(this.pos_profile),
							price_list: this.customer_price_list,
							item_group: this.item_group !== "ALL" ? this.item_group.toLowerCase() : "",
							search_value: this.search || "",
							customer: this.customer,
							modified_after: lastSync,
							limit,
							start_after: startAfter,
							include_image: 1,
							item_groups: profileGroups,
						},
						freeze: false,
					});
					console.log("[ItemsSelector] background load server response", {
						count: res.message?.length,
					});
					const text = JSON.stringify(res);
					if (this.items_request_token !== requestToken) {
						console.log("[ItemsSelector] background load token mismatch after response");
						return;
					}
					let lastItemName = null;
					const count = await new Promise((resolve) => {
						this.itemWorker.onmessage = async (ev) => {
							if (this.items_request_token !== requestToken) {
								console.log(
									"[ItemsSelector] background load token mismatch during worker message",
								);
								resolve(0);
								return;
							}
							if (ev.data.type === "parsed") {
								const newItems = ev.data.items || [];
								newItems.forEach((it) => {
									const existing = this.items.find((i) => i.item_code === it.item_code);
									if (existing) Object.assign(existing, it);
									else this.items.push(it);
								});
								lastItemName = newItems[newItems.length - 1]?.item_name || null;
								this.eventBus.emit("set_all_items", this.items);
								console.log("[ItemsSelector] background load set_all_items emitted", {
									length: this.items.length,
								});
								if (
									this.pos_profile &&
									this.pos_profile.posa_local_storage &&
									this.storageAvailable &&
									!this.pos_profile.pose_use_limit_search
								) {
									try {
										if (clearBefore) {
											await clearStoredItems();
											clearBefore = false;
										}
										await saveItemsBulk(newItems);
										console.log("[ItemsSelector] background load items persisted", {
											length: newItems.length,
										});
									} catch (e) {
										console.error(e);
										this.markStorageUnavailable();
									}
								}
								resolve(newItems.length);
							} else if (ev.data.type === "error") {
								console.error("Item worker parse error:", ev.data.error);
								resolve(0);
							}
						};
						this.itemWorker.postMessage({
							type: "parse_and_cache",
							json: text,
							priceList: this.customer_price_list || "",
						});
					});
					if (this.items_request_token !== requestToken) {
						console.log("[ItemsSelector] background load token mismatch after worker");
						return;
					}
					const newLoaded = loaded + count;
					const progress = Math.min(99, Math.round((newLoaded / (newLoaded + limit)) * 100));
					this.eventBus.emit("data-load-progress", { name: "items", progress });
					console.log("[ItemsSelector] background load progress", { progress });
					if (count === limit) {
						await this.backgroundLoadItems(
							lastItemName,
							syncSince,
							clearBefore,
							requestToken,
							newLoaded,
						);
					} else {
						if (this.storageAvailable && this.localStorageAvailable) {
							setItemsLastSync(new Date().toISOString());
						}
						if (this.itemWorker) {
							this.itemWorker.terminate();
							this.itemWorker = null;
						}
						if (this.items && this.items.length > 0) {
							await this.prePopulateStockCache(this.items);
						}
						this.eventBus.emit("data-load-progress", { name: "items", progress: 100 });
						console.log("[ItemsSelector] background load completed");
						this.items_loaded = true;
					}
				} catch (err) {
					console.error("Failed to background load items", err);
					this.markStorageUnavailable();
					return this.backgroundLoadItems(startAfter, syncSince, clearBefore, requestToken, loaded);
				}
			} else {
				frappe.call({
					method: "posawesome.posawesome.api.items.get_items",
					args: {
						pos_profile: JSON.stringify(this.pos_profile),
						price_list: this.customer_price_list,
						item_group: this.item_group !== "ALL" ? this.item_group.toLowerCase() : "",
						search_value: this.search || "",
						customer: this.customer,
						modified_after: lastSync,
						limit,
						start_after: startAfter,
						include_image: 1,
						item_groups: profileGroups,
					},
					callback: async (r) => {
						if (this.items_request_token !== requestToken) {
							console.log("[ItemsSelector] background load token mismatch in callback");
							return;
						}
						const rows = r.message || [];
						console.log("[ItemsSelector] background load callback items", { count: rows.length });
						rows.forEach((it) => {
							const existing = this.items.find((i) => i.item_code === it.item_code);
							if (existing) Object.assign(existing, it);
							else this.items.push(it);
						});
						this.eventBus.emit("set_all_items", this.items);
						console.log("[ItemsSelector] background load set_all_items emitted", {
							length: this.items.length,
						});
						if (
							this.pos_profile &&
							this.pos_profile.posa_local_storage &&
							this.storageAvailable &&
							!this.pos_profile.pose_use_limit_search
						) {
							try {
								if (clearBefore) {
									await clearStoredItems();
									clearBefore = false;
								}
								await saveItemsBulk(rows);
								console.log("[ItemsSelector] background load items persisted", {
									length: rows.length,
								});
							} catch (e) {
								console.error(e);
								this.markStorageUnavailable();
							}
						}
						const newLoaded = loaded + rows.length;
						const progress = Math.min(99, Math.round((newLoaded / (newLoaded + limit)) * 100));
						this.eventBus.emit("data-load-progress", { name: "items", progress });
						console.log("[ItemsSelector] background load progress", { progress });
						if (rows.length === limit) {
							const nextStart = rows[rows.length - 1]?.item_name || null;
							await this.backgroundLoadItems(
								nextStart,
								syncSince,
								clearBefore,
								requestToken,
								newLoaded,
							);
						} else {
							if (this.storageAvailable && this.localStorageAvailable) {
								setItemsLastSync(new Date().toISOString());
							}
							if (this.items && this.items.length > 0) {
								await this.prePopulateStockCache(this.items);
							}
							this.eventBus.emit("data-load-progress", { name: "items", progress: 100 });
							console.log("[ItemsSelector] background load completed");
							this.items_loaded = true;
						}
					},
					error: (err) => {
						console.error("Failed to background load items", err);
					},
				});
			}
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
		async click_item_row(event, { item }) {
			await this.add_item(item);
		},
		async add_item(item) {
			item = { ...item };
			if (item.has_variants) {
				let variants = this.items.filter((it) => it.variant_of == item.item_code);
				let attrsMeta = {};
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
				this.eventBus.emit("show_message", {
					title: __("This is an item template. Please choose a variant."),
					color: "warning",
				});
				console.log("sending profile", this.pos_profile);
				// Ensure attributes meta is always an object
				attrsMeta = attrsMeta || {};
				this.eventBus.emit("open_variants_model", item, variants, this.pos_profile, attrsMeta);
			} else {
				if (item.actual_qty === 0 && this.pos_profile.posa_display_items_in_stock) {
					this.eventBus.emit("show_message", {
						title: `No stock available for ${item.item_name}`,
						color: "warning",
					});
					await this.update_items_details([item]);
					return;
				}

				// Ensure UOMs are initialized before adding the item
				if (!item.item_uoms || item.item_uoms.length === 0) {
					// If UOMs are not available, fetch them first
					await this.update_items_details([item]);

					// Add stock UOM as fallback
					if (!item.item_uoms || item.item_uoms.length === 0) {
						item.item_uoms = [{ uom: item.stock_uom, conversion_factor: 1.0 }];
					}
				}

				// Ensure correct rate based on selected currency
				if (this.pos_profile.posa_allow_multi_currency) {
					this.applyCurrencyConversionToItem(item);

					// Compute base rates from original values
					const base_rate =
						item.original_currency === this.pos_profile.currency
							? item.original_rate
							: item.original_rate * (item.plc_conversion_rate || this.exchange_rate);
					item.base_rate = base_rate;
					item.base_price_list_rate = base_rate;
				}

				if (!item.qty || item.qty === 1) {
					let qtyVal = this.qty != null ? this.qty : 1;
					qtyVal = Math.abs(qtyVal);
					if (this.hide_qty_decimals) {
						qtyVal = Math.trunc(qtyVal);
					}
					item.qty = qtyVal;
				}
				this.eventBus.emit("add_item", item);
				this.qty = 1;
			}
		},
		async enter_event() {
			let match = false;
			if (!this.filtered_items.length || !this.first_search) {
				return;
			}
			const qty = this.get_item_qty(this.first_search);
			const new_item = { ...this.filtered_items[0] };
			new_item.qty = flt(qty);
			if (Array.isArray(new_item.item_barcode)) {
				new_item.item_barcode.forEach((element) => {
					if (this.search == element.barcode) {
						new_item.uom = element.posa_uom;
						match = true;
					}
				});
			}
			if (this.flags.serial_no) {
				new_item.to_set_serial_no = this.flags.serial_no;
			}
			if (this.flags.batch_no) {
				new_item.to_set_batch_no = this.flags.batch_no;
			}
			if (match) {
				await this.add_item(new_item);
				this.flags.serial_no = null;
				this.flags.batch_no = null;
				this.qty = 1;
				// Clear search field after successfully adding an item
				this.clearSearch();
				this.$refs.debounce_search.focus();
			}
		},
		search_onchange: _.debounce(async function (newSearchTerm) {
			const vm = this;

			vm.cancelItemDetailsRequest();

			// Determine the actual query string and trim whitespace
			const query = typeof newSearchTerm === "string" ? newSearchTerm : vm.first_search;

			vm.search = (query || "").trim();

			// Require a minimum of three characters before running a search
			if (!vm.search || vm.search.length < 3) {
				vm.search_from_scanner = false;
				return;
			}

			const fromScanner = vm.search_from_scanner;

			if (vm.pos_profile && vm.pos_profile.pose_use_limit_search) {
				if (vm.pos_profile && (!vm.pos_profile.posa_local_storage || !vm.storageAvailable)) {
					vm.get_items(true);
				} else {
					vm.get_items();
				}
			} else if (vm.pos_profile && vm.pos_profile.posa_local_storage) {
				if (vm.storageAvailable) {
					await vm.loadVisibleItems(true);
					vm.enter_event();
				} else {
					vm.get_items(true);
				}
			} else {
				// Save the current filtered items before search to maintain quantity data
				const current_items = [...vm.filtered_items];
				vm.enter_event();

				// After search, update quantities for newly filtered items
				if (vm.filtered_items && vm.filtered_items.length > 0) {
					setTimeout(() => {
						vm.update_items_details(vm.filtered_items);
					}, 300);
				}
			}

			// Clear the input only when triggered via scanner
			if (fromScanner) {
				vm.clearSearch();
				vm.$refs.debounce_search && vm.$refs.debounce_search.focus();
				vm.search_from_scanner = false;
			}
		}, 300),
		get_item_qty(first_search) {
			const qtyVal = this.qty != null ? this.qty : 1;
			let scal_qty = Math.abs(qtyVal);
			if (first_search.startsWith(this.pos_profile.posa_scale_barcode_start)) {
				let pesokg1 = first_search.substr(7, 5);
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
			return first_search.startsWith(this.pos_profile.posa_scale_barcode_start)
				? first_search.substr(0, 7)
				: first_search;
		},
		esc_event() {
			this.search = null;
			this.first_search = null;
			this.search_backup = null;
			this.qty = 1;
			this.$refs.debounce_search.focus();
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
						if (det.rate !== 0 || !item.rate) {
							item.rate = det.rate;
							item.price_list_rate = det.price_list_rate || det.rate;
						}
					}
					if (det.currency) {
						item.currency = det.currency;
					}

					if (!item.original_rate) {
						item.original_rate = item.rate;
						item.original_currency = item.currency || vm.pos_profile.currency;
					}

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
						vm.applyCurrencyConversionToItem(item);
					});

					updateLocalStockCache(details);
					saveItemDetailsCache(vm.pos_profile.name, vm.active_price_list, details);

					if (
						vm.pos_profile &&
						vm.pos_profile.posa_local_storage &&
						vm.storageAvailable &&
						!vm.pos_profile.pose_use_limit_search
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
			if (this.filtered_items && this.filtered_items.length > 0) {
				this.update_items_details(this.filtered_items);
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
						setTimeout(() => {
							vm.trigger_onscan(sCode);
						}, 300);
					},
				});

				// Mark document as having scanner attached
				document._scannerAttached = true;
			} catch (error) {
				console.warn("Scanner initialization error:", error.message);
			}
		},
		trigger_onscan(sCode) {
			// indicate this search came from a scanner
			this.search_from_scanner = true;
			// apply scanned code as search term
			this.first_search = sCode;
			this.search = sCode;

			this.$nextTick(() => {
				if (this.filtered_items.length == 0) {
					this.eventBus.emit("show_message", {
						title: `No Item has this barcode "${sCode}"`,
						color: "error",
					});
					frappe.utils.play_sound("error");
				} else {
					this.enter_event();
				}

				// clear search field for next scan and refocus input
				this.clearSearch();
				this.$refs.debounce_search && this.$refs.debounce_search.focus();
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
			this.search_backup = this.first_search;
			this.first_search = "";
			this.search = "";
			// Reset the visible items to the full list
			this.loadVisibleItems(true);
			// Refresh items from the server if needed
			this.get_items();
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

		clearQty() {
			this.qty = null;
		},

		startCameraScanning() {
			if (this.$refs.cameraScanner) {
				this.$refs.cameraScanner.startScanning();
			}
		},
		onBarcodeScanned(scannedCode) {
			console.log("Barcode scanned:", scannedCode);

			// mark this search as coming from a scanner
			this.search_from_scanner = true;

			// Clear any previous search
			this.search = "";
			this.first_search = "";

			// Set the scanned code as search term
			this.first_search = scannedCode;
			this.search = scannedCode;

			// Show scanning feedback
			frappe.show_alert(
				{
					message: `Scanning for: ${scannedCode}`,
					indicator: "blue",
				},
				2,
			);

			// Enhanced item search and submission logic
			setTimeout(() => {
				this.processScannedItem(scannedCode);
			}, 300);
		},
		async processScannedItem(scannedCode) {
			// First try to find exact match by barcode
			let foundItem = this.items.find((item) => {
				const barcodeMatch =
					item.barcode === scannedCode ||
					(Array.isArray(item.item_barcode) &&
						item.item_barcode.some((b) => b.barcode === scannedCode)) ||
					(Array.isArray(item.barcodes) && item.barcodes.some((bc) => String(bc) === scannedCode));
				return barcodeMatch || item.item_code === scannedCode;
			});

			if (foundItem) {
				console.log("Found item by exact match:", foundItem);
				this.addScannedItemToInvoice(foundItem, scannedCode);
				return;
			}

			// If not found locally, attempt to fetch from server by barcode
			try {
				const res = await frappe.call({
					method: "posawesome.posawesome.api.items.get_items_from_barcode",
					args: {
						selling_price_list: this.active_price_list,
						currency: this.pos_profile.currency,
						barcode: scannedCode,
					},
				});

				if (res && res.message) {
					const newItem = res.message;
					this.items.push(newItem);

					if (this.searchCache) {
						this.searchCache.clear();
					}

					await saveItems(this.items);
					await savePriceListItems(this.customer_price_list, this.items);
					this.eventBus.emit("set_all_items", this.items);
					await this.update_items_details([newItem]);
					this.addScannedItemToInvoice(newItem, scannedCode);
					return;
				}

				frappe.show_alert(
					{
						message: `${this.__("Item not found")}: ${scannedCode}`,
						indicator: "red",
					},
					5,
				);
				return;
			} catch (e) {
				console.error("Error fetching item from barcode:", e);
				frappe.show_alert(
					{
						message: `${this.__("Item not found")}: ${scannedCode}`,
						indicator: "red",
					},
					5,
				);
				return;
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
		async addScannedItemToInvoice(item, scannedCode) {
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

			// Use existing add_item method with enhanced feedback
			await this.add_item(newItem);

			// Show success message
			frappe.show_alert(
				{
					message: `Added: ${item.item_name}`,
					indicator: "green",
				},
				3,
			);

			// Clear search after successful addition and refocus input
			this.clearSearch();
			this.$refs.debounce_search && this.$refs.debounce_search.focus();
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

			// Show error message
			frappe.show_alert(
				{
					message: `Item not found: ${scannedCode}`,
					indicator: "red",
				},
				5,
			);

			// Keep the search term for manual search
			this.trigger_onscan(scannedCode);
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
			if (this.filtered_items && this.filtered_items.length > 0) {
				// Set default quantities if not available
				this.filtered_items.forEach((item) => {
					if (item.actual_qty === undefined || item.actual_qty === null) {
						item.actual_qty = 0;
					}
				});
				// Force update quantities from server
				this.update_items_details(this.filtered_items);
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
			if (this.filtered_items && this.filtered_items.length > 0) {
				this.filtered_items.forEach((item) => {
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
		headers() {
			return this.getItemsHeaders();
		},
		filtered_items() {
			if (!this.items || this.items.length === 0) {
				return [];
			}

			const searchTerm = this.get_search(this.first_search).trim().toLowerCase();
			let filteredItems = [...this.items];

			// Apply search filter only for queries with at least three characters
			if (searchTerm.length >= 3) {
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

					return searchFields.some((field) => field.includes(searchTerm));
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
		isDarkTheme() {
			return this.$theme.current === "dark";
		},
		active_price_list() {
			return this.customer_price_list || (this.pos_profile && this.pos_profile.selling_price_list);
		},
	},

	created() {
		console.log("ItemsSelector created - starting initialization");

		// Setup search debounce
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
				}

				// Load initial items if we have a profile
				if (this.pos_profile && this.pos_profile.name) {
					console.log("Loading items with POS Profile:", this.pos_profile.name);
					this.get_items_groups();
					await this.get_items();
					this.verifyServerItemCount();
				} else {
					console.warn("No POS Profile available during initialization");
				}
			} catch (error) {
				console.error("Error during initialization:", error);
			}
		});

		// Event listeners
		this.eventBus.on("register_pos_profile", (data) => {
			this.pos_profile = data.pos_profile;
			this.get_items_groups();
			this.get_items();
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
			this.customer_price_list = data;
		});
		this.eventBus.on("update_customer", (data) => {
			this.customer = data;
		});

		// Manually trigger a full item reload when requested
		this.eventBus.on("force_reload_items", async () => {
			await this.ensureStorageHealth();
			this.items_loaded = false;
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
			if (this.filtered_items && this.filtered_items.length > 0) {
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
		if (this.pos_profile && this.pos_profile.name && !this.items_loaded) {
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
		this.$nextTick(this.checkItemContainerOverflow);
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

		this.eventBus.off("update_currency");
		this.eventBus.off("server-online");
		this.eventBus.off("register_pos_profile");
		this.eventBus.off("update_cur_items_details");
		this.eventBus.off("update_offers_counters");
		this.eventBus.off("update_coupons_counters");
		this.eventBus.off("update_customer_price_list");
		this.eventBus.off("update_customer");
		this.eventBus.off("force_reload_items");
		window.removeEventListener("resize", this.checkItemContainerOverflow);
	},
};
</script>

<style scoped>
/* "dynamic-card" no longer composes from pos-card; the pos-card class is added directly in the template */
.dynamic-padding {
	/* Equal spacing on all sides for consistent alignment */
	padding: var(--dynamic-sm);
}

.sticky-header {
	position: sticky;
	top: 0;
	z-index: 100;
	background-color: var(--surface-primary, #fff);
	padding: var(--dynamic-sm);
	margin: 0;
	border-bottom: 1px solid #e0e0e0;
}

[data-theme="dark"] .sticky-header {
	background-color: var(--surface-primary, #1e1e1e);
}

.dynamic-scroll {
	transition: max-height var(--transition-normal);
	padding-bottom: var(--dynamic-sm);
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
	transition: var(--transition-normal);
	background-color: var(--surface-secondary);
	display: flex;
	flex-direction: column;
	height: auto;
	max-width: 180px;
	box-sizing: border-box;
}

.dynamic-item-card .v-img {
	object-fit: contain;
}

.dynamic-item-card:hover {
	transform: scale(calc(1 + 0.02 * var(--font-scale)));
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
	transition: all 0.3s ease;
	cursor: pointer;
	display: flex;
	flex-direction: column;
	height: auto;
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.card-item-card:hover {
	transform: translateY(-2px);
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
	transition: transform 0.3s ease;
}

.card-item-card:hover .card-item-image {
	transform: scale(1.05);
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
	color: var(--text-secondary, #6c757d);
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
	color: var(--text-secondary, #6c757d);
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
	color: var(--text-secondary, #6c757d);
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
	color: var(--text-secondary, #b0b0b0);
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
</style>
