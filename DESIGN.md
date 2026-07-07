# Design System — Agent Monitor

Cyberpunk Neon Pixel + Retro-Futurism hybrid.  
Reference: `preview.html`

---

## 1. Philosophy

- **Pixel art edges** — sharp corners, no `border-radius`. Everything is blocky, angular.
- **Neon glow** — multi-color light-pool ambiance, CRT scanline overlay, HUD corner brackets.
- **Readability first** — pixel fonts only for UI chrome (headers, buttons, labels). All content/data uses readable sans-serif and monospace.
- **Light/dark dual-theme** — all tokens have both modes. Dark is neon-on-void. Light is colored lines on pastel.

---

## 2. Color System

### 2.1 Neon Palette (6 colors, each with 3 glow intensities)

| Color    | Hex       | Role                                      |
|----------|-----------|--------------------------------------------|
| Cyan     | `#00F0FF` | Primary: logo, header, buttons, active nav, links |
| Purple   | `#C570FF` | Secondary: sidebar, tree accents, nav highlights |
| Magenta  | `#FF1A75` | Error, danger, alerts, kill actions        |
| Green    | `#00FF66` | Success, active status, OpenCode agent     |
| Orange   | `#FFAA00` | Warning, idle status, Claude agent         |
| Blue     | `#44BBFF` | Info, neutral signals, Codex agent         |

Each color has 3 glow tokens:
- `--neon-*-glow`: `0 0 12px` — medium aura
- `--neon-*-soft`: `0 0 6px` — subtle aura
- `--*-glow`: `0 0 12px + 0 0 40px` — compound ambient glow (used on logo, status dots)

### 2.2 Semantic Mappings

Always use semantic tokens, never raw neon colors:

| Token              | Maps to    | Usage                          |
|--------------------|-----------|--------------------------------|
| `--accent`         | Cyan      | Primary UI accent              |
| `--success`        | Green     | Active/online/success state    |
| `--warning`        | Orange    | Idle/pending/warning state     |
| `--danger`         | Magenta   | Error/failure/alert state      |
| `--info`           | Blue      | Neutral info signals           |
| `--sidebar-accent` | Purple    | Sidebar-specific accents       |

### 2.3 Agent Identity Colors

```
Claude   → Orange (#FFAA00)
OpenCode → Green  (#00FF66)
Codex    → Blue   (#44BBFF)
```

### 2.4 Status Colors

```
active       → Green
idle         → Orange
stopped      → Disabled gray
error        → Magenta
disappeared  → Magenta
unknown      → Magenta (dimmed)
```

### 2.5 Text Colors

| Token              | Dark        | Light      | Usage                    |
|--------------------|-------------|------------|--------------------------|
| `--text-primary`   | `#F0F0FA`   | `#1A1A22`  | Main content, headings   |
| `--text-secondary` | `#A0A5C0`   | `#555566`  | Body text, descriptions  |
| `--text-tertiary`  | `#6E7398`   | `#888899`  | Labels, timestamps, meta |
| `--text-disabled`  | `#3E4058`   | `#BBBBCC`  | Inactive/placeholder     |

### 2.6 Backgrounds

| Token          | Dark      | Light      | Usage                         |
|----------------|-----------|------------|-------------------------------|
| `--bg`         | `#050510` | `#F0EFFF`  | Page background               |
| `--card-bg`    | `#0A0A1A` | `#FFFFFF`  | Cards, panels, header         |
| `--muted-bg`   | `#0E0E20` | `#F5F3FF`  | Sidebar, list headers, detail values |
| `--input-bg`   | `#080818` | `#EDEBF8`  | Input fields, code blocks     |

---

## 3. Typography — 4-Tier System

| Tier      | Font                           | Size (px)    | Usage                                    |
|-----------|--------------------------------|-------------|------------------------------------------|
| **Pixel** | `Press Start 2P`              | 8–22px      | Logo, headers, buttons, badges, turn labels |
| **UI**    | `VT323`                       | 16–20px     | Stat labels, filter pills, detail labels |
| **Sans**  | `Inter`                       | 12–16px     | Tree entries, session text, messages, body |
| **Mono**  | `JetBrains Mono` / `SF Mono` | 10–13px     | Session keys, PIDs, CWD, code, timestamps |

