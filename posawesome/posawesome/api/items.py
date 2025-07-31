# Copyright (c) 2020, Youssef Restom and contributors
# For license information, please see license.txt

import json

import frappe
from erpnext.accounts.doctype.pos_profile.pos_profile import get_item_groups
from erpnext.stock.doctype.batch.batch import (
	get_batch_no,
	get_batch_qty,
)
from erpnext.stock.get_item_details import get_item_details
from frappe import _
from frappe.utils import cstr, flt, nowdate
from frappe.utils.background_jobs import enqueue
from frappe.utils.caching import redis_cache


def get_seearch_items_conditions(item_code, serial_no, batch_no, barcode):
	"""Build item search conditions safely."""
	# Gracefully handle missing item_code values to avoid TypeErrors
	item_code = item_code or ""

	if serial_no or batch_no or barcode:
		return f" and name = {frappe.db.escape(item_code)}"

	return """ and (name like {item_code} or item_name like {item_code})""".format(
		item_code=frappe.db.escape("%" + item_code + "%")
	)


def get_item_group_condition(pos_profile):
	cond = " and 1=1"
	item_groups = get_item_groups(pos_profile)
	if item_groups:
		cond = " and item_group in ({})".format(", ".join(["%s"] * len(item_groups)))

	return cond % tuple(item_groups)


def get_stock_availability(item_code, warehouse):
	actual_qty = (
		frappe.db.get_value(
			"Stock Ledger Entry",
			filters={
				"item_code": item_code,
				"warehouse": warehouse,
				"is_cancelled": 0,
			},
			fieldname="qty_after_transaction",
			order_by="posting_date desc, posting_time desc, creation desc",
		)
		or 0.0
	)
	return actual_qty


