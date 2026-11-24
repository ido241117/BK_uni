# UI/UX Specification — Recommendations ("Gợi ý lộ trình")

| | |
|---|---|
| Status | **Proposal** (not approved, not implemented) |
| Version | 0.1 |
| Date | 24/11/2026 |
| Source artifact | `ui-demo/` (`index.html`, `style.css`, `app.js`) and `mau-what-if.html` (same content, single file) |
| Note | `DOC-TRUOC.md` is stale: it points to "đặc tả mục 12 trong `docs/02-ke-hoach.md`", which has no section 12, and names the folder `tach-rieng/` which is now `ui-demo/`. |
| Reference standards | WCAG 2.2 level AA (normative for accessibility), ISO 9241-110 dialogue principles (rationale), ISO 8601 / Vietnamese semester codes as used by the backend (`YYS`) |
| Companion docs | `../docs/03-thiet-ke.md` (behavior, API contract), `../docs/02-ke-hoach.md` (status), `../docs/04-luat-qd285.md` (rules) |
| Paths | Relative to this folder, except the `Frontend/` paths in §12, which are repository-root-relative. |

---

## 1. Purpose and scope

### 1.1 Purpose

Define the target look, information architecture, interaction model, component library, content rules and accessibility bar for the student-facing plan screen, using the `ui-template` prototype as the visual and behavioral baseline.

### 1.2 In scope

- The **Lộ trình** (plan) tab: KPI strip, status banner, semester board, scenario panel, action bar.
- The **So sánh** (compare) tab: plan selection, metric table, assumption diff, moved-course list.
- The visual language: color, typography, spacing, radius, elevation, motion.
- State model, empty/loading/error/stale states, content and message rules.
- Accessibility conformance targets and the specific defects in the prototype that must be fixed before implementation.
- Mapping to the current React + Ant Design frontend.

### 1.3 Out of scope

- `/courses` (myBK import, progress card) — separate spec.
- Admin and advisor surfaces.
- Solver behavior. The prototype's solver is a JS simulation; the real one is CP-SAT/Clingo behind `POST /api/plans/solve` (`docs/03-thiet-ke.md` §6).
- Authentication, error pages, the app shell (sidebar/topbar).

### 1.4 Reading the "binding" column in this document

Every rule is tagged **Must** (acceptance criterion), **Should** (deviation needs a written reason), or **May** (optional polish). Measured values are labeled *measured*; proposals are labeled *proposed*.

---

## 2. Users, jobs, and design consequences

| Actor | Job to be done | Consequence for the UI |
|---|---|---|
| Student, 2nd–4th year | "Will I graduate on time, and what changes if I skip a semester / drop a course / take summer?" | One screen must answer the outcome (graduation semester) before the detail (which course in which term). |
| Student under academic pressure | "Why can't I move this course?" | Every refused move must state a reason in Vietnamese, next to the target, not in a modal. |
| Student who distrusts an automatic plan | "I want to keep my own choice and let the tool fill the rest." | Manual moves are first-class and survive re-solving (pin semantics). |
| Student comparing options | "Which scenario is better?" | Side-by-side comparison of outcome metrics plus the list of differing assumptions. |

### 2.1 Design principles (ordered; earlier wins conflicts)

1. **Outcome first, detail second.** Graduation semester is the largest, first-read element. Semester rows carry the evidence.
2. **Explain refusal in place.** A control that cannot act shows why, at the point of the attempt, and stays visible while the attempt is active.
3. **The solver runs only on demand.** Editing never silently recomputes. The user always knows whether what they see is validated.
4. **Manual intent is preserved.** A move becomes a pin. Nothing the user placed is moved by the solver without saying so.
5. **Errors are actionable.** Every blocking error names the rule and offers at most three single-change escapes, each verified to actually resolve it.
6. **Calm surface, dense data.** Generous whitespace, no cards-in-cards, no color used for decoration where it also carries meaning.

---

## 3. Information architecture

### 3.1 Screen map

```
Gợi ý lộ trình                                   [global app shell: sidebar + topbar]
├── Tab: Lộ trình
│   ├── KPI strip                    (4 outcome metrics, stale-aware)
│   ├── Status banner                (empty | solving | dirty | ok | warn | error)
│   ├── Tray                         (courses not yet placed)
│   ├── Semester board               (rows, one per semester; beads inside)
│   ├── Legend
│   └── Action bar                   (Giải · Hoàn tác · name · Lưu bản này)
├── Tab: So sánh (N)
│   ├── Plan pickers (A / B)
│   ├── Outcome metric table
│   ├── Assumption diff table
│   └── Moved-course list
└── Side panel: Kịch bản             (collapsible, sticky)
    ├── Môn đang học (HK 261)        pass/fail per in-progress course
    ├── Ưu tiên                      ordered priorities, on/off + reorder
    └── Lịch sử (n/10)               saved snapshots: star, open, compare, delete
```

### 3.2 Navigation rules

