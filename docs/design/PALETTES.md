# AETERNA CRM: palette study

Spatial glass for UK accountants and law-adjacent practices. Offline desktop, used for full working days.

**Decision.** Ship eight palettes: the brief's five plus three luxury additions. Every one has a Day and a Night token set.
Burgundy & Slate stays the default, with Appearance = Auto (follows Windows) and Glass effect = Balanced.
`validate.py` runs 920 checks across 8 palettes x 2 modes, and the text, contrast and chart checks run at all four glass levels (Full, Balanced, Lite and Reduce transparency).
It also runs the dataviz skill's own validator 16 times. **Everything passes** (`validation.txt`, last line: `ALL CHECKS PASS`).

Files in this folder:

| File | What it is |
|---|---|
| `palettes.json` | The tokens: 8 palettes, each with `day` and `night` sets of exactly 35 keys |
| `validate.py` | Standard-library validator. Run `python3 validate.py` to regenerate `validation.txt` (exit 0 = all pass) |
| `validation.txt` | Summary, key-results table, Reduce-transparency hexes, fidelity to the brief, and every check |
| `palettes-preview.png` | Glass mock of all 16 themes, rendered from the JSON |

---

## 1. What the brief contained

These colours were sampled with Pillow from the screenshots (the median of a 5x5 box, so WebP noise doesn't skew them):

| Burgundy, Night (image 3) | Sampled | Burgundy, Day (image 2) | Sampled |
|---|---|---|---|
| Backdrop, top-left oxblood bloom | `#2b0a15` | Backdrop, top-left blush | `#f1dfe7` |
| Backdrop, centre | `#0d0a10` | Backdrop, top-centre pearl | `#eceff7` |
| Backdrop, bottom (ink, slate cast) | `#07060b`, slate glow `#1a2332` behind main panel | Backdrop, bottom slate-lavender | `#dadeed` |
| Sidebar glass, top / mid | `#51182b` / `#3d0a1e` | Sidebar glass | `#fff8fc` to `#ffedf5` |
| Primary button, left / mid / right | `#9e1439` / `#ae133c` / `#d16472` | Primary button, left / mid / right | `#710f2c` / `#901135` / `#b54959` |
| Text / muted / faint | `#fff4ff` / `#bba6b9` / `#7c687f` | Text / muted / faint | `#080b1a` / `#5e535d` / `#838594` |

The five swatch trios matched Tailwind steps to within 2 units, so they were snapped to them.
Sapphire `#1e3a8a #2563eb #60a5fa`, Emerald `#065f46 #10b981 #d5b04d`, Graphite `#44403c #c2410c #f3c08b`, Indigo `#3730a3 #6366f1 #a5b4fc` and Burgundy `#6a0f29 #be123c #e7b8a1`.

What the screenshots teach:
- **The swatch trio reads deep, then accent, then sheen.** The Settings cards draw the trio as a 3-stop gradient. All three additions follow the same grammar.
- **Glass takes its colour from what is behind it.** The panels are lightly tinted, and the wine or slate cast comes from two blurred ambient glows. That's why the token set has `glowA` and `glowB`, and why the validator composites every layer over the glows.
- **Burgundy's "slate" is the cool side of the field** (the backdrop's lower half and the second highlight), not a second accent. Its third swatch is the blush sheen.

**Fidelity check.** `validation.txt` compares Burgundy's tokens with the samples using ΔE2000. In Night, the backdrop stops come within 0.5-2.0, text 2.5, muted 1.8 and the gradient start 0.8. In Day, every backdrop stop, muted, accent and both gradient ends come within 0.0-0.8.
Two deliberate departures:
- **The Night gradient's light end** went from `#d16472` to `#d3395d`. The brief's value gives white text only 3.64:1; ours gives 4.65:1. The sheen comes back through the `highlight` overlay instead.
- **Night `textFaint`** went from `#7c687f` to `#99879e`. It has to clear 3:1 on the brightest layer it can sit on: a selected row over the oxblood glow at Full transparency.

## 2. Principles

1. **Trust before delight.** Each accent carries one meaning: action and selection. Its hue never also means "good" or "bad".
2. **Calm across a ten-hour day.** Night is the default after dark, with text at 9-10:1 rather than 15+ (which halates on glass). Day uses a pearl field, not paper-white. Glows are static: nothing moves unless the user does something.
3. **Ink that photocopies.** Day semantic colours sit at OKLCH L 0.45-0.50. They read as dark green, bronze, oxblood-red and steel on a mono laser printer, and they hold at least 4.65:1 as text.
4. **No traffic-light overload.** A status colour appears only as a dot plus a label in a soft pill, never as a row fill. Negative money goes in parentheses, per UK accounting convention, not in red. Danger is kept for overdue, lapsed and at-risk items.
5. **Measured, not eyeballed.** Every translucent layer is composited over the darkest and lightest backdrop colours, including both glows at full strength, at every glass level. The worst case is the number that has to pass.