@frappe.whitelist()
def get_items(
	pos_profile,
	price_list=None,
	item_group="",
	search_value="",
	customer=None,
	limit=None,
	offset=None,
	modified_after=None,
):
	_pos_profile = json.loads(pos_profile)
	use_price_list = _pos_profile.get("posa_use_server_cache")

	@redis_cache(ttl=60)
	def __get_items(
		pos_profile,
		price_list,
		item_group,
		search_value,
		customer=None,
		limit=None,
		offset=None,
		modified_after=None,
	):
		return _get_items(
		        pos_profile,
		        price_list,
		        item_group,
		        search_value,
		        customer,
		        limit,
		        offset,
		        modified_after,
		)

	def _get_items(
		pos_profile,
		price_list,
		item_group,
		search_value,
		customer=None,
		limit=None,
		offset=None,
		modified_after=None,
	):
		pos_profile = json.loads(pos_profile)
		condition = ""

		# Clear quantity cache to ensure fresh values on each search
		try:
			if hasattr(frappe.local.cache, "delete_key"):
				frappe.local.cache.delete_key("bin_qty_cache")
			elif frappe.cache().get_value("bin_qty_cache"):
				frappe.cache().delete_value("bin_qty_cache")
		except Exception as e:
			frappe.log_error(f"Error clearing bin_qty_cache: {e!s}", "POS Awesome")

		today = nowdate()
		warehouse = pos_profile.get("warehouse")
		use_limit_search = pos_profile.get("pose_use_limit_search")
		search_serial_no = pos_profile.get("posa_search_serial_no")
		search_batch_no = pos_profile.get("posa_search_batch_no")
		posa_show_template_items = pos_profile.get("posa_show_template_items")
		posa_display_items_in_stock = pos_profile.get("posa_display_items_in_stock")
		search_limit = 0

		if not price_list:
			price_list = pos_profile.get("selling_price_list")

		limit_clause = ""

		def _to_positive_int(value):
			"""Convert the input to a non-negative integer if possible."""
			try:
				ivalue = int(value)
				return ivalue if ivalue >= 0 else None
			except (TypeError, ValueError):
				return None

		limit = _to_positive_int(limit)
		offset = _to_positive_int(offset)

		if limit is not None:
			limit_clause = f" LIMIT {limit}"
			if offset:
				limit_clause += f" OFFSET {offset}"

		condition += get_item_group_condition(pos_profile.get("name"))

		if use_limit_search and limit is None:
			search_limit = pos_profile.get("posa_search_limit") or 500
			data = {}
			if search_value:
				data = search_serial_or_batch_or_barcode_number(search_value, search_serial_no)

			item_code = data.get("item_code") if data.get("item_code") else search_value
			serial_no = data.get("serial_no") if data.get("serial_no") else ""
			batch_no = data.get("batch_no") if data.get("batch_no") else ""
			barcode = data.get("barcode") if data.get("barcode") else ""

			condition += get_seearch_items_conditions(item_code, serial_no, batch_no, barcode)
			if item_group:
				# Escape item_group to avoid SQL errors with special characters
				safe_item_group = frappe.db.escape("%" + item_group + "%")
				condition += f" AND item_group like {safe_item_group}"

			# Always apply a search limit when limit search is enabled
			limit_clause = f" LIMIT {search_limit}"

			# If force reload is enabled and the user is explicitly searching,
			# remove the limit to return all matching items
			if pos_profile.get("posa_force_reload_items") and search_value:
				limit_clause = ""

		if not posa_show_template_items:
			condition += " AND has_variants = 0"

		result = []

		# Build ORM filters
		filters = {"disabled": 0, "is_sales_item": 1, "is_fixed_asset": 0}
		if modified_after:
		        filters["modified"] = [">", modified_after]

		# Add item group filter
		item_groups = get_item_groups(pos_profile.get("name"))
		item_groups = [g.strip("'") for g in item_groups]
		if item_groups:
			filters["item_group"] = ["in", item_groups]

		# Add search conditions
		or_filters = []
		if use_limit_search and search_value:
			data = search_serial_or_batch_or_barcode_number(search_value, search_serial_no)
			item_code = data.get("item_code") if data.get("item_code") else search_value

			or_filters = [
				["name", "like", f"%{item_code}%"],
				["item_name", "like", f"%{item_code}%"],
			]

			# Check for exact barcode match
			if data.get("item_code"):
				filters["name"] = data.get("item_code")
				or_filters = []

		if item_group and item_group.upper() != "ALL":
			filters["item_group"] = ["like", f"%{item_group}%"]

		if not posa_show_template_items:
			filters["has_variants"] = 0

		# Determine limit
		limit_page_length = None
		limit_start = None

		if limit is not None:
			limit_page_length = limit
			if offset:
				limit_start = offset
		elif use_limit_search:
			limit_page_length = search_limit
			if pos_profile.get("posa_force_reload_items") and search_value:
				limit_page_length = None

		items_data = frappe.get_all(
			"Item",
			filters=filters,
			or_filters=or_filters if or_filters else None,
			fields=[
				"name as item_code",
				"item_name",
				"description",
				"stock_uom",
				"image",
				"is_stock_item",
				"has_variants",
				"variant_of",
				"item_group",
				"idx",
				"has_batch_no",
				"has_serial_no",
				"max_discount",
				"brand",
			],
			limit_start=limit_start,
			limit_page_length=limit_page_length,
			order_by="item_name asc",
		)

		if items_data:
			items = [d.item_code for d in items_data]
			price_list_currency = frappe.db.get_value("Price List", price_list, "currency")
			item_prices_data = frappe.get_all(
				"Item Price",
				fields=["item_code", "price_list_rate", "currency", "uom"],
				filters={
					"price_list": price_list,
					"item_code": ["in", items],
					"currency": price_list_currency or pos_profile.get("currency"),
					"selling": 1,
					"valid_from": ["<=", today],
					"customer": ["in", ["", None, customer]],
				},
				or_filters=[
					["valid_upto", ">=", today],
					["valid_upto", "in", ["", None]],
				],
				order_by="valid_from ASC, valid_upto DESC",
			)

			item_prices = {}
			for d in item_prices_data:
				item_prices.setdefault(d.item_code, {})
				item_prices[d.item_code][d.get("uom") or "None"] = d

			for item in items_data:
				item_code = item.item_code
				item_price = {}
				if item_prices.get(item_code):
					item_price = (
						item_prices.get(item_code).get(item.stock_uom)
						or item_prices.get(item_code).get("None")
						or {}
					)
				item_barcode = frappe.get_all(
					"Item Barcode",
					filters={"parent": item_code},
					fields=["barcode", "posa_uom"],
				)
				batch_no_data = []
				if search_batch_no or item.has_batch_no:
					batch_list = get_batch_qty(warehouse=warehouse, item_code=item_code)
					if batch_list:
						for batch in batch_list:
							if batch.qty > 0 and batch.batch_no:
								batch_doc = frappe.get_cached_doc("Batch", batch.batch_no)
								if (
									str(batch_doc.expiry_date) > str(today)
									or batch_doc.expiry_date in ["", None]
								) and batch_doc.disabled == 0:
									batch_no_data.append(
										{
											"batch_no": batch.batch_no,
											"batch_qty": batch.qty,
											"expiry_date": batch_doc.expiry_date,
											"batch_price": batch_doc.posa_batch_price,
											"manufacturing_date": batch_doc.manufacturing_date,
										}
									)
				serial_no_data = []
				if search_serial_no or item.has_serial_no:
					serial_no_data = frappe.get_all(
						"Serial No",
						filters={
							"item_code": item_code,
							"status": "Active",
							"warehouse": warehouse,
						},
						fields=["name as serial_no"],
					)
				# Fetch UOM conversion details for the item
				uoms = frappe.get_all(
					"UOM Conversion Detail",
					filters={"parent": item_code},
					fields=["uom", "conversion_factor"],
				)
				stock_uom = item.stock_uom
				if stock_uom and not any(u.get("uom") == stock_uom for u in uoms):
					uoms.append({"uom": stock_uom, "conversion_factor": 1.0})
				item_stock_qty = 0
				if pos_profile.get("posa_display_items_in_stock") or use_limit_search:
					item_stock_qty = get_stock_availability(item_code, pos_profile.get("warehouse"))
				attributes = ""
				if pos_profile.get("posa_show_template_items") and item.has_variants:
					attributes = get_item_attributes(item.item_code)
				item_attributes = ""
				if pos_profile.get("posa_show_template_items") and item.variant_of:
					item_attributes = frappe.get_all(
						"Item Variant Attribute",
						fields=["attribute", "attribute_value"],
						filters={"parent": item.item_code, "parentfield": "attributes"},
					)
				if posa_display_items_in_stock and (not item_stock_qty or item_stock_qty < 0):
					pass
				else:
					row = {}
					row.update(item)
					row.update(
						{
							"rate": item_price.get("price_list_rate") or 0,
							"currency": item_price.get("currency")
							or price_list_currency
							or pos_profile.get("currency"),
							"item_barcode": item_barcode or [],
							"actual_qty": item_stock_qty or 0,
							"serial_no_data": serial_no_data or [],
							"batch_no_data": batch_no_data or [],
							"attributes": attributes or "",
							"item_attributes": item_attributes or "",
							"item_uoms": uoms or [],
						}
					)
					result.append(row)
		return result

	if use_price_list:
		return __get_items(
		        pos_profile,
		        price_list,
		        item_group,
		        search_value,
		        customer,
		        limit,
		        offset,
		        modified_after,
		)
	else:
		return _get_items(
		        pos_profile,
		        price_list,
		        item_group,
		        search_value,
		        customer,
		        limit,
		        offset,
		        modified_after,
		)


