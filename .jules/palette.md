## 2024-05-23 - Interactive Icons Accessibility
**Learning:** Raw clickable `v-icon` elements are a recurring accessibility anti-pattern in this codebase. They lack keyboard focus states, semantic roles, and accessible names, making them invisible to screen readers and keyboard-only users.
**Action:** Replace clickable icons with `v-btn` (icon/text variant) which provides native keyboard support and focus styles. Always include `aria-label` for icon-only buttons.
