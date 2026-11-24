<template>
	<v-dialog
		:model-value="modelValue"
		max-width="1240px"
		:fullscreen="useFullscreenDialog"
		scrollable
		content-class="posa-item-history-dialog"
		:theme="resolvedTheme"
		@update:model-value="emit('update:modelValue', $event)"
		@after-leave="emit('after-leave')"
	>
		<v-card
			ref="modalCard"
			class="posa-item-history-card pos-themed-card"
			:class="{ 'posa-item-history-card--fullscreen': useFullscreenDialog }"
			tabindex="0"
			data-pos-keyboard-root="item-history"
			data-testid="item-history-modal"
			@keydown.capture="handleModalKeydown"
			@click.capture="handleModalClick"
		>
			<v-card-title class="posa-item-history-header">
				<div class="posa-item-history-header__identity">
					<div class="text-h6">{{ item?.item_name || __("Item Workspace") }}</div>
					<div class="text-subtitle-2 text-medium-emphasis">
						{{ item?.item_code || "" }} - {{ __("Sales history and item details") }}
					</div>
				</div>
				<div class="posa-item-history-header__metrics">
					<v-chip size="small" color="primary" variant="tonal">
						{{ __("Qty") }} {{ formatFloat(Number(item?.qty || 0)) }}
					</v-chip>
					<v-chip size="small" color="secondary" variant="tonal">
						{{ currencySymbol(displayCurrency) }} {{ formatCurrency(Number(item?.rate || 0)) }}
					</v-chip>
					<v-chip size="small" color="success" variant="tonal">
						{{ currencySymbol(displayCurrency) }}
						{{ formatCurrency(Number(item?.qty || 0) * Number(item?.rate || 0)) }}
					</v-chip>
					<v-btn
						v-if="item?.item_code && canUpdateItem"
						data-item-history-keytarget
						data-item-history-key="update-item"
						data-testid="item-workspace-update-item"
						prepend-icon="mdi-pencil-outline"
						variant="tonal"
						color="primary"
						size="small"
						@click="emit('edit-item', item)"
					>
						{{ __("Update Item") }}
					</v-btn>
					<v-btn
						data-item-history-keytarget
						data-testid="item-history-close"
						icon="mdi-close"
						variant="text"
						:aria-label="__('Close item history')"
						@click="close"
					/>
				</div>
			</v-card-title>

			<v-tabs v-model="activeTab" color="primary" class="posa-item-history-tabs">
				<v-tab
					value="sales"
					prepend-icon="mdi-history"
					data-item-history-keytarget
					data-testid="item-history-sales-tab"
					>{{ __("Sales History") }}</v-tab
				>
				<v-tab
					value="details"
					prepend-icon="mdi-information-outline"
					data-item-history-keytarget
					data-testid="item-history-details-tab"
					>{{ __("Item Details") }}</v-tab
				>
			</v-tabs>
			<v-divider />

			<v-card-text class="posa-item-history-body">
				<v-window v-model="activeTab">
					<v-window-item value="sales">
						<v-alert v-if="offline" type="warning" variant="tonal" density="compact" class="mb-3">
							{{ __("Sales history requires an online connection.") }}
						</v-alert>
						<div class="posa-item-history-filters">
							<v-text-field
								ref="searchInput"
								v-model="filters.search"
								class="pos-themed-input"
								variant="outlined"
								density="compact"
								hide-details
								clearable
								prepend-inner-icon="mdi-magnify"
								:label="__('Search invoice or customer')"
								data-item-history-keytarget
								@update:model-value="scheduleHistoryReload"
							/>
							<v-text-field
								v-model="filters.from_date"
								type="date"
								class="pos-themed-input"
								variant="outlined"
								density="compact"
								hide-details
								:label="__('From Date')"
								data-item-history-keytarget
								@update:model-value="reloadHistoryFromStart"
							/>
							<v-text-field
								v-model="filters.to_date"
								type="date"
								class="pos-themed-input"
								variant="outlined"
								density="compact"
								hide-details
								:label="__('To Date')"
								data-item-history-keytarget
								@update:model-value="reloadHistoryFromStart"
							/>
							<v-select
								v-model="filters.doctype_filter"
								class="pos-themed-input"
								variant="outlined"
								density="compact"
								hide-details
								:items="doctypeFilterItems"
								:label="__('Document Type')"
								data-item-history-keytarget
								@update:model-value="reloadHistoryFromStart"
							/>
						</div>

						<div class="posa-item-history-summary">
							<div class="summary-tile">
								<div class="summary-tile__label">{{ __("Invoices") }}</div>
								<div class="summary-tile__value">{{ historySummary.invoice_count || 0 }}</div>
							</div>
							<div class="summary-tile">
								<div class="summary-tile__label">{{ __("Sold Qty") }}</div>
								<div class="summary-tile__value">
									{{ formatFloat(historySummary.total_qty || 0) }}
								</div>
							</div>
							<div class="summary-tile">
								<div class="summary-tile__label">{{ __("Sales") }}</div>
								<div class="summary-tile__value">
									{{ currencySymbol(displayCurrency) }}
									{{ formatCurrency(historySummary.total_amount || 0) }}
								</div>
							</div>
							<div class="summary-tile">
								<div class="summary-tile__label">{{ __("Avg Rate") }}</div>
								<div class="summary-tile__value">
									{{ currencySymbol(displayCurrency) }}
									{{ formatCurrency(historySummary.avg_rate || 0) }}
								</div>
							</div>
						</div>

						<div v-if="historyLoading" class="posa-item-history-loader">
							<v-progress-circular indeterminate color="primary" size="28" width="3" />
							<span>{{ __("Loading item sales...") }}</span>
						</div>
						<div v-else-if="!historyRows.length" class="posa-item-history-empty">
							<v-icon size="42" color="medium-emphasis">mdi-text-box-search-outline</v-icon>
							<div class="text-subtitle-1">{{ __("No sales found for this item") }}</div>
							<div class="text-caption text-medium-emphasis">
								{{ __("Try changing the filters or date range.") }}
							</div>
						</div>
						<v-table v-else class="posa-item-history-table">
							<thead>
								<tr>
									<th>{{ __("Invoice") }}</th>
									<th>{{ __("Type") }}</th>
									<th>{{ __("Date") }}</th>
									<th>{{ __("Customer") }}</th>
									<th class="text-end">{{ __("Qty") }}</th>
									<th class="text-end">{{ __("Rate") }}</th>
									<th class="text-end">{{ __("Discount") }}</th>
									<th class="text-end">{{ __("Amount") }}</th>
									<th class="text-end">{{ __("Actions") }}</th>
								</tr>
							</thead>
							<tbody>
								<tr
									v-for="(row, index) in historyRows"
									:key="`${row.doctype}-${row.invoice}`"
									:class="{
										'posa-item-history-row--active': selectedHistoryIndex === index,
										'posa-modal-keyboard-box': isKeyboardTargetActive(
											`history-row-${index}`,
										),
									}"
									tabindex="0"
									data-item-history-keytarget
									:data-testid="`item-history-row-${index}`"
									:data-item-history-key="`history-row-${index}`"
									@click="selectedHistoryIndex = index"
									@dblclick="viewInvoice(row)"
								>
									<td>{{ row.invoice }}</td>
									<td>
										<v-chip size="x-small" color="primary" variant="tonal">
											{{ __(row.doctype) }}
										</v-chip>
									</td>
									<td>{{ formatDateTime(row.posting_date, row.posting_time) }}</td>
									<td>{{ row.customer_name || row.customer || "-" }}</td>
									<td class="text-end">{{ formatFloat(row.qty || 0) }}</td>
									<td class="text-end">
										{{ currencySymbol(row.currency || displayCurrency) }}
										{{ formatCurrency(row.avg_rate || 0) }}
									</td>
									<td class="text-end">
										{{ currencySymbol(row.currency || displayCurrency) }}
										{{ formatCurrency(row.discount_amount || 0) }}
									</td>
									<td class="text-end">
										{{ currencySymbol(row.currency || displayCurrency) }}
										{{ formatCurrency(row.amount || 0) }}
									</td>
									<td class="text-end">
										<v-btn
											data-item-history-keytarget
											:data-testid="`item-history-view-${index}`"
											icon="mdi-eye-outline"
											variant="text"
											size="small"
											:title="__('View Invoice')"
											:aria-label="__('View invoice')"
											@click.stop="viewInvoice(row)"
										/>
									</td>
								</tr>
							</tbody>
						</v-table>

						<div class="posa-item-history-footer">
							<div class="text-caption text-medium-emphasis">
								{{ __("Page {0}", [historyPage + 1]) }}
							</div>
							<div class="d-flex ga-2">
								<v-btn
									data-item-history-keytarget
									size="small"
									variant="tonal"
									prepend-icon="mdi-chevron-left"
									:disabled="historyPage === 0 || historyLoading"
									@click="previousHistoryPage"
								>
									{{ __("Previous") }}
								</v-btn>
								<v-btn
									data-item-history-keytarget
									size="small"
									variant="tonal"
									append-icon="mdi-chevron-right"
									:disabled="!historyHasMore || historyLoading"
									@click="nextHistoryPage"
								>
									{{ __("Next") }}
								</v-btn>
							</div>
						</div>
					</v-window-item>

					<v-window-item value="details">
						<ItemsTableExpandedRow
							v-if="item"
							:item="item"
							:is-expanded="true"
							:colspan="1"
							panel-only
							:pos_profile="posProfile"
							:invoice-type="invoiceType"
							:is-return-invoice="isReturnInvoice"
							:invoice_doc="invoiceDoc"
							:hide_qty_decimals="hideQtyDecimals"
							:expanded-content-classes="expandedContentClasses"
							:format-float="formatFloat"
							:format-currency="formatCurrency"
							:currency-symbol="currencySymbol"
							:is-number="isNumber"
							:set-formated-currency="setFormatedCurrency"
							:calc-prices="calcPrices"
							:calc-uom="calcUom"
							:change-price-list-rate="changePriceListRate"
							:get-serial-options="getSerialOptions"
							:set-serial-no="setSerialNo"
							:set-batch-qty="setBatchQty"
							:validate-due-date="validateDueDate"
							@qty-change="$emit('qty-change', $event)"
						/>
					</v-window-item>
				</v-window>
			</v-card-text>

			<v-card-actions class="posa-item-history-actions">
				<v-spacer />
				<v-btn data-item-history-keytarget color="error" variant="tonal" @click="close">{{
					__("Close")
				}}</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>

	<v-dialog v-model="invoiceDetailDialog" max-width="1040px" scrollable :theme="resolvedTheme">
		<v-card
			class="invoice-detail-card pos-themed-card"
			data-testid="item-history-invoice-detail-dialog"
			@keydown.esc.capture.stop.prevent="closeInvoiceDetailDialog"
		>
			<v-card-title
				class="invoice-detail-header d-flex align-center justify-space-between flex-wrap ga-3"
			>
				<div>
					<div class="text-h6">{{ selectedInvoiceDetail?.name || __("Invoice Details") }}</div>
					<div class="text-subtitle-2 text-medium-emphasis">
						{{ selectedInvoiceDetail?.customer_name || selectedInvoiceDetail?.customer || "" }}
					</div>
				</div>
				<v-btn
					icon="mdi-close"
					variant="text"
					:aria-label="__('Close invoice details')"
					@click="closeInvoiceDetailDialog"
				/>
			</v-card-title>
			<v-divider />
			<v-card-text v-if="selectedInvoiceDetail">
				<div class="posa-item-history-summary mb-4">
					<div class="summary-tile">
						<div class="summary-tile__label">{{ __("Posting") }}</div>
						<div class="summary-tile__value">
							{{
								formatDateTime(
									selectedInvoiceDetail.posting_date,
									selectedInvoiceDetail.posting_time,
								)
							}}
						</div>
					</div>
					<div class="summary-tile">
						<div class="summary-tile__label">{{ __("Grand Total") }}</div>
						<div class="summary-tile__value">
							{{ currencySymbol(selectedInvoiceDetail.currency) }}
							{{ formatCurrency(selectedInvoiceDetail.grand_total || 0) }}
						</div>
					</div>
					<div class="summary-tile">
						<div class="summary-tile__label">{{ __("Paid") }}</div>
						<div class="summary-tile__value">
							{{ currencySymbol(selectedInvoiceDetail.currency) }}
							{{ formatCurrency(selectedInvoiceDetail.paid_amount || 0) }}
						</div>
					</div>
					<div class="summary-tile">
						<div class="summary-tile__label">{{ __("Outstanding") }}</div>
						<div class="summary-tile__value">
							{{ currencySymbol(selectedInvoiceDetail.currency) }}
							{{ formatCurrency(selectedInvoiceDetail.outstanding_amount || 0) }}
						</div>
					</div>
				</div>
				<div class="detail-section__title">{{ __("Items") }}</div>
				<v-table class="posa-item-history-table">
					<thead>
						<tr>
							<th>{{ __("Item") }}</th>
							<th>{{ __("Code") }}</th>
							<th class="text-end">{{ __("Qty") }}</th>
							<th class="text-end">{{ __("Rate") }}</th>
							<th class="text-end">{{ __("Amount") }}</th>
						</tr>
					</thead>
					<tbody>
						<tr v-for="invoiceItem in selectedInvoiceDetail.items || []" :key="invoiceItem.name">
							<td>{{ invoiceItem.item_name }}</td>
							<td>{{ invoiceItem.item_code }}</td>
							<td class="text-end">{{ formatFloat(invoiceItem.qty || 0) }}</td>
							<td class="text-end">
								{{ currencySymbol(selectedInvoiceDetail.currency) }}
								{{ formatCurrency(invoiceItem.rate || 0) }}
							</td>
							<td class="text-end">
								{{ currencySymbol(selectedInvoiceDetail.currency) }}
								{{ formatCurrency(invoiceItem.amount || 0) }}
							</td>
						</tr>
					</tbody>
				</v-table>
			</v-card-text>
		</v-card>
	</v-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { isOffline } from "../../../../offline/index";