## 3. Thresholds (all met)

| What | Required | Worst result across all 16 themes |
|---|---|---|
| `text` on surface, raised, sunken and selected layers | 7:1 (floor 4.5) | 7.75 (Onyx Night) |
| `textMuted` | 4.5:1 | 5.20 |
| `textFaint` (non-essential text only) | 3:1 | 3.30 |
| `accentFg` on accent, hover, active and both gradient ends | 4.5:1 | 4.60 |
| `accent` as a UI graphic (toggle, checkbox, selection bar) | 3:1 | 3.01 |
| `focus` ring (held to 4.5 because it doubles as accent-coloured text) | 3:1 | 4.80 |
| `accent2` as a graphic | 3:1 | 3.31 |
| `success`, `warning`, `danger`, `info` as text, including on their own soft tint | 4.5:1 | 4.65 |
| Each chart colour on the surface and on a raised card | 3:1 | 3.15 |
| Adjacent chart pairs, ΔE2000 under normal vision, protanopia, deuteranopia and tritanopia | 15 | 15.8 (Petrol Night) |
| Dataviz skill checks: OKLCH L band, chroma at least 0.10, OKLab ΔE at least 15 (normal) and 8 (CVD) | pass, no WARN | pass in all 16 runs |
| `accent` vs each semantic colour, ΔE2000 (so danger never reads as the brand) | 10 | 11.3 (Onyx Day, warning) |
| Sequential ramp: one hue, monotone, ΔL at least 0.06, the end nearest the surface at least 2:1 | yes | yes |
| Diverging: grey midpoint, poles at least 3:1, poles ΔE2000 at least 15 in all visions | yes | yes |

## 4. The palettes

Contrast figures are worst cases from `validation.txt`, given as text / muted / faint / white-on-accent.

| # | Palette | Rationale | Day | Night |
|---|---|---|---|---|
| **Default** | **Burgundy & Slate**: "Traditional, law-firm" | Oxblood and rose-crimson over cool slate glass. It is the chambers-library register, and it's the only palette whose accent hue is never needed elsewhere, because danger moves to vermilion. Slate (`#6f7f99` / `#9ba9c2`) is the quiet second highlight. | 13.4 / 5.2 / 3.3 / 9.1 | 9.7 / 5.2 / 3.3 / 4.65 |
| 1 | **Sapphire**: "Calm and trusted" | The banking-hall standard. To keep blue meaning "action", info moves to teal (`#01646d` / `#58c5d0`). | 13.4 / 5.2 / 3.3 / 5.2 | 9.2 / 5.2 / 3.3 / 4.7 |
| 2 | **Emerald & Gold**: "Classic accounting, premium" | Green baize and gilt. Success shifts to leaf green (hue 135) so it sits 16-25 ΔE from the emerald accent. Gold is the `accent2` highlight. | 13.3 / 5.2 / 3.3 / 5.5 | 9.3 / 5.2 / 3.3 / 4.65 |
| 3 | **Graphite & Copper**: "Understated, modern" | One copper accent, as the brief says. The apricot sheen is `accent2`. Danger moves to carmine (hue 22) and warning to ochre (hue 88), both away from copper (hue 38). | 13.3 / 5.2 / 3.3 / 5.2 | 9.1 / 5.2 / 3.3 / 4.7 |
| 4 | **Indigo**: "Clean, single hue" | The UI chrome uses only indigo, from ink to periwinkle. Info moves to cyan (hue 225). | 13.1 / 5.2 / 3.3 / 6.3 | 9.1 / 5.2 / 3.3 / 4.7 |
| 6 | **Onyx & Champagne** (new) | See §5. In Night, champagne `#d4b169` carries onyx ink `#17140f` (9.0:1). In Day, the accent is antique gold `#856112` with white text. | 14.3 / 5.3 / 3.3 / 5.7 | 7.75 / 5.2 / 3.3 / 9.0 |
| 7 | **Aubergine & Rose Gold** (new) | See §5. | 13.2 / 5.2 / 3.3 / 8.6 | 9.7 / 5.2 / 3.3 / 4.7 |
| 8 | **Petrol & Pearl** (new) | See §5. | 13.4 / 5.3 / 3.3 / 7.1 | 9.5 / 5.2 / 3.3 / 4.7 |

