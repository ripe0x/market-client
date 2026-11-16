# Style Guide — Monochrome Square

A portable visual system extracted from Market V1. It carries the look only: no site structure, content, or product logic. Paste this file into a new session and ask for the new site to be designed "following this style guide".

## 1. Character
- Black ground, white ink, greys for hierarchy. **No accent colour.** Emphasis comes from size, weight and white-vs-grey, never hue.
- **Square everything.** Border radius 0 on every element: buttons, inputs, images, toggles, cards.
- **Hairlines, not boxes.** Structure comes from 1px dividers and alignment. Avoid filled cards, shadows, gradients, blur, glows.
- **Extreme type contrast.** Very large, heavy, tightly tracked display type sits next to small mono labels. Little in between.
- **Data as typography.** Numbers are set large and bold with a small mono unit beside them. Tables are a first-class layout.
- **Plain text affordances.** Use characters instead of icons: ↑ ↓ (sort), ▾ (dropdown/expand), ← (back), ↗ (external link), ··· (more), − + (steppers), × (close).

## 2. Colour
| Token | Hex | Use |
|---|---|---|
| bg | #000000 | Page background |
| ink | #FFFFFF | Primary text, primary buttons, active states, selection outlines |
| ink-2 | #B5B5B5 | Secondary text, chart lines |
| ink-3 | #7A7A7A | Muted text, labels, units, inactive nav/sort |
| ink-4 | #555555 | Group labels, disabled knob |
| line-strong | #444444 | Off-state toggle border, dashed chart segments |
| ink-ghost | #3D3D3D | Inactive giant tab titles |
| line-control | #333333 | Button/input borders |
| line | #262626 | Section dividers, toolbar borders, chart tracks |
| line-soft | #1A1A1A | Row dividers inside tables/lists |
| fill-media | #111111 | Image placeholders / empty media |
| hover | #0D0D0D | Row hover background |
| fill-group | #0A0A0A | Group header rows inside tables |