import { useResponsive } from "../../../composables/core/useResponsive";
import { useTheme } from "../../../composables/core/useTheme";
import { canShowItemQuickEdit } from "../../../utils/itemQuickEditPermission";
import ItemsTableExpandedRow from "./ItemsTableExpandedRow.vue";

declare const frappe: any;
declare const __: (_str: string, _args?: any[]) => string;

interface Props {
	modelValue?: boolean;
	item?: any;
	posProfile?: any;
	invoiceType?: string;
	isReturnInvoice?: boolean;
	invoiceDoc?: any;
	hideQtyDecimals?: boolean;
	expandedContentClasses?: string | any[] | Record<string, any>;
	displayCurrency?: string;
	isDarkTheme?: boolean;
	formatFloat: (_val: any, _precision?: number) => string;
	formatCurrency: (_val: any, _precision?: number) => string;
	currencySymbol: (_currency?: string) => string;
	isNumber: (_val: any) => string | boolean;
	setFormatedCurrency: (_item: any, _field: string, _value: any, _force?: boolean, _event?: any) => void;
	calcPrices: (_item: any, _value: any, _event?: any) => void;
	calcUom: (_item: any, _uom: string) => void;
	changePriceListRate: (_item: any) => void;
	getSerialOptions: (_item: any) => any[];
	setSerialNo: (_item: any) => void;
	setBatchQty: (_item: any, _event: any) => void;
	validateDueDate: (_item: any) => void;
}