**Rule**: Pixel and VT323 fonts are **never** used for body content or data.  
**Rule**: Mono is for machine data (keys, IDs, paths, code). Sans is for human-readable content.

### 3.1 Font Loading

Fonts are loaded via `<link>` in `index.html`:
```
Press Start 2P, VT323, Inter (400/500/600/700), JetBrains Mono (400/500)
```
Do NOT use `@import` in CSS files — it blocks rendering.

### 3.2 Key Component Sizes (px, fixed — never rem/em)

| Component              | Font       | Size |
|------------------------|------------|------|
| Logo                   | Pixel      | 10   |
| Header nav items       | VT323      | 20   |
| Theme toggle           | Pixel      | 10   |
| Sidebar nav items      | Pixel      | 10   |
| Sidebar labels         | Pixel      | 9    |
| Tree entries           | Sans       | 13   |
| Tree children          | Sans       | 12   |
| Stat labels            | VT323      | 20   |
| Stat values            | Pixel      | 22   |
| Stat sub               | Mono       | 11   |
| Filter pills           | VT323      | 16   |
| Session key            | Mono       | 12   |
| Session agent          | Sans       | 13   |
| Session time           | Mono       | 11   |
| Detail header          | Pixel      | 11   |
| Detail label           | VT323      | 18   |
| Detail value           | Mono       | 12   |
| Buttons                | Pixel      | 10   |
| Turn title             | Pixel      | 9    |
| Turn message           | Sans       | 13   |
| Timeline event name    | Pixel      | 9    |
| Timeline code          | Mono       | 11   |
| Exec items             | Mono       | 11   |
| Empty state h2         | Sans       | 16   |
| Empty state h3         | Sans       | 14   |
| Empty state p          | Sans       | 13   |

---

## 4. Layout & Spacing

### 4.1 Structural Dimensions (px)

| Element            | Size       |
|--------------------|------------|
| Header height      | 64         |
| Sidebar width      | 280        |
| Session list width | 420        |
| Agent drawer width | 360        |

### 4.2 Spacing Scale

Always use `--space-*` tokens for padding/gap/margin:

```
--space-1:  8px
--space-2: 12px
--space-3: 16px
--space-4: 24px
--space-5: 32px
--space-6: 48px
--space-8: 64px
```

### 4.3 Layout Structure

```
┌─ .top-nav (fixed, h=64px) ───────────────────────────────┐
│  logo │ SESSIONS DASHBOARD │ spacer │ theme-toggle │ avatar █
├─ .main-area (margin-top:64px, h=100vh-64px) ─────────────┤
│ ┌─ .sidebar (280px) ──┐ ┌─ .view-panel (flex:1) ────────┐│
│ │ ws-selector         │ │ ┌─ stats-row (4 cols) ───────┐││
│ │ side-nav-item ×2    │ │ ├─ stat-card ×4 ────────────┤││
│ │ tree-separator      │ │ └────────────────────────────┘││
│ │ Projects label + +  │ │ ┌─ .session-panel ───────────┐││
│ │ tree items          │ │ │ ┌─ list (420px) ─┐ ┌─ detail│││
│ │ Status section      │ │ │ │ header         │ │ header  │││
│ └─────────────────────┘ │ │ │ filters        │ │ Agent   │││
│                         │ │ │ session rows   │ │ Status  │││
│                         │ │ └────────────────┘ │ Timeline│││
│                         │ │                    │ buttons │││
│                         │ │                    └─────────┘││
│                         │ └───────────────────────────────┘│
│                         └──────────────────────────────────┘
└────────────────────────────────────────────────────────────┘

Agent drawer (360px) slides out from right, fixed, top:64px.
```

### 4.4 View Switching

- **Sessions view** (default): stats-row + session-panel (list + detail side-by-side)
- **Dashboard view**: title + stats-row + recent-activity list
- Only one `.view-panel` visible at a time (`display:flex` when `.active`)

---

## 5. Component Specifications

### 5.1 Stat Cards

- 4-column grid (`grid-template-columns: repeat(4, 1fr)`)
- Padding: `--space-3` (16px)
- Background: `--card-bg`, border: `1px solid --border`
- Pixel shadow: `--pixel-shadow --pixel-border-dark`
- HUD corner brackets: `::before` (cyan, top-left) + `::after` (purple, bottom-right)
- Structure: `.stat-label` → `.stat-value` → `.stat-sub`

