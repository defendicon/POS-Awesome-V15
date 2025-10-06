<template>
	<div>
		<v-card
			:class="['selection mx-auto mt-3', isDarkTheme ? '' : 'bg-grey-lighten-5']"
			:style="isDarkTheme ? 'background-color:#1E1E1E' : ''"
			style="max-height: 80vh; height: 80vh"
		>
			<v-card-title>
				<span class="text-h6 text-primary">{{ __("Offers") }}</span>
			</v-card-title>
			<div
				class="my-0 py-0 overflow-y-auto"
				style="max-height: 75vh"
				@mouseover="style = 'cursor: pointer'"
			>
				<v-data-table
					:headers="items_headers"
					:items="pos_offers"
					:single-expand="singleExpand"
					v-model:expanded="expanded"
					show-expand
					item-value="row_id"
					class="elevation-1"
					:items-per-page="itemsPerPage"
					hide-default-footer
				>
                                         <template v-slot:item.offer_applied="{ item }">
                                               <v-checkbox-btn
                                                       @click="toggleOfferApplied"
                                                       v-model="item.offer_applied"
                                                        :disabled="
                                                                (item.offer == 'Give Product' &&
                                                                        !item.give_item &&
                                                                        (!item.replace_cheapest_item || !item.replace_item)) ||
                                                                (item.offer == 'Grand Total' &&
                                                                        discount_percentage_offer_name &&
                                                                        discount_percentage_offer_name != item.name)
                                                        "
                                                ></v-checkbox-btn>
                                        </template>
					<template v-slot:expanded-row="{ item }">
						<td :colspan="items_headers.length">
							<v-row class="mt-2">
								<v-col v-if="item.description">
									<div class="text-primary" v-html="handleNewLine(item.description)"></div>
								</v-col>
								<v-col v-if="item.offer == 'Give Product'">
									<v-autocomplete
										v-model="item.give_item"
										:items="get_give_items(item)"
                                                                                item-title="item_name"
                                                                                item-value="item_code"
										variant="outlined"
										density="compact"
										color="primary"
										:label="frappe._('Give Item')"
										:disabled="
											item.apply_type != 'Item Group' ||
											item.replace_item ||
											item.replace_cheapest_item
										"
									></v-autocomplete>
								</v-col>
							</v-row>
						</td>
					</template>
				</v-data-table>
			</div>
		</v-card>

		<v-card flat style="max-height: 11vh; height: 11vh" class="cards mb-0 mt-3 py-0">
			<v-row align="start" no-gutters>
				<v-col cols="12">
					<v-btn
						block
						class="pa-1"
						size="large"
						color="warning"
						theme="dark"
						@click="back_to_invoice"
						>{{ __("Back") }}</v-btn
					>
				</v-col>
			</v-row>
		</v-card>
	</div>
</template>