@frappe.whitelist()
def get_items_groups():
	return frappe.db.sql(
		"""select name from `tabItem Group`
	    where is_group = 0 order by name limit 500""",
		as_dict=1,
	)


@frappe.whitelist()
def get_item_variants(pos_profile, parent_item_code, price_list=None, customer=None):
	"""Return variants of an item along with attribute metadata."""
	pos_profile = json.loads(pos_profile)
	price_list = price_list or pos_profile.get("selling_price_list")

	fields = [
		"name as item_code",
		"item_name",
		"description",
		"stock_uom",
		"image",
		"is_stock_item",
		"has_variants",
		"variant_of",
		"item_group",
		"idx",
		"has_batch_no",
		"has_serial_no",
		"max_discount",
		"brand",
	]

	items_data = frappe.get_all(
		"Item",
		filters={"variant_of": parent_item_code, "disabled": 0},
		fields=fields,
		order_by="item_name asc",
	)

	if not items_data:
		return {"variants": [], "attributes_meta": {}}

	details = get_items_details(
		json.dumps(pos_profile),
		json.dumps(items_data),
		price_list=price_list,
	)

	detail_map = {d["item_code"]: d for d in details}
	result = []
	for item in items_data:
		item_barcode = frappe.get_all(
			"Item Barcode",
			filters={"parent": item["item_code"]},
			fields=["barcode", "posa_uom"],
		)
		item["item_barcode"] = item_barcode or []
		if detail_map.get(item["item_code"]):
			item.update(detail_map[item["item_code"]])
		result.append(item)

	# --------------------------
	# Build attributes meta *and* per-item attribute list
	# --------------------------
	attr_rows = frappe.get_all(
		"Item Variant Attribute",
		filters={"parent": ["in", [d["item_code"] for d in items_data]]},
		fields=["parent", "attribute", "attribute_value"],
	)

	from collections import defaultdict

	attributes_meta: dict[str, set] = defaultdict(set)
	item_attr_map: dict[str, list] = defaultdict(list)

	for row in attr_rows:
		attributes_meta[row.attribute].add(row.attribute_value)
		item_attr_map[row.parent].append({"attribute": row.attribute, "attribute_value": row.attribute_value})

	attributes_meta = {k: sorted(v) for k, v in attributes_meta.items()}

	for item in result:
		item["item_attributes"] = item_attr_map.get(item["item_code"], [])

	# Ensure attributes_meta is always a dictionary
	return {"variants": result, "attributes_meta": attributes_meta or {}}