**Why every Night accent sits at about 4.65:1 with white.** For a white-label button to clear 4.5:1, the fill's luminance must stay at or below 0.183. For the same fill to clear 3:1 as a toggle against lit glass, its luminance must be at least about 0.16. Every Night accent is solved into that window.
Two design rules follow:
- **Night glass is kept fairly dark**, and the glows modest, so the window stays open.
- **Night hover doesn't lighten the fill**, because the fill is already at the white-text ceiling. Hover is a lift: translate up 1px, a stronger `highlight` and a larger shadow. Active steps down 0.06 in L.

## 5. Luxury additions

| Palette | Swatches | Why it is worth shipping |
|---|---|---|
| **Onyx & Champagne**: "Black-tie, quietly opulent" | `#15130f` `#cdb17a` `#d9dbe0` | The only neutral-black theme. Graphite is warm grey and recedes; Onyx is lacquer and gold, and it is the one to show a client across the desk. Gold leads in both modes, platinum details are `accent2`, and warning moves to amber (hue 58) to stay clear of champagne (hue 85). For private client, wealth and family-office work. |
| **Aubergine & Rose Gold**: "Boutique, private client" | `#3b1438` `#8e3a7f` `#e3aa98` | It fills the empty 300-340 hue band between Burgundy (red) and Indigo (blue-violet). It's warm and discreet without being frivolous, and the rose-gold sheen echoes Burgundy's blush, so the two feel like siblings. For family law and boutique advisory. |
| **Petrol & Pearl**: "Heritage, deep and composed" | `#0e3640` `#2a7f90` `#e8e1d8` | It fills the empty 200-230 band between Emerald and Sapphire: a Georgian front-door blue-green, the lowest-arousal hue in the set and the calmest for long review sessions. Pearl is the Night `accent2`. In Day it becomes a Tahitian-pearl grey (`#827c90`) so it still clears 3:1. For mixed and insolvency practices. |

Rejected:
- **Midnight & Platinum** duplicates Sapphire. Its platinum accent (C below 0.03) also fails 3:1 as a toggle and reads as disabled.
- **Forest & Brass** duplicates Emerald & Gold. A third gold metal would make three gold-accented themes.

## 6. A more appropriate multi-colour palette

The client asked for a multi-colour palette that isn't a generic rainbow. Each theme owns its multi-colour system in three ways:

**a. Semantic colours are re-tuned per theme, not shared.** Each one keeps its meaning (green, amber, red, blue) but bends hue away from the theme's accent, and its lightness is solved per mode to clear 4.65:1.
- Day: L 0.45-0.50, which is inked and print-safe.
- Night: L 0.72-0.80.

| Theme | Collision avoided | Move | Closest semantic to the accent (ΔE2000, Day / Night) |
|---|---|---|---|
| Burgundy | danger vs crimson | danger to vermilion (hue 32) | danger 19.1 / 23.6 |
| Sapphire | info vs blue | info to teal (hue 205) | info 27.4 / 35.9 |
| Emerald | success vs emerald | success to leaf (hue 135) | success 16.1 / 25.3 |
| Graphite | danger and warning vs copper | carmine (hue 22) and ochre (hue 88) | danger 15.2 / 29.2 |
| Indigo | info vs indigo | info to cyan (hue 225) | info 19.5 / 30.5 |
| Onyx | warning vs champagne | warning to amber (hue 58) | warning 11.3 / 13.5 |
| Aubergine | none critical | standard set | danger 25.8 / 29.4 |
| Petrol | info vs petrol | info to indigo-blue (hue 268) | info 18.0 / 28.5 |

**Night danger is a soft vermilion** (`#ff8f79` in Burgundy), not a hard red. Any red that holds 4.65:1 as text on lit glass has to sit around L 0.77, where sRGB caps red chroma near 0.14. Pairing it with an icon and a label keeps it unambiguous.

**b. The categorical chart order is brand-led and CVD-ordered.**
- **Slot 1 is the accent family**, pinned to the three steps nearest the accent.
- **Slot 2 is the theme's partner hue** at its nominal chroma: slate for Burgundy, amber for Sapphire, steel for Graphite.
- **Slots 3-8 were ordered by exhaustive search** over all permutations and over the lightness steps that clear 3:1 (up to 6 in Day, 5 in Night) x 2 chroma levels per slot. The order is the same in Day and Night (colour follows the entity: Day-to-Night hue drift is at most 1.3 degrees). The search maximised the worst adjacent pair under all four visions.

