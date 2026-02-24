# -*- coding: utf-8 -*-
# Copyright (c) 2020, Youssef Restom and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import json
import frappe
from frappe.utils import nowdate, flt, cstr, get_datetime
from frappe import _
from erpnext.accounts.doctype.loyalty_program.loyalty_program import (
    get_loyalty_program_details_with_points,
)
from frappe.utils.caching import redis_cache
from .utils import fetch_sales_person_names


MAX_CUSTOMER_QUERY_LIMIT = 500
MAX_CUSTOMER_QUERY_OFFSET = 50000
MAX_CUSTOMER_START_AFTER_LENGTH = 140
MAX_ADDRESS_PAYLOAD_LENGTH = 10000


def _can_manage_all_pos_profiles():
    return "System Manager" in frappe.get_roles()


def _extract_pos_profile_name(pos_profile_input):
    if isinstance(pos_profile_input, dict):
        return cstr(
            pos_profile_input.get("name")
            or pos_profile_input.get("pos_profile")
            or pos_profile_input.get("profile")
        ).strip()

    raw_value = cstr(pos_profile_input).strip()
    if not raw_value:
        return ""

    try:
        parsed = json.loads(raw_value)
    except Exception:
        parsed = raw_value

    if isinstance(parsed, dict):
        return _extract_pos_profile_name(parsed)
    return cstr(parsed).strip()


def _resolve_authorized_pos_profile(pos_profile_input):
    profile_name = _extract_pos_profile_name(pos_profile_input)
    if not profile_name:
        frappe.throw(_("POS Profile is required"))

    profile_doc = frappe.get_doc("POS Profile", profile_name)
    if profile_doc.disabled:
        frappe.throw(_("POS Profile {0} is disabled.").format(profile_doc.name))

    has_access = frappe.db.exists(
        "POS Profile User",
        {"parent": profile_doc.name, "user": frappe.session.user},
    )
    if not has_access and not _can_manage_all_pos_profiles():
        frappe.throw(_("You are not assigned to POS Profile {0}.").format(profile_doc.name))

    return profile_doc


def _ensure_customer_write_permission(customer_name):
    if frappe.has_permission("Customer", "write", customer_name):
        return
    if _can_manage_all_pos_profiles():
        return
    frappe.throw(_("Not permitted to update customer {0}.").format(customer_name))


def _ensure_customer_read_permission(customer_name):
    if frappe.has_permission("Customer", "read", customer_name):
        return
    if _can_manage_all_pos_profiles():
        return
    if frappe.db.exists("POS Profile User", {"user": frappe.session.user}):
        return
    frappe.throw(_("Not permitted to access customer {0}.").format(customer_name))


def get_customer_groups(pos_profile):
    customer_groups = []
    if pos_profile.get("customer_groups"):
        # Get items based on the item groups defined in the POS profile
        for data in pos_profile.get("customer_groups"):
            group_name = data.get("customer_group") if data else None
            if not group_name:
                continue
            customer_groups.extend(
                [d.get("name") for d in get_child_nodes("Customer Group", group_name)]
            )

    return list(set(customer_groups))


def get_child_nodes(group_type, root):
    if not root:
        return []
    result = frappe.db.get_value(group_type, root, ["lft", "rgt"])
    if not result:
        return []
    lft, rgt = result
    return frappe.get_all(
        group_type,
        filters={"lft": [">=", lft], "rgt": ["<=", rgt]},
        fields=["name", "lft", "rgt"],
        order_by="lft",
    )


def get_customer_group_condition(pos_profile):
    cond = "disabled = 0"
    customer_groups = get_customer_groups(pos_profile)
    if customer_groups:
        escaped_groups = [frappe.db.escape(g) for g in customer_groups]
        cond = " customer_group in ({})".format(", ".join(escaped_groups))

    return cond


@frappe.whitelist()
def get_customer_balance(customer):
    if not customer:
        return {"balance": 0, "customer_name": None}
    _ensure_customer_read_permission(customer)

    try:
        customer_doc = frappe.get_doc("Customer", customer)
        customer_name = customer_doc.customer_name

        balance = frappe.db.sql(
            """
            SELECT SUM(debit - credit) AS balance
            FROM `tabGL Entry`
            WHERE party_type = 'Customer' AND party = %s AND docstatus = 1
        """,
            (customer,),
            as_dict=True,
        )

        return {
            "balance": flt(balance[0].get("balance", 0)) if balance else 0,
            "customer_name": customer_name,
        }
    except Exception as e:
        frappe.log_error(f"Error fetching customer balance: {e}")
        return {"balance": 0, "customer_name": None}


