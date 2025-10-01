import frappe


def execute():
    if not frappe.db.table_exists("Workspace"):
        return

    if not frappe.db.table_exists("Promotional Scheme"):
        return

    if not frappe.db.exists("Workspace", "POS Awesome"):
        return

    workspace = frappe.get_doc("Workspace", "POS Awesome")

    if any(link.link_to == "Promotional Scheme" for link in workspace.links or []):
        return

    new_link = workspace.append(
        "links",
        {
            "type": "Link",
            "label": "Promotional Schemes",
            "link_to": "Promotional Scheme",
            "link_type": "DocType",
            "link_count": 0,
            "hidden": 0,
            "is_query_report": 0,
            "onboard": 0,
        },
    )

    links = workspace.links or []

    insert_after = None
    for idx, link in enumerate(links):
        if link == new_link:
            insert_after = idx
            break

    if insert_after is None:
        return

    # place the new link after the POS Offer link if it exists
    target_index = None
    for idx, link in enumerate(links):
        if link.type == "Link" and link.link_to == "POS Offer":
            target_index = idx + 1

    if target_index is None:
        # otherwise, keep the new link right after the Offers & Coupons card break
        for idx, link in enumerate(links):
            if link.type == "Card Break" and link.label == "Offers & Coupons":
                target_index = idx + 1
                break

    if target_index is not None and target_index != insert_after:
        links.pop(insert_after)
        links.insert(target_index if target_index <= len(links) else len(links), new_link)

    # recompute link counts for the Offers & Coupons card break
    offers_card = None
    for link in links:
        if link.type == "Card Break" and link.label == "Offers & Coupons":
            offers_card = link
            break

    if offers_card:
        count = 0
        started = False
        for link in links:
            if link == offers_card:
                started = True
                count = 0
                continue
            if started and link.type == "Card Break":
                break
            if started and link.type == "Link":
                count += 1
        offers_card.link_count = count

    for idx, link in enumerate(links, start=1):
        link.idx = idx

    workspace.save(ignore_permissions=True)