const props = withDefaults(defineProps<Props>(), {
	modelValue: false,
	item: null,
	posProfile: null,
	invoiceType: "",
	isReturnInvoice: false,
	invoiceDoc: null,
	hideQtyDecimals: false,
	expandedContentClasses: "",
	displayCurrency: "",
});

const emit = defineEmits(["update:modelValue", "qty-change", "edit-item", "after-leave"]);

const responsive = useResponsive();
const theme = useTheme();
const resolvedTheme = computed(() => ((props.isDarkTheme ?? theme.isDark.value) ? "dark" : "light"));
const useFullscreenDialog = computed(
	() => responsive.windowWidth.value <= 1100 || responsive.windowHeight.value <= 760,
);
const activeTab = ref("sales");
const modalCard = ref<any>(null);
const searchInput = ref<any>(null);
const filters = ref({
	search: "",
	from_date: "",
	to_date: "",
	doctype_filter: "All",
});
const doctypeFilterItems = ["All", "Sales Invoice", "POS Invoice"];
const historyRows = ref<any[]>([]);
const historySummary = ref<Record<string, any>>({});
const historyLoading = ref(false);
const historyHasMore = ref(false);
const historyPage = ref(0);
const historyPageSize = 25;
const selectedHistoryIndex = ref(0);
const reloadTimer = ref<number | null>(null);
const invoiceDetailDialog = ref(false);
const selectedInvoiceDetail = ref<any>(null);
const offline = computed(() => isOffline());
const canUpdateItem = computed(() => canShowItemQuickEdit(props.posProfile));
const activeKeyboardKey = ref("");
const activeKeyboardTarget = ref<HTMLElement | null>(null);
const keyboardEditing = ref(false);
let generatedKeyboardTargetId = 0;