@frappe.whitelist()
def get_customer_names(pos_profile, limit=None, offset=None, start_after=None, modified_after=None):
    def _safe_limit(value, default=MAX_CUSTOMER_QUERY_LIMIT):
        try:
            parsed = int(value if value is not None else default)
        except Exception:
            parsed = default
        return min(max(parsed, 1), MAX_CUSTOMER_QUERY_LIMIT)

    def _safe_offset(value, default=0):
        try:
            parsed = int(value if value is not None else default)
        except Exception:
            parsed = default
        return min(max(parsed, 0), MAX_CUSTOMER_QUERY_OFFSET)

    pos_profile_doc = _resolve_authorized_pos_profile(pos_profile)
    _pos_profile = {
        "name": pos_profile_doc.name,
        "customer_groups": pos_profile_doc.get("customer_groups") or [],
        "posa_server_cache_duration": pos_profile_doc.get("posa_server_cache_duration"),
        "posa_use_server_cache": pos_profile_doc.get("posa_use_server_cache"),
    }

    limit = _safe_limit(limit)
    offset = _safe_offset(offset)
    start_after = cstr(start_after).strip()
    if len(start_after) > MAX_CUSTOMER_START_AFTER_LENGTH:
        frappe.throw(_("start_after is too long."))
    modified_after = cstr(modified_after).strip()
    if modified_after and len(modified_after) > 64:
        frappe.throw(_("modified_after is too long."))

    serialized_profile = json.dumps(_pos_profile, sort_keys=True)
    ttl = _pos_profile.get("posa_server_cache_duration")
    if ttl:
        try:
            ttl = int(ttl) * 60
        except Exception:
            ttl = None

    @redis_cache(ttl=ttl or 1800)
    def __get_customer_names(pos_profile, limit=None, offset=None, start_after=None, modified_after=None):
        return _get_customer_names(pos_profile, limit, offset, start_after, modified_after)

    def _get_customer_names(pos_profile, limit=None, offset=None, start_after=None, modified_after=None):
        pos_profile = json.loads(pos_profile)
        filters = {"disabled": 0}

        customer_groups = get_customer_groups(pos_profile)
        if customer_groups:
            filters["customer_group"] = ["in", customer_groups]

        if modified_after:
            try:
                parsed_modified_after = get_datetime(modified_after)
            except Exception:
                frappe.throw(_("modified_after must be a valid ISO datetime"))
            filters["modified"] = [">", parsed_modified_after.isoformat()]

        if start_after:
            filters["name"] = [">", start_after]

        customers = frappe.get_all(
            "Customer",
            filters=filters,
            fields=[
                "name",
                "mobile_no",
                "email_id",
                "tax_id",
                "customer_name",
                "primary_address",
            ],
            order_by="name",
            limit_start=None if start_after else offset,
            limit_page_length=limit,
        )
        return customers

    if _pos_profile.get("posa_use_server_cache") and not (limit or offset or start_after or modified_after):
        return __get_customer_names(serialized_profile, limit, offset, start_after, modified_after)
    else:
        return _get_customer_names(serialized_profile, limit, offset, start_after, modified_after)


@frappe.whitelist()
def get_customers_count(pos_profile):
    pos_profile = _resolve_authorized_pos_profile(pos_profile).as_dict()
    filters = {"disabled": 0}
    customer_groups = get_customer_groups(pos_profile)
    if customer_groups:
        filters["customer_group"] = ["in", customer_groups]
    return frappe.db.count("Customer", filters)


@frappe.whitelist()
def get_customer_info(customer=None):
    customer = cstr(customer or "").strip()
    if not customer:
        return {}
    _ensure_customer_read_permission(customer)

    customer = frappe.get_doc("Customer", customer)

    res = {"loyalty_points": None, "conversion_factor": None}

    res["email_id"] = customer.email_id
    res["mobile_no"] = customer.mobile_no
    res["image"] = customer.image
    res["loyalty_program"] = customer.loyalty_program
    res["customer_price_list"] = customer.default_price_list
    res["customer_group"] = customer.customer_group
    res["customer_type"] = customer.customer_type
    res["territory"] = customer.territory
    res["birthday"] = customer.posa_birthday
    res["gender"] = customer.gender
    res["tax_id"] = customer.tax_id
    res["posa_discount"] = customer.posa_discount
    res["name"] = customer.name
    res["customer_name"] = customer.customer_name
    res["customer_group_price_list"] = frappe.get_value(
        "Customer Group", customer.customer_group, "default_price_list"
    )

    effective_price_list = (
        res.get("customer_price_list")
        or res.get("customer_group_price_list")
    )
    if effective_price_list:
        res["price_list_currency"] = frappe.get_value(
            "Price List", effective_price_list, "currency"
        )
    else:
        res["price_list_currency"] = None

    if customer.loyalty_program:
        lp_details = get_loyalty_program_details_with_points(
            customer.name,
            customer.loyalty_program,
            silent=True,
            include_expired_entry=False,
        )
        res["loyalty_points"] = lp_details.get("loyalty_points")
        res["conversion_factor"] = lp_details.get("conversion_factor")

    addresses = frappe.db.sql(
        """
	SELECT
	    address.name as address_name,
	    address.address_line1,
	    address.address_line2,
	    address.city,
	    address.state,
	    address.country,
	    address.address_type
	FROM `tabAddress` address
	INNER JOIN `tabDynamic Link` link
	    ON (address.name = link.parent)
	WHERE
	    link.link_doctype = 'Customer'
	    AND link.link_name = %s
	    AND address.disabled = 0
	    AND address.address_type = 'Shipping'
	ORDER BY address.creation DESC
	LIMIT 1
	""",
        (customer.name,),
        as_dict=True,
    )

    if addresses:
        addr = addresses[0]
        res["address_line1"] = addr.address_line1 or ""
        res["address_line2"] = addr.address_line2 or ""
        res["city"] = addr.city or ""
        res["state"] = addr.state or ""
        res["country"] = addr.country or ""

    return res


