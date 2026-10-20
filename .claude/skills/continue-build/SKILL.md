---
name: continue-build
description: Resume building Project Room where the team left off. Use at the start of a session, or when asked to "continue", "pick up the next task", or "what should I work on".
---

# Continue building Project Room

1. Sync: run `git status` and `git log --oneline -10`. If the tree is clean and on `main`, run `git pull`.
   Run `npm install` if `package-lock.json` changed since the last pull.
2. Read `docs/PROGRESS.md` fully, then the sections of `AGENTS.md` relevant to the area you'll touch.
   Skim `docs/PRODUCT_BRIEF.md` sections for that feature so the work matches the product intent.
3. Baseline: `npm run typecheck && npm test`. If anything fails, report it before starting new work.
4. Choose work:
   - If the person named a task, do that.
   - Otherwise propose the first unchecked item under "Next up" in PROGRESS.md (say what you'd build and
     roughly which files), and wait for a yes.
5. Create a branch `feat/<short-name>` (or `fix/…`) from up-to-date `main`.
6. Build it following AGENTS.md conventions: shared types/schemas first, then API (schema.surql →
   repository → service → route + test), then web (feature components → page/route).
7. Verify: `npm run typecheck && npm test`; for UI, run `npm run dev` and exercise the flow in a browser.
8. Update `docs/PROGRESS.md` (Done / Known gaps / Decision log) and `docs/ARCHITECTURE.md` if the
   structure changed. Commit, and offer to open a PR.
