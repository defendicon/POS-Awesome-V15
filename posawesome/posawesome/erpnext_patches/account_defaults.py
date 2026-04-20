"""Guard ERPNext item-default account persistence for POS transactions."""

from __future__ import annotations

from types import ModuleType


def is_pos_transaction(doc) -> bool:
    """Return True when account resolution should stay transaction-only."""

    return bool(getattr(doc, "is_pos", 0) and getattr(doc, "pos_profile", None))


def patch_selling_controller(selling_controller: ModuleType) -> None:
    """Patch ERPNext selling controller to skip POS item-default mutations."""

    if getattr(selling_controller, "_posawesome_income_account_guard_installed", False):
        return

    original = selling_controller.set_default_income_account_for_item

    def guarded_set_default_income_account_for_item(obj):
        if is_pos_transaction(obj):
            return

        return original(obj)

    selling_controller.set_default_income_account_for_item = guarded_set_default_income_account_for_item
    selling_controller._posawesome_original_set_default_income_account_for_item = original
    selling_controller._posawesome_income_account_guard_installed = True


def install() -> None:
    """Install the POS-specific ERPNext guard when ERPNext is available."""

    try:
        from erpnext.controllers import selling_controller
    except ModuleNotFoundError:
        return

    patch_selling_controller(selling_controller)
