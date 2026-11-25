# BKPath design system

Version 1.4 · 2026-11-25 · Applies to `Frontend/` (React 19 + antd 6).

This document specifies how BKPath looks and behaves: the theme, the brand, every component, and how to extend or change any of it. It is written for anyone who designs a page, builds a component, or reviews UI work. It describes the HTML templates in [`ui-template/`](ui-template/) and the web app as built; where the two differ, the template is the source of truth and the app is brought in line with it.

| Companion | What it gives you |
|---|---|
| [`ui-template/`](ui-template/) | The designer's HTML templates (open in a browser). Each one is listed in §0 |
| `Frontend/src/styles/tokens.css` | Every color, space, radius, shadow and layout size, light and dark |
| `npm run contrast:check` (in `Frontend/`) | Measures the palette against the contrast rules of §1.3; exits 1 if a rule fails |
| `npm run i18n:check` (in `Frontend/`) | Lists UI text missing from or unused in `en.json` |

**Conventions.** "Token" = a CSS custom property in `Frontend/src/styles/tokens.css`. Component names are the React names (`CollapsibleGroup`); class names are in `code`. "Template" = a file in `ui-template/`. MUST / SHOULD / MAY follow RFC 2119.

---

## Contents

0. [Templates](#0-templates) — which template defines what
1. [Theme and style](#1-theme-and-style) — principles, color, choosing a palette, dark mode, type, space, elevation, motion, language
2. [Brand, icons, motifs, illustrations](#2-brand-icons-motifs-illustrations)
3. [Components](#3-components) — which component for which content, then each component
4. [Designing a new page](#4-designing-a-new-page) — general rules and page-type rules
5. [Changing the design](#5-changing-the-design) — where every decision lives and how to change it safely
6. [Known issues and backlog](#6-known-issues-and-backlog)

---

## 0. Templates

The templates are plain HTML/CSS files. To change how something looks, change its template first, then port it to the app (§5.0).

| Template | Defines |
|---|---|
| `index.html` | List of all templates |
| `foundations.html` | Palette (read live from `tokens.css`), type, space and radius, motifs, icons, illustrations, scrollbar |
| `logo.html` | Logo (face page + schedule blocks + pencil + gear), favicon, lockup, monochrome and dark variants |
| `controls.html` | Buttons, inputs, dropdown, paste area, search, switch, checkbox / radio, chips (Segmented), tabs |
| `data-display.html` | Rows, KPI count + progress thread, KPI strip, course table (file column, conflicts, row note), empty table, course status, tags, markers, course search result, groups, disclosure |
| `feedback.html` | Status line (all tones), notice, toast, confirm popover, modal (import, review), numbered steps, empty and loading states, ticker (not used yet) |
| `semester-timeline.html` | Gợi ý lộ trình timeline (thread + sparkle checkpoints), the bead family, course cards of the Chương trình board |
| `sidebar-topbar.html` | App shell: sidebar (expanded / collapsed), topbar, breadcrumb, semester badge |
| `dang-nhap.html` | Login / register: split editorial layout |
| `tien-do-hoc-tap-page.html` | Tiến độ học tập › Tiến độ: info panel, Hiệu chỉnh, course groups |

All templates share `template.css` (plain class names, values mirror the app's CSS) and `template.js` (light / dark toggle, open / close behavior), and link the app's `Frontend/src/styles/tokens.css` for every color, so a palette change shows in the templates and the app at once. Open any template with `?theme=dark` for dark.

---

## 1. Theme and style

### 1.1 Principles

1. **Light pink, line-driven.** Separation comes from tonal washes and 1px hairlines, not boxes or heavy shadows. A card with a border and a shadow is the exception, not the default.
2. **Rules run across the page, not down it.** Dividers are horizontal hairlines. The only line that runs down the page is the timeline thread on Gợi ý lộ trình, because it is the "thread" motif (time), not a divider. No vertical stripes to mark a row.
3. **Editorial hierarchy.** A serif (Fraunces) marks what you read first: page titles, section titles, big numbers, semester codes. Everything you scan or operate is sans (Be Vietnam Pro).
4. **One loud thing per area.** Each area has at most one primary (rose, filled) action. Everything else is quieter: secondary stamp, underline, link.
5. **Color means something, shape says it first.** Rose = the product's action and selection. Sage / amber / terracotta = status only. Blue = brand and "where you are going" (§2.1). A state is never shown by color alone: beads change shape (§3.8), status has a word.
6. **Calm by default, honest when it matters.** No decoration that implies data. Warnings name the problem and the fix; conflicts are terracotta, never pink.

### 1.2 Color

All colors are tokens; components MUST NOT use raw hex values. The documented exceptions are canvas charts and the logo favicon, which cannot read CSS variables (§3.12, §5.4).

**Surfaces**

| Token | Light | Dark | Role |
|---|---|---|---|
| `--bg-canvas` | `#FFFFFF` | `#1A1216` | Workspace background |
| `--bg-blush` | `#FDF4F7` | `#21171D` | Sidebar, aside panels, disclosure rows, status line band, selected wash |
| `--bg-elevated` | `#FFF8F4` | `#2A1E25` | Popovers, confirm popover, save bar, page fill of the logo |
| `--bg-tint-hover` | `#FBEDF2` | `#33242D` | Row hover, selected option |
| `--bg-disabled` | `#F9F2F5` | `#251B21` | Locked controls |

**Ink**

| Token | Light | Dark | Role |
|---|---|---|---|
| `--ink-primary` | `#3B2230` | `#F4E6EC` | Body text, values |
| `--ink-muted` | `#745762` | `#C3A4B1` | Labels, secondary text, inactive nav, chart text |
| `--ink-soft` | `#906072` | `#A08995` | Section labels, table headers, placeholders, chevrons, input and checkbox edges |
| `--ink-disabled` | `#CBB3BD` | `#5F4B55` | Disabled labels (exempt from contrast) |
| `--ink-inverse` | `#FFFFFF` | `#2A1120` | Text on a filled accent |

**Accents**

| Token | Light | Dark | Role |
|---|---|---|---|
| `--accent-rose` | `#B83E6C` | `#EC8DB2` | Primary action, active tab/nav, links, selection |
| `--accent-rose-hover` | `#A03460` | `#F4A9C6` | Hover of rose (a step more emphatic) |
| `--accent-sparkle` | `#E58FB0` | `#B5718F` | **Decorative only**: stamp borders, suggested-course ring, timeline thread, sparkles |
| `--accent-glow` | rose 22% | rose 18% | Halo around a checked switch, the graduation sparkle |
| `--accent-brand` | `#2F6FB0` | `#7FB2EC` | **Brand blue: only the places in §2.1** |
| `--focus-ring` | `#B83E6C` | `#EC8DB2` | Keyboard focus outline (2px) |

**Lines** — `--line-hairline` (`#F3E3EA` / `#33252D`) is a boundary inside content; `--line-chrome` (`#E4B7CB` / `#4E3442`) is the edge of an app region (sidebar right edge, topbar bottom edge); `--line-hairline-on-blush` is the hairline on blush backgrounds. Lines are decorative: nothing a user must see depends on them alone.

**Semantic**

| Token | Light | Dark | Meaning | Wash token |
|---|---|---|---|---|
| `--sem-good` | `#577556` | `#9CC79A` | Done, met, passed | `--sem-good-bg` |
| `--sem-warn` | `#916526` | `#E2B56E` | Soft warning, summer term, unsaved | `--sem-warn-bg` |
| `--sem-err` | `#AE4B33` | `#F08D77` | Error, **conflict**, over a limit, failed | `--sem-err-bg` |

Rule: a difference between two sources of truth (myBK file vs web, plan vs rules) is a **conflict → terracotta**, not amber. Amber is for "worth knowing" (summer limits, unsaved changes).

**Marks on a row.** A course is a ring (a bead, §3.8). A flag on a row is a solid 6px dot (`Pip`): amber = unsaved, terracotta = differs from the myBK file, rose = differs in So sánh. Never a vertical stripe.

**Distribution.** Roughly 60% canvas white, 30% blush and hairlines, 10% rose. Brand blue is under 1%.

**Contrast (WCAG 2.1, measured by `npm run contrast:check`).** Every text token passes AA on every surface in both themes. Worst surface shown (light: tint-hover; dark: tint-hover).

| Pair | Light (canvas / worst) | Dark (canvas / worst) | Needed |
|---|---|---|---|
| ink-primary | 14.41 / 12.69 | 15.22 / 12.14 | 4.5 |
| ink-muted | 6.40 / 5.64 | 8.11 / 6.47 | 4.5 |
| ink-soft | 5.12 / 4.51 | 5.70 / 4.55 | 4.5 |
| accent-rose | 5.33 / 4.69 | 7.90 / 6.30 | 4.5 |
| accent-brand | 5.22 / 4.60 | 8.30 / 6.63 | 4.5 |
| sem-good / warn / err | 5.14 / 5.13 / 5.45 (worst 4.52) | 9.68 / 9.69 / 7.69 (worst 6.14) | 4.5 |
| semantic on own wash | 4.75 / 4.81 / 5.00 | 8.22 / 8.13 / 6.75 | 4.5 |
| inverse on rose (button) | 5.33 | 7.52 | 4.5 |
| focus ring (worst) | 4.69 | 6.30 | 3.0 |
| sparkle (decorative) | 2.36 | 5.01 | — |

### 1.3 Choosing or changing a palette (guidelines)

Follow these steps for a new theme, a re-brand, or a single color change. The check script enforces the measurable rules.

1. **Start from roles, not colors.** Fill every role in §1.2 (5 surfaces, 5 inks, action accent + hover, decorative accent, brand accent, focus ring, 3 lines, 3 semantic colors + washes, illustration fill). A palette without a value for a role is not finished.
2. **One base hue.** Pick the hue the product lives in (BKPath: pink, hue ≈ 330°). Surfaces are near-white tints of it (lightness 95–100%, low saturation); inks are deep shades of the same hue. Shared hue is what makes the page feel calm and of one piece.
3. **Action accent.** Same hue family, saturated, dark enough to pass as text (≥ 4.5:1) on every surface, and its inverse text (white in light) must pass on it. Hover is one step more emphatic: darker in light, lighter in dark.
4. **Decorative accent may be pastel**, below 3:1, but then it MUST NOT be the only carrier of meaning. Anything a user must see to operate the UI (a control's edge, the focus ring, a state ring) uses a token that reaches 3:1 (`--ink-soft`, `--focus-ring`, the semantic colors).
5. **Brand accent.** A hue clearly apart from the base (BKPath: blue against pink), used in under 1% of the page and only where §2.1 allows. Scarcity is what makes it read as brand.
6. **Semantic colors.** Green / amber / red families, desaturated to sit next to the base hue, at least ~30° of hue away from the action accent (error is terracotta, not rose, so an error never looks like a selection). Each has a wash for notices; the color on its own wash also passes 4.5:1.
7. **Contrast targets.** Text ≥ 4.5:1 on all four surfaces, including the hover tint (text sits on hovered rows). Non-text cues ≥ 3:1. Disabled is exempt. Ink steps stay distinguishable: muted is at least 1.2× the contrast of soft.
8. **Color vision.** Never tell two states apart by red vs green (or any hue pair) alone: add a shape (bead family) and a word. Check the palette in a color-blindness simulator before shipping.
9. **Derive dark, don't invert (§1.4).** Keep the hue; move surfaces to 7–20% lightness; lift accents until they pass (aim for 6:1+); give filled accents dark text; soften semantic colors one step.
10. **Verify.** Edit `tokens.css` (both themes) → mirror `PALETTE` in `config/theme/index.ts` → `npm run contrast:check` → look at the pages in light and dark → update the tables in §1.2.

### 1.4 Dark mode mapping and rationale

Dark mode is "the same room at night", not an inversion. Every token has a dark value (the `[data-theme='dark']` block in `tokens.css`); components never branch on the theme. The dark palette was reviewed on 2026-11-25 (contrast, hue, elevation, every page).

| Decision | Why |
|---|---|
| Canvas `#1A1216`, a plum-black, not grey or pure black | Keeps the pink undertone (hue ≈ 330°) so the brand still reads; pure black makes the rose glow and tires the eye |
| Elevation by lightness: canvas < blush < elevated < tint | Shadows are nearly invisible on dark; a lighter surface is how "on top" reads |
| Shadows become neutral black, not pink | A pink shadow on a dark surface looks like a glow, which implies focus |
| Rose lifts from `#B83E6C` to `#EC8DB2` | The light rose would be 2.9:1 on the dark canvas; the lifted rose is 7.9:1 |
| Filled accents carry dark plum text (`--ink-inverse` = `#2A1120`) | White on the lifted rose would fail (≈ 2.4:1); plum on it is 7.5:1 |
| Hover goes **lighter** in dark (`#F4A9C6`), darker in light | Hover means "more emphasis"; on dark, emphasis is brightness |
| Soft ink lifts to `#A08995` | It is used for text (section labels, table headers); the earlier `#8F7482` was 3.5:1 on the hover tint |
| Stamp inset line becomes dark plum instead of white | A white inner line on a light-rose button disappears |
| Semantic colors lighten and desaturate a step | Same meaning, AA on the dark canvas; washes are dark tints of the same hue |
| Sparkle `#B5718F` (muted) | Decorative borders should recede on dark, not compete with text |
| Brand blue lifts to `#7FB2EC` | Same role, 8.3:1 |
| Chart ramp reverses (brightest = done) | On dark the most finished stage should be the most visible (§3.12) |
| Scrim `rgba(0,0,0,.45)` | A plum scrim over dark is too weak to separate a modal |

The default theme is light; the theme toggle (`ThemeToggle`, in the topbar and on the login page) switches it, and the choice is remembered per browser.

### 1.5 Typography

| Role | Family | Size | Weight | Notes |
|---|---|---|---|---|
| Page title (H1) | Fraunces | 36px | 500 | `PageHeader` |
| Hero KPI | Fraunces | 44px | 500 | rose |
| KPI / semester code | Fraunces | 26–32px | 500 | `KpiCount`, `.kpi-count`, `.sem-code` |
| Section / group title (H2) | Fraunces | 19–22px | 500 | groups, sections, card / modal titles |
| Modal title | Fraunces | 26px | 500 | with a sans eyebrow above |
| Tab | Be Vietnam Pro | 15px | 400 / 600 active | |
| Nav item | Be Vietnam Pro | 13.5px | 500 / 600 active | |
| Section label (H5) / field label | Be Vietnam Pro | 10.5–11px | 600 | uppercase, 0.09–0.1em tracking, `--ink-soft` |
| Body, table text | Be Vietnam Pro | 13.5–14px | 400 | line-height 1.45 |
| Course code | Be Vietnam Pro | 12.5–13px | 600 | 0.02em tracking |
| Captions, hints, badges | Be Vietnam Pro | 11–12.5px | 400–600 | `--ink-muted` |
| KPI unit ("TC", "(kỳ 1 2027-2028)") | Be Vietnam Pro | 13px | 400 | muted, never wraps away from its number |

**Fonts are self-hosted** (`@fontsource/be-vietnam-pro` 400–700 and `@fontsource-variable/fraunces` with the optical-size axis, imported in `src/main.tsx`). Each font is split by `unicode-range` into Vietnamese / Latin-ext / Latin files, so the browser downloads only what a page uses, from our own origin. The serif token is `'Fraunces Variable', 'Times New Roman', Georgia, serif`: the fallback has Vietnamese glyphs on Windows (Georgia does not).

### 1.6 Space, radius, layout

- **Spacing scale** `--space-1…11` = 4, 8, 12, 16, 20, 24, 28, 32, 40, 44px. Use the scale; redefine tokens in a media query instead of editing rules.
- **Radius**: 4px for stamps, inputs, chips, menus (`--radius-xs`); 6px for modal and disclosure; full pills only for nav items and the delta pill.
- **Shell**: sidebar 230px (68px collapsed), topbar 58px (sticky), workspace max 1440px with `--space-page` padding.
- **Breakpoints**: ≤1024px the sidebar becomes the 68px icon rail and expands as an overlay; ≤860px info panels stack into one column and the topbar hides the account text; ≤900px the login brand pane hides.

### 1.7 Elevation

Only floating things get a shadow, and shadows are tinted, never grey: `--shadow-stamp` (primary button), `--shadow-pop` (menus, popovers, toasts, save bar), `--shadow-modal`. Content (tables, groups, cards) has no shadow.

### 1.8 Motion

Short and purposeful: 0.15–0.22s for hover, chevrons, sidebar width; 1.1–2.4s loops only for loading (pulsing sparkle, floating page, spinning status icon). `prefers-reduced-motion` disables all animation (`base.css`).

### 1.9 Scrollbar

Thin, transparent track, sparkle thumb (`scrollbar-width: thin; scrollbar-color: var(--accent-sparkle) transparent`). WebKit fallback: a sparkle→rose gradient thumb with a transparent border, rose on hover (`foundations.html`). antd tables get the same colors (they set their own `scrollbar-color`, which is overridden in `antd-skin.css`).

### 1.10 Language and content

- The UI is bilingual (VN default, EN). Vietnamese is the source text; English lives in `Frontend/src/i18n/en.json`. Course names, curriculum names and other data stay in Vietnamese in both languages.
- **Voice**: plain, short, second person ("bạn" / "you"). Labels in sentence case. Say what happened and what to do: "Không tải được dữ liệu để phân tích. Thử tải lại trang."
- Units: "TC" (credits; EN "cr"), semesters as "HK 261" (EN "Sem 261").
- Confirmation before every change that writes the student's data ("Đổi CO3049 sang “Đã hoàn thành”?" → Hủy / Đồng ý).
- Only offer what the backend supports: no control or text for a feature that does not exist.

---

## 2. Brand, icons, motifs, illustrations

### 2.1 Name, logo, brand accent

**Name: BKPath.** "Path" names the core feature (lộ trình), reads the same in Vietnamese and English, and keeps the link to the university ("BK"). The name and logo are temporary by design: one file each (§5.4).

**Mark** (`logo.html` → `components/shell/BrandMark.tsx`): a smiling folded page with mini schedule blocks (one rose, one brand blue, two outlined), a pencil leaning on its right edge and a customization gear at the top right, drawn in brand blue. No ring or box around it. Colors are tokens, so it follows the theme. Wordmark: "BK" in ink + "Path" in brand blue, Fraunces 20px/600.

- **Favicon**: the simplified 24px variant (`#logo-favicon`: page, face, two blocks, a filled blue gear, a pencil), inlined in `index.html` with the light colors.
- Sizes: full mark from 32px (sidebar and login: 40px); favicon variant for 16–24px.
- Variants: monochrome rose and light-on-plum (`logo.html`), both single-tone (the blue becomes the tone color).
- MUST NOT add a ring or a box around the mark, recolor the gear rose in the color version, set the wordmark in all caps, or place the mark on a saturated background.

**Brand blue (`--accent-brand`) means "where you are / where you're going"** and appears only in:

1. The logo (gear, one schedule block, "Path").
2. The current-semester badge icon in the topbar (`SemesterBadge`).
3. The next semester on the Gợi ý lộ trình timeline (solid blue sparkle + "KỲ TỚI").

Adding a place needs a design decision; the scarcity is what makes it read as brand.

### 2.2 Icons

- Set: **Phosphor** via `react-icons/pi` (no extra dependency); a few Lucide icons (`react-icons/lu`) remain in the Gợi ý lộ trình action rows. Regular weight for UI, Fill for warnings.
- Sizes: 16–18px in controls and nav, 14px inline with text, 20px for the disclosure icon.
- Color: icons take the color of their text (`currentColor`); semantic icons take the semantic color.
- Every icon-only button MUST have an `aria-label` (and a tooltip).

| Meaning | Icon |
|---|---|
| Tiến độ học tập / Chương trình / Gợi ý lộ trình / Tư vấn với AI / Hồ sơ | `PiChartLineUp` / `PiBookOpen` / `PiPath` / `PiRobot` / `PiUser` |
| A course's state | Not an icon: a bead (§3.8) |
| Conflict / over a limit | `PiWarningFill` / `PiWarningCircleFill` |
| Source of a value ("tự tính theo ngày") | `PiCalendarBlank` |
| Note / edit / close / delete | `PiNotePencil` / `PiPencilSimple(Line)` / `PiX` / `PiTrash` |
| Import / read file / save / undo | `PiFileArrowUp` / `PiFileMagnifyingGlass` / `PiFloppyDisk` / `PiArrowCounterClockwise` |

### 2.3 Motifs

| Motif | Means | Where it is allowed |
|---|---|---|
| **Thread + beads** | Progress through time, a course on a path | Progress thread, switch (bead on a thread), the Gợi ý timeline thread, course beads (§3.8), skeleton beads |
| **Sparkle** (4-point star) | Decoration, or "something is coming" | Semester checkpoints on the Gợi ý timeline (§3.9), tip of the progress thread, login title, loading (pulsing / twinkling), the "Chờ xếp" tray, the solver-success status icon. MUST NOT stand in for an icon with another meaning |
| **Folded page** | A document / a state of the page | Logo, illustrations (§2.4) |

### 2.4 Illustrations (page characters)

The mascot is the page with a blushing face from the logo; the illustrations are drawn from it. The mascot / drawing family can be changed (one file).

One drawing family: a folded page with a small face, pastel rose outline, blush disc. Colors are tokens, so they follow the theme (`components/EmptyState/illustrations.tsx`).

| Illustration | Meaning | Used by |
|---|---|---|
| Shy page peeking over a line | Empty / not started | `EmptyState illustration="blank"` (default) |
| Page napping on a cloud, "zzz" | Cannot reach the server | `illustration="offline"` |
| Sad page with "?" | Load failed / not found | `illustration="error"`, 404 |
| Surprised page + magnifier | No results for a search/filter | `illustration="no-results"` |
| Page with twinkling sparkles | Loading (a page opening) | `RouteLoading` |

---

## 3. Components

All components live in `Frontend/src/components/` (`shell/`, `ui/`, `Button`, `EmptyState`, …) and are exported from `@/components`. antd components are styled globally by `styles/antd-skin.css` and `components/Button/button.css`, so a raw antd component already follows the system; prefer the named components below when one exists.

### 3.0 Which component for which content

| You need to show… | Use | Not |
|---|---|---|
| The page's name and its one main action | `PageHeader` (title, subtitle, `extra` = primary button) | A card title |
| Sections of a page the user switches between | `PageTabs` (bar hides with one tab) | Segmented, buttons |
| Views or filters of the same data inside a section | antd `Segmented` (chips) | Tabs inside tabs |
| A small uppercase label above a block | `SectionLabel` | Bold text |
| Facts as label → value | `RowList` + `RowItem` (`chip` for codes to double-check); `RowList wrap` for many facts in columns; antd `Descriptions` renders the same rows | Bordered descriptions, 2-column tables |
| One number that matters | `KpiCount` (+ `ProgressThread` for part of a whole) | A chart |
| Several numbers side by side (Gợi ý) | KPI strip (`.kpi-strip`: label, serif count, small unit, hairline between cells) | Big colored sans numbers |
| Many records with columns | antd `Table` / `ITable` (skinned) | Cards in a grid |
| Items in a curriculum, by semester/block | Course cards (`board/`) or beads (`SemesterBoard`) | Tables |
| A course's state as a mark | `Bead` (ring family) | A solid dot, a colored icon |
| A flag on a row (unsaved, differs) | `Pip` (solid 6px dot) | A vertical stripe |
| A course's state with its word | `CourseStatus` (bead + label) / `CourseStatusSelect` | Colored tags |
| A long list that should start closed | `CollapsibleGroup` (bead + serif title + meta) | antd `Collapse` |
| An optional mode or form opened in place | `Disclosure` | A modal for something that stays on screen |
| A focused task with its own steps (import, confirm a review) | antd `Modal` + `ModalTitle` | A new page |
| "Are you sure?" before a change | `confirmThen` (Modal.confirm) or `Popconfirm` | Native `confirm()` |
| Any other category label | antd `Tag` (ring + text) / `TextTag` (plain) | Filled pills |
| A conflict on one row | `DiffFlag` + row class `is-diff` (terracotta pip) | A red row background |
| A limit being exceeded next to a count | `LoadWarning` | A notice far from the number |
| Where a value came from | `SourceBadge` | A tooltip only |
| A from → to change | `StatusChange` | Two columns |
| A note attached to a row | `NoteTrigger` + `NoteBox` (expanded row) | An input inside the cell |
| A state the page is in: solving, solved, unsaved edits, where content came from | `StatusLine` (band with an icon ring) | A notice |
| A problem to read or fix: a list of warnings, an error with fixes | antd `Alert` (notice: rule + wash), warning / error only | A status line, an info notice |
| Feedback after an action | toast (`toastMessage.*`) | A notice |
| Nothing to show | `EmptyState` (page / panel / compact) · `EmptyTableLine` in tables | Blank space |
| Data loading | `PageLoading` (pulsing sparkle + skeleton) · page opening: `RouteLoading` | A bare spinner |
| A text field | antd `Input` (underlined globally) / `FormField` | Boxed inputs |
| Search | `SearchLine` | A plain input with a button |
| An on/off option | `LabeledSwitch` (inline) / `ToggleRow` (settings list) | A checkbox for a setting |

### 3.1 App shell (`sidebar-topbar.html`)

`AppShell` (frame) + `Sidebar` + `SidebarNavSection` / `SidebarNavItem` / `SidebarFooterLink` + `Topbar` + `Breadcrumb` + `SemesterBadge` + `ThemeToggle` + `LanguageMenu` + `AccountMenu` (`components/shell/`, wired in `layouts/private/`).

- Sidebar: blush, chrome right edge, brand row (40px logo, no box + wordmark + collapse toggle) with a hairline under it, sections with uppercase titles, help link pinned to the bottom. Student items: Học tập › Tiến độ học tập, Chương trình, Gợi ý lộ trình, Tư vấn với AI; Tài khoản › Hồ sơ cá nhân. Active item: rose text, weight 600. Collapsed: icons with tooltips. One shared `ShellLayoutProvider` owns the collapsed state (wide screens remember the choice; narrow screens collapse by default and overlay when expanded).
- Topbar: sticky, translucent canvas with blur, chrome bottom edge. Left: breadcrumb (group › page). Right: semester badge (brand blue icon), theme toggle, language menu, account menu (profile, sign out).
- The menu is data (`config/sider-options`): add an item there with its group, icon, roles and permission; the shell renders it.

### 3.2 Buttons (`controls.html`, `components/Button`, `button.css`)

| Variant | Wrapper / antd | Use | Sizes |
|---|---|---|---|
| Primary stamp | `ISolidBtn` / `type="primary"` | The one main action of an area | 42 · small 36 · large 46 |
| Secondary stamp | `IOutLinedBtn` / default | Supporting actions | 40 · small 34 · large 42 |
| Tertiary | `ITextBtn` / `type="text"` | Cancel, undo, low emphasis | underline |
| Link | `type="link"` | Navigation, "see guide" | rose + sparkle underline |
| Icon | `IconBtn` | Close, edit in a row | 34px hairline box (28 small) |
| Danger | `color="danger"` | Delete, remove | blush-red stamp, fills on hover |

States: hover (primary darkens one step in light, lightens in dark; secondary turns rose on tint), focus (2px `--focus-ring` outline), disabled (locked: disabled surface + disabled ink, no shadow). The "Hủy" that antd draws itself in modals/popconfirms is restyled as tertiary.

### 3.3 Form controls (`controls.html`)

- **Text input / number / date / select**: underlined app-wide (`ConfigProvider variant="underlined"`), `--ink-soft` line, rose line on focus, terracotta line on error. Labels: 11px uppercase. Hints below in 11.5px muted; errors in terracotta.
- **Dropdown menu**: double-hairline stamp (sparkle border + inset hairline), hairline between options, blush hover, tint + rose check on the selected option.
- **Text area**: blush paste area (top hairline, bottom line, tints on focus), never a lone underline under several rows.
- **`SearchLine`**: magnifier, × clear, optional `/` shortcut hint (`slashShortcut`), `tinted` variant for dense toolbars.
- **Switch**: bead on a thread (all antd switches): off = `--ink-soft` ring on the thread, on = filled rose bead with a glow. `LabeledSwitch` for inline filters; `ToggleRow` for settings (title + description + switch).
- **Checkbox / radio**: native shape, `--ink-soft` edge (3:1), rose when checked.
- **Segmented** (`.chip`, `controls.html`): separate chips 8px apart (wrapping), each with a hairline border, 4px radius, canvas fill, muted 600 text; hover: sparkle border; selected: sparkle border, blush fill, rose text. No outer frame.

### 3.4 Data display

- **`SectionLabel`**, **`RowList` / `RowItem`** (label left, value right; long values wrap instead of overlapping), **`KpiCount`**, **`ProgressThread`** (2px track, sparkle→rose gradient, sparkle at the tip; percent clamped 0–100).
- **Descriptions** (antd): rendered as rows like `RowList`: label left, value right, no colon, hairline under each row, blush hover.
- **KPI strip** (Gợi ý lộ trình): cells split by a hairline; uppercase soft label, serif 32px count, 13px muted unit kept on the same line as its number; dims to 45% while the result is stale.
- **Table** (all antd tables): transparent, uppercase soft headers, hairline rows, tint hover, slim controls inside cells (28px), `is-diff` row class puts a terracotta pip before the first cell, expanded rows are blush (note boxes). Empty → `EmptyTableLine`.
- **Course status**: `CourseStatus` (bead + label in sage / rose / muted / terracotta), `CourseStatusSelect`, `FileMark` (✓ / --), `CourseCode`, `CourseOption` (search result: rose code, name, credits right).
- **Markers**: `DiffFlag`, `LoadWarning` (terracotta, left rule), `SourceBadge` (blush chip, rose text), `StatusChange`, `TextTag` (plain 11px tag), `CreditLabel` (sage when met), antd `Tag` (8px ring in the tone color + plum text; preset colors map to the palette).

### 3.5 Containers

- **`PageHeader`**: serif 36px title, 13px muted subtitle (max 640px), action bottom-right.
- **`PageTabs`**: underline tabs (15px, rose ink bar, 28px gap); hides the bar while there is one tab.
- **`CollapsibleGroup`**: chevron left (rotates 90°), bead (completed bead = met, empty ring = not met, none = n/a), serif 19px title, meta right (`CreditLabel` · `TextTag`), body indented 24px. Starts open unless `defaultOpen={false}` (curriculum groups start closed).
- **`Disclosure`**: blush row with sparkle border, rose icon, title + subtitle, chevron flips; panel below between hairlines. Controlled (the page owns `open`).
- **Card (antd, default)**: no box; a top hairline separates it.
- **Collapse (antd, default)**: no box; items separated by hairlines, body indented 24px.
- **Aside panel**: a side panel that holds settings for the main column (Gợi ý › Kịch bản) sits on blush, sticky under the topbar, with `--line-hairline-on-blush` between its sections; collapsed it becomes a blush rail with a vertical label.
- **Section (page-level)**: hairline on top + serif 21px title + optional hint (`.analysis-section`).

### 3.6 Feedback and overlays

- **`StatusLine`** (`feedback.html`): a band on blush between two hairlines, padding 12/16; a 24px icon ring (canvas fill, border in the tone color) + bold title, then a muted detail or a list, optional action. Tones and icons: `good` (sparkle, chrome lines), `rose` (path; edited, not checked; tint band, sparkle lines), `warn` (warning circle, amber wash), `err` (x circle, terracotta wash, `role="alert"`), `info` (info), `loading` (spinning icon, `aria-busy`). On Gợi ý lộ trình there is exactly one, between the KPI strip and the timeline, in this order of priority: solving > "Đã sửa N chỗ, chưa kiểm" > cannot solve (with fixes) > solved with N warnings > solved.
- **Notice** (antd `Alert`): 2.5px left rule + wash + bold title in the semantic color. Only for problems (warning / error); an info or success message is a `StatusLine`, because a washed block reads as "something is wrong".
- **Toast**: white sheet, sparkle edge, 3px left rule and icon by type (`App.tsx` `toastIcon`).
- **Confirm popover**: warm paper, double hairline, message and buttons on one line, no icon.
- **Modal** (`feedback.html`): sparkle border, 6px radius, 28/32px padding, `ModalTitle` (rose uppercase eyebrow + serif 26px title), hairline under the header and over the footer, 34px hairline close box, footer = tertiary cancel + primary action; backdrop = scrim + 3px blur. Inside: `UploadZone` (dashed blush band), `StepList` (serif rose numbers), paste area.
- **`EmptyState`**: `illustration` × `size` (`page` 96px + serif title, `panel` 72px, `compact` 52px).
- **Loading**: `RouteLoading` (floating sparkle page: page opening, session check); `PageLoading` / `TablePageSkeleton` (pulsing sparkle + skeleton rows) for every page-level load.

### 3.7 Page patterns

| Page | Pattern | Source |
|---|---|---|
| Login / register | Split editorial (`dang-nhap.html`): blush brand pane (logo, eyebrow, serif headline, feature thread, disclaimer) + form canvas (serif title + sparkle, underline fields with icons, large primary, "hoặc", large secondary, theme toggle + language menu top right) | `layouts/auth`, `pages/auth` |
| Tiến độ học tập › Tiến độ | Header + import button + tabs → info panel (rows left, KPI + progress right) → `Disclosure` (edit mode) → closed `CollapsibleGroup`s with course tables (`tien-do-hoc-tap-page.html`) | `pages/courses` |
| Tiến độ học tập › Phân tích | Overview (two columns + two charts) → warnings group → detail tabs (missing courses, options, next semester, roadmap, graduation requirements) | `pages/courses/analysis` |
| Chương trình | Header "Chương trình CS-…" + the editable curriculum board: toolbar (search, status filter, template / import, save), bead legend, view chips (semester, block, groups, specializations, catalog), course cards, floating save bar | `pages/program`, `pages/courses/board` |
| Gợi ý lộ trình | KPI strip, solver `StatusLine`, semester timeline (§3.9), action bar (primary Giải, tertiary Hoàn tác, secondary Lưu bản này), scenario aside on blush. So sánh: metric table (better value in sage, bold) and an assumptions table where differing rows get a rose pip and full ink, equal rows recede to muted | `pages/recommendations` |
| Admin lists | Header + primary "Thêm", search/filter row, skinned table, modals for edit | `pages/admin` |

### 3.8 Bead family (`semester-timeline.html` §B, `components/ui/Bead.tsx`)

A course is a ring: a bead with a hole, on the curriculum's thread. Its **shape** carries the state; color reinforces it, so the state reads without color.

| State | Bead | Color |
|---|---|---|
| Chưa khai (not declared) | faint dotted ring | `--ink-soft` |
| Chưa học (not started) | empty ring | `--ink-muted` |
| Đã lên kế hoạch (planned) | dashed ring | rose |
| Đang học (in progress) | half-filled ring | rose |
| Đã hoàn thành (completed) | filled with a pinhole | sage |
| Chưa đạt (failed) | ring with a slash | terracotta |
| Gợi ý (a suggested course on the timeline) | pink ring (`suggest`); amber ring when it has a warning; dashed for a free-elective slot | sparkle |

`<Bead state tone? dashed? size?>`; 10px by default, 1.6px ring. A solid 6px `Pip` is a flag on a row, never a state. Used by: course cards and the catalog column (Chương trình), the board legend, `CourseStatus`, `CollapsibleGroup`, the Gợi ý timeline; antd `Tag` draws the same ring in its tone color.

**Course card** (Chương trình board): no box; bead + code (600) + credits, two-line muted name, status word. Click = change status; a text row under it holds "+ Lên kế hoạch" or "− HK 262 + ×"; a small arrow at the top right opens the course page; an amber pip when unsaved. Hover = tint.

### 3.9 Semester timeline (`semester-timeline.html` §A, `pages/recommendations/SemesterBoard.tsx`)

- **Thread**: runs down a 28px gutter on the left. Above the first row it fades in (the past); between planned semesters it is a 1.5px dashed sparkle line; it ends at the graduation semester. Each row draws the segment above and below its checkpoint, leaving a gap around the marker. Rows are still separated by hairlines across the page.
- **First row: the past.** "231 – 261 · Đã qua 6 kỳ · đang ở 261 · tích lũy 105/128 TC" with a completed bead and a mini progress thread.
- **Checkpoints**: next semester = solid brand-blue sparkle + "KỲ TỚI"; other semesters = hollow sparkle (blush fill, rose outline); graduation semester = solid rose sparkle with a glow + "RA TRƯỜNG"; switched-off and summer semesters fold into a thin row with a small ring. Solid sparkles have a canvas outline so they stand out from the thread.
- **Row**: serif code (26px), credits, labels, "→ 121/128 TC" (credits accumulated after the semester), controls (nghỉ / học hè, "muốn … TC"); course beads (pink rings + code + two-line name).
- **After graduation**: empty semesters are hidden behind one muted line ("Sau kỳ ra trường: 272, 273, 281 — không có môn, đã ẩn"); they reappear while a course is being moved or dragged, as move targets.
- **Interaction**: clicking a bead expands a blush section under the semester's beads with the course's facts and actions (move, pin, not offered, assume fail, swap within block); several can be open, × or a second click closes. "Chuyển kỳ…" turns on move mode: rows that can take the course turn blush with "Chuyển vào đây", the others fade with the reason; drag and drop also works.

### 3.10 Accessibility requirements

- Text contrast AA on every surface (§1.2); non-text cues 3:1; `npm run contrast:check` passes.
- Focus visible on every control: 2px `--focus-ring` outline.
- Status is never color alone: bead shape + word, or a word ("Khác file tiến độ").
- Icon-only controls have `aria-label`; collapsibles use `aria-expanded` / `aria-controls`; the progress thread is a `progressbar`; error status lines are `role="alert"`.
- `prefers-reduced-motion` respected; the sidebar works by keyboard; `<html lang>` follows the language.

### 3.11 Internationalization in components

Write the Vietnamese text through `t()` (hook) or `i18n.t()` (anywhere), interpolate with `{{name}}`; module-level label maps are wrapped in `trLive(...)`. See §5.6.

### 3.12 Charts

- Progress series (done, in progress, planned, suggested) are **ordinal**: one rose hue stepped by lightness, remaining = hairline track. Light `#7A2A4E → #B83E6C → #D9709A → #E99AB9`; dark reversed `#F5BCD1 → #EC8DB2 → #C9628E → #9A4A6E`.
- Categorical data (syllabus components) uses the validated categorical palette in `charts.tsx`.
- Chart text (axis labels, legends) is `--ink-muted` at full opacity (the chart library's default grey fails contrast).
- Canvas charts cannot read CSS variables, so their hex values live in `charts.tsx` (`SERIES_COLOR`, `ink`) and MUST mirror the tokens.
- Legends always name the series; text uses ink tokens, never series colors.
- **The prerequisite graph (Chương trình › Sơ đồ điều kiện) is a placeholder.** It is a temporary feature, has not been design-reviewed and is intended to be removed. It is outside this system: do not copy its look (edge colors, node boxes) elsewhere.

---

## 4. Designing a new page

### 4.1 General rules (every page)

1. **Template first.** A new visual pattern starts as (or in) a template in `ui-template/`; the page then implements it.
2. **Start from the shell.** Add the page to `config/sider-options` (group, icon, label) and the routes; the shell, breadcrumb and access check come for free.
3. **One `PageHeader`.** Serif title = the sidebar label; one-sentence subtitle saying where the data comes from; at most one primary action in `extra`.
4. **Tabs only for sections.** Use `PageTabs`; with one section there is no bar.
5. **Lines, not boxes.** Separate blocks with hairlines and white space (24–40px). No bordered cards with shadows. Rules run across, not down.
6. **Serif for what you read first, sans for the rest.**
7. **Pick components from §3.0.** If nothing fits, compose existing ones before inventing; a new component goes into `components/ui` with its CSS (§5.5).
8. **One primary per area; destructive actions are danger stamps and confirm first.**
9. **Every state designed**: loading (`PageLoading`), empty (`EmptyState` with the right character and a next step), error (`illustration="error"` / `offline`), no results (`no-results` + clear filters).
10. **Course states are beads; flags are pips; conflicts are terracotta; brand blue only where §2.1 allows.**
11. **Tokens only**: no hex, no inline colors; spacing from the scale.
12. **Text through `t()`**, Vietnamese source + English in `en.json`; run `npm run i18n:check`.
13. **Check both themes and both languages** before calling it done (dark mode and English are the two places new pages usually break).

### 4.2 Rules by page type

| Page type | Specific guidance |
|---|---|
| **Overview / dashboard** | Top: two-column info panel (`RowList` left, `KpiCount` + `ProgressThread` + rows right). Charts below in a two-column grid with `SectionLabel` titles. Warnings as one `CollapsibleGroup` (open when there is an error). |
| **Record detail** (a course, a curriculum) | `RowList` / Descriptions facts first; long text in sections with serif H2; related lists as skinned tables; edit in a `Disclosure` or modal. |
| **Editable list** (progress, board) | Edits happen in place behind an explicit mode (`Disclosure`) or a draft with a floating save bar; every change confirms; unsaved changes carry an amber pip and survive reloads (draft storage). |
| **Planner / timeline** | Time runs top to bottom on the thread; semesters are sparkle checkpoints; items are beads; "next" is the blue sparkle; drop targets light up blush; impossible targets fade with the reason. |
| **Admin table** | Header + primary "Thêm"; filters as `SearchLine` + selects in one row; small icon buttons in rows; delete = danger + `Popconfirm`; forms in modals with underline fields. |
| **Form / settings** | Labels above fields; hints below; `ToggleRow` for on/off settings; primary "Lưu" at the end; tertiary "Hủy". |
| **Auth / onboarding** | Split editorial layout; no sidebar; language menu top right; large stamps, block width. |
| **Chat** (AI advisor) | Thread with user messages right, answers left in plain text with rows/chips for recommendations; composer = paste area + primary send; empty thread = sparkle page + starter prompts. |

### 4.3 Review checklist

- [ ] Matches its template; uses only tokens; looks right in light and dark.
- [ ] `npm run contrast:check` passes (if a color changed).
- [ ] One primary action per area; destructive actions confirm.
- [ ] Loading, empty, error and no-results states exist.
- [ ] All UI text goes through `t()`; `npm run i18n:check` passes; English reads naturally.
- [ ] Keyboard focus visible; icon buttons labeled; status not color-only (bead shape + word).
- [ ] Brand blue only where §2.1 allows; sparkle not used as an icon with another meaning.
- [ ] Narrow screen (≤1024px) still works.

---

## 5. Changing the design

### 5.0 Workflow

1. Change the template in `ui-template/` (or add one) and agree on it.
2. Port it: tokens in `tokens.css`, components in `components/`, page CSS next to the page.
3. Check: `npx tsc -p tsconfig.app.json --noEmit`, `npx eslint src`, `npm run i18n:check`, `npm run contrast:check`, and look at the page in light / dark and VN / EN.
4. Update this document.

### 5.1 Where every decision lives

| Decision | File(s) |
|---|---|
| Visual source of truth | `ui-docs/ui-template/*.html` |
| Colors, spacing, radius, shadows, layout sizes (light + dark) | `Frontend/src/styles/tokens.css` |
| The same colors for antd components | `Frontend/src/config/theme/index.ts` (`PALETTE`, `buildAntdTheme`) |
| Contrast rules | `Frontend/scripts/contrast-check.cjs` |
| Fonts | `Frontend/src/main.tsx` (`@fontsource` imports), `--serif` / `--sans` in tokens, `FONT` in `config/theme`, `--font-*` in `styles/index.css` |
| Type scale | `Frontend/src/styles/typography.css` and component CSS |
| antd component look (tables, inputs, menus, notices, modal, switch, segmented, descriptions, tags, …) | `Frontend/src/styles/antd-skin.css` |
| Buttons | `Frontend/src/components/Button/button.css` |
| Shell | `Frontend/src/components/shell/*.tsx`, `shell.css` |
| Design-system components (incl. `Bead`, `Pip`, `SparkleMark`) | `Frontend/src/components/ui/*.tsx`, `ui.css`, `controls.css` |
| Page layouts | next to the page (`mybk-progress.css`, `board.css`, `analysis.css`, `recommendations.css`, `layouts/auth/auth.css`) |
| CSS import order (cascade layers) | `Frontend/src/styles/index.css` |
| Name, wordmark, logo, favicon | `Frontend/src/config/brand.ts`, `components/shell/BrandMark.tsx`, `Frontend/index.html` |
| Illustrations | `Frontend/src/components/EmptyState/illustrations.tsx` |
| Menu | `Frontend/src/config/sider-options/index.tsx` |
| English text | `Frontend/src/i18n/en.json` |
| Chart colors | `Frontend/src/pages/courses/components/charts.tsx`, `--viz-*` in `styles/components.css` |

**Cascade layers.** `index.css` declares `theme, base, antd, components, utilities`; antd's styles are placed in the `antd` layer by `<StyleProvider layer>` (`App.tsx`), so our component layer overrides antd. Component CSS MUST be imported from `index.css`, never from a `.tsx` file (a JS-imported CSS file can be emitted first and reorder the layers).

### 5.2 Change a color

1. Edit the token in `tokens.css` (both the `:root` and the `[data-theme='dark']` value).
2. Mirror it in `config/theme/index.ts` `PALETTE` if antd uses it; mirror it in `charts.tsx` if charts use it.
3. Run `npm run contrast:check`; follow §1.3 for anything it flags.
4. Look at the pages in both themes; update §1.2.

### 5.3 Change fonts or the type scale

Install the new font from `@fontsource` (with its Vietnamese subset), swap the imports in `src/main.tsx`, the `--serif` / `--sans` tokens, `FONT` in `config/theme` and `--font-*` in `styles/index.css`. Keep a fallback that has Vietnamese glyphs. Sizes live in `typography.css` and component CSS.

### 5.4 Change the name or logo

Edit `logo.html` first. Then `config/brand.ts` (name + wordmark parts), `components/shell/BrandMark.tsx` (SVG, token colors), and `index.html` (title, description, favicon data URI with the light colors written in). Keep the brand accent rule (§2.1).

### 5.5 Change or add a component

- Look of an antd component everywhere → `antd-skin.css` (key on antd's classes; check antd 6 class names, they changed from v5).
- A new design-system component → `components/ui/<Name>.tsx` + rules in `ui.css` / `controls.css` (inside `@layer components`, tokens only), export from `components/ui/index.ts` and `components/index.tsx`, add it to the §3.0 table.

### 5.6 Add or change text (i18n)

1. Write the Vietnamese in code: `t('Đã lưu {{count}} môn', { count })` in components, `i18n.t(...)` elsewhere; module-level label maps: wrap the object in `trLive(...)`.
2. Add the English to `src/i18n/en.json` (same key).
3. `npm run i18n:check` lists missing/unused keys (exits 1 when something is missing).

**Changing existing text** (content edits later): one command updates the code and `en.json` together.

```bash
npm run i18n:rename -- "Đã lưu {{count}} môn" "Đã lưu {{count}} học phần"            # new Vietnamese, English kept
npm run i18n:rename -- "Đã lưu {{count}} môn" "Đã lưu {{count}} học phần" --en "Saved {{count}} courses"
npm run i18n:rename -- "Đã lưu {{count}} môn" "Đã lưu {{count}} môn" --en "{{count}} courses saved"   # English only
```

- Add `--dry` to preview. It replaces every string literal exactly equal to the old text (any quote style) and renames the key in `en.json` in place; it lists each `file:line` it changed.
- Nothing is written unless every check passes: it refuses when the new text already exists in `en.json` with a different English, and stops when the old text is found nowhere. It warns when the `{{placeholders}}` differ.
- Read the listed lines: a literal that is compared or parsed rather than shown (for example the `"[Trả lời lựa chọn]"` marker split out of advisor messages) must keep matching the backend; revert that line if so.
- For text with a line break, call `node scripts/i18n-rename.cjs` directly (npm on Windows drops such arguments).
- Then run `npm run i18n:check`.

Do not translate data that is compared or parsed (file headers, codes).

### 5.7 Dark mode

Add the dark value next to every new color token. Never write `[data-theme='dark']` rules in component CSS unless the change is structural (none exist today).

### 5.8 Packages the design system depends on

Versions as in `Frontend/package.json`. **New** = added during the 2026-11 redesign.

| Package | Version | Role in the UI | Notes |
|---|---|---|---|
| `antd` + `@ant-design/cssinjs` | ^6.3.1 / ^2.2.0 | Base components (table, inputs, select, modal, tabs, segmented, …), themed by `config/theme` and restyled by `antd-skin.css` | `<StyleProvider layer>` puts antd's CSS in the `antd` cascade layer so our `components` layer wins (§5.1) |
| `tailwindcss` | ^4.2.1 | Base reset and the `@theme` font variables (`@import "tailwindcss"` in `styles/index.css`) | No utility classes are used in components; styling is tokens + plain CSS |
| `react-icons` | ^5.6.0 | Icons: Phosphor (`react-icons/pi`) everywhere, a few Lucide (`react-icons/lu`) in Gợi ý action rows | Same Phosphor set as the templates (`@phosphor-icons/web` from a CDN there) |
| `react-toastify` | ^11.0.5 | Toasts (`toastMessage.*`), skinned in `antd-skin.css`, icons in `App.tsx` | |
| `@ant-design/plots` | ^2.6.8 | Charts on Phân tích (`charts.tsx`): bar / column / ring | Canvas: colors are hex values mirrored from the tokens; axis and legend text forced to `--ink-muted` (§3.12) |
| `@xyflow/react` | 12.12.1 | Prerequisite graph (Chương trình › Sơ đồ điều kiện) | **Placeholder** feature, outside the system, to be removed (§3.12); removing it removes this dependency |
| `i18next` + `react-i18next` | ^27.2.7 / ^18.0.3 | **New.** VN / EN switch: `t()` / `i18n.t()`, Vietnamese text as keys, English in `src/i18n/en.json` (§5.6) | Tooling in `Frontend/scripts`: `i18n:check`, `i18n:rename` |
| `@fontsource/be-vietnam-pro` | ^5.3.0 | **New.** Sans font, weights 400 / 500 / 600 / 700, self-hosted | Replaced the Google Fonts link; files split by `unicode-range` (Vietnamese / Latin-ext / Latin), imported in `src/main.tsx` |
| `@fontsource-variable/fraunces` | ^5.3.0 | **New.** Serif font, variable (weight + optical size), self-hosted | Family name `'Fraunces Variable'`; the serif token falls back to `'Fraunces'` (templates load it from Google Fonts), then `'Times New Roman'` |

Scripts in `Frontend/scripts/` (no extra dependencies, plain Node): `contrast-check.cjs` (`npm run contrast:check`, §1.3), `i18n-check.cjs` (`npm run i18n:check`), `i18n-rename.cjs` (`npm run i18n:rename`, §5.6).

Adding a UI package: prefer what is already here (antd, Phosphor, tokens + CSS). A new one must work with the cascade layers, follow both themes through tokens (or mirror them like the charts), and support Vietnamese text; record it in this table.

---

## 6. Known issues and backlog

| Item | Status / suggestion |
|---|---|
| Gợi ý: "tích lũy" credits | Computed as required total minus credits still planned; can differ by a credit or two from Phân tích's earned figure when the solver's remaining set differs from the analysis |
| ASCII-only Vietnamese words | Detected by a word list (TC, MSSV, HK, Khoa); new ones need `t()` by hand |
| Not translated on purpose | Course / curriculum names (data), Excel template headers (file format), AI advisor context, official program list |
| Prerequisite graph | Placeholder, not design-reviewed, intended to be removed (§3.12) |
| Gợi ý lộ trình: some inline layout remains in `EngineReportCard` (tag rows) | Move to classes when the page is finalized |
| Admin, profile, advisor, course detail | Follow the system through the global skin; no page-specific template yet; admin pages not yet checked visually |
| Help page | Link present ("sắp có"); no page |
