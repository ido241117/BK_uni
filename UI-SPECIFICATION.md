(Light mode first)

##  **Color System & Surface Hierarchy** {#color-system-&-surface-hierarchy}

The objective is a **light-pink, minimal, line-driven** aesthetic (avoiding heavy "boxed" layouts), color must do the work of separation through subtle tonal washes and hairline dividers rather than drop shadows or thick borders.

Where to look for the color theme: 
- src/styles/tokens.css: the single source of color. It has the light palette, the dark palette (not reviewed yet), and at the bottom the old names (--brand etc.) mapped to the new colors, to be removed later.
- src/config/theme/index.ts: PALETTE, the same colors copied for antd. Change a color in both files.
- index.html: browser theme color and the favicon colors
- The illustrations (src/components/EmptyState/illustrations.tsx) and the logo (src/components/shell/BrandMark.tsx) use the CSS color variables, so they follow the theme automatically.

### **Color Palette** {#color-palette}

Monochromatic pink

\#3B2230, \#B83E6C, \#E58FB0, \#FBEDF2, \#FDF4F7

Main theme color: \#B83E6C 

Color distribution of the web:

- 60%:   
- 30%:  
- 10%: 

### **Backgrounds & Surfaces** {#backgrounds-&-surfaces}

* **Primary Canvas (\--bg-canvas):** \#FFFFFF — Pure crisp white for the main content workspace to keep dense academic data breathable.  
* **Soft Pink Ambient Wash (\--bg-blush):** \#FDF4F7 — Used sparingly for the Global Left Sidebar, the collapsible Scenario Panel (aside), and active row hover/selection highlights.  
* **Warm Paper / Elevated Popover (\--bg-elevated):** \#FFF8F4 or \#FFFFFF — Reserved strictly for floating tooltips, dropdown menus, and active bead popovers.  
* **Interactive Tint (\--bg-tint-hover):** \#FBEDF2 — Used for subtle row highlights in comparison tables and hover states inside action menus.

### **Ink & Typography Colors** {#ink-&-typography-colors}

* **Primary Ink (\--ink-primary):** \#3B2230 — A deep plum-charcoal rather than harsh \#000000, keeping high contrast while harmonizing with pink undertones.  
* **Secondary / Muted Ink (\--ink-muted):** \#8E6B78 — Dusty mauve for labels, descriptions, inactive tabs, and metadata.  
* **Subtle / Disabled Ink (\--ink-soft):** \#BE9EAA — Pale rose-taupe for placeholders, disabled states, and helper notes.  
* **Inverse Text (\--ink-inverse):** \#FFFFFF — Used exclusively on solid primary rose buttons and active segmented toggles.

### **Accents, Sparkles & Dividers** {#accents,-sparkles-&-dividers}

* **Primary Brand Rose (\--accent-rose):** \#B83E6C — Deep berry-rose for primary CTAs (Giải), active tab underlines, active indicators, and key KPI numbers. This is the primary dark color  
* **Rose Hover (\--accent-rose-hover):** \#A03460 — Deepened rose for primary button hover states.  
* **Sparkle / Node Pink (\--accent-sparkle):** \#E58FB0 — Mid-tone pastel rose for timeline dots, course beads, active rings.  
* **Soft Blush Glow (\--accent-glow):** rgba(229, 143, 176, 0.22) — Used as a radial halo around active dots or sparkle icons instead of drop shadows.  
* **Hairline Dividers (\--line-hairline):** \#F3E3EA (on white) and rgba(59, 34, 48, 0.13) (on blush) — 1px crisp structural lines that replace card borders.  
* **Taskbar & Topbar dividers (somehow called Chrome Divider) (\--line-chrome)**: \#E4B7CB (\#F3E3EA but more saturated) for structural dividers that separate "app chrome" from "workspace": topbar bottom border, and the sidebar's right border.   
* **Temporary Logo Color (--accent-teal)**: 

hairline \= "this is a boundary within content," chrome divider \= "this is the edge of an app region." 

### **Semantic Status Colors (Harmonized to Warm/Pastel Palette)** {#semantic-status-colors-(harmonized-to-warm/pastel-palette)}

* **Success / Optimal (\--sem-good):** \#5E7F5D (Sage Green)  
* **Warning / Summer (\--sem-warn):** \#A0702A (Warm Amber)  
* **Error / Conflict (\--sem-err):** \#AE4B33 (Terracotta Red)


