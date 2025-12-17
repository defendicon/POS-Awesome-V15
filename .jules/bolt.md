# Bolt's Journal - Critical Learnings

This journal records critical performance learnings, anti-patterns, and insights specific to this codebase.

## 2024-05-22 - [Initial Setup]
**Learning:** Initialized Bolt's journal.
**Action:** Record only critical learnings that affect future performance decisions.

## 2024-05-22 - [Vue Reactivity Anti-Pattern]
**Learning:** Initializing large caching objects (like `Map` or `Set`) in Vue's `data()` method makes them deeply reactive. This causes significant performance overhead for every read/write operation, especially when these caches are large (e.g., item indexes, formatting caches).
**Action:** Move such caches to the `created()` lifecycle hook (Vue 2) or `setup()` (Vue 3) to keep them non-reactive while still being accessible via `this`. This avoids the reactivity system entirely for data that doesn't need to trigger UI updates directly.