| Rule | Level |
|---|---|
| Exactly two top-level tabs: `Lộ trình`, `So sánh (N)` where N = saved snapshots. | Must |
| Tab state survives reload; deep-linking a tab is not required. | Should |
| The scenario panel is collapsible to a 44 px vertical rail; collapsed state persists. Collapsing must not hide the `Giải` action. | Must |
| There is no third-level navigation. All detail appears in popovers or inline rows. | Must |
| `Làm lại từ đầu` lives in the footer, not the action bar, and requires confirmation. | Must |

---

## 4. Screen specification — Lộ trình

### 4.1 Wireframe (desktop ≥ 1280 px)

```
┌───────────────────────────────────────────────────────────────┬──────────────────┐
│ Gợi ý lộ trình ✦                                              │ Kịch bản      ‹  │
│ Mẫu theo đặc tả · dữ liệu mẫu · ...                           │                  │
│ Lộ trình    So sánh (3)                                       │ MÔN ĐANG HỌC     │
├───────────────────────────────────────────────────────────────┤ CO2039  [Đậu|Rớt]│
│ Ra trường     Kỳ chính nặng nhất   Học hè    Môn không được rớt│ MT2013  [Đậu|Rớt]│
│ HK 281 +1 kỳ      17 TC  −2 TC     6 TC      2 môn             │                  │
├───────────────────────────────────────────────────────────────┤ ƯU TIÊN          │
│ ● Giải được, có 2 cảnh báo                                     │ ☑ 1. Ra trường…  │
│   [Quy định] HK 271: 19 TC, ngoài mức 15–18                    │ ☑ 2. Mỗi kỳ 15–18│
│                                                                │ ☑ 3. Không dư…   │
├───────────────────────────────────────────────────────────────┤                  │
│ 262 ● 14 TC   [nghỉ] [muốn 14 TC]                              │ LỊCH SỬ (3/10)   │
│      ● CO2013            ● CO3001            ● SP1007          │ ★ Không học hè   │
│        Hệ CSDL            CNPM               Pháp luật         │   18:40 · HK 281 │
├───────────────────────────────────────────────────────────────┤   [Mở][So][Xóa]  │
│ 263 ● HÈ 0 TC  [học hè]                                        │                  │
└───────────────────────────────────────────────────────────────┴──────────────────┘
│ [ Giải ]  Hoàn tác   Chỉ bấm Giải mới gọi bộ giải.  [Tên bản]  [Lưu bản này]      │
└──────────────────────────────────────────────────────────────────────────────────┘
```

Grid: `minmax(0,1fr) 290px`, gap 36 px, page padding 26–56 px, max width 1480 px.

### 4.2 KPI strip

Four metrics, always in this order and with these labels:

| # | Label (vi) | Value format | Sub-line | Direction |
|---|---|---|---|---|
| 1 | `Ra trường` | `HK <code>` | `kỳ cuối có môn` | lower is better; delta shown as `sớm N kỳ` / `trễ N kỳ` |
| 2 | `Kỳ chính nặng nhất` | `<n> TC` | `<n> kỳ ngoài 15–18` | lower is better |
| 3 | `Học hè` | `<n> TC` | empty | lower is better |
| 4 | `Môn không được rớt` | `<n> môn` | `rớt là trễ ra trường: <codes…>` | lower is better |

| Rule | Level |
|---|---|
| Metric 1 is rendered at the largest size (46 px serif) and in `--rose`; metrics 2–4 at 36 px in `--ink`. | Must |
| With no result: every value is `—`; no delta pills; sub-lines empty. | Must |
| While the result is stale (edits since last solve, or solving in progress), the whole strip is at 40 % opacity and **not** skeletonised. | Must |
| Deltas appear only against the immediately previous successful result, and only when the value actually changed. Format `+2 TC` / `−2 TC`, pill outline in `--good` (better) or `--err` (worse). Zero delta renders nothing. | Must |
| Graduation delta is text, not a number: `+2` must never appear for metric 1. | Must |
| Metric 4's sub-line lists at most 3 course codes then `…`; the full list is the cell's accessible description, not only a `title` attribute. | Must |
| Deltas must not be the only indicator of improvement: pair color with the sign/word. | Must |

### 4.3 Status banner

One banner, above the board, with a colored dot and a heading. It is the single source of truth for "is what I see valid".

| State | Dot | Heading | Body |
|---|---|---|---|
| Empty | `--soft` | `Chưa có lộ trình.` | `Bấm Giải để bộ giải đề xuất lộ trình.` |
| Solving | `--rose` + spinner | `Đang giải…` | — |
| Dirty (n > 0) | `--rose` | `Đã sửa <n> chỗ, chưa kiểm.` | `Bấm Giải để kiểm và xếp lại phần còn lại. Môn bạn chuyển được giữ nguyên (ghim).` |
| OK | `--good` | `Giải được. Không vi phạm quy định, không cảnh báo.` | — |
| Warning | `--warn` | `Giải được, có <n> cảnh báo` | list of warnings, each `[tag] text` + optional inline action |
| Error | `--err` | `Không giải được` | list of errors, each `[tag] text`, then `Cách gỡ:` + up to 3 escape buttons |
| Error, no escape | `--err` | `Không giải được` | errors + `Không có một lựa chọn nào gỡ được riêng; cần nới nhiều chỗ.` |

