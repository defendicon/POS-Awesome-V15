import json

import frappe


WORKSPACE_NAME = "POS Awesome"
CARD_LABEL = "Cash Movement"
LINK_TO = "POS Cash Movement"


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


def _remove_cash_movement_links(workspace):
    links = workspace.links or []
    changed = False
    for idx in range(len(links) - 1, -1, -1):
        link = links[idx]
        if (link.type == "Link" and link.link_to == LINK_TO) or (
            link.type == "Card Break" and link.label == CARD_LABEL
        ):
            links.pop(idx)
            changed = True

    if changed:
        _recompute_card_break_counts(links)
        _set_link_indexes(links)

    return changed


def _remove_cash_movement_content(workspace):
    if not workspace.content:
        return False

    try:
        content = json.loads(workspace.content)
    except Exception:
        return False

    filtered_content = [
        block
        for block in content
        if not (
            block.get("type") == "card"
            and (block.get("data") or {}).get("card_name") == CARD_LABEL
        )
    ]

    if len(filtered_content) == len(content):
        return False

    workspace.content = json.dumps(filtered_content, separators=(",", ":"))
    return True


def _ensure_workspace_content(workspace):
    content = []
    if workspace.content:
        try:
            content = json.loads(workspace.content)
        except Exception:
            content = []

    has_cash_card = any(
        block.get("type") == "card"
        and (block.get("data") or {}).get("card_name") == CARD_LABEL
        for block in content
    )
    if has_cash_card:
        workspace.content = json.dumps(content, separators=(",", ":"))
        return

    new_card_block = {
        "id": "posaCashMovementCard",
        "type": "card",
        "data": {"card_name": CARD_LABEL, "col": 4},
    }

    shift_index = None
    for idx, block in enumerate(content):
        if block.get("type") == "card" and (block.get("data") or {}).get("card_name") == "Shift":
            shift_index = idx
            break

    if shift_index is None:
        content.append(new_card_block)
    else:
        content.insert(shift_index + 1, new_card_block)

    workspace.content = json.dumps(content, separators=(",", ":"))


def execute():
    if not frappe.db.table_exists("Workspace"):
        return

    if not frappe.db.table_exists("DocType"):
        return

    if not frappe.db.exists("Workspace", WORKSPACE_NAME):
        return

    workspace = frappe.get_doc("Workspace", WORKSPACE_NAME)
    has_cash_movement_doctype = frappe.db.exists("DocType", LINK_TO)
    if not has_cash_movement_doctype:
        removed_links = _remove_cash_movement_links(workspace)
        removed_content = _remove_cash_movement_content(workspace)
        if removed_links or removed_content:
            if not workspace.get("type"):
                workspace.type = "Workspace"
            workspace.save(ignore_permissions=True)
        return

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
                "label": CARD_LABEL,
                "link_to": LINK_TO,
                "link_type": "DocType",
                "link_count": 0,
                "hidden": 0,
                "is_query_report": 0,
                "onboard": 0,
            },
        )

    links = workspace.links or []
    _recompute_card_break_counts(links)
    _set_link_indexes(links)

    _ensure_workspace_content(workspace)
    if not workspace.get("type"):
        workspace.type = "Workspace"
    workspace.save(ignore_permissions=True)
