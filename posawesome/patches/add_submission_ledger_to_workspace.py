import json

import frappe


WORKSPACE_NAME = "POS Awesome"
CARD_LABEL = "Submission Ledger"
LINK_LABEL = "Invoice Submission Ledger"
LINK_TO = "POS Invoice Submission Ledger"
CARD_BLOCK_ID = "posaSubmissionLedgerCard"


def _recompute_card_break_counts(links):
    card_break = None
    for link in links:
        if link.type == "Card Break":
            card_break = link
            card_break.link_count = 0
            continue
        if card_break and link.type == "Link":
            card_break.link_count = (card_break.link_count or 0) + 1


def _set_link_indexes(links):
    for idx, link in enumerate(links, start=1):
        link.idx = idx


def _ensure_workspace_content(workspace):
    content = []
    if workspace.content:
        try:
            content = json.loads(workspace.content)
        except Exception:
            content = []

    has_card = any(
        block.get("id") == CARD_BLOCK_ID
        or (
            block.get("type") == "card"
            and (block.get("data") or {}).get("card_name") == CARD_LABEL
        )
        for block in content
    )
    if has_card:
        workspace.content = json.dumps(content, separators=(",", ":"))
        return

    new_card_block = {
        "id": CARD_BLOCK_ID,
        "type": "card",
        "data": {"card_name": CARD_LABEL, "col": 4},
    }

    insert_index = None
    for idx, block in enumerate(content):
        if block.get("type") == "card" and (block.get("data") or {}).get("card_name") == "Gift Cards":
            insert_index = idx + 1
            break

    if insert_index is None:
        content.append(new_card_block)
    else:
        content.insert(insert_index, new_card_block)

    workspace.content = json.dumps(content, separators=(",", ":"))


def execute():
    if not frappe.db.table_exists("Workspace"):
        return

    if not frappe.db.table_exists("DocType"):
        return

    if not frappe.db.exists("Workspace", WORKSPACE_NAME):
        return

    if not frappe.db.exists("DocType", LINK_TO):
        return

    workspace = frappe.get_doc("Workspace", WORKSPACE_NAME)
    links = workspace.links or []

    has_card_break = any(link.type == "Card Break" and link.label == CARD_LABEL for link in links)
    if not has_card_break:
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

    has_link = any(link.type == "Link" and link.link_to == LINK_TO for link in links)
    if not has_link:
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
    card_break_index = next(
        (idx for idx, link in enumerate(links) if link.type == "Card Break" and link.label == CARD_LABEL),
        None,
    )
    link_index = next(
        (idx for idx, link in enumerate(links) if link.type == "Link" and link.link_to == LINK_TO),
        None,
    )
    if card_break_index is not None and link_index is not None and link_index != card_break_index + 1:
        ledger_link = links.pop(link_index)
        if link_index < card_break_index:
            card_break_index -= 1
        links.insert(card_break_index + 1, ledger_link)

    _recompute_card_break_counts(links)
    _set_link_indexes(links)
    _ensure_workspace_content(workspace)
    if not workspace.get("type"):
        workspace.type = "Workspace"
    workspace.save(ignore_permissions=True)