| Rule | Level |
|---|---|
| The banner must be `role="status"` and `aria-live="polite"` for dirty/OK/warning; `role="alert"` for errors. | Must |
| Every list item starts with a category tag in `--mut`, uppercase, 10.5 px, letter-spacing 0.08em. Tags are exactly: `Tiên quyết`, `QĐ 285`, `Quy định`, `Lựa chọn của bạn`. | Must |
| Escape buttons are pill-shaped, 1 px `--rose` outline, filled on hover; label states the action and the entity: `Bỏ ghim CO3011 ở HK 271`, `Bật học hè HK 263`. | Must |
| Clicking an escape applies it and immediately re-solves. The escape must have been verified to remove at least one error, or it must not be shown. | Must |
| Warnings with an available correction show one inline action, e.g. `Kỳ này có mở`, which records the offering exception and marks the result dirty (no auto-solve). | Must |
| Error and warning counts must equal the counts reported by the API for the same payload. The banner is not allowed to filter. | Must |

### 4.4 Tray

`Chờ xếp khi bấm Giải: <list>` — prefixed by `✦ `, 13 px, `--rose`. Lists ids of courses with no semester in the current view, retakes prefixed `học lại `. Hidden when empty.

### 4.5 Semester board

Rows are **vertical** (time flows down), courses are **horizontal beads** inside the row. Row anatomy:

```
┌───┬──────────────┬──────────────────────────────────────────────────┐
│ ● │  262         │  [notes: errors / warnings on this semester]      │
│   │  14 TC       │  ● CO2013     ● CO3001      ● SP1007             │
│   │  [nghỉ]      │   Hệ CSDL      CNPM          Pháp luật           │
│   │  [muốn 14TC] │  · · · · · · · · · · · · · · · · · · · · · · ·    │
└───┴──────────────┴──────────────────────────────────────────────────┘
    22px   132px              1fr
```

| Element | Rule | Level |
|---|---|---|
| Timeline dot | Left rail, 9 px, `--dot` pink, on a 1 px vertical rule spanning the board (`#F3E3EA`). | Must |
| Semester code | 26 px serif, `--ink`. The prototype fills the dot of the **first rendered row** (`i === 0`, i.e. the next semester, not the current one) with no legend entry. Either label that row (`Học kỳ tới`) or drop the styling; an unexplained color state is not acceptable. | Should |
| Load | `<n> TC`, or `<n> / <target> TC` when the user set a target. 12 px, `--mut`. | Must |
| Summer rows | Tag `HÈ` (11 px, 600, `--warn`) after the code; all summer rows sit between main semesters in chronological order. | Must |
| Inactive row | If a summer semester is off, or the user marked a main semester as skipped, and it holds no courses, collapse to a 6 px-high row with its toggle still reachable. | Must |
| Active row | Background `#FDF4F7` **only** while a course is selected and this row is a legal destination; otherwise white. | Must |
| Illegality | Row opacity 0.45 while a course is selected and this row is not a legal destination; the reason is rendered inline at the end of the row in italic `--mut`. | Must |
| Inline notes | One line per error (12 px `--err`) and per warning (12 px `--warn`), before the beads. | Must |
| Legend | Under the board: hover to inspect, click to adjust, bright row = legal drop target, `•` after a code = moved but not yet solved. | Must |

### 4.6 Course bead

Anatomy: `◯` dot · `<code>` · `<name>` (2-line clamp, 11 px `--mut`), 132 px wide, left-aligned.

| State | Visual | Behavior |
|---|---|---|
| Default | Hollow dot, 1.6 px `--dot` border | Hover → dot scales 1.2, tooltip appears |
| Selected | Dot filled `--dot`; code in `--rose` | Click again deselects |
| Moved, unsolved | `•` appended to code in `--rose` | Tooltip line `Đã chuyển, chưa giải` |
| Pinned | Tooltip line `Đã ghim vào kỳ này` in `--rose` | — |
| Assumed failed | Tooltip line `Giả định rớt kỳ này` in `--err`. **Today this is the only marker** (the `.card.failed` tint belongs to the dead first generation) — add a persistent one, e.g. a dashed bead dot, and keep the tooltip line. | — |
| Semester not offered | Tooltip line `Bạn báo kỳ này không mở` in `--err` | — |
| Elective | Tooltip line `Tự chọn khối C`; popover adds a course `<select>` | Swap keeps the slot |
| Free elective | Code shows `Tự do` when unnamed; popover adds a free-text code input | Input is uppercased and trimmed on commit |
| Retake | Tooltip line `Học lại` | Cannot be assumed failed again |

**Interaction contract**

