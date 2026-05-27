# Memshare Design System

The visual language for Memshare. Inherited from Memcon. Read this before
touching any UI file.

## Philosophy — five rules

1. **Monochrome only.** Background is `#0a0a0a` (never pure black). Text is
   a ladder of grays through to `#f4f4f4`. The only hue is `--live: #3dd07a`
   on pulse indicators. No accent color — not even on call-to-actions.
2. **No bordered cards.** No rounded corners >4px, no drop shadows, no
   gradients. Sections separate with 1px hairlines and negative space.
3. **Massive display type next to tiny micro-labels.** Inter Tight at
   `clamp(2.5rem, 7vw, 6rem)` with `letter-spacing: -.035em` against
   `.66rem` uppercase tracking-`.16em` labels. Mid-sizes are rare.
4. **Editorial 3-column grids.** Default to `1.1fr 1.6fr 1fr`. Left-aligned.
   Center only quotes and CTAs.
5. **Different interaction per section.** Live clock, accordion,
   hover-side-panel, tab switcher, marquee, underline-on-hover,
   pad-left-on-hover, fade-up reveal. Never reuse one on the same page.

## Color ladder

```
--bg      #0a0a0a    --line      #1a1a1a    --text      #f4f4f4
--bg-2    #101010    --line-2    #262626    --text-2    #cfcfcf
--bg-3    #151515    --line-3    #3a3a3a    --dim       #8a8a8a
                                            --faint     #5a5a5a
                                            --ghost     #2c2c2c
--live    #3dd07a    --error     #e07070
```

Use them in order. If something needs a barely-visible line, that's `--line`.
Don't invent new hex values.

## Type

```
Inter Tight     display, headings, brand, big numbers, buttons
Inter           body text, form inputs, default UI
JetBrains Mono  code, signatures, terminal, .mono micro-labels
```

The visual identity is the two-family contrast plus negative-letter-spacing
on display type and wide tracking on labels. Drop any of those three and it
collapses into generic Bootstrap.

## Anti-patterns

- ❌ Rounded corners >4px
- ❌ Drop shadows, gradients
- ❌ Color accents (blue, brand color, etc.)
- ❌ Icon next to every label — tracking-`.16em` uppercase IS the icon
- ❌ Multi-paragraph copy inside "cards" — one sentence each
- ❌ Centered text as default
- ❌ Bracket-corner decorations
- ❌ Reusing the same hover effect on five+ sections
- ❌ Pure `#000` background — `#0a0a0a` always

## Interaction menu

Pick a different one per section:

- **Live clock** — header microcopy, ticking seconds with pulse dot
- **Cursor crosshair** — hero only, lines + pixel coords
- **Accordion** — clickable rows expand inline
- **Hover side-panel** — grid + sticky panel that updates on hover
- **Tab switcher** — underline-only, OS / mode pickers
- **Marquee** — full-bleed scrolling band, hover pauses
- **Pad-left on hover** — rows slide right `.5rem` on hover
- **Underline-reveal** — animated `::after` underline on focus words

## Working files

- [public/css/base.css](../public/css/base.css) — variables, type, utilities
- [public/index.html](../public/index.html) — landing page
- [public/app.html](../public/app.html) — chat UI

The one-line summary:

> Editorial typography on lines, not in boxes. Different interaction per
> section. One word of color, ever — and it's reserved for "alive".
