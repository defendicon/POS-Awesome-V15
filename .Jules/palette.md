## 2024-05-24 - [Improved Cart Empty State]
**Learning:** The `v-data-table-virtual` component in Vuetify 3 supports a `no-data` slot that overrides the `no-data-text` prop, allowing for rich content (icons, guidance text) instead of just a string. This is crucial for guiding users in "empty" states which might otherwise feel like an error or a dead end.
**Action:** Always check for `no-data` or `empty` slots in data-display components to provide actionable guidance (e.g., "Scan item to start") rather than passive status messages.