const keyboardTargetSelector = "[data-item-history-keytarget]";
const arrowKeys = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

const close = () => emit("update:modelValue", false);

const clearReloadTimer = () => {
	if (reloadTimer.value) {
		window.clearTimeout(reloadTimer.value);
		reloadTimer.value = null;
	}
};

const formatDateForDisplay = (date: string) => {
	if (!date) return "";
	const parts = String(date).split("-");
	return parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : date;
};

const formatDateTime = (date: string, time: string) => {
	const formattedDate = formatDateForDisplay(date);
	const formattedTime = time ? String(time).split(".")[0] : "";
	return [formattedDate, formattedTime].filter(Boolean).join(" ");
};

const loadHistory = async () => {
	if (!props.modelValue || !props.item?.item_code || !props.posProfile?.company || offline.value) {
		historyRows.value = [];
		historySummary.value = {};
		historyHasMore.value = false;
		return;
	}
	historyLoading.value = true;
	try {
		const { message } = await frappe.call({
			method: "posawesome.posawesome.api.items.get_item_sales_history",
			args: {
				item_code: props.item.item_code,
				company: props.posProfile.company,
				pos_profile: props.posProfile.name,
				doctype_filter: filters.value.doctype_filter,
				search: filters.value.search,
				from_date: filters.value.from_date,
				to_date: filters.value.to_date,
				limit_start: historyPage.value * historyPageSize,
				limit_page_length: historyPageSize,
			},
		});
		historyRows.value = Array.isArray(message?.rows) ? message.rows : [];
		historySummary.value = message?.summary || {};
		historyHasMore.value = Boolean(message?.has_more);
		selectedHistoryIndex.value = historyRows.value.length ? 0 : -1;
	} catch (error) {
		console.error("Error loading item sales history:", error);
		historyRows.value = [];
		historySummary.value = {};
		historyHasMore.value = false;
	} finally {
		historyLoading.value = false;
	}
};

