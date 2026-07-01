"""Expose API functions for POS Awesome."""

from .bundles import get_bundle_components
from .dashboard import get_dashboard_data
from .customers import (
    create_customer,
    get_customer_addresses,
    get_customer_info,
    get_customer_names,
    get_customers_count,
    get_sales_person_names,
    make_address,
    set_customer_info,
)
from .commercial_flow import (
    commit_document_flow_action,
    list_source_documents,
    prepare_document_flow_action,
)
from .invoices import (
    delete_invoice,
    get_draft_invoices,
    get_last_invoice_rates,
    search_invoices_for_return,
    submit_invoice,
    update_invoice,
    validate_return_items,
)
from .items import (
    build_scale_barcode,
    get_item_attributes,
    get_item_brand,
    get_item_detail,
    get_items,
    get_items_count,
    get_items_details,
    get_items_from_barcode,
    parse_scale_barcode,
    get_items_groups,
)
from .offers import (
    get_active_gift_coupons,
    get_applicable_delivery_charges,
    get_offers,
    get_pos_coupon,
)
# Pre-import `pricing_rules` so its module load happens during the
# package __init__ pass — same call stack as offers/items/etc.
# Without this Python 3.14's stricter `_ModuleLock` raises a
# deadlock when two concurrent SPA requests race on
# `posawesome.posawesome.api.offers` (already loaded once via
# this __init__) and `posawesome.posawesome.api.pricing_rules`
# (loaded on first frappe.call to `get_active_pricing_rules`,
# triggering a re-entry into this __init__ from a different
# thread). Pre-importing means subsequent calls hit the cached
# module without re-running this __init__ chain.
from .pricing_rules import get_active_pricing_rules, reconcile_line_prices  # noqa: F401
from .payments import (
    create_payment_request,
    get_available_credit,
)
from .stored_value import (
    get_available_stored_value,
    get_stored_value_summary,
)
from .sales_orders import (
    search_orders,
    submit_sales_order,
    update_sales_order,
)
from .quotations import (
    submit_quotation,
    update_quotation,
)
from .purchase_orders import (
    create_purchase_item,
    create_purchase_order,
    create_supplier,
    get_draft_purchase_order,
    search_draft_purchase_orders,
    search_suppliers,
)
from .shifts import (
    check_opening_shift,
    create_opening_voucher,
    get_opening_dialog_data,
)
from .utilities import (
    get_app_branch,
    get_app_info,
    get_language_options,
    get_pos_profile_tax_inclusive,
    get_selling_price_lists,
    get_translation_dict,
    get_version,
)
from .utils import get_active_pos_profile, get_default_warehouse, get_warehouses
from .label_templates import (
    get_label_templates,
    get_label_template_detail,
    save_label_template,
    delete_label_template,
    get_shipping_addresses,
)
from .sscc_api import get_next_sscc_serials
from .barcode_print_log import (
    batch_create_print_logs,
    verify_barcode,
    get_print_logs,
    get_print_stats,
)
