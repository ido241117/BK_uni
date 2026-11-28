# Changelog

One entry per change, newest first. Rules for when to write one: [GUIDELINES.md](GUIDELINES.md), section 0.

Copy this template to the top of the entries:

```markdown
## YYYY-MM-DD HH:MM (+07:00) · <author> · <area>

- **Area:** data | fields | solver | evaluation | docs | other
- **Commit:** `<short hash>`

### What changed
- <file or package>: <what changed, in detail, and why>

### Fields added or removed (fields changes only)
- `<file>`: `<field>` added/removed. Read by: <code that uses it>

### Solver input/output (solver changes only)
- Input format: unchanged / changed: <how>
- Output format: unchanged / changed: <how>

### Tests
- Added or updated: <test files>
- Ran: <command>, result: <passed / failed, and what failed>

### Docs updated
- <doc files, or "none">
```

---

## 2026-11-28 19:15 (+07:00) · kqyuu22 · docs

- **Area:** docs
- **Commit:** `<fill in after commit>`

### What changed
- `docs/GUIDELINES.md`, section 0: replaced "one branch per change, off `research-pipeline`"
  with direct commits to `research-pipeline`, plus test and documentation rules for
  data changes, field changes and solver changes, and this changelog.
- `docs/CHANGELOG.md`: created, with the entry template above.

### Tests
- None (docs only).

### Docs updated
- `docs/GUIDELINES.md`, `docs/CHANGELOG.md`