const reloadHistoryFromStart = () => {
	historyPage.value = 0;
	loadHistory();
};

const scheduleHistoryReload = () => {
	clearReloadTimer();
	reloadTimer.value = window.setTimeout(() => {
		reloadTimer.value = null;
		reloadHistoryFromStart();
	}, 350);
};

const nextHistoryPage = () => {
	if (!historyHasMore.value || historyLoading.value) return;
	historyPage.value += 1;
	loadHistory();
};

const previousHistoryPage = () => {
	if (historyPage.value <= 0 || historyLoading.value) return;
	historyPage.value -= 1;
	loadHistory();
};

const getRootElement = () => {
	const value = modalCard.value;
	return (value?.$el || value) as HTMLElement | null;
};

const isElementVisible = (element: HTMLElement) => {
	if (!element.isConnected) return false;
	const style = window.getComputedStyle(element);
	if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
		return false;
	}
	const rect = element.getBoundingClientRect();
	return rect.width > 0 && rect.height > 0;
};

const isKeyboardTargetDisabled = (element: HTMLElement) =>
	element.hasAttribute("disabled") ||
	element.getAttribute("aria-disabled") === "true" ||
	element.classList.contains("v-btn--disabled") ||
	Boolean(element.closest("[disabled], [aria-disabled='true'], .v-btn--disabled"));

const ensureKeyboardTargetKey = (element: HTMLElement) => {
	if (!element.dataset.itemHistoryKey) {
		generatedKeyboardTargetId += 1;
		element.dataset.itemHistoryKey = `modal-target-${generatedKeyboardTargetId}`;
	}
	return element.dataset.itemHistoryKey;
};

const getKeyboardTargets = () => {
	const root = getRootElement();
	if (!root) return [];
	const seen = new Set<HTMLElement>();
	const targets: HTMLElement[] = [];
	for (const node of Array.from(root.querySelectorAll<HTMLElement>(keyboardTargetSelector))) {
		if (seen.has(node) || isKeyboardTargetDisabled(node) || !isElementVisible(node)) {
			continue;
		}
		ensureKeyboardTargetKey(node);
		seen.add(node);
		targets.push(node);
	}
	return targets;
};

const clearKeyboardBox = () => {
	const root = getRootElement();
	root?.querySelectorAll(".posa-modal-keyboard-box").forEach((node) => {
		node.classList.remove("posa-modal-keyboard-box");
	});
};

const setKeyboardTarget = (target: HTMLElement | null) => {
	clearKeyboardBox();
	activeKeyboardTarget.value = target;
	activeKeyboardKey.value = target ? ensureKeyboardTargetKey(target) || "" : "";
	if (!target) return;
	target.classList.add("posa-modal-keyboard-box");
	target.scrollIntoView?.({ block: "nearest", inline: "nearest" });
	const rowKey = target.dataset.itemHistoryKey || "";
	if (rowKey.startsWith("history-row-")) {
		const index = Number(rowKey.replace("history-row-", ""));
		if (Number.isInteger(index)) {
			selectedHistoryIndex.value = index;
		}
	}
};

const isKeyboardTargetActive = (key: string) => activeKeyboardKey.value === key;

const sortTargetsByPosition = (targets: HTMLElement[]) =>
	[...targets].sort((a, b) => {
		const aRect = a.getBoundingClientRect();
		const bRect = b.getBoundingClientRect();
		return aRect.top - bRect.top || aRect.left - bRect.left;
	});

const getTargetCenter = (element: HTMLElement) => {
	const rect = element.getBoundingClientRect();
	return {
		x: rect.left + rect.width / 2,
		y: rect.top + rect.height / 2,
	};
};

const scoreTargetForArrow = (
	key: string,
	current: ReturnType<typeof getTargetCenter>,
	target: HTMLElement,
) => {
	const candidate = getTargetCenter(target);
	const dx = candidate.x - current.x;
	const dy = candidate.y - current.y;
	if (key === "ArrowRight" && dx <= 1) return null;
	if (key === "ArrowLeft" && dx >= -1) return null;
	if (key === "ArrowDown" && dy <= 1) return null;
	if (key === "ArrowUp" && dy >= -1) return null;
	const primary = key === "ArrowRight" || key === "ArrowLeft" ? Math.abs(dx) : Math.abs(dy);
	const secondary = key === "ArrowRight" || key === "ArrowLeft" ? Math.abs(dy) : Math.abs(dx);
	return secondary * 1000 + primary;
};