| Action | Result | Level |
|---|---|---|
| Hover / keyboard focus | Tooltip: name, credits + category, then state lines. | Must |
| Click / `Enter` | Popover with the actions; only one popover at a time. | Must |
| Click / `Enter` when another bead is selected | The selected course moves into this bead's semester; the bead's popover does not open. | Must |
| `Esc` | Closes the popover; if a course is selected and no popover is open, clears the selection. | Must |
| Popover actions | `Ghim vào HK <c>` / `Bỏ ghim`, `HK <c> không mở môn này`, `Giả định rớt kỳ này` / `Bỏ giả định rớt`, elective swap, free-code input. | Must |
| Any edit | Pushes undo (max 30), increments the dirty counter, clears the selection, re-renders. **Never** calls the solver. | Must |
| Tooltip must not be the only place a blocking state is communicated. | A blocked row also shows its reason inline. | Must |

### 4.7 Action bar

`[ Giải ]` (46 px pill, `--rose`, white label, disabled + `Đang giải…` while solving) · `Hoàn tác` (text button, disabled when the undo stack is empty) · mute note `Chỉ bấm Giải mới gọi bộ giải.` · spacer · plan-name input (`Tên bản, VD: Không học hè`, 200 px) · `Lưu bản này` (ghost, disabled with no result).

| Rule | Level |
|---|---|
| Undo restores the previous scenario **and** its dirty count, but does not restore the previous result. | Must |
| `Lưu bản này` with an empty name auto-names it `Bản <n>`. | Must |
| At 10 snapshots, saving evicts the oldest non-starred snapshot; starred snapshots are never evicted automatically. | Must |
| Saving while dirty stores the snapshot with `chưa kiểm` and must not present its KPI as validated. | Must |

### 4.8 Scenario panel

| Section | Controls | Rule |
|---|---|---|
| `Môn đang học (HK 261)` | One row per in-progress course: code, name, `[Đậu \| Rớt]` segmented | Marking `Rớt` moves the course to the tray as a retake and adds `R: <code>` |
| `Ưu tiên` | Up to 3 ordered priorities: checkbox, `1.` index, `↑` `↓` | Order is semantic; the solver objective follows it. Disabled placeholders `Học phí thấp (bàn sau)` and `Theo sở thích (bàn sau)` stay visible and disabled |
| `Lịch sử (n/10)` | Star toggle (`★`, one starred baseline at a time), timestamp, outcome line, `Mở` / `So với đang xem` / `Xóa` | `Mở` loads the snapshot and **solves it immediately**; that is the only path that solves without the `Giải` button and must be labelled as such in the empty/loading feedback |
| Empty history | `Chưa có bản nào.` | Must |

Panel container: `--tint` background, no shadow, 26 px radius, `position: sticky; top: 20px`. Collapsed: 44 px pill rail with vertical `Kịch bản` text.

---

## 5. Screen specification — So sánh

1. **Pickers**: `<Bản A> [so với] <Bản B>`. Options are `Đang xem`, `Kế hoạch giảng dạy` (the faculty recommended plan, computed client-side without the solver), and every saved snapshot by name.
2. **Outcome table**: rows `Ra trường`, `Kỳ chính ngoài 15–18 TC`, `Kỳ chính nặng nhất`, `Học hè`, `Môn bắt buộc trễ hơn kế hoạch khoa`, `Cảnh báo`. The better cell is `--good` + 600 weight, only for rows with a defined direction (`Học hè` is neutral: no winner highlighted).
3. **Assumption diff**: union of assumption keys across A and B (`Học hè`, `Nghỉ kỳ`, `Ô TC từng kỳ`, `Ghim`, `Đang học`, `Giả định rớt`, `Không mở`, `Ưu tiên`, `Tự chọn C`, `Tự chọn tự do`); rows where the values differ get `#FBEDF2` background. For the faculty plan, a single row `Giả định: Theo kỳ khuyến nghị của khoa` replaces the list.
4. **Moved courses**: `<code> <name> <from> → <to>` for every course present in both plans in different semesters, with a count in the heading. Empty: `Không môn nào đổi kỳ.`
5. Footnote: `Dòng hồng: giả định khác nhau. Chữ xanh: bản tốt hơn. So sánh không gọi bộ giải.`

| Rule | Level |
|---|---|
| Comparing never calls the solver. | Must |
| Missing KPI (failed plan) renders `—`, never `0`. | Must |
| The diff table must state "better" in text for screen readers (`<span class="sr-only">tốt hơn</span>`), not only via color. | Must |

---

## 6. State model

| State | Trigger | KPI | Board | Banner |
|---|---|---|---|---|
| `empty` | No result in session | `—` ×4 | Blob illustration + `Chưa có lộ trình nào. Bấm Giải ở dưới để xếp thử nhé.` | Empty |
| `solving` | `Giải` pressed | stale (40 %) | unchanged, inputs disabled | Solving |
| `dirty` | Any edit after a result | stale (40 %) | edits applied optimistically (`shown()` maps pins/fails onto the last result) | Dirty |
| `ok` | Result, 0 errors, 0 warnings | fresh | fresh | OK |
| `warn` | Result, 0 errors, ≥1 warning | fresh | inline warning lines | Warning |
| `error` | Result with errors | all four values `—` (the prototype renders nothing numeric when `errors.length > 0`) | inline error lines, no row tinting | Error + escapes |
| `error_locked` | Error, escapes empty | as `error` | frozen, `Giải` re-enabled | Error, no escape |

