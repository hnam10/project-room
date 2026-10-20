@AGENTS.md

## Claude Code notes

- `/continue-build` (project skill in `.claude/skills/`) runs the start-of-session routine and picks the next task.
- The team works in Korean and English; reply in the language the person writes in. Code, comments,
  commit messages and docs stay in English.
- SurrealDB SDK is `surrealdb` 2.x with the embedded engine `@surrealdb/node` (SurrealDB 3.x). Its API
  differs from older examples online — check `node_modules/surrealdb/README.md` before using a new method.