const setDefaultKeyboardTarget = async () => {
	await nextTick();
	const targets = getKeyboardTargets();
	if (!targets.length) {
		setKeyboardTarget(null);
		return;
	}
	const preferred: HTMLElement | null =
		targets.find(
			(target) =>
				target.getAttribute("role") === "tab" &&
				target.textContent?.includes(
					activeTab.value === "details" ? __("Item Details") : __("Sales History"),
				),
		) ||
		(activeTab.value === "sales"
			? targets.find((target) => target.dataset.itemHistoryKey === "history-row-0") || null
			: null) ||
		targets[0] ||
		null;
	setKeyboardTarget(preferred);
	getRootElement()?.focus?.({ preventScroll: true });
};

const moveKeyboardTarget = (key: string) => {
	const targets = getKeyboardTargets();
	if (!targets.length) return false;
	if (!activeKeyboardTarget.value || !targets.includes(activeKeyboardTarget.value)) {
		setKeyboardTarget(sortTargetsByPosition(targets)[0] ?? null);
		return true;
	}
	const current = getTargetCenter(activeKeyboardTarget.value);
	let bestTarget: HTMLElement | null = null;
	let bestScore = Number.POSITIVE_INFINITY;
	for (const target of targets) {
		if (target === activeKeyboardTarget.value) continue;
		const score = scoreTargetForArrow(key, current, target);
		if (score !== null && score < bestScore) {
			bestScore = score;
			bestTarget = target;
		}
	}
	if (!bestTarget) {
		const ordered = sortTargetsByPosition(targets);
		const currentIndex = ordered.indexOf(activeKeyboardTarget.value);
		const delta = key === "ArrowLeft" || key === "ArrowUp" ? -1 : 1;
		bestTarget = ordered[Math.max(0, Math.min(currentIndex + delta, ordered.length - 1))] || null;
	}
	if (!bestTarget || bestTarget === activeKeyboardTarget.value) return false;
	setKeyboardTarget(bestTarget);
	return true;
};

const findFocusableWithinTarget = (target: HTMLElement) => {
	if (target.matches("input, textarea, select, button, [role='tab'], [contenteditable='true']")) {
		return target;
	}
	return target.querySelector<HTMLElement>(
		"input, textarea, select, button, [role='tab'], [contenteditable='true'], [tabindex]:not([tabindex='-1'])",
	);
};

const activateKeyboardTarget = () => {
	const target = activeKeyboardTarget.value;
	if (!target) {
		void setDefaultKeyboardTarget();
		return;
	}
	const rowKey = target.dataset.itemHistoryKey || "";
	if (rowKey.startsWith("history-row-")) {
		const index = Number(rowKey.replace("history-row-", ""));
		if (Number.isInteger(index) && historyRows.value[index]) {
			viewInvoice(historyRows.value[index]);
		}
		return;
	}
	const focusable = findFocusableWithinTarget(target);
	if (!focusable) return;
	focusable.focus?.();
	if (focusable.matches("input, textarea, select, [contenteditable='true']")) {
		keyboardEditing.value = true;
		if (focusable instanceof HTMLInputElement) {
			focusable.select?.();
		}
		return;
	}
	focusable.click?.();
	void nextTick(() => setDefaultKeyboardTarget());
};

const stopKeyboardEditing = () => {
	keyboardEditing.value = false;
	(document.activeElement as HTMLElement | null)?.blur?.();
	getRootElement()?.focus?.({ preventScroll: true });
};

const viewInvoice = async (row: any) => {
	if (!row?.invoice || !row?.doctype) return;
	try {
		const { message } = await frappe.call({
			method: "frappe.client.get",
			args: { doctype: row.doctype, name: row.invoice },
		});
		selectedInvoiceDetail.value = message || null;
		invoiceDetailDialog.value = Boolean(message);
	} catch (error) {
		console.error("Error loading invoice details:", error);
	}
};

const closeInvoiceDetailDialog = async () => {
	invoiceDetailDialog.value = false;
	await nextTick();
	const previousTarget = activeKeyboardTarget.value;
	if (previousTarget?.isConnected && isElementVisible(previousTarget)) {
		setKeyboardTarget(previousTarget);
	} else {
		await setDefaultKeyboardTarget();
	}
	getRootElement()?.focus?.({ preventScroll: true });
};

const isEditableTarget = (target: EventTarget | null) => {
	const element = target as HTMLElement | null;
	if (!element) return false;
	return Boolean(element.closest("input, textarea, select, [contenteditable='true']"));
};

const handleModalKeydown = (event: KeyboardEvent) => {
	if (invoiceDetailDialog.value) {
		if (event.key === "Escape") {
			event.preventDefault();
			void closeInvoiceDetailDialog();
		}
		return;
	}
	if (event.key === "Escape") {
		event.preventDefault();
		if (keyboardEditing.value) {
			stopKeyboardEditing();
			return;
		}
		close();
		return;
	}
	if (arrowKeys.has(event.key)) {
		event.preventDefault();
		event.stopPropagation();
		if (keyboardEditing.value) {
			stopKeyboardEditing();
		}
		moveKeyboardTarget(event.key);
		return;
	}
	if (event.key === "Tab") {
		event.preventDefault();
		event.stopPropagation();
		if (keyboardEditing.value) {
			stopKeyboardEditing();
		}
		moveKeyboardTarget(event.shiftKey ? "ArrowLeft" : "ArrowRight");
		return;
	}
	if (event.key === "Enter") {
		event.preventDefault();
		event.stopPropagation();
		if (keyboardEditing.value && !isEditableTarget(event.target)) {
			keyboardEditing.value = false;
		}
		activateKeyboardTarget();
	}
};

const handleModalClick = (event: MouseEvent) => {
	const target = (event.target as HTMLElement | null)?.closest?.(
		keyboardTargetSelector,
	) as HTMLElement | null;
	if (target) {
		setKeyboardTarget(target);
	}
};

watch(
	() => props.modelValue,
	async (value) => {
		if (!value) {
			clearReloadTimer();
			return;
		}
		activeTab.value = "sales";
		historyPage.value = 0;
		selectedInvoiceDetail.value = null;
		invoiceDetailDialog.value = false;
		await loadHistory();
		keyboardEditing.value = false;
		await setDefaultKeyboardTarget();
	},
);

watch(
	() => props.item?.item_code,
	() => {
		if (props.modelValue) reloadHistoryFromStart();
	},
);

watch(activeTab, () => {
	if (props.modelValue) {
		keyboardEditing.value = false;
		void setDefaultKeyboardTarget();
	}
});

watch(historyRows, () => {
	if (props.modelValue && activeTab.value === "sales") {
		void setDefaultKeyboardTarget();
	}
});
</script>

<style scoped>
.posa-item-history-card {
	--counter-rugged-navy: #09253d;
	--counter-rugged-navy-raised: #174a70;
	--counter-rugged-blue: #0f70d7;
	--counter-rugged-cyan: #38bdf8;
	--counter-rugged-line: var(--pos-outline);
	--counter-rugged-soft-line: var(--pos-border);
	display: grid;
	grid-template-rows: auto auto auto minmax(0, 1fr) auto;
	height: min(780px, calc(100vh - 24px));
	height: min(780px, calc(100dvh - 24px));
	max-height: calc(100vh - 24px);
	max-height: calc(100dvh - 24px);
	overflow: hidden;
	border: 3px solid var(--counter-rugged-navy);
	border-radius: 5px !important;
	background: var(--pos-dialog-bg) !important;
	color: var(--pos-text-primary) !important;
	box-shadow: 0 5px 14px rgba(4, 22, 37, 0.34);
}

.posa-item-history-card--fullscreen {
	height: 100vh;
	height: 100dvh;
	max-height: 100vh;
	max-height: 100dvh;
	border-radius: 0 !important;
}

.posa-item-history-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 16px;
	flex-wrap: wrap;
	min-height: 70px;
	padding: 10px 12px 10px 16px;
	border-bottom: 2px solid var(--counter-rugged-cyan);
	background: var(--counter-rugged-navy);
	color: #ffffff;
}

.posa-item-history-header__identity {
	min-width: 0;
	flex: 1 1 260px;
}

.posa-item-history-header__identity .text-h6,
.posa-item-history-header__identity .text-subtitle-2 {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	color: #ffffff !important;
}

.posa-item-history-header__identity .text-subtitle-2 {
	color: #d6e7f3 !important;
}

.posa-item-history-header__metrics {
	display: flex;
	align-items: center;
	gap: 8px;
	flex-wrap: wrap;
}

.posa-item-history-header__metrics :deep(.v-chip) {
	border: 1px solid #6ea3c7;
	border-radius: 3px;
	background: #174a70 !important;
	color: #ffffff !important;
}

.posa-item-history-header__metrics :deep(.v-btn) {
	border-radius: 3px !important;
}

.posa-item-history-header__metrics :deep(.v-btn:not(.v-btn--icon)) {
	border: 1px solid var(--counter-rugged-cyan);
	background: #174a70 !important;
	color: #ffffff !important;
}

.posa-item-history-header__metrics :deep(.v-btn--icon) {
	color: #ffffff !important;
}

.posa-item-history-tabs {
	padding-inline: 12px;
	border-bottom: 1px solid var(--counter-rugged-line);
	background: var(--pos-table-header-bg);
	color: var(--pos-text-primary);
}

.posa-item-history-tabs :deep(.v-tab) {
	border-radius: 0 !important;
	font-weight: 700;
}

.posa-item-history-tabs :deep(.v-tab--selected) {
	background: var(--pos-input-bg);
	color: var(--counter-rugged-blue) !important;
}

.posa-item-history-body {
	min-height: 0;
	overflow: auto;
	overscroll-behavior: contain;
	background: var(--pos-surface-muted);
}

