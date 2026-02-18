<template>
	<div>
		<v-card class="selection mx-auto mt-3 pos-themed-card" style="max-height: 80vh; height: 80vh">
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
						<v-btn
							v-if="!item.offer_applied"
							color="green"
							@click="applyOffer(item)"
							:disabled="
								(item.offer == 'Give Product' &&
									!item.give_item &&
									!item.replace_cheapest_item &&
									!item.replace_item) ||
								(item.offer == 'Grand Total' &&
									discount_percentage_offer_name &&
									discount_percentage_offer_name != item.name)
							"
						>
							{{ __("Apply") }}
						</v-btn>
						<v-btn v-else color="red" @click="removeOffer(item)">
							{{ __("Remove") }}
						</v-btn>
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
import format from "../../../format";
import { useCustomersStore } from "../../../stores/customersStore.js";
import { useUIStore } from "../../../stores/uiStore.js";
import { useToastStore } from "../../../stores/toastStore.js";
import { storeToRefs } from "pinia";
export default {
	mixins: [format],
	setup() {
		const customersStore = useCustomersStore();
		const uiStore = useUIStore();
		const toastStore = useToastStore();
		const { selectedCustomer } = storeToRefs(customersStore);
		return { selectedCustomer, uiStore, toastStore };
	},
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
	},

	methods: {
		back_to_invoice() {
			this.uiStore.setActiveView("items");
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
		applyOffer(item) {
			item.offer_applied = true;
			this.forceUpdateItem();
		},
		removeOffer(item) {
			item.offer_applied = false;
			this.forceUpdateItem();
		},
		normalizeOfferRowId(value) {
			return String(value ?? "").trim();
		},
		getOfferId(offer) {
			return this.normalizeOfferRowId(offer?.row_id || offer?.name);
		},
		normalizeOfferIdentity(offer) {
			if (!offer || typeof offer !== "object") return offer;
			const rowId = this.getOfferId(offer);
			if (rowId) {
				offer.row_id = rowId;
			}
			return offer;
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
			const incoming = (Array.isArray(offers) ? offers : []).map((offer) =>
				this.normalizeOfferIdentity({ ...offer }),
			);
			const toRemove = [];
			this.pos_offers.forEach((pos_offer) => {
				const offer = incoming.find(
					(offer) => this.getOfferId(offer) === this.getOfferId(pos_offer),
				);
				if (!offer) {
					toRemove.push(this.getOfferId(pos_offer));
				}
			});
			this.removeOffers(toRemove);
			incoming.forEach((offer) => {
				const pos_offer = this.pos_offers.find(
					(pos_offer) => this.getOfferId(offer) === this.getOfferId(pos_offer),
				);
				if (pos_offer) {
					pos_offer.items = offer.items;
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
						newOffer.row_id = this.getOfferId(offer) || this.makeid(20);
					}
					if (offer.apply_type == "Item Code") {
						if (offer.replace_item) {
							newOffer.give_item = offer.item || offer.apply_item_code || null;
						} else {
							newOffer.give_item = offer.apply_item_code || null;
						}
					}
					if (offer.offer_applied) {
						newOffer.offer_applied = !!offer.offer_applied;
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
					this.toastStore.show({
						title: __("New Offer Available"),
						color: "warning",
					});
				}
			});
		},
		removeOffers(offers_id_list) {
			const normalized = new Set(
				(offers_id_list || []).map((id) => this.normalizeOfferRowId(id)),
			);
			this.pos_offers = this.pos_offers.filter(
				(offer) => !normalized.has(this.getOfferId(offer)),
			);
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
					filtered_items = filtered_items.filter((item) => item.rate < offer.less_then);
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
			// update store
			this.uiStore.setOfferCounts(this.offersCount, this.appliedOffersCount);
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
		selectedCustomer(newCustomer, oldCustomer) {
			if (newCustomer === oldCustomer) {
				return;
			}
			this.pos_offers = [];
		},
	},

	created: function () {
		this.$watch(
			() => this.uiStore.posProfile,
			(profile) => {
				if (profile) this.pos_profile = profile;
			},
			{ deep: true, immediate: true },
		);
		this.$watch(
			() => this.uiStore.applicableOffers,
			(offers) => {
				if (Array.isArray(offers)) {
					this.updatePosOffers(offers);
				}
			},
			{ deep: true, immediate: true },
		);

		/*
		this.$nextTick(function () {
			this.eventBus.on("register_pos_profile", (data) => {
				this.pos_profile = data.pos_profile;
			});
		});
		*/
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