### 5.2 Session Rows

- 3-line vertical layout: `.session-key` → `.session-agent` → `.session-time`
- Padding: `12px 16px`, hairline bottom border
- Selected: cyan left border + subtle cyan background
- Status dot: `●` character with color via class (`.dot-active` green, `.dot-idle` orange, `.dot-error` magenta)

### 5.3 Detail Panel

- Padding: `24px`, full border
- Header: "SESSION: {key}" in pixel font 11px cyan, bottom border: 2px
- Sections: `.detail-label` (VT323 18px) + `.detail-value` (mono 12px, muted bg, purple left border, pixel shadow)
- Gap between sections: `margin-bottom: 24px`
- Action buttons: input + SEND in one row, CANCEL + KILL in another row

### 5.4 Filter Pills

- Font: VT323 16px
- Padding: `2px 10px`, border: `1px solid --border`
- Active: cyan border, cyan text, pixel shadow, text glow
- Hover: purple border
- Count badge in mono 12px

### 5.5 Buttons

All buttons use pixel font 10px with `letter-spacing: 1px` and `text-transform: uppercase`.

| Variant     | Background       | Text Color         | Border                      |
|-------------|------------------|--------------------|------------------------------|
| Primary     | `--neon-cyan`    | `--bg`             | none (`font-weight: 700`)    |
| Danger      | transparent      | `--neon-magenta`   | `2px solid --neon-magenta`  |
| Ghost       | transparent      | `--text-secondary` | `1px solid --border`        |
| Secondary   | `--fill-medium`  | `--text-secondary` | `1px solid --border-subtle` |
| Cancel/Send | same as Primary/Secondary but with explicit px padding/font-size |

All buttons share: `box-shadow: --pixel-shadow --pixel-border-dark`, `transition: transform box-shadow 150ms`, `:active { transform: translate(1px,1px) }`.

Primary hover: shadow becomes neon cyan + glow, `translate(-1px,-1px)`.

### 5.6 Timeline (Collapsible)

- **Turn block**: card bg, hairline border, cyan left border (2px). Collapsible header + body.
- **Turn title**: pixel 9px, uppercase
- **User input**: input-bg, cyan left border, pixel box-shadow
- **Tool group**: card bg, left border colored by status (orange=running, green=completed, magenta=error)
- **Tool detail**: input-bg, mono 11px, cyan text
- **Timeline event**: card bg, colored left border by type (blue=reasoning, cyan=assistant, green=final, orange=tool, magenta=error, purple=system)
- **Event name**: pixel 9px, uppercase

### 5.7 Sidebar Tree (2-level flat)

- Project items: `.tree-item` with `.dot.project` (purple, 6×6px, glow)
- Topic/Service items: `.tree-item.child` with `.dot.service` (cyan, 6×6px, glow)
- No arrows, no counts, no story-level items in tree
- `+` button on project (add topic), shown on hover only
- Project click toggles expand/collapse (`.tree-children.open`)
- Topic click selects and filters sessions

### 5.8 Status Dots

Use `●` character (U+25CF) with `.status-dot` + color class:
```html
<span class="status-dot dot-active">●</span>
```
```css
.status-dot { display: inline-block; margin-right: 6px; line-height: 1; }
.dot-active  { color: var(--neon-green);  text-shadow: 0 0 6px rgba(0,255,102,0.5); }
.dot-idle    { color: var(--neon-orange); }
.dot-error   { color: var(--neon-magenta); text-shadow: 0 0 6px rgba(255,26,117,0.5); }
```
Do NOT use fixed `width/height` boxes, background-color, or `border-radius`.

### 5.9 Modals & Overlays

- Backdrop: `rgba(0,0,0,0.65)` + `backdrop-filter: blur(4px)`
- Box: `--muted-bg`, pixel shadow + glow, padding `32px`, max-width 420px
- Close on backdrop click or Escape key
- Form inputs: `--input-bg`, pixel border, focus → cyan border + pixel shadow

### 5.10 Toast

- Position: fixed, top-right below header
- Background: `--card-bg`, pixel shadow
- Colored left border: green(ok), orange(warn), cyan(info), red(error)
- Auto-dismiss (4-5s) or manual close

---

## 6. Visual Effects

