# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`GLOSSARY.md`** at the repo root.
- **`docs/adr/`**: read ADRs that touch the area you're about to work in.

If these files do not exist, proceed silently. Create them lazily through `/domain-modeling` when terms or decisions actually get resolved.

## File structure

This repo uses a single-context layout, with shared vocabulary and decisions for the backend and frontend:

```text
/
|-- GLOSSARY.md
|-- docs/
|   `-- adr/
|       |-- 0001-<decision-slug>.md
|       `-- 0002-<decision-slug>.md
|-- backend/
`-- frontend/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `GLOSSARY.md`.

If the concept you need is not in the glossary yet, reconsider whether the project uses that language or note the gap for `/domain-modeling`.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface the conflict explicitly with the ADR identifier and the reason to revisit the decision.
