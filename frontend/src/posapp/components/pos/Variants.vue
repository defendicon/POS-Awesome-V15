<template>
	<v-row justify="center">
		<v-dialog v-model="varaintsDialog" max-width="600px">
			<v-card min-height="500px">
				<v-card-title>
					<span class="text-h5 text-primary">Select Item</span>
					<v-spacer></v-spacer>
					<v-btn color="error" theme="dark" @click="close_dialog">Close</v-btn>
				</v-card-title>
				<v-card-text class="pa-0">
					<v-container v-if="parentItem">
						<div v-for="attr in parentItem.attributes" :key="attr.attribute">
							<v-chip-group
								v-model="filters[attr.attribute]"
								selected-class="green--text text--accent-4"
								column
								@update:model-value="updateFiltredItems"
							>
								<v-chip
									v-for="value in attr.values"
									:key="value.abbr"
									:value="value.attribute_value"
									variant="outlined"
									label
								>
									{{ value.attribute_value }}
								</v-chip>
								<v-chip
									v-if="filters[attr.attribute]"
									:value="null"
									variant="text"
									color="primary"
									@click.stop="clearFilter(attr.attribute)"
								>
									{{ __("Clear") }}
								</v-chip>
							</v-chip-group>
							<v-divider class="p-0 m-0"></v-divider>
						</div>
						<div>
							<v-row density="default" class="overflow-y-auto" style="max-height: 500px">
								<v-col
									v-for="(item, idx) in displayItems"
									:key="idx"
									xl="2"
									lg="3"
									md="4"
									sm="4"
									cols="6"
									min-height="50"
								>
									<v-card hover="hover" @click="add_item(item)">
										<v-img
											:src="item.image || placeholderImage"
											class="text-white align-end"
											gradient="to bottom, rgba(0,0,0,.2), rgba(0,0,0,.7)"
											height="100px"
										>
											<v-card-text
												v-text="item.item_name"
												class="text-subtitle-2 px-1 pb-2"
											></v-card-text>
										</v-img>
										<v-card-text class="text--primary pa-1">
											<div class="text-caption text-primary text-accent-3">
												{{
													formatCurrencySafe(item.price_list_rate || item.rate || 0)
												}}
												{{ item.currency || "" }}
											</div>
										</v-card-text>
									</v-card>
								</v-col>
								<div v-intersect="loadMore"></div>
							</v-row>
						</div>
					</v-container>
				</v-card-text>
			</v-card>
		</v-dialog>
	</v-row>
</template>