### 6.1 CRT Scanline
```
Fixed overlay, full viewport, z-index: 9999
repeating-linear-gradient: 1px rgba(0,0,0,0.07) / 3px transparent
opacity: 0.5 (dark), 0.3 (light)
```
Hidden when `prefers-reduced-motion: reduce`.

### 6.2 Ambient Neon Pools
```
Fixed ::before pseudo-element on body (z-index: -1), dark mode only:
4 colored radial gradients + 1 center gradient
Interpolated colors: cyan → purple → magenta → green
```
Light mode: `background: none`.

### 6.3 Pixel Border Effect
```
--pixel-border-light: #15E0FF
--pixel-border-dark:  #004A55
--pixel-shadow: 3px 3px 0  (dark mode)
--pixel-shadow: 2px 2px 0  (light mode)
```
Applied via `box-shadow: var(--pixel-shadow) var(--pixel-border-dark)`.
Used on: stat cards, buttons, detail values, input fields, modals, toast.

### 6.4 HUD Corner Brackets
Stat cards have `::before` (top-left cyan) and `::after` (bottom-right purple) bracket indicators:
```
width: 14px; height: 14px;
border-top/left: 2px solid --neon-cyan;
border-bottom/right: 2px solid --neon-purple;
opacity: 0.7;
```

---

## 7. Light Mode

All tokens under `[data-theme="light"]`. Key differences:

| Property       | Dark                      | Light                     |
|---------------|---------------------------|---------------------------|
| Backgrounds   | Near-black (#050510)     | Pastel purple (#F0EFFF)  |
| Cards         | Deep blue (#0A0A1A)     | White (#FFFFFF)           |
| Glows         | `0 0 12px` radial        | Colored border shadows    |
| CRT scanline  | 0.5 opacity              | 0.3 opacity               |
| Ambient pools | Active                    | Disabled                  |
| Pixel shadow  | `3px 3px 0`             | `2px 2px 0`              |

Theme toggle button text: dark = `☽ MODE`, light = `☀ MODE`.

---

## 8. Layout Rules

1. **Header is fixed** (`position: fixed; top:0; height:64px`), not sticky.
2. **Main area** offset via `margin-top: 64px` and `height: calc(100vh - 64px)`.
3. **App container** `#app { height: 100vh; overflow: hidden }` — content scrolls inside panels.
4. **No overflow on body** — `overflow-x: hidden`.
5. **Scrollbar** re-styled: 6px width, cyan thumb, purple on hover.
6. **Reduced motion**: `prefers-reduced-motion:reduce` disables all animations and CRT scanline.

---

## 9. CSS Conventions

### 9.1 Units
- **Always use explicit `px`** for font sizes. Never `rem` or `em`.
- Use `--space-*` tokens for padding/gap/margin.
- Use CSS custom properties for colors, never hardcoded hex/rgba.

### 9.2 Font Loading
- Fonts loaded via `<link>` in `index.html` only.
- No `@import url()` in CSS files.

### 9.3 Naming
- Component classes: kebab-case (`.session-list-panel`, `.detail-header`)
- State variants: BEM-like (`.session-row.selected`, `.turn-block.is-open`)
- Color variants: descriptive (`.stat-value.green`, `.dot-active`)

### 9.4 Theme
- Toggle via `document.documentElement.setAttribute('data-theme', 'dark'|'light')`
- Persist preference in `localStorage` key `agent-monitor-theme`

---

## 10. Constraints for Development

1. **No `border-radius`** — pixel art aesthetic uses sharp corners everywhere.
2. **No `rem`/`em` font sizes** — always px. The body is 14px, all key elements use explicit px.
3. **No hardcoded colors** — always use `var(--*)` tokens so themes work.
4. **Pixel fonts only for UI chrome** — never use Press Start 2P or VT323 for data/content.
5. **Status dots are text characters** — `●` with color class, never background + border-radius boxes.
6. **Sidebar tree is 2 levels max** — Projects → Topics. Stories handled via filtering, not visible in tree.
7. **Buttons follow pixel style** — pixel shadow, uppercase, letter-spacing, no rounded corners.
8. **New panels match card style** — `--card-bg`, 1px `--border`, pixel shadow.
9. **Inputs match input style** — `--input-bg`, pixel border, focus → cyan border + pixel shadow.
10. **Dark/light must both work** — test every component in both themes.
