"""Doc-event handlers for Quotation & Sales Order — kg + tiered pricing."""

from posawesome.posawesome.api.posa_kg_calc import sync_kg_fields
from posawesome.posawesome.api.lpg_pricing import apply_tiered_pricing


def validate(doc, method=None):
    apply_tiered_pricing(doc, method)
    sync_kg_fields(doc, method)