@frappe.whitelist()
def create_customer(
    customer_name,
    company,
    pos_profile_doc,
    customer_id=None,
    tax_id=None,
    mobile_no=None,
    email_id=None,
    referral_code=None,
    birthday=None,
    customer_group=None,
    territory=None,
    customer_type=None,
    gender=None,
    method="create",
    address_line1=None,
    city=None,
    country=None,
):
    pos_profile = _resolve_authorized_pos_profile(pos_profile_doc).as_dict()
    customer_name = cstr(customer_name).strip()
    if not customer_name:
        frappe.throw(_("Customer name is required"))

    requested_company = cstr(company).strip()
    profile_company = cstr(pos_profile.get("company")).strip()
    if requested_company and profile_company and requested_company != profile_company:
        frappe.throw(_("POS Profile company mismatch."))
    company = profile_company or requested_company

    # Format birthday to MySQL compatible format (YYYY-MM-DD) if provided
    formatted_birthday = None
    if birthday:
        try:
            # Try to parse date in DD-MM-YYYY format
            if "-" in birthday:
                date_parts = birthday.split("-")
                if len(date_parts) == 3:
                    day, month, year = date_parts
                    formatted_birthday = f"{year}-{month.zfill(2)}-{day.zfill(2)}"
            # If format is already YYYY-MM-DD, use as is
            elif len(birthday) == 10 and birthday[4] == "-" and birthday[7] == "-":
                formatted_birthday = birthday
        except Exception:
            frappe.log_error(f"Error formatting birthday: {birthday}", "POS Awesome")

    if method == "create":
        is_exist = frappe.db.exists("Customer", {"customer_name": customer_name})
        if pos_profile.get("posa_allow_duplicate_customer_names") or not is_exist:
            customer = frappe.get_doc(
                {
                    "doctype": "Customer",
                    "customer_name": customer_name,
                    "posa_referral_company": company,
                    "tax_id": tax_id,
                    "mobile_no": mobile_no,
                    "email_id": email_id,
                    "posa_referral_code": referral_code,
                    "posa_birthday": formatted_birthday,
                    "customer_type": customer_type,
                    "gender": gender,
                }
            )
            if customer_group:
                customer.customer_group = customer_group
            else:
                customer.customer_group = "All Customer Groups"
            if territory:
                customer.territory = territory
            else:
                customer.territory = "All Territories"

            customer.save()

            if address_line1 or city:
                args = {
                    "name": f"{customer.customer_name} - Shipping",
                    "doctype": "Customer",
                    "customer": customer.name,
                    "address_line1": address_line1 or "",
                    "address_line2": "",
                    "city": city or "",
                    "state": "",
                    "pincode": "",
                    "country": country or "",
                }
                make_address(json.dumps(args))

            return customer
        else:
            frappe.throw(_("Customer already exists"))

    elif method == "update":
        if not customer_id:
            frappe.throw(_("Customer ID is required for updates"))
        _ensure_customer_write_permission(customer_id)
        customer_doc = frappe.get_doc("Customer", customer_id)
        customer_doc.customer_name = customer_name
        customer_doc.tax_id = tax_id
        customer_doc.mobile_no = mobile_no
        customer_doc.email_id = email_id
        customer_doc.posa_referral_code = referral_code
        customer_doc.posa_birthday = formatted_birthday
        customer_doc.customer_type = customer_type
        customer_doc.gender = gender
        customer_doc.save()

        # ensure contact details are synced correctly
        if mobile_no:
            set_customer_info(customer_doc.name, "mobile_no", mobile_no)
        if email_id:
            set_customer_info(customer_doc.name, "email_id", email_id)

        existing_address_name = frappe.db.get_value(
            "Dynamic Link",
            {
                "link_doctype": "Customer",
                "link_name": customer_id,
                "parenttype": "Address",
            },
            "parent",
        )

        if existing_address_name:
            address_doc = frappe.get_doc("Address", existing_address_name)
            address_doc.address_line1 = address_line1 or ""
            address_doc.city = city or ""
            address_doc.country = country or ""
            address_doc.save()
        else:
            if address_line1 or city:
                args = {
                    "name": f"{customer_doc.customer_name} - Shipping",
                    "doctype": "Customer",
                    "customer": customer_doc.name,
                    "address_line1": address_line1 or "",
                    "address_line2": "",
                    "city": city or "",
                    "state": "",
                    "pincode": "",
                    "country": country or "",
                }
                make_address(json.dumps(args))

        return customer_doc


