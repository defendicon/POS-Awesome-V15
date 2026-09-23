import json

import frappe


WORKSPACE_NAME = "POS Awesome"
CARD_LABEL = "Item Exchange"
CARD_BLOCK_ID = "posaItemExchangeCard"
LINKS = (
    ("Item Exchanges", "POS Item Exchange", "DocType", 0),
    ("Item Exchange Audit", "POS Item Exchange Audit", "Report", 1),
)


def _recompute_card_break_counts(links):
    card_break = None
    for link in links:
        if link.type == "Card Break":
            card_break = link
            card_break.link_count = 0
        elif card_break and link.type == "Link":
            card_break.link_count = (card_break.link_count or 0) + 1


def _ensure_content_card(workspace):
    try:
        content = json.loads(workspace.content or "[]")
    except (TypeError, ValueError):
        content = []

    if not any(
        block.get("id") == CARD_BLOCK_ID
        or (
            block.get("type") == "card"
            and (block.get("data") or {}).get("card_name") == CARD_LABEL
        )
        for block in content
    ):
        content.append(
            {
                "id": CARD_BLOCK_ID,
                "type": "card",
                "data": {"card_name": CARD_LABEL, "col": 4},
            }
        )
    workspace.content = json.dumps(content, separators=(",", ":"))


def execute():
    if not frappe.db.exists("Workspace", WORKSPACE_NAME):
        return
    if not frappe.db.exists("DocType", "POS Item Exchange"):
        return

    workspace = frappe.get_doc("Workspace", WORKSPACE_NAME)
    links = workspace.links or []
    if not any(link.type == "Card Break" and link.label == CARD_LABEL for link in links):
        workspace.append(
            "links",
            {
                "type": "Card Break",
                "label": CARD_LABEL,
                "link_count": len(LINKS),
                "hidden": 0,
                "is_query_report": 0,
                "onboard": 0,
            },
        )

    links = workspace.links or []
    card_index = next(
        index
        for index, link in enumerate(links)
        if link.type == "Card Break" and link.label == CARD_LABEL
    )
    insert_index = card_index + 1
    for label, link_to, link_type, is_query_report in LINKS:
        existing_index = next(
            (
                index
                for index, link in enumerate(links)
                if link.type == "Link" and link.link_to == link_to
            ),
            None,
        )
        if existing_index is None:
            workspace.append(
                "links",
                {
                    "type": "Link",
                    "label": label,
                    "link_to": link_to,
                    "link_type": link_type,
                    "link_count": 0,
                    "hidden": 0,
                    "is_query_report": is_query_report,
                    "onboard": 0,
                },
            )
            links = workspace.links or []
            existing_index = len(links) - 1

        exchange_link = links.pop(existing_index)
        if existing_index < insert_index:
            insert_index -= 1
        links.insert(insert_index, exchange_link)
        insert_index += 1

    _recompute_card_break_counts(links)
    for index, link in enumerate(links, start=1):
        link.idx = index
    _ensure_content_card(workspace)
    workspace.save(ignore_permissions=True)