##  **Typography**

The design pairs an expressive, high-contrast serif (**Fraunces**) for editorial focal points with a clean geometric Vietnamese-optimized sans-serif (**Be Vietnam Pro**) for UI controls and dense course data.

The whole point of having two families is the contrast: Fraunces signals "this is a moment" (the one big serif per page), Be Vietnam Pro signals "this is information, read it normally." If the subtitle also goes serif, the H1 stops feeling special — it's just more serif text, slightly bigger. There's also a practical reason: Be Vietnam Pro is built for dense Vietnamese text with full diacritic support at small sizes; Fraunces is an editorial display face, gorgeous at 36–44px but not really made for a wrapped paragraph of body copy with tone marks.

Where to look for the typography rules:  (paths from Frontend/):
- index.html: loads the two fonts (Google Fonts link)
- src/styles/tokens.css: the --serif and --sans font variables
- src/styles/typography.css: the type scale (which elements are serif, sizes, weights)
- src/styles/base.css: body font and size; h1/h2 set to serif
- src/styles/index.css: layer order, plus the Tailwind font classes (font-sans, font-serif)
- src/config/theme/index.ts: FONT, the font antd uses for its components
- src/components/shell/shell.css: text styles for the sidebar and topbar

### **Font Families**

* **Display & Editorial Serif:** 'Fraunces', Georgia, serif (Weights: 400, 500)  
* **UI, Body & Data Sans:** 'Be Vietnam Pro', system-ui, sans-serif (Weights: 400, 500, 600, 700)

3. ## **Button**

- Primary Button: “Nhập tiến độ học tập”, “Lưu hiệu chỉnh”, “Giải”, “Lưu kế hoạch”
  - Main hue:
  - Danger hue: e.g. delete button.   
- Secondary Button:  
- Tertiary / ghost text button: “Hủy” (trong bản hiệu chỉnh môn đang học) 

Where to look up button: 
- ...
- One button still looks old? Inspect it in the browser and check its classes. If it isn't an antd .ant-btn (a hand-made <button> with its own class in components.css), button.css doesn't reach it, and it gets fixed when that page is rebuilt.

4. ## **Responsive Design Strategy** {#responsive-design-strategy}

Three concrete habits, applied now rather than retrofitted later:

* **Tokenize everything that changes at a breakpoint.** I already added `--nav-width` / `--nav-width-collapsed`. Extend that to a small spacing scale (`--space-2: 8px; --space-3: 12px; --space-4: 16px...`) instead of scattering literal `9px`, `20px`, `44px` through the file. When you need to tighten spacing at a smaller screen, you redefine the tokens once inside a media query instead of hunting every rule:

```css
@media (max-width: 1024px) {
  :root { --nav-width: var(--nav-width-collapsed); }
  .topbar { padding: 0 24px; }
}
```

* **Decide collapse behavior by breakpoint, not just by click.** Right now the toggle is the only thing that adds `.collapsed`. For auto-behavior at narrow widths, add a `matchMedia` listener that toggles the same class, but track user-intent separately so a manual expand isn't fought by the auto-rule:

js

```js
const mq = window.matchMedia('(max-width: 1024px)');
let userOverride = null; // null = follow breakpoint, true/false = user forced it
function applyState() {
  const shouldCollapse = userOverride ?? mq.matches;
  sidebar.classList.toggle('collapsed', shouldCollapse);
}
mq.addEventListener('change', applyState);
toggleBtn.addEventListener('click', () => { userOverride = !sidebar.classList.contains('collapsed'); applyState(); });
applyState();
```

* **In React, make Sidebar/Topbar controlled, not self-managing.** Both should take `collapsed`/`onToggle` as props from one shared layout state (context or a parent `AppShell` component), not keep independent `useState`. That's what lets the main content area react to sidebar width (e.g. `margin-left: var(--nav-width)`) without prop-drilling or duplicated breakpoint logic in two places.

## **Components**

### **Logo**

### **Side bar (collaspsible)** 

- **Logo**  
- **Collapse button**:  next to the logo. This is a persistent, frequently-reused control, so it belongs somewhere that doesn't move; a footer position drifts if you ever add more footer content (help card, account block, etc.), and users expect the toggle near the brand mark in most sidebar patterns.  
- **Sections**: A simple two-level component:  
  - Title: e.g. “Học tập”.  
  - Items: e.g. “Tiến độ học tập”, “Gợi ý lộ trình”.