@frappe.whitelist()
def set_customer_info(customer, fieldname, value=""):
    customer = cstr(customer).strip()
    fieldname = cstr(fieldname).strip()
    if not customer:
        frappe.throw(_("Customer is required"))
    if fieldname not in {"loyalty_program", "email_id", "mobile_no"}:
        frappe.throw(_("Unsupported customer info field: {0}").format(fieldname))

    _ensure_customer_write_permission(customer)

    if fieldname == "loyalty_program":
        frappe.db.set_value("Customer", customer, "loyalty_program", value)

    contact = frappe.get_cached_value("Customer", customer, "customer_primary_contact") or ""

    if contact:
        contact_doc = frappe.get_doc("Contact", contact)
        if fieldname == "email_id":
            contact_doc.set("email_ids", [{"email_id": value, "is_primary": 1}])
            frappe.db.set_value("Customer", customer, "email_id", value)
        elif fieldname == "mobile_no":
            contact_doc.set("phone_nos", [{"phone": value, "is_primary_mobile_no": 1}])
            frappe.db.set_value("Customer", customer, "mobile_no", value)
        contact_doc.save()

    else:
        contact_doc = frappe.new_doc("Contact")
        contact_doc.first_name = customer
        contact_doc.is_primary_contact = 1
        contact_doc.is_billing_contact = 1
        if fieldname == "mobile_no":
            contact_doc.add_phone(value, is_primary_mobile_no=1, is_primary_phone=1)

        if fieldname == "email_id":
            contact_doc.add_email(value, is_primary=1)

        contact_doc.append("links", {"link_doctype": "Customer", "link_name": customer})

        contact_doc.flags.ignore_mandatory = True
        contact_doc.save()
        frappe.set_value("Customer", customer, "customer_primary_contact", contact_doc.name)


@frappe.whitelist()
def get_customer_addresses(customer):
    customer = cstr(customer).strip()
    if not customer:
        return []
    _ensure_customer_read_permission(customer)

    return frappe.db.sql(
        """
        SELECT
            address.name,
            address.address_line1,
            address.address_line2,
            address.address_title,
            address.city,
            address.state,
            address.country,
            address.address_type
        FROM `tabAddress` as address
        INNER JOIN `tabDynamic Link` AS link
                                ON address.name = link.parent
        WHERE link.link_doctype = 'Customer'
            AND link.link_name = %s
            AND address.disabled = 0
        ORDER BY address.name
        """,
        (customer,),
        as_dict=1,
    )


@frappe.whitelist()
def make_address(args):
    if isinstance(args, str):
        raw_payload = args.strip()
        if len(raw_payload) > MAX_ADDRESS_PAYLOAD_LENGTH:
            frappe.throw(_("Address payload is too large"))
        try:
            args = json.loads(raw_payload)
        except Exception:
            frappe.throw(_("Address payload must be a valid JSON object"))
    if not isinstance(args, dict):
        frappe.throw(_("Address payload must be a JSON object"))

    customer = cstr(args.get("customer")).strip()
    if not customer:
        frappe.throw(_("Customer is required to create an address"))
    if not frappe.db.exists("Customer", customer):
        frappe.throw(_("Customer {0} does not exist").format(customer))
    _ensure_customer_write_permission(customer)

    address = frappe.get_doc(
        {
            "doctype": "Address",
            "address_title": cstr(args.get("name")).strip(),
            "address_line1": cstr(args.get("address_line1")).strip(),
            "address_line2": cstr(args.get("address_line2")).strip(),
            "city": cstr(args.get("city")).strip(),
            "state": cstr(args.get("state")).strip(),
            "pincode": cstr(args.get("pincode")).strip(),
            "country": cstr(args.get("country")).strip(),
            "address_type": "Shipping",
            "links": [{"link_doctype": "Customer", "link_name": customer}],
        }
    ).insert()

    return address


@frappe.whitelist()
def get_sales_person_names():
    return fetch_sales_person_names()