**Transitions**

- `empty → solving` on `Giải`; `solving → ok|warn|error` on response.
- `ok|warn|error → dirty` on any edit; `dirty → solving` only on `Giải`.
- `dirty → ok|warn|error` on `Giải` (previous KPI becomes the delta baseline).
- `any → empty` only via `Làm lại từ đầu` (confirmation required) or a new account.
- Loading longer than 2 s shows the spinner plus `Đang giải…`; there is no progress bar and no cancel. The API timeout is 2 min, so the button must stay disabled for the full window.

---

## 7. Visual language

### 7.1 Generation note (important for implementers)

`style.css` contains **two design generations** concatenated. The second block (`/* ===== ban 5 ===== */` and `/* ===== ban 6 ===== */`) overrides most of the first: page background becomes white, `--bg` becomes `#FFFFFF`, `--dot: #E58FB0`, `--tint: #FDF4F7`; card-style course tiles become `bead` items; the row grid becomes `22px 132px 1fr`. **This specification describes the final (second) generation only.** The first generation's `.card`, `.chip`, `.chips`, `.dash` rules are dead and must not be ported.

### 7.2 Color tokens (light only)

| Token | Value | Role | Measured contrast |
|---|---|---|---|
| `--canvas` | `#FFFFFF` | Page background | — |
| `--paper` | `#FFF8F4` | Popover, elevated surfaces | ink 13.71:1 |
| `--tint` | `#FDF4F7` | Legal drop-target row, scenario panel, diff rows | `--ink` 13.55:1 |
| `--sand` | `#F6EADF` | Elective/alternative surface (sparingly) | `--ink` 12.18:1 |
| `--ink` | `#3B2230` | Primary text | 13.71:1 on paper |
| `--mut` | `#8E6B78` | Secondary text, labels | **4.42:1 on paper — fails 4.5** |
| `--soft` | `#BE9EAA` | Note text, disabled | **2.31:1 — fails** |
| `--rose` | `#B83E6C` | Brand, primary action, selected, pinned | 5.07:1 on paper; 4.93:1 on tint; white on it 5.33:1 |
| `--rose-hover` | `#A03460` | Fill hover | white 6.66:1 |
| `--dot` | `#E58FB0` | Bead dot, timeline accents | **2.36:1 on white — fails 3:1 for UI components** |
| `--good` | `#5E7F5D` | Better delta, best cell | 4.50:1 on white; **4.17:1 on tint — fails** |
| `--warn` | `#A0702A` | Warning text, `HÈ` tag | **4.33:1 on white — fails** |
| `--err` | `#AE4B33` | Error text | 5.45:1 on white; 5.05:1 on tint |
| `--line` | `rgba(59,34,48,.13)` | Dividers | decorative only |

**Required corrections** (values *measured* to pass AA; adopt these instead of the prototype values):

| Use | Replace with | Contrast |
|---|---|---|
| `--mut` on light surfaces | `#82606D` | 5.20:1 |
| `--soft` used for any text | delete as a text color; use `--mut`. Keep `#BE9EAA` for non-text decoration only. | — |
| `--good` on tint | `#54724F` | 4.99:1 |
| `--warn` | `#8F6321` | 5.28:1 |
| `--err` on tint | no change needed | 5.05:1 |
| `--dot` | `#D2749A` | 3.13:1 (only if the dot conveys state) |

### 7.3 Typography

| Role | Family | Size / weight / tracking | Line height |
|---|---|---|---|
| Display (H1) | Fraunces 500, opsz 9–144 | 40 px, −0.01em | 1.2 |
| KPI value 1 | Fraunces 500 | 46 px | 1.1 |
| KPI value 2–4 | Fraunces 500 | 36 px | 1.1 |
| Semester code | Fraunces 500 | 26 px | 1.1 |
| Section heading (panel) | Be Vietnam Pro 600 | 11 px, 0.1em, uppercase | 1.4 |
| Body | Be Vietnam Pro 400 | 14 px | 1.45 |
| Bead code | Be Vietnam Pro 600 | 12.5 px, 0.02em | 1.3 |
| Bead name | Be Vietnam Pro 400 | 11 px, clamp 2 lines | 1.3 |
| Meta / note | Be Vietnam Pro 400 | 12 px | 1.4 |
| Tag | Be Vietnam Pro 600 | 10.5 px, 0.08em, uppercase | 1.4 |

| Rule | Level |
|---|---|
| Body text must not go below 12 px; 10.5–11 px is allowed only for uppercase tags and bead names, never for sentences longer than ~6 words. | Must |
| Fonts load from Google Fonts with `display=swap` and the current fallbacks (`Georgia, serif` / `system-ui, sans-serif`). No layout shift on swap: reserve the line box. | Must |
| Serif is used for numbers and proper nouns only (titles, KPI values, semester codes, course codes in the compare table). Never for body copy. | Must |
| No text is rendered in `--rose` below 12 px at weight < 600. | Should |