<script>
/* global frappe */
import { ensurePosProfile } from "../../../utils/pos_profile.js";
import _ from "lodash";
import placeholderImage from "./placeholder-image.png";
export default {
	data: () => ({
		varaintsDialog: false,
		parentItem: null,
		items: null,
		filters: {},
		filterdItems: [],
		pos_profile: null,
		attributes_meta: {},
		displayCount: 100,
		placeholderImage,
	}),

	computed: {
		variantsItems() {
			if (!this.parentItem || !Array.isArray(this.items)) {
				return [];
			}
			return this.items.filter((item) => item.variant_of == this.parentItem.item_code);
		},
		displayItems() {
			return this.filterdItems.slice(0, this.displayCount);
		},
	},

	watch: {
		items: {
			handler() {
				this.filterdItems = this.variantsItems;
				this.displayCount = 100;
			},
			deep: true,
		},
		parentItem() {
			this.filterdItems = this.variantsItems;
			this.displayCount = 100;
		},
		attributes_meta: {
			handler(newVal) {
				if (this.parentItem && newVal && Object.keys(newVal).length) {
					this.parentItem.attributes = Object.keys(newVal).map((attr) => ({
						attribute: attr,
						values: newVal[attr].map((v) => ({ attribute_value: v, abbr: v })),
					}));
				} else if (this.parentItem) {
					this.parentItem.attributes = [];
				}
				this.$nextTick(() => {
					this.filterdItems = this.variantsItems;
					this.displayCount = 100;
				});
			},
			deep: true,
		},
		filters: {
			handler() {
				this.updateFiltredItems();
			},
			deep: true,
		},
	},

	methods: {
		close_dialog() {
			this.varaintsDialog = false;
		},
		formatCurrency(value) {
			return this.$options.mixins[0].methods.formatCurrency.call(this, value, 2);
		},
		formatCurrencySafe(val) {
			const mixinFn =
				this.$options.mixins &&
				this.$options.mixins[0] &&
				this.$options.mixins[0].methods &&
				this.$options.mixins[0].methods.formatCurrency;

			if (mixinFn) {
				return mixinFn.call(this, val, 2);
			}
			return new Intl.NumberFormat("en-PK", {
				minimumFractionDigits: 0,
				maximumFractionDigits: 2,
			}).format(val);
		},
		applyCurrencyConversionToItem(item) {
			if (!item) return;
			if (!item.original_rate) {
				item.original_rate = item.price_list_rate || item.rate;
				item.original_currency = item.currency || (this.pos_profile && this.pos_profile.currency);
			}
			// Use original_rate as price list rate in item's currency
			item.base_price_list_rate = item.price_list_rate || item.original_rate;
			item.base_rate = item.base_rate || item.base_price_list_rate;
			item.rate = item.price_list_rate || item.rate;
			item.currency = item.currency || (this.pos_profile && this.pos_profile.currency);
			console.log("after currency conversion", {
				code: item.item_code,
				rate: item.rate,
				currency: item.currency,
			});
		},
		async fetchVariants(code, profile) {
			console.log("fetchVariants called with", code, profile);
			try {
				const res = await frappe.call({
					method: "posawesome.posawesome.api.items.get_item_variants",
					args: {
						pos_profile: JSON.stringify(profile || this.pos_profile || {}),
						parent_item_code: code,
					},
				});
				console.log("variants API result", res);
				if (res.message) {
					const variants = res.message.variants || res.message;
					this.attributes_meta = res.message.attributes_meta || this.attributes_meta;
					const existingCodes = new Set((this.items || []).map((it) => it.item_code));
					const newItems = variants.filter((it) => !existingCodes.has(it.item_code));
					console.log("new variant items", newItems);
					await Promise.all(newItems.map((it) => this.fetchVariantRate(it)));
					this.items = (this.items || []).concat(newItems);
				}
			} catch (e) {
				console.error("Failed to fetch variants", e);
			}
		},
		updateFiltredItems: _.debounce(function () {
			this.$nextTick(() => {
				const values = [];
				Object.entries(this.filters).forEach(([, value]) => {
					if (value) {
						values.push(value);
					}
				});

				if (!values.length) {
					this.filterdItems = this.variantsItems;
				} else {
					const itemsList = [];
					this.filterdItems = [];
					this.variantsItems.forEach((item) => {
						let apply = true;
						let attrs = [];
						if (Array.isArray(item.item_attributes)) {
							attrs = item.item_attributes;
						} else if (
							typeof item.item_attributes === "string" &&
							item.item_attributes.trim().startsWith("[")
						) {
							try {
								attrs = JSON.parse(item.item_attributes);
							} catch {
								attrs = [];
							}
						}
						for (const [attrName, val] of Object.entries(this.filters)) {
							if (!val) continue;
							const found = attrs.find(
								(a) => a.attribute === attrName && String(a.attribute_value) === String(val),
							);
							if (!found) {
								apply = false;
								break;
							}
						}
						if (apply && !itemsList.includes(item.item_code)) {
							this.filterdItems.push(item);
							itemsList.push(item.item_code);
						}
					});
				}
				console.log(
					"filtered items",
					this.filterdItems.map((it) => it.item_code),
				);
				this.displayCount = 100;
			});
		}, 200),
		clearFilter(attr) {
			this.filters[attr] = null;
			this.$nextTick(() => {
				this.filterdItems = this.variantsItems;
				this.displayCount = 100;
			});
		},
		loadMore() {
			if (this.displayCount < this.filterdItems.length) {
				this.displayCount += 100;
			}
		},
		async fetchVariantRate(item) {
			if (!this.pos_profile) {
				this.pos_profile = await ensurePosProfile();
			}
			if (!this.pos_profile.warehouse) {
				try {
					const res = await frappe.call({
						method: "posawesome.posawesome.api.utils.get_default_warehouse",
						args: { company: this.pos_profile.company },
					});
					if (res.message) {
						this.pos_profile.warehouse = res.message;
					}
				} catch (e) {
					console.error("Failed to fetch default warehouse", e);
				}
			}
			console.log("fetchVariantRate called for", item.item_code);
			try {
				const res = await frappe.call({
					method: "posawesome.posawesome.api.items.get_item_detail",
					args: {
						warehouse: item.warehouse || this.pos_profile.warehouse,
						price_list: this.pos_profile.selling_price_list,
						company: this.pos_profile.company,
						item: JSON.stringify({
							item_code: item.item_code,
							pos_profile: this.pos_profile.name,
							qty: item.qty || 1,
							uom: item.uom || item.stock_uom,
							doctype: this.pos_profile.create_pos_invoice_instead_of_sales_invoice
								? "POS Invoice"
								: "Sales Invoice",
						}),
					},
				});
				console.log("variant rate result", res);
				if (res.message) {
					const data = res.message;
					item.rate = data.price_list_rate;
					item.price_list_rate = data.price_list_rate;
					item.base_rate = data.price_list_rate;
					item.base_price_list_rate = data.price_list_rate;
					item.currency = data.currency || data.price_list_currency || this.pos_profile.currency;
					this.applyCurrencyConversionToItem(item);
					console.log("rate applied", {
						code: item.item_code,
						rate: item.rate,
					});
				}
			} catch (e) {
				console.error("Failed to fetch variant rate", e);
			}
		},
		async add_item(item) {
			console.log("add_item called", item.item_code);
			await this.fetchVariantRate(item);
			const payload = { ...item, code: item.item_code };
			console.log("emitting add_item", {
				code: payload.code,
				rate: payload.rate,
			});
			this.eventBus.emit("add_item", payload);
			this.close_dialog();
		},
	},

	created: function () {
		this.eventBus.on("open_variants_model", async (item, items, profile, attrsMeta) => {
			console.log("open_variants_model", { item, items, profile, attrsMeta });
			this.varaintsDialog = true;
			this.parentItem = item || null;
			this.items = Array.isArray(items) ? items : [];
			this.filters = {};
			this.attributes_meta = attrsMeta || this.attributes_meta;
			if (
				!this.parentItem.attributes &&
				this.attributes_meta &&
				Object.keys(this.attributes_meta).length
			) {
				this.parentItem.attributes = Object.keys(this.attributes_meta).map((attr) => ({
					attribute: attr,
					values: this.attributes_meta[attr].map((v) => ({ attribute_value: v, abbr: v })),
				}));
			}
			if (profile) {
				this.pos_profile = profile;
			} else {
				this.pos_profile = await ensurePosProfile();
			}
			if (!this.items || this.items.length === 0) {
				const parentCode = item.item_code || item.code || item.name;
				await this.fetchVariants(parentCode, this.pos_profile);
			}
			this.$nextTick(() => {
				this.filterdItems = this.variantsItems;
				this.displayCount = 100;
			});
		});
	},
	beforeUnmount() {
		console.log("variants dialog destroyed");
		this.eventBus.off("open_variants_model");
	},
};
</script>
