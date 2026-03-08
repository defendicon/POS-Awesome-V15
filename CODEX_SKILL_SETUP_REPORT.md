# Codex Skill Setup Report: ui-ux-pro-max

## What was created

- `.agents/skills/ui-ux-pro-max/`
- `.agents/skills/ui-ux-pro-max/SKILL.md` (Codex-ready, local-path version)
- `.agents/skills/ui-ux-pro-max/scripts/` (3 Python engine files)
- `.agents/skills/ui-ux-pro-max/data/` (24 CSV knowledge files)

## Source repository inspected

- Cloned from: `https://github.com/nextlevelbuilder/ui-ux-pro-max-skill`
- Main source-of-truth identified in:
  - `src/ui-ux-pro-max/scripts/` (runtime engine)
  - `src/ui-ux-pro-max/data/` (search/design-system datasets)
  - `src/ui-ux-pro-max/templates/` (platform template definitions)
- Key instruction/template files reviewed:
  - `README.md`
  - `CLAUDE.md`
  - `src/ui-ux-pro-max/templates/base/skill-content.md`
  - `src/ui-ux-pro-max/templates/platforms/codex.json`

## What was copied or adapted

- Copied directly:
  - `src/ui-ux-pro-max/scripts/*` -> `.agents/skills/ui-ux-pro-max/scripts/*`
  - `src/ui-ux-pro-max/data/*` -> `.agents/skills/ui-ux-pro-max/data/*`
- Adapted:
  - Created a new Codex-focused `.agents/skills/ui-ux-pro-max/SKILL.md`
  - Replaced Claude-style command paths with local project paths under `.agents/skills/ui-ux-pro-max/`
  - Added practical usage sections and examples for:
    - analyzing an existing frontend
    - generating a design system
    - improving responsiveness
    - modernizing POS/dashboard UI

## Validation and fixes made

- Verified copied file parity with source:
  - `scripts`: 3/3 files present
  - `data`: 24/24 files present
- Verified `SKILL.md` referenced paths exist.
- Runtime validation passed:
  - `python .agents/skills/ui-ux-pro-max/scripts/search.py "POS dashboard checkout inventory" --design-system -p "POS Awesome" -f markdown`
  - `python .agents/skills/ui-ux-pro-max/scripts/search.py "responsive layout mobile table" --domain ux -n 2`
- Note:
  - `python -m compileall` could not create `__pycache__` in this environment due filesystem permissions, but normal script execution works.

## Exact example prompts for Codex

1. `Use the local skill at .agents/skills/ui-ux-pro-max to analyze my existing frontend in ./frontend, then implement high-impact UX and accessibility fixes.`
2. `Use .agents/skills/ui-ux-pro-max to generate a full design system for this POS project, then apply it to modernize dashboard and checkout screens.`
3. `Use .agents/skills/ui-ux-pro-max to improve responsiveness across mobile/tablet/desktop in ./frontend and patch the code directly.`
4. `Use .agents/skills/ui-ux-pro-max to modernize this POS/admin UI with a professional data-dense dashboard style and implement the changes in code.`

## Dependencies and limitations

- Dependency: Python 3.8+ (`python --version`)
- No external pip packages required.
- Current install is self-contained for runtime (`SKILL.md`, `scripts/`, `data/`).