Harmony comes from a shared chroma band (0.10-0.14: jewel, not neon) and a shared lightness band, not from avoiding hues. Most charts use only slots 1-3, and those always look like the theme.

| Theme | Order (slots 1-8) |
|---|---|
| Burgundy | crimson, slate, moss, orchid, jade, brass, periwinkle, vermilion |
| Sapphire | sapphire, amber, jade, copper, violet, olive, sky, rose |
| Emerald | emerald, copper, plum, olive, sapphire, gold, violet, garnet |
| Graphite | copper, steel, olive, mauve, jade, ochre, lavender, brick |
| Indigo | indigo, amber, sky, rose, olive, orchid, jade, copper |
| Onyx | champagne, pewter, rosewood, lavender, bronze, jade, aubergine, moss |
| Aubergine | orchid, jade, gold, periwinkle, rose gold, sky, olive, garnet |
| Petrol | petrol, coral, amethyst, gold, sea green, copper, cornflower, moss |

**Emerald trade-off.** Emerald beside gold can't pass in Night. Within the Night lightness band (OKLCH L 0.48-0.67), the best emerald/gold step pair reaches only OKLab ΔE 14.6, under the dataviz skill's normal-vision floor of 15: too close even for full-colour readers. So gold sits at slot 6 and copper takes slot 2. Gold remains `accent2`, which suits single-series emphasis such as a target line.

**Indigo.** Its "single hue" promise holds for chrome and for ordinal data, which should use `chartSequential`. Nominal series still need eight hues.

**c. Scales follow the theme.**
- **`chartSequential`** is the accent hue, from light to dark. In Day, low values map to index 0. In Night, low values map to index 4, the end that recedes into the glass. Its near-surface end clears 2:1, so it also serves as an ordinal ramp, such as aged-debt buckets 0-30 / 31-60 / 61-90 / 90+.
- **`chartDiverging`** has a cool and a warm pole with a grey midpoint. It's never red against green, so it suits budget vs actual, or over vs under.
- Pole pairs: Burgundy slate / rose; Sapphire blue / copper; Emerald teal / terracotta; Graphite steel / copper; Indigo indigo / amber; Onyx pewter / bronze; Aubergine teal / rose gold; Petrol petrol / coral.
- Status never doubles as a series colour. A series that *means* good or bad wears status tokens instead.

**Which palette for which practice:**
- Conveyancing, probate and litigation support: **Burgundy & Slate**.
- Audit and corporate finance: **Sapphire**.
- General practice and tax: **Emerald & Gold**.
- Payroll bureaux and modern advisory: **Graphite & Copper**.
- R&D tax and tech-forward firms: **Indigo**.
- Private client and wealth: **Onyx & Champagne**.
- Family law and boutique advisory: **Aubergine & Rose Gold**.
- Insolvency, mixed practices and long review sessions: **Petrol & Pearl**.

## 7. Glass recipe

The tokens in `palettes.json` are the **Balanced** level. The other levels scale the alpha of `surface` and `surfaceRaised` only, capped at 0.96. These are exactly the levels the validator tested.

| Level | Glass alpha | Backdrop blur | Saturate | Grain | Sheen | Shadow | Use when |
|---|---|---|---|---|---|---|---|
| **Full** | x0.85 | 28px (popovers 36px) | 170% | 3.5% | 1px inset `highlight`, plus a 120-degree specular gradient (white at 0.10 Day, 0.06 Night, fading to 0 at 40%) | 3 layers | Capable GPU, mains power |
| **Balanced** (default) | x1.00 | 20px (popovers 28px) | 150% | 2% | 1px inset `highlight` | 2 layers | Everyone else |
| **Lite** | x1.15 | 10px | 120% | off | 1px inset `highlight` | 1 layer | Battery saver, older iGPU, RDP or Citrix sessions (common in practices) |
| **Reduce transparency** | opaque | 0 | n/a | off | none | 1 layer, plus `borderStrong` | Windows "Transparency effects" off, `prefers-reduced-transparency`, or user toggle |

Treatment details:
- **Border.** Use 1px `border` on every glass layer. Inputs and the Reduce-transparency level use `borderStrong`.
- **Radii.** Panels 24px, cards 16px, controls 10-12px, pills full. The step-down means a nested radius equals the parent's minus its inset.
- **Shadow layers.** Use `0 1px 2px` at 0.4x `shadow`, then `0 12px 32px -12px shadow`, then (Full only) `0 32px 64px -24px shadow`.
- **Grain.** Use an inline SVG `feTurbulence` data URI (baseFrequency 0.8, two octaves) with `mix-blend-mode: overlay` (`soft-light` in Day). It is bundled, so nothing loads from the network. It exists to stop banding on 8-bit panels in the long dark gradients: it is not decoration.
- **Depth.**
  - L0: the backdrop gradient (From, Via, To at 145 degrees), with `glowA` at the top-left and `glowB` at the bottom-centre.
  - L1: panels (`surface`).
  - L2: cards (`surfaceRaised` on L1).
  - L3: menus and popovers (L2 plus 8px of blur and twice the shadow).
  - L4: modals, on a scrim of `shadow` at 0.5 over L3 glass.
  - Inputs and tracks go down to `surfaceSunken`. Selection is `accentSoft` plus a 3px `accent` bar, as in the brief's sidebar.