```
<SidebarNavSection title="HỌC TẬP">
  <SidebarNavItem icon="chart-line-up" label="Tiến độ học tập" />
  <SidebarNavItem icon="path" label="Gợi ý lộ trình" active />
</SidebarNavSection>
<SidebarNavSection title="TÀI KHOẢN">
  <SidebarNavItem icon="user" label="Hồ sơ cá nhân" />
</SidebarNavSection>
```

`SidebarNavSection` owns the uppercase label \+ the hairline below it; `SidebarNavItem` owns icon/label/active-state/sparkle-indicator. 

- **Help/Instruction button**: at the bottom of the side bar. Things such as: “Q\&A” or “Click here for a quick instruction”, etc.

### **Top bar** {#top-bar}

1. **Breadcrumb**: e.g. “Học tập \> Gợi ý lộ trình”.  
2. **Dark/light toggle**  
3. **Language**: EN/VN  
4. **Logout**: fold it into the account dropdown mentioned above rather than a standalone icon button, so there's one account menu instead of a loose action floating next to language/theme. (?)  
5. **Help**: standalone icon button is fine since it's not account-specific (general FAQ/help center, not tied to who's logged in). (?)  
6. **Current semester badge**: e.g. “Học kỳ hiện tại: HK261”, worth keeping as a persistent topbar element rather than re-stating it per-page.

So topbar left-to-right: breadcrumb → (flex space) → semester badge → theme toggle → language → help → account menu (avatar, opens name/email/profile-link/logout). (?)

### Workspace header + Description

### Disclosure
 Why Disclosure is controlled but CollapsibleGroup isn't: the disclosure panel holds a form whose "Lưu"/"Hủy" buttons must close it, so the page has to own that state. A group only opens and closes itself, so it keeps its own state.

### Collapsible Group
 What CollapsibleGroup gives a page: one tested block for open/close state, chevron rotation, the status dot and accessibility (aria-expanded). Every group on every page looks and behaves the same, and a design change is one edit in ui.css.

 Chevron doesn't rotate: check that the <section> gets data-open="true" (Inspect), then the .course-group[data-open='true'] .chev rule in ui.css.

### Table
small uppercase soft headers, hairline rows, pink hover.



## **Empty/Unavailable Pages**

### **Whole Page**

- **Cannot connect to backend / network offline:** Disconnected plug, broken signal/cloud, or server/sparkle motif \+ **Retry (`Thử lại`)** action and reassurance that local/unsaved work isn't lost.  
- **Page not found / route unavailable (`404` or dead link):** Lost map/compass/folded page \+ **Go back (`Quay lại`)** or **Home (`Về trang chủ`)**.

### **Workspace**

- **Cannot load workspace:** Workspace frame/folder with a warning/retry badge \+ **Reload workspace** or **Switch workspace** button.  
- **Empty workspace (brand new):** Clean folder/sheet with a primary creation CTA (e.g., create first plan/project/template).  
- **No access / restricted workspace:** Lock or shield accent on a sheet/folder \+ clear explanation (no lecturing, just what happened and who/how to request access).

### **Tab & Panel States**

Used inside sub-tabs (like switching between `Lộ trình` and `So sánh` in your app) or side panels.

* **Cannot load data in a tab:** Compact version of the error/retry state—avoid giant `60px` vertical padding if the tab lives inside a tight pane; keep the icon smaller (\~`48px–64px`) with a lightweight inline **Retry** link/button.  
* **Tab has nothing to compare / nothing saved yet:** E.g., when opening `So sánh` before saving any scenarios—points the user to save a snapshot or pick another source.

### **Table, List & Grid States** 

Used inside data tables, rows, or cards.

* **Cannot load table:** Table skeleton/grid lines with a subtle retry cue—visually communicates *"table structure exists, rows didn't load"* rather than *"no rows exist."*  
* **Table is genuinely empty (0 records):** Simple document/row icon \+ short message \+ primary add/import action if applicable.  
* **Empty filter / search result:** Magnifying glass \+ soft page/list \+ **Clear filters (`Xóa bộ lọc`)** action so users know data exists, just not matching current filters.

Empty/Unstarted page: shy peeking page
Connection failure: cloud nap face + zzz signs
Load failure / not found: sad face page + question mark
No results: A suprised face page with a magnifying glass

**Loading Page:**  


## Layers