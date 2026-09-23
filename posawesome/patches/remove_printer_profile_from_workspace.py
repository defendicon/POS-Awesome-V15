import frappe

WORKSPACE_NAME = "POS Awesome"
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

    workspace = frappe.get_doc("Workspace", WORKSPACE_NAME)
    links = workspace.links or []
    filtered_links = [link for link in links if not (link.type == "Link" and link.link_to == LINK_TO)]
    if len(filtered_links) == len(links):
        return

    workspace.set("links", filtered_links)
    _recompute_card_break_counts(workspace.links or [])
    for index, link in enumerate(workspace.links or [], start=1):
        link.idx = index
    if not workspace.get("type"):
        workspace.type = "Workspace"
    workspace.save(ignore_permissions=True)
    frappe.clear_cache()