- **Reduce transparency hexes.** These are opaque, pre-flattened over `backdropVia`, and listed per theme in `validation.txt`. For Burgundy:
  - Night: surface `#260e1a`, raised `#311925`, sunken `#1c0a14`, selected `#491728`.
  - Day: surface `#f7f9fc`, raised `#fdfdfe`, sunken `#ecedf2`, selected `#efe6ec`.
  - The theme engine can also compute them at runtime with the same source-over formula.
- **Forced colours or high contrast.** Drop glass entirely and map to system colours (`Canvas`, `CanvasText`, `Highlight`).

## 8. Refinements worth building

1. **Morphing theme switch.** Use the View Transitions API to cross-fade the backdrop and tokens over 240ms when a palette or mode changes, so the change never flashes. Skip it under reduced motion.
2. **Settings cards like the brief.** Draw each card's swatch as the trio's 3-stop gradient, with a live mini-preview of that theme's glass and a check on the chosen one. Appearance offers Day ("Bright and crisp"), Night ("Easy on the eyes") and Auto ("Follows Windows"). Glass effect offers Full, Balanced and Lite, plus a Reduce transparency toggle. Defaults: Burgundy, Auto, Balanced.
3. **OS-native glass.** On Windows 11 the window can use Mica or Acrylic: Electron's `backgroundMaterial` or Tauri's `window-vibrancy`. The in-app backdrop then continues the desktop, and Lite becomes cheap.
4. **Accountant-grade numbers.**
   - Use tabular lining figures (`font-variant-numeric: tabular-nums lining-nums`) in tables and proportional figures for hero KPIs.
   - Show negatives as `(1,240.00)`, not in red.
   - Set pence and `.00` in `textMuted`, and the £ sign at 0.85em.
   - Use a slashed zero (`zero`) in reference numbers such as UTR, VAT and company numbers.
   - Format dates en-GB ("20 Oct 2026"), with the VAT quarter and the tax year (6 April) built in.
5. **Typography.**
   - **UI and figures: Inter** (variable, v4). It's a deliberate default here: it has the best small-size hinting on Windows ClearType, true tabular figures, a slashed zero, and the `ss02` disambiguation set (I/l/1).
   - **Display: Source Serif 4** (variable, optical size 48-60). Use it only for page titles, client and matter dossier headers, and empty-state headlines. It brings the chambers register without hurting data density.
   - **Bundling.** Both are SIL OFL 1.1 and **must be bundled for offline use**. Ship WOFF2 subset to Latin plus Latin-1 plus £ € and typographic punctuation (about 110KB for Inter roman, 150KB for Source Serif 4), and include the licence text in the app's notices.
   - **Fallback stack:** `Inter, "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif`.
6. **Double focus ring.** A 2px `focus` ring with a 2px gap in the surface colour reads on glass and on the accent button alike. It animates in over 120ms.
7. **One orchestrated moment.** On first load each day, the KPI figures count up once (600ms, ease-out). Everything else moves only in answer to the user: a 1px button press, a check stroke drawn on "Paid", selection fading in through `accentSoft`.
8. **Pointer specular** (Full only). A 6%-opacity radial highlight follows the cursor across the primary panel, like light on a glass desk. It's off under reduced motion and on Lite.
9. **Print and PDF stylesheet.** Force the Day tokens, opaque surfaces, `accentActive` for brand ink, and the dataviz 45/135-degree texture fill on chart series, so a client pack prints legibly on a mono laser.
10. **Density setting.** Offer Comfortable (row height 44px) and Compact (32px) for large ledgers and time sheets. Compact keeps the same glass but drops card padding by a third.

## 9. Re-running

`python3 validate.py` (standard library only, Python 3.8+) regenerates `validation.txt` and exits 1 on any failure. It looks for the dataviz skill's `validate_palette.py` (or the path in `DATAVIZ_VALIDATOR`) and records that script's verdict for every chart palette. Without it, the same checks run from the re-implemented formulas.
