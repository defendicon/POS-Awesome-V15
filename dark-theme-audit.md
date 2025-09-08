# Dark Theme Audit

- frontend/tailwind.config.js
    - No explicit dark mode config; relies on Tailwind's default `media` strategy.
- posawesome/public/css/responsive.css
    - Core tokens only cover surfaces; missing aliases for bg/fg, table states, focus ring, and scrollbars.
- frontend/src/posapp/components/pos/Invoice.vue
    - Inline hardcoded colors (`#121212`, `#1E1E1E`, `white`) bypass theme variables.
    - Selected checkbox uses fixed `color: white`.
- frontend/src/posapp/components/pos/ItemsTable.vue
    - Hardcoded light/dark colors throughout style block.
    - Quantity stepper lacks tokenized background/border; contrast breaks in dark mode.
    - Expanded row uses fixed colors instead of tokens.
    - Scroll container has no themed scrollbar styling.
- frontend/src/posapp/components/pos/Payments.vue
    - Multiple fields conditionally set `:bg-color` with `#1E1E1E` or `white` and rely on `dark-field` class.
    - Card wrapper toggles classes via `isDarkTheme` instead of token utilities.
- frontend/src/posapp/components/pos/InvoiceSummary.vue
    - Card background switches between `bg-grey-lighten-4` and `#1E1E1E` via inline bindings.
