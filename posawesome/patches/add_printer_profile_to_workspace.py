import frappe

WORKSPACE_NAME = "POS Awesome"
CARD_LABEL = "Profile"
LINK_LABEL = "Printer Profiles"
LINK_TO = "POSA Printer Profile"


def _recompute_card_break_counts(links):
    card_break = None
    for link in links:
        if link.type == "Card Break":
            card_break = link
            card_break.link_count = 0
        elif card_break and link.type == "Link":
            card_break.link_count = (card_break.link_count or 0) + 1


def execute():
    if not frappe.db.exists("Workspace", WORKSPACE_NAME):
        return
    if not frappe.db.exists("DocType", LINK_TO):
        return

    workspace = frappe.get_doc("Workspace", WORKSPACE_NAME)
    links = workspace.links or []
    profile_index = next(
        (index for index, link in enumerate(links) if link.type == "Card Break" and link.label == CARD_LABEL),
        None,
    )
    if profile_index is None:
        workspace.append(
            "links",
            {
                "type": "Card Break",
                "label": CARD_LABEL,
                "link_count": 1,
                "hidden": 0,
                "is_query_report": 0,
                "onboard": 0,
            },
        )
        links = workspace.links or []
        profile_index = len(links) - 1

    existing_index = next(
        (index for index, link in enumerate(links) if link.type == "Link" and link.link_to == LINK_TO),
        None,
    )
    if existing_index is None:
        workspace.append(
            "links",
            {
                "type": "Link",
                "label": LINK_LABEL,
                "link_to": LINK_TO,
                "link_type": "DocType",
                "link_count": 0,
                "hidden": 0,
                "is_query_report": 0,
                "onboard": 0,
            },
        )
        links = workspace.links or []
        existing_index = len(links) - 1

    printer_link = links.pop(existing_index)
    if existing_index < profile_index:
        profile_index -= 1

    insert_index = profile_index + 1
    while insert_index < len(links) and links[insert_index].type == "Link":
        insert_index += 1
    links.insert(insert_index, printer_link)

    _recompute_card_break_counts(links)
    for index, link in enumerate(links, start=1):
        link.idx = index
    if not workspace.get("type"):
        workspace.type = "Workspace"
    workspace.save(ignore_permissions=True)
    frappe.clear_cache()