### 7.4 Space, radius, elevation

- Spacing scale: 2, 4, 6, 8, 10, 14, 18, 22, 26, 36 px. Page padding `26px 56px` desktop, `16px` mobile.
- Radius: `14px` small surfaces, `16px` popovers, `22–26px` rows and panels, `999px` pills and buttons.
- Elevation: three levels only — none (rows, panel), `0 14px 34px -14px rgba(120,40,70,.45)` (tooltip), `0 18px 40px -16px rgba(120,40,70,.5)` + 1 px `#F3E3EA` ring (popover). No card shadows on list items.
- Motion: 150 ms ease for hover/transform, 150 ms for background changes, spinner 800 ms linear infinite. All of it must be disabled under `prefers-reduced-motion: reduce` (currently absent).

---

## 8. Component library

Each component below is specified as: anatomy → variants → behavior → accessibility obligations. Implementations map to Ant Design as noted.

### 8.1 `Bead` (course chip) — AntD: custom + `Tooltip`/`Popover`

- **Anatomy**: dot, code (600), name (2-line clamp), optional `•` marker, embedded tooltip and popover.
- **Sizes**: fixed 132 px; height auto (≥ 44 px). No width variants.
- **States**: default, hover, focus-visible, selected, moved, pinned, assumed-failed, retake, not-offered, disabled (row inactive).
- **A11y obligations**:
  - Rendered as `<button type="button">` with `aria-expanded` for its popover and an accessible name `"<code> — <name>, <credits> tín chỉ, <category>"` plus state words.
  - `focus-visible` ring: `0 0 0 3px rgba(184,62,108,.35)`. Never `outline:none` without a replacement.
  - Tooltip content is also in the accessible description (`aria-describedby`), not only visual.
  - Popover: focus moves into it, `Esc` closes and returns focus to the bead, tab order follows DOM.

### 8.2 `SemesterRow` — AntD: custom grid

- Anatomy: timeline dot, code, load, controls (`nghỉ` / `học hè`, `muốn <n> TC`), notes, bead lane, drop affordance.
- Variants: main, summer, inactive-collapsed, legal-target, illegal-target, with-errors, current.
- A11y: the row is a group with `role="group"` and `aria-label="Học kỳ 262, 14 tín chỉ"`. Drop-target legality is announced (`aria-describedby` pointing to the reason text), not only via opacity.

### 8.3 `KpiCell`

- Anatomy: label, value, sub-line, optional delta pill.
- Variants: fresh, stale, empty, with-delta-good, with-delta-bad.
- A11y: one `aria-label` per cell composing label + value + delta ("Ra trường HK 281, sớm 1 kỳ"); the sub-line is separate text. `title` alone is not acceptable.

### 8.4 `StatusBanner`

- Variants as in §4.3. Anatomy: dot/spinner, heading, optional `<ul>` of tagged items, optional action row.
- A11y: `role`/`aria-live` per §4.3; the tag is included in the list item's text, not as an image or `::before` content only (the current `::before` dot is decorative and must be `aria-hidden`).

### 8.5 `Pill` / delta

- 11 px, 600, `1px solid currentColor`, radius 999. Contents: signed number + unit, or `sớm/trễ N kỳ`. Max one per KPI cell.

### 8.6 `SegmentedToggle` (`Đậu | Rớt`, AntD: `Segmented`)

- 2 options only. Selected = filled `--rose`, white label. Must expose `role="radiogroup"` semantics or AntD's default `aria-checked`; each option ≥ 32 px tall.

### 8.7 `PriorityRow`

- Checkbox + ordinal + label + `↑`/`↓` (20 px icon buttons, disabled at ends). Disabled rows: `--soft` text, checkbox disabled, no edit affordance. A11y: buttons need `aria-label="Đưa ưu tiên 2 lên"`; the ordinal is part of the accessible name.

### 8.8 `HistoryItem`

- Star toggle, name, meta line (`time · outcome [· chưa kiểm] [· mốc]`), three actions.
- A11y: star is a toggle button with `aria-pressed`; `Xóa` requires confirmation (destructive, currently no confirmation).

### 8.9 `DataTable` (compare) — AntD: `Table`

- Header row uppercase 11 px `--mut`; row separators `1px var(--line)`; better cell `--good` 600; diff row `#FBEDF2`.
- A11y obligations for the port: real `<thead>`, `<th scope="col">`, `<caption class="sr-only">`, no layout `<table>` for the assumption grid if a definition list is semantically closer.

### 8.10 `EmptyState`

- 90 px SVG illustration + two-line instruction with the action word emphasized in `--rose`. Text must name the actual control: `Bấm Giải ở dưới`.

---

## 9. Content and terminology