@frappe.whitelist()
def get_items_details(pos_profile, items_data, price_list=None):
	pos_profile = json.loads(pos_profile)
	items_data = json.loads(items_data)
	warehouse = pos_profile.get("warehouse")
	company = (
		pos_profile.get("company")
		or frappe.defaults.get_user_default("Company")
		or frappe.defaults.get_global_default("company")
	)
	result = []

	if items_data:
		for item in items_data:
			item_code = item.get("item_code")
			if item_code:
				if item.get("has_variants"):
					# Skip template items to avoid ValidationError
					continue
				item_detail = get_item_detail(
					json.dumps(item),
						warehouse=warehouse,
						price_list=price_list or pos_profile.get("selling_price_list"),
						company=company,
					)
				if item_detail:
					result.append(item_detail)

	return result


@frappe.whitelist()
def get_item_detail(item, doc=None, warehouse=None, price_list=None, company=None):
	item = json.loads(item)
	today = nowdate()
	item_code = item.get("item_code")
	batch_no_data = []
	serial_no_data = []
	if warehouse and item.get("has_batch_no"):
		batch_list = get_batch_qty(warehouse=warehouse, item_code=item_code)
		if batch_list:
			for batch in batch_list:
				if batch.qty > 0 and batch.batch_no:
					batch_doc = frappe.get_cached_doc("Batch", batch.batch_no)
					if (
						str(batch_doc.expiry_date) > str(today) or batch_doc.expiry_date in ["", None]
					) and batch_doc.disabled == 0:
						batch_no_data.append(
							{
								"batch_no": batch.batch_no,
								"batch_qty": batch.qty,
								"expiry_date": batch_doc.expiry_date,
								"batch_price": batch_doc.posa_batch_price,
								"manufacturing_date": batch_doc.manufacturing_date,
							}
						)
	if warehouse and item.get("has_serial_no"):
		serial_no_data = frappe.get_all(
			"Serial No",
			filters={
				"item_code": item_code,
				"status": "Active",
				"warehouse": warehouse,
			},
			fields=["name as serial_no"],
		)

	item["selling_price_list"] = price_list

	# Determine if multi-currency is enabled on the POS Profile
	allow_multi_currency = False
	if item.get("pos_profile"):
		allow_multi_currency = (
			frappe.db.get_value("POS Profile", item.get("pos_profile"), "posa_allow_multi_currency") or 0
		)

	# Ensure conversion rate exists when price list currency differs from
	# company currency to avoid ValidationError from ERPNext. Also provide
	# sensible defaults when price list or currency is missing.
	if company:
		company_currency = frappe.db.get_value("Company", company, "default_currency")
		price_list_currency = company_currency
		if price_list:
			price_list_currency = (
				frappe.db.get_value("Price List", price_list, "currency") or company_currency
			)

		exchange_rate = 1
		if price_list_currency != company_currency and allow_multi_currency:
			from erpnext.setup.utils import get_exchange_rate

			try:
				exchange_rate = get_exchange_rate(price_list_currency, company_currency, today)
			except Exception:
				frappe.log_error(
					f"Missing exchange rate from {price_list_currency} to {company_currency}",
					"POS Awesome",
				)

		item["price_list_currency"] = price_list_currency
		item["plc_conversion_rate"] = exchange_rate
		item["conversion_rate"] = exchange_rate

		if doc:
			doc.price_list_currency = price_list_currency
			doc.plc_conversion_rate = exchange_rate
			doc.conversion_rate = exchange_rate

	# Add company and doctype to the item args for ERPNext validation
	if company:
		item["company"] = company

	# Set doctype for ERPNext validation
	item["doctype"] = "Sales Invoice"

	# Create a proper doc structure with company for ERPNext validation
	if not doc and company:
		doc = frappe._dict({"doctype": "Sales Invoice", "company": company})

	max_discount = frappe.get_value("Item", item_code, "max_discount")
	res = get_item_details(
		item,
		doc,
		overwrite_warehouse=False,
	)
	if item.get("is_stock_item") and warehouse:
		res["actual_qty"] = get_stock_availability(item_code, warehouse)
	res["max_discount"] = max_discount
	res["batch_no_data"] = batch_no_data
	res["serial_no_data"] = serial_no_data

	# Add UOMs data directly from item document
	uoms = frappe.get_all(
		"UOM Conversion Detail",
		filters={"parent": item_code},
		fields=["uom", "conversion_factor"],
	)

	# Add stock UOM if not already in uoms list
	stock_uom = frappe.db.get_value("Item", item_code, "stock_uom")
	if stock_uom:
		stock_uom_exists = False
		for uom_data in uoms:
			if uom_data.get("uom") == stock_uom:
				stock_uom_exists = True
				break

		if not stock_uom_exists:
			uoms.append({"uom": stock_uom, "conversion_factor": 1.0})

	res["item_uoms"] = uoms

	return res