<script>
/* global __, frappe */
import format from "../../format";
export default {
	mixins: [format],
	data: () => ({
		loading: false,
		pos_profile: "",
		pos_offers: [],
                allItems: [],
                groupItemCache: {},
		discount_percentage_offer_name: null,
		itemsPerPage: 1000,
		expanded: [],
		singleExpand: true,
		items_headers: [
			{ title: __("Name"), value: "name", align: "start" },
			{ title: __("Apply On"), value: "apply_on", align: "start" },
			{ title: __("Offer"), value: "offer", align: "start" },
			{ title: __("Applied"), value: "offer_applied", align: "start" },
		],
	}),

	computed: {
		offersCount() {
			return this.pos_offers.length;
		},
		appliedOffersCount() {
			return this.pos_offers.filter((el) => !!el.offer_applied).length;
		},
		isDarkTheme() {
			return this.$theme?.current === "dark";
		},
	},

        methods: {
                back_to_invoice() {
                        this.eventBus.emit("show_offers", "false");
                },
                async fetchGroupItems(group) {
                        try {
                                const { message } = await frappe.call({
                                        method: "posawesome.posawesome.api.items.get_items",
                                        args: {
                                                pos_profile: JSON.stringify(this.pos_profile),
                                                item_group: group,
                                                // fetch complete inventory; backend paginates internally
                                        },
                                });

                                const fullItems = message || [];

                                // cache minimal info for dropdown use
                                this.groupItemCache[group] = fullItems.map((it) => ({
                                        item_code: it.item_code,
                                        item_name: it.item_name || it.item_code,
                                        rate: it.price_list_rate,
                                }));

                                // merge fetched items into allItems so offer application has details
                                const existing = new Set(this.allItems.map((it) => it.item_code));
                                const newItems = fullItems.filter((it) => !existing.has(it.item_code));
                                if (newItems.length) {
                                        this.allItems.push(...newItems);
                                        this.eventBus.emit("set_all_items", this.allItems);
                                }

                                this.forceUpdateItem();
                        } catch (error) {
                                console.error("Failed to fetch group items", error);
                        }
                },
                forceUpdateItem() {
                        let list_offers = [];
                        list_offers = [...this.pos_offers];
                        this.pos_offers = list_offers;
                },
                toggleOfferApplied() {
                        // re-emit updated offers so watchers respond
                        this.forceUpdateItem();
                },
                makeid(length) {
                        let result = "";
                        const characters = "abcdefghijklmnopqrstuvwxyz0123456789";
			const charactersLength = characters.length;
			for (var i = 0; i < length; i++) {
				result += characters.charAt(Math.floor(Math.random() * charactersLength));
			}
			return result;
		},
		updatePosOffers(offers) {
			const toRemove = [];
			this.pos_offers.forEach((pos_offer) => {
				const offer = offers.find((offer) => offer.name === pos_offer.name);
				if (!offer) {
					toRemove.push(pos_offer.row_id);
				}
			});
			this.removeOffers(toRemove);
			offers.forEach((offer) => {
				const pos_offer = this.pos_offers.find((pos_offer) => offer.name === pos_offer.name);
				if (pos_offer) {
					pos_offer.items = offer.items;
					if (pos_offer.offer === "Grand Total" && !this.discount_percentage_offer_name) {
						pos_offer.offer_applied = !!pos_offer.auto;
					}
					if (
						offer.apply_on == "Item Group" &&
						offer.apply_type == "Item Group" &&
						offer.replace_cheapest_item
					) {
						pos_offer.give_item = offer.give_item;
						pos_offer.apply_item_code = offer.apply_item_code;
					}
				} else {
					const newOffer = { ...offer };
					if (!offer.row_id) {
						newOffer.row_id = this.makeid(20);
					}
					if (offer.apply_type == "Item Code") {
						newOffer.give_item = offer.apply_item_code || "Nothing";
					}
					if (offer.offer_applied) {
						newOffer.offer_applied == !!offer.offer_applied;
					} else {
						if (
							offer.apply_type == "Item Group" &&
							offer.offer == "Give Product" &&
							!offer.replace_cheapest_item &&
							!offer.replace_item
						) {
							newOffer.offer_applied = false;
						} else if (offer.offer === "Grand Total" && this.discount_percentage_offer_name) {
							newOffer.offer_applied = false;
						} else {
							newOffer.offer_applied = !!offer.auto;
						}
					}
                                        if (newOffer.offer == "Give Product" && !newOffer.give_item) {
                                                const giveItems = this.get_give_items(newOffer);
                                                if (giveItems.length) {
                                                        newOffer.give_item = giveItems[0].item_code;
                                                }
                                        }
					this.pos_offers.push(newOffer);
					this.eventBus.emit("show_message", {
						title: __("New Offer Available"),
						color: "warning",
					});
				}
			});
		},
		removeOffers(offers_id_list) {
			this.pos_offers = this.pos_offers.filter((offer) => !offers_id_list.includes(offer.row_id));
		},
		handelOffers() {
			const applyedOffers = this.pos_offers.filter((offer) => offer.offer_applied);
			this.eventBus.emit("update_invoice_offers", applyedOffers);
		},
		handleNewLine(str) {
			if (str) {
				return str.replace(/(?:\r\n|\r|\n)/g, "<br />");
			} else {
				return "";
			}
		},
                get_give_items(offer) {
                        if (offer.apply_type === "Item Code") {
                                return [
                                        {
                                                item_code: offer.apply_item_code,
                                                item_name: offer.apply_item_code,
                                        },
                                ];
                        } else if (offer.apply_type === "Item Group") {
                                const group = offer.apply_item_group;
                                if (!this.groupItemCache[group]) {
                                        this.fetchGroupItems(group);
                                        return [];
                                }
                                let filtered_items = this.groupItemCache[group];
                                if (offer.less_then > 0) {
                                        filtered_items = filtered_items.filter(
                                                (item) => item.rate < offer.less_then,
                                        );
                                }
                                const unique = [];
                                const seen = new Set();
                                filtered_items.forEach((item) => {
                                        if (!seen.has(item.item_code)) {
                                                seen.add(item.item_code);
                                                unique.push({
                                                        item_code: item.item_code,
                                                        item_name: item.item_name || item.item_code,
                                                });
                                        }
                                });
                                return unique;
                        }
                        return [];
                },
		updateCounters() {
			this.eventBus.emit("update_offers_counters", {
				offersCount: this.offersCount,
				appliedOffersCount: this.appliedOffersCount,
			});
		},
		updatePosCoupuns() {
			const applyedOffers = this.pos_offers.filter(
				(offer) => offer.offer_applied && offer.coupon_based,
			);
			this.eventBus.emit("update_pos_coupons", applyedOffers);
		},
	},

	watch: {
		pos_offers: {
			deep: true,
			handler() {
				this.handelOffers();
				this.updateCounters();
				this.updatePosCoupuns();
			},
		},
	},

	created: function () {
		this.$nextTick(function () {
			this.eventBus.on("register_pos_profile", (data) => {
				this.pos_profile = data.pos_profile;
			});
		});
		this.eventBus.on("update_customer", (customer) => {
			if (this.customer != customer) {
				this.offers = [];
			}
		});
		this.eventBus.on("update_pos_offers", (data) => {
			this.updatePosOffers(data);
		});
		this.eventBus.on("update_discount_percentage_offer_name", (data) => {
			this.discount_percentage_offer_name = data.value;
		});
		this.eventBus.on("set_all_items", (data) => {
			this.allItems = data;
		});
	},
};
</script>