| Concept | Canonical label | Never use |
|---|---|---|
| Run the solver | `Giải` (button), `Đang giải…` (progress) | `Tối ưu`, `Tính toán` |
| The output | `lộ trình` | `thời khóa biểu`, `kế hoạch học` (that is the faculty plan) |
| Faculty recommended plan | `Kế hoạch giảng dạy` | `kế hoạch chuẩn` |
| Manual placement | `Ghim` / `Bỏ ghim` | `Khóa`, `Cố định` |
| Unvalidated edit | `Đã sửa <n> chỗ, chưa kiểm` | `Chưa lưu` |
| Saved snapshot | `bản`, `mốc` (starred baseline) | `phiên bản` |
| Summer term | `học hè`, tag `HÈ` | `kỳ hè` inconsistently |

Rules: sentence case; no ALL-CAPS except the fixed tags; Vietnamese diacritics everywhere (including `Đã`, `Kỳ`); numbers use a thin space before the unit (`14 TC`, `−2 TC`) and a true minus sign `−` in deltas; course codes are never translated; every message names the entity it concerns (course code or semester code), never "this item".

---

## 10. Accessibility conformance plan

Target: **WCAG 2.2 AA**. The prototype fails the following today; all are **Must** before implementation is accepted.

| # | Criterion | Current defect (measured / observed) | Required fix |
|---|---|---|---|
| 1 | 1.4.3 Contrast (text) | `--soft` 2.31:1; `--mut` 4.42:1 (paper), 4.30:1 (tint), 3.92:1 (sand); `--good` 4.17:1 (tint); `--warn` 4.33:1 | Adopt the replacement values in §7.2 |
| 2 | 1.4.11 Non-text contrast | `--dot` 2.36:1 on white although it carries state (selected/moved) | `#D2749A`, plus a non-color marker (`•`, filled vs hollow) — already present for moved |
| 3 | 1.3.1 / 4.1.2 Semantics | Beads and rows are `div`s with click handlers; no roles or names; tabs and segmented controls lack `aria-selected`/`aria-pressed` | Real `<button>`s, `role="tablist"`, `aria-pressed` |
| 4 | 2.1.1 Keyboard | Tooltip is hover-only; popover not focusable; no keyboard path to "move to semester" (it requires click-then-click with no focus transfer) | Focus-visible everywhere; `Enter`/`Space` select; arrow-key movement between beads; inline `Chuyển vào HK …` action in the popover |
| 5 | 2.4.7 Focus visible | `outline:none` on two inputs, replaced by a 1 px border color change only | 3 px ring on all interactive elements |
| 6 | 1.4.1 Use of color | Legal/illegal row = opacity only; delta good/bad = `--good`/`--err` only; best compare cell = color only | Add words (`hợp lệ`, `sớm 1 kỳ`, `tốt hơn` via `.sr-only`), plus icon or border |
| 7 | 4.1.3 Status messages | Solve result replaces the banner with no live region | `aria-live` per §4.3 |
| 8 | 1.4.4 Resize / 1.4.10 Reflow | No media queries at all; fixed 132 px bead column, 290 px panel, 56 px page padding | Implement §11 |
| 9 | 2.3.3 Animation | Spinner and hover transforms ignore `prefers-reduced-motion` | Media query guard |
| 10 | 3.3.2 Labels | Plan-name input has placeholder only; free-code input relies on visible text but has no programmatic label | Visible label or `aria-label` |
| 11 | 1.3.1 Heading order | `h1` → `h3` inside the panel; no `h2` | `h2` for panel section titles, `h3` for sub-items |
| 12 | 2.4.1 Bypass blocks | No skip link inside the page (shell may provide one) | Provide `Bỏ qua đến lộ trình` if the shell does not |
| 13 | 3.2.2 On input | `Mở` in history replaces the whole plan and solves immediately, with no warning | Label the button `Mở và giải lại`, or require confirmation |
| 14 | 2.5.8 Target size (AA, 2.2) | Bead dot hover target 9 px; `↑`/`↓` 20 px; star 14 px | Hit area ≥ 24×24 px without changing visual size |

---

## 11. Responsive layout

The prototype has **zero breakpoints** (verified: no `@media` in `style.css`). Proposed:

| Range | Layout |
|---|---|
| ≥ 1280 px | 2 columns `1fr + 290px`; board as specified; KPI 4-up |
| 1024–1279 px | 2 columns `1fr + 240px`; page padding 32 px; bead 120 px |
| 768–1023 px | 1 column; scenario panel becomes a right `Drawer` opened by a `Kịch bản` button in the action bar (AntD `Drawer`, 320 px) |
| < 768 px | 1 column, 16 px padding; KPI becomes 2×2; bead 50 % width in a 2-column lane; action bar becomes a sticky bottom bar with `Giải` full-width and undo as an icon button; compare tables become stacked label/value pairs |

Rules: no horizontal scrolling at 320 px width (reflow criterion); the board's timeline rail is hidden below 768 px; popovers become bottom sheets below 600 px.

---

## 12. Mapping to the current frontend (implementation notes)

The current app is React + Ant Design with a **blue** brand (`#0066cc`) defined in `Frontend/src/styles/tokens.css` and `Frontend/src/config/theme/index.ts`, explicitly documented as the single source of truth for both antd and CSS. Adopting the prototype's look therefore means replacing the brand layer, not adding a skin on top.