.posa-item-history-filters {
	display: grid;
	grid-template-columns: minmax(260px, 2fr) minmax(150px, 1fr) minmax(150px, 1fr) minmax(180px, 1fr);
	gap: 12px;
	margin-bottom: 16px;
}

.posa-item-history-filters :deep(.v-label),
.posa-item-history-filters :deep(.v-field-label) {
	color: var(--pos-text-secondary) !important;
	opacity: 1;
}

.posa-item-history-summary {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 12px;
	margin-bottom: 16px;
}

.summary-tile {
	min-width: 0;
	padding: 10px 12px;
	border: 1px solid var(--counter-rugged-line);
	border-left: 5px solid var(--counter-rugged-blue);
	border-radius: 3px;
	background: var(--pos-card-bg);
	box-shadow: 0 1px 3px rgba(9, 37, 61, 0.12);
}

.summary-tile__label {
	color: var(--pos-text-secondary);
	font-size: 0.7rem;
	font-weight: 700;
	text-transform: uppercase;
}

.summary-tile__value {
	margin-top: 3px;
	overflow: hidden;
	color: var(--pos-text-primary);
	font-size: 0.96rem;
	font-weight: 800;
	font-variant-numeric: tabular-nums;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.posa-item-history-loader,
.posa-item-history-empty {
	min-height: 260px;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 10px;
}

.posa-item-history-table {
	border: 2px solid var(--counter-rugged-navy-raised);
	border-radius: 3px;
	overflow: auto;
	background: var(--pos-card-bg);
}

.posa-item-history-table :deep(table) {
	min-width: 920px;
}

.posa-item-history-table tbody tr {
	cursor: pointer;
}

.posa-item-history-table :deep(th) {
	height: 40px;
	border-right: 1px solid #70b9e4;
	border-bottom: 2px solid var(--counter-rugged-cyan);
	background: var(--counter-rugged-navy-raised) !important;
	color: #ffffff !important;
	font-size: 0.72rem;
	font-weight: 800;
	text-transform: uppercase;
}

.posa-item-history-table :deep(td) {
	border-right: 1px solid var(--counter-rugged-soft-line);
	border-bottom: 1px solid var(--counter-rugged-line);
	background: var(--pos-card-bg);
	color: var(--pos-text-primary);
	font-variant-numeric: tabular-nums;
}

.posa-item-history-table :deep(tbody tr:nth-child(even) td) {
	background: var(--pos-surface-muted);
}

.posa-item-history-row--active td {
	background: var(--pos-selected-bg) !important;
	box-shadow: inset 4px 0 0 var(--counter-rugged-blue);
}

.posa-modal-keyboard-box {
	position: relative;
	outline: 3px solid rgb(var(--v-theme-primary)) !important;
	outline-offset: 2px;
	border-radius: 6px;
	z-index: 4;
}

.posa-item-history-table tr.posa-modal-keyboard-box {
	outline-offset: -3px;
}

.posa-item-history-table tr.posa-modal-keyboard-box td {
	background: var(--pos-selected-bg) !important;
}

.posa-item-history-footer,
.posa-item-history-actions {
	display: flex;
	align-items: center;
	gap: 12px;
}

.posa-item-history-footer {
	justify-content: space-between;
	margin-top: 14px;
}

.posa-item-history-actions {
	border-top: 2px solid var(--counter-rugged-navy-raised);
	background: var(--pos-card-bg);
}

.posa-item-history-actions :deep(.v-btn) {
	border: 1px solid #b7202a;
	border-radius: 3px !important;
	background: #dc343d !important;
	color: #ffffff !important;
}

.detail-section__title {
	font-size: 0.95rem;
	font-weight: 700;
	margin-bottom: 8px;
}

.invoice-detail-card {
	--counter-rugged-navy: #09253d;
	--counter-rugged-navy-raised: #174a70;
	--counter-rugged-cyan: #38bdf8;
	--counter-rugged-line: var(--pos-outline);
	--counter-rugged-soft-line: var(--pos-border);
	border: 3px solid var(--counter-rugged-navy);
	border-radius: 5px !important;
	background: var(--pos-dialog-bg) !important;
}

.invoice-detail-header {
	border-bottom: 2px solid var(--counter-rugged-cyan);
	background: var(--counter-rugged-navy);
	color: #ffffff;
}

.invoice-detail-header .text-subtitle-2 {
	color: #d6e7f3 !important;
}

.invoice-detail-header :deep(.v-btn) {
	border-radius: 3px !important;
	color: #ffffff !important;
}

@media (max-width: 960px) {
	.posa-item-history-filters {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.posa-item-history-summary {
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 8px;
	}
}

@media (max-width: 720px) {
	.posa-item-history-filters {
		grid-template-columns: 1fr;
	}

	.posa-item-history-summary {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}
</style>