@frappe.whitelist()
def get_items_from_barcode(selling_price_list, currency, barcode):
	search_item = frappe.db.get_value(
		"Item Barcode",
		{"barcode": barcode},
		["parent as item_code", "posa_uom"],
		as_dict=1,
	)
	if search_item:
		item_doc = frappe.get_cached_doc("Item", search_item.item_code)
		item_price = frappe.db.get_value(
			"Item Price",
			{
				"item_code": search_item.item_code,
				"price_list": selling_price_list,
				"currency": currency,
			},
			"price_list_rate",
		)

		return {
			"item_code": item_doc.name,
			"item_name": item_doc.item_name,
			"barcode": barcode,
			"rate": item_price or 0,
			"uom": search_item.posa_uom or item_doc.stock_uom,
			"currency": currency,
		}
	return None


def build_item_cache(item_code):
	"""Build item cache for faster access."""
	# Implementation for building item cache
	pass


def get_item_optional_attributes(item_code):
	"""Get optional attributes for an item."""
	return frappe.get_all(
		"Item Variant Attribute",
		fields=["attribute", "attribute_value"],
		filters={"parent": item_code, "parentfield": "attributes"},
	)


@frappe.whitelist()
def get_item_attributes(item_code):
	"""Get item attributes."""
	return frappe.get_all(
		"Item Attribute",
		fields=["name", "attribute_name"],
		filters={
			"name": [
				"in",
				[
					attr.attribute
					for attr in frappe.get_all(
						"Item Variant Attribute",
						fields=["attribute"],
						filters={"parent": item_code},
					)
				],
			]
		},
	)


@frappe.whitelist()
def search_serial_or_batch_or_barcode_number(search_value, search_serial_no):
	"""Search for items by serial number, batch number, or barcode."""
	# Search by barcode
	barcode_data = frappe.db.get_value(
		"Item Barcode",
		{"barcode": search_value},
		["parent as item_code", "barcode"],
		as_dict=True,
	)
	if barcode_data:
		return {"item_code": barcode_data.item_code, "barcode": barcode_data.barcode}

	# Search by batch number
	batch_data = frappe.db.get_value(
		"Batch",
		{"name": search_value},
		["item as item_code", "name as batch_no"],
		as_dict=True,
	)
	if batch_data:
		return {"item_code": batch_data.item_code, "batch_no": batch_data.batch_no}

	# Search by serial number if enabled
	if search_serial_no:
		serial_data = frappe.db.get_value(
			"Serial No",
			{"name": search_value},
			["item_code", "name as serial_no"],
			as_dict=True,
		)
		if serial_data:
			return {
				"item_code": serial_data.item_code,
				"serial_no": serial_data.serial_no,
			}

	return {}


@frappe.whitelist()
def update_price_list_rate(item_code, price_list, rate, uom=None):
	"""Create or update Item Price for the given item and price list."""
	if not item_code or not price_list:
		frappe.throw(_("Item Code and Price List are required"))

	rate = flt(rate)
	filters = {"item_code": item_code, "price_list": price_list}
	if uom:
		filters["uom"] = uom
	else:
		filters["uom"] = ["", None]

	name = frappe.db.exists("Item Price", filters)
	if name:
		doc = frappe.get_doc("Item Price", name)
		doc.price_list_rate = rate
		doc.save(ignore_permissions=True)
	else:
		doc = frappe.get_doc(
			{
				"doctype": "Item Price",
				"item_code": item_code,
				"price_list": price_list,
				"uom": uom,
				"price_list_rate": rate,
				"selling": 1,
			}
		)
		doc.insert(ignore_permissions=True)

	frappe.db.commit()
	return _("Item Price has been added or updated")


@frappe.whitelist()
def get_price_for_uom(item_code, price_list, uom):
	"""Return Item Price for the given item, price list and UOM if it exists."""
	if not (item_code and price_list and uom):
		return None

	price = frappe.db.get_value(
		"Item Price",
		{
			"item_code": item_code,
			"price_list": price_list,
			"uom": uom,
			"selling": 1,
		},
		"price_list_rate",
	)
	return price
