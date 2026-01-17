## 2024-05-23 - Interactive Icons Accessibility
**Learning:** Raw clickable `v-icon` elements are a recurring accessibility anti-pattern in this codebase. They lack keyboard focus states, semantic roles, and accessible names, making them invisible to screen readers and keyboard-only users.
**Action:** Replace clickable icons with `v-btn` (icon/text variant) which provides native keyboard support and focus styles. Always include `aria-label` for icon-only buttons.

## 2024-05-24 - Keyboard Support for Editable Displays
**Learning:** Elements that switch between "display" and "edit" modes (like the quantity/rate fields in the cart) often rely on `div` click handlers, making them inaccessible to keyboard users. Without `tabindex="0"`, `role="button"`, and keydown handlers (Enter/Space), these interactive elements are unreachable and unusable via keyboard.
**Action:** Ensure all interactive "display-to-edit" elements include `tabindex="0"`, `role="button"`, and appropriate `@keydown` handlers (Enter, Space) to mimic the click behavior. Provide visual focus indicators (e.g., using `:focus-visible`) to guide keyboard users.