Rules
- Text on black: use #FFF, #B5B5B5 or #7A7A7A only. #555 and #3D3D3D are for non-essential labels and large display type.
- Inverted elements (primary button, selected segment, highlighted row) are #FFF background with #000 text.
- If a status colour is ever unavoidable (error), use it on text only, sparingly. Prefer wording ("Expired 27 Oct" in #FFF vs muted grey for normal).

## 3. Typography
Fonts (Google Fonts): **Archivo** 400/500/700/800 for UI and display; **JetBrains Mono** 400/500 for labels, IDs, addresses, codes, units, table headers, timestamps.

Always on numbers: `font-variant-numeric: tabular-nums`.

| Role | Font | Size (desktop / mobile) | Weight | Tracking | Line-height |
|---|---|---|---|---|---|
| Hero / page title | Archivo | 88–64 / 40–32px | 800 | −0.05em | 0.9 |
| Section title | Archivo | 56–40 / 28px | 800 | −0.05em | 0.95 |
| Big figure | Archivo | 76–48 / 36px | 700 | −0.045em | 1 |
| Figure | Archivo | 36–22 / 18px | 700 | −0.02 to −0.03em | 1.1 |
| Item title | Archivo | 17–19px | 700 | −0.01em | 1.25 |
| Body | Archivo | 15–17px | 400/500 | 0 | 1.45 |
| Note / explainer | Archivo | 13–14px, #7A7A7A or #B5B5B5 | 400 | 0 | 1.5 |
| Label | JetBrains Mono | 11–12px, UPPERCASE | 500 | 0.06em | 1.2 |
| Meta / ID / address | JetBrains Mono | 12–13px, #7A7A7A | 400/500 | 0 | 1.3 |
| Unit suffix | JetBrains Mono | 10–13px, #7A7A7A, after the number with ~6px gap | 500 | 0 | — |

Pairing patterns
- **Figure + unit:** `1.42` Archivo 700 large #FFF, then `UNIT` mono small #7A7A7A, baseline-aligned.
- **Label over value:** mono uppercase label #7A7A7A, 8px gap, value Archivo 700.
- **Giant tabs:** sibling page sections as 64px/800 words side by side (gap 36px); active #FFF, inactive #3D3D3D.

## 4. Spacing & layout
- Scale (px): 4, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72.
- Desktop canvas 1440px; page gutter **40px**. Mobile 390px; gutter **18px**.
- Top bar 76px tall, bottom border 1px #262626. Grid `fixed-left | 1fr | auto`.
- Toolbars 64px tall with top and bottom 1px #262626 borders; controls left, view switches right.
- Two-column detail layout: `1fr | 520px`, left column `border-right: 1px solid #262626`. Media sits in the left column with generous padding (56–72px); dense info/form in the right panel (padding 56px 48px).
- Grids of media: 1px #262626 gutters (draw them with `gap:1px` on a #262626 background) or 24px open gaps. Media always square.
- Hero header blocks: padding 40–48px top, 32–36px bottom.

## 5. Components

**Buttons** (all radius 0)
- Primary: bg #FFF, text #000, Archivo 700. Heights 40 (inline), 58 (mobile CTA), 64 (desktop CTA). Padding 0 20px. Label states the outcome ("Deposit and list #15").
- Secondary: transparent, 1px #333 border, #FFF text. Hover → bg #FFF, text #000, border #FFF.
- Text action: 14–15px #FFF or #7A7A7A, no border; underline 2px #FFF when it marks the current page.
- Pill-free: never round, never add icons inside buttons except a trailing ▾ or ↗.

**Inputs**
- Height 42–44px, 1px #333 border, padding 0 16px, 15px text, placeholder #7A7A7A. No fill.
- Form cells: stacked rows separated by 1px #262626; mono uppercase label on top, value 30px/700 with mono unit on the right.

**Segmented control**
- Row of equal cells inside a 1px #333 border; cells divided by 1px #333. Selected: bg #FFF, text #000, 700. Unselected: #B5B5B5. Height 40–48px. Optional second line inside each cell (e.g. a balance) in mono 12px.

**Toggle**
- 44×24 square track. On: bg #FFF, #000 square knob on the right. Off: 1px #444 border, #555 knob on the left.

**Stepper**
- `−` value `+` with 40×40 square buttons bordered #333.

**Tabs**
- Inline tabs: 15px; active 700 #FFF with 2px #FFF underline sitting on the toolbar's bottom border; inactive #7A7A7A. Counts follow in mono #7A7A7A.
- Sort options: plain words, gap 28px, active #FFF, rest #7A7A7A.

**Tables**
- Header row 44–48px: mono 12px uppercase #7A7A7A, 0.06em; sorted column #FFF with ↑/↓.
- Optional two-tier header: group label in mono 11px #555 spanning its columns, with 1px #262626 underline.
- Rows 60–80px, `border-bottom:1px solid #1A1A1A`, hover bg #0D0D0D. Column gap 24px. Numbers right-aligned or consistently left with tabular nums.
- Lead cell: 44–52px square thumbnail + title 17px/700 + mono meta 13px #7A7A7A.
- Row action: secondary button at the end of the row.
- Group header rows: 44px, bg #0A0A0A, bottom 1px #262626, mono 12px uppercase: group name #FFF, count #7A7A7A.
- Footer: 64px row, note 15px #7A7A7A left, "Show N more" #FFF right.

**Stat block**
- Horizontal row of label-over-value pairs, gap 40px; labels mono 12px uppercase #7A7A7A, values 26px/700. Group related stats under a mono group label (#555) and separate groups with 1px #262626 vertical rule.

**Key–value rows**
- 52–56px rows, top border #262626; key 15px #7A7A7A left, value 15px #FFF right (mono for codes). Expandable rows end with ▾. A total row is 700 #FFF.

**Selection**
- Selected media/item: `outline: 2px solid #FFF; outline-offset: 4–8px`. Optional mono caption under it ("Selected").
- Highlighted row (e.g. "you are here"): full row bg #FFF, text #000.

**Progress / charts**
- Thin bars: 2px tall, track #262626, fill #7A7A7A or #FFF.
- Line charts: 1.5px stroke; past solid #B5B5B5, future dashed #444; current point 4px #FFF dot. Endpoint labels mono 12px #7A7A7A. No gridlines, no fills.

**Mobile specifics**
- Status bar 50px. Root screens: logo left, account right; full-width 44px search.
- Sub-screens: 52px nav row `← | title | ···` or `Cancel | title | spacer`, bottom border #262626.
- Primary CTA pinned at the bottom, full width 58px. Tap targets ≥ 44px.
- Default to 2-column grids for media, list rows for data.

**Logo mark (reference)**
- 22×22 square outline, 2px #FFF stroke, single diagonal; wordmark Archivo 800 22px, −0.03em, gap 12px. Replace with the new brand's mark but keep it geometric, monoline and square.

## 6. Motion
- Minimal. Hover/state changes 120ms ease on background and colour only. No slide-ins, no bounce, no parallax.

## 7. Writing style
- Plain, factual, present tense. Say what will happen, in the user's terms: "Cancel any time to get it back."
- Buttons name the exact outcome and amount where relevant.
- Notes are one or two short sentences, muted grey, placed directly under the thing they explain.
- No exclamation marks, no marketing adjectives, no emoji.
- Truncate long identifiers in the middle: `0x7a…e41`.

## 8. Don'ts
- No colour accents, gradients, shadows, rounded corners, glassmorphism.
- No icon libraries or illustrated icons; use the text glyphs above.
- No filled cards or boxed sections; use dividers and whitespace.
- No mid-weight display type: headings are 800, figures 700.
- Don't centre-align data screens; left-align to the 40px gutter.

## 9. CSS starter
```css
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
:root{
  --bg:#000; --ink:#fff; --ink-2:#b5b5b5; --ink-3:#7a7a7a; --ink-4:#555; --ink-ghost:#3d3d3d;
  --line-strong:#444; --line-control:#333; --line:#262626; --line-soft:#1a1a1a;
  --fill-media:#111; --hover:#0d0d0d; --fill-group:#0a0a0a;
  --font-ui:'Archivo',system-ui,sans-serif; --font-mono:'JetBrains Mono',ui-monospace,monospace;
  --gutter:40px; --radius:0;
}
@media (max-width:640px){ :root{ --gutter:18px; } }
html,body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--font-ui);
  font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased}
*{border-radius:0;box-sizing:border-box}
a{color:var(--ink);text-decoration:none} a:hover{color:var(--ink-2)}
.label{font:500 12px/1.2 var(--font-mono);text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3)}
.display{font-weight:800;letter-spacing:-.05em;line-height:.9}
```
