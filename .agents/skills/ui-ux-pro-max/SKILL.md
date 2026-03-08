---
name: ui-ux-pro-max
description: UI/UX design intelligence skill with searchable guidelines, stack recommendations, and design-system generation for frontend modernization.
---

# ui-ux-pro-max

Use this skill when the user asks to design, review, modernize, or improve frontend UI/UX (especially landing pages, dashboards, admin panels, and POS interfaces).

## Prerequisites

- Python 3.8+ installed (`python --version`)
- No external Python packages required

## How Codex Should Invoke It

1. Start with design-system generation:

```bash
python .agents/skills/ui-ux-pro-max/scripts/search.py "<product + industry + style keywords>" --design-system -p "<Project Name>" -f markdown
```

2. Add targeted lookups as needed:

```bash
python .agents/skills/ui-ux-pro-max/scripts/search.py "<keywords>" --domain <style|color|typography|landing|chart|ux|web|react|product|icons> -n 5
python .agents/skills/ui-ux-pro-max/scripts/search.py "<keywords>" --stack <html-tailwind|react|nextjs|astro|vue|nuxtjs|nuxt-ui|svelte|swiftui|react-native|flutter|shadcn|jetpack-compose>
```

3. Optional persistence for repeatable implementation:

```bash
python .agents/skills/ui-ux-pro-max/scripts/search.py "<query>" --design-system --persist -p "<Project Name>" --page "<page-name>"
```

## Practical Examples

### 1) Analyze an existing frontend

```bash
python .agents/skills/ui-ux-pro-max/scripts/search.py "accessibility keyboard focus forms contrast loading states" --domain ux -n 5
python .agents/skills/ui-ux-pro-max/scripts/search.py "aria semantic headings focus outline input autocomplete" --domain web -n 5
```

Then apply findings to real files in `frontend/` and verify responsive and accessibility fixes.

### 2) Generate a design system

```bash
python .agents/skills/ui-ux-pro-max/scripts/search.py "retail POS dashboard checkout inventory analytics modern clean" --design-system -p "POS Awesome" -f markdown
```

### 3) Improve responsiveness

```bash
python .agents/skills/ui-ux-pro-max/scripts/search.py "responsive layout breakpoints touch targets mobile tables" --domain ux -n 5
python .agents/skills/ui-ux-pro-max/scripts/search.py "responsive forms cards table overflow spacing" --stack vue
```

### 4) Modernize a POS or dashboard UI

```bash
python .agents/skills/ui-ux-pro-max/scripts/search.py "POS dashboard cashier workflow realtime sales charts inventory alerts" --design-system --persist -p "POS Modernization"
python .agents/skills/ui-ux-pro-max/scripts/search.py "data-dense dashboard chart readability comparison trend" --domain chart -n 5
python .agents/skills/ui-ux-pro-max/scripts/search.py "professional fintech-safe palette with strong CTA" --domain color -n 5
```

## Notes

- Skill assets are self-contained in `.agents/skills/ui-ux-pro-max/`.
- Main engine: `.agents/skills/ui-ux-pro-max/scripts/search.py`
- Data source: `.agents/skills/ui-ux-pro-max/data/`
- If `python` is unavailable in your shell, use `python3` instead.