| Prototype token | Proposed app token | Where |
|---|---|---|
| `--rose #B83E6C` | `--brand` / `BRAND.primary` | `tokens.css`, `config/theme` |
| `--rose-hover #A03460` | `--brand-hover` | same |
| `--ink #3B2230` | `--text-primary` | same |
| `--mut #8E6B78` → `#82606D` | `--text-secondary` | same |
| `--tint #FDF4F7` | `--bg-subtle` (light) | same |
| `--line` | `--border-soft` | same |
| Fraunces / Be Vietnam Pro | `fontFamily` + display family token | `config/theme` |

Required decisions and constraints:

1. **Dark mode.** The prototype is light-only; the app supports `[data-theme='dark']`. Either define dark equivalents for the rose palette (needs a measured contrast pass) or declare the recommendations screen light-only, which contradicts the shell. **Decision required before build.**
2. **Component reuse.** Reuse `PageHeader`, `Button`, `EmptyState`, `ErrorBoundary`, `ITable` rather than re-implementing; supersede `ISolidBtn`/`IOutLinedBtn` only where the pill geometry differs.
3. **Solver latency.** `Giải` must keep the previous result visible and dimmed (§6); do not unmount the board or show a full-page skeleton.
4. **No `innerHTML`.** The prototype builds HTML strings and escapes with a local `esc()`. The React port must not reintroduce string templating; free-text course codes require the same validation as `adjustments` (existence in the catalogue).
5. **Persistence.** Keep the localStorage contract only if it survives the React port: key versioned (`bkuni.whatif.v1`), storing scenario + result + history + panel state, never names, MSSV or grades. The prototype stores the raw `S`/`V` blob and ignores quota errors — wrap in try/catch and degrade to in-memory.
6. **API binding.** `POST /api/plans/solve` returns `status`, `semesters[]`, `graduation_semester`, `preferences_report`, `assumptions`, `warnings`, `violations`, `diff_vs_previous`, `infeasible_reason`, `unverified_prerequisites`. The UI must surface `status` (`OPTIMAL` / `SAT_NOT_PROVEN_OPTIMAL` / `UNSAT` / `TIMEOUT` / `INPUT_ERROR`) — the prototype has no concept of a non-optimal or timed-out result and would silently render it as OK. Add a fourth banner tone for `SAT_NOT_PROVEN_OPTIMAL` (`Giải được, chưa chứng minh tối ưu`) and for `TIMEOUT` (`Hết thời gian giải`).
7. **`preferences_report` instead of a KPI guess.** The compare tab currently compares only proxies. When the API is wired, add rows for the preferences the solver actually scored, rather than inventing metrics client-side.
8. **Removal of dead CSS.** Do not port `.card`, `.chip`, `.chips`, `.dash`.

---

## 13. Acceptance criteria

A build is accepted when all of the following are demonstrable:

1. At 1280, 1024, 768, 390 and 320 px, no horizontal scroll, and every action in §4 remains reachable.
2. All text/UI pairs meet the contrast values in §7.2, checked with a computed ratio, not by eye.
3. Full keyboard path: `Giải` → select bead → move to semester → undo → open popover → close with `Esc`, with visible focus at every step.
4. Screen-reader announcement of the solve result (`role="status"`/`alert`) including the error/warning count.
5. Editing never triggers a network call; `Giải` is the only trigger except the labelled `Mở và giải lại`.
6. Stale KPI is visually distinguishable from fresh KPI without relying on opacity alone (an `Chưa kiểm` tag accompanies it).
7. `UNSAT` shows at least one verified escape when one exists, and the "no single escape" message otherwise.
8. Snapshot cap of 10 with starred protection; `Xóa` and `Làm lại từ đầu` confirm.
9. `prefers-reduced-motion: reduce` disables the spinner animation and hover transforms.
10. No course code, name, MSSV or grade is written to localStorage.

---

## 14. Open questions

1. **Dark mode**: define a rose dark palette, or scope this screen to light only? (blocks §12.1)
2. **Brand replacement**: is the whole app moving to the rose/Fraunces identity, or only `/recommendations`? A split identity would break the "single source of truth" rule in `tokens.css`.
3. **`SAT_NOT_PROVEN_OPTIMAL` / `TIMEOUT` copy** needs an owner; the prototype has no strings for them.
4. **`Lưu bản này` location**: in the action bar (prototype) or in the history panel (closer to where snapshots live)?
5. **Priority list** exposes 3 of the 11 ranked preferences (§3 of `../docs/03-thiet-ke.md`). Confirm that hiding the rest is acceptable, or expose a "more preferences" disclosure.
6. **Retake of a retake**: the prototype blocks assuming a retake failed; confirm this matches the solver's model.
7. **Docs drift**: fix `DOC-TRUOC.md` (wrong section reference, wrong folder name) and decide whether `../docs/03-thiet-ke.md` should link to this file, so the spec is not orphaned in `ui-template/`.
