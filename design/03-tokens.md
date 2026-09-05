# Vantage: tokens

A concrete starting palette and type system. Use it, or depart from it
deliberately and say why. Do not replace it with framework defaults.

Every value here is flat. There are no gradients in this system, so there is
nothing to reach for later.

## Why these colours

The colours an image or code generator reaches for by default are recognisable,
and this product cannot afford to look generated. Specifically avoided:

| Avoided | Why |
| --- | --- |
| `#6366F1` indigo, `#8B5CF6` violet, `#A855F7` purple | The single most overused default. Reads as generated instantly |
| `#3B82F6` blue, `#06B6D4` cyan | Untouched framework defaults |
| `#10B981` emerald as success | Same, and too bright next to serious content |
| `#6B7280` neutral gray | The default gray. Slightly cool custom neutrals read as considered |
| Warm cream and clay palettes | Too close to other products' identities |

The approach here is the one used by tools that look expensive: **the primary
action is near-black ink, not a colour.** Colour is reserved for meaning. That
removes the "what is our brand blue" problem entirely, keeps every status
legible, and is why Google's consoles, Linear and Mercury look calm. A single
accent exists for focus, links and selection, and appears nowhere else.

## Light theme

The default. Get this one genuinely right before touching dark.

```
Canvas            #F7F8F8    page background
Surface           #FFFFFF    cards, table rows, dialogs
Surface sunken    #F0F1F2    table headers, inset panels
Surface hover     #F0F1F2    row hover

Border subtle     #E3E5E7    row dividers, quiet separation
Border            #CDD1D4    inputs, card edges
Border strong     #A7ADB2    focused inputs, emphasis

Text primary      #15181B    body, table cells, headings
Text secondary    #454B50    labels, supporting copy
Text muted        #6B7177    timestamps, hints, placeholder
Text inverse      #FFFFFF    on ink

Ink               #15181B    primary button, active nav
Ink hover         #262B2F
Accent            #0F5257    links, focus ring, selection, the mark
Accent hover      #0B3E42
Accent wash       #E6EFEF    selected row, active filter chip
```

## Dark theme, true black

Base is `#000000`. Two notes that matter on OLED, where true black is worth
having in the first place.

**Do not use pure white for text.** `#FFFFFF` on `#000000` smears and haloes on
OLED and is genuinely tiring on a screen somebody reads tables on all afternoon.
`#F2F4F5` is the right amount of not-white.

**Borders have to work harder.** On true black there is no shadow to lean on, so
separation comes entirely from a border and a barely-raised surface. Do not go
below `#1C1F22` for a visible divider.

```
Canvas            #000000    page background, true black
Surface           #0A0B0C    cards, dialogs, raised rows
Surface sunken    #000000    table headers read as recessed
Surface hover     #141618

Border subtle     #1C1F22
Border            #2A2E33
Border strong     #3D4348

Text primary      #F2F4F5    deliberately not pure white
Text secondary    #A8AEB4
Text muted        #71787E
Text inverse      #000000    on ink

Ink               #F2F4F5    primary button inverts on dark
Ink hover         #D6DADD
Accent            #4FB3B8    lifted so it stays legible on black
Accent hover      #6FC7CB
Accent wash       #0D2224
```

## Status palette

Six states. Five carry a hue. The sixth is deliberately differentiated by
**form** rather than colour, and that is the important one.

### Light

```
Pending / neutral   text #4A5055   bg #F0F1F2   border #CDD1D4
In progress         text #1F63B8   bg #E7EEF9   border #B4CBEA
Confirmed           text #1B7A4B   bg #E4F2EA   border #B2D9C4
Warning             text #8A5800   bg #FBF0DC   border #EAD5A8
Failed              text #B3261E   bg #FBE9E7   border #EFC0BB
Unresolved          text #15181B   bg transparent   border #6B7177, 1.5px dashed
```

### Dark

```
Pending / neutral   text #A8AEB4   bg #141618   border #2A2E33
In progress         text #6BA5F2   bg #0B1929   border #1E3A5C
Confirmed           text #4FC183   bg #06180F   border #14472C
Warning             text #E0A33A   bg #1C1405   border #4A3510
Failed              text #F2685E   bg #1F0B09   border #4F1B16
Unresolved          text #F2F4F5   bg transparent   border #71787E, 1.5px dashed
```

### Why unresolved is drawn, not coloured

`unknown` means nobody knows whether the money moved. It is not a failure and it
must never be mistaken for one, but it is also not fine. Giving it a sixth hue
puts it in the same visual category as the outcomes, which is exactly wrong.

Instead: **no fill, a dashed border, and neutral ink.** It reads as incomplete
rather than as a result. It stays distinct in greyscale, when printed, and for
anyone who cannot separate red from green. It is the one place in this system
where form does the semantic work, and it is worth the exception.

Pair it with a consistent icon, and never show it without a "last checked" and
"next check" time next to it.

## Status to state mapping

Item statuses come from `src/domain/payout-item.ts`. Batch statuses from
`src/domain/payout-batch.ts`. Map every one:

| Status | Treatment |
| --- | --- |
| `pending`, `queued`, `draft`, `validating` | Pending |
| `sending`, `sent`, `disbursing`, `approved` | In progress |
| `confirmed`, `completed`, `closed` | Confirmed |
| `needs_fixes`, `pending_approval`, `completed_with_failures` | Warning |
| `failed`, `cancelled` | Failed |
| `unknown` | Unresolved |

`sending` is a special case: it is in progress on the item screen, but the
reconciliation view counts it as unresolved because it blocks batch closure.
Show it as in progress with the unresolved dashed border when it appears there.

## Type

**IBM Plex Sans** for the interface, **IBM Plex Mono** for figures that must
align and for anything an auditor reads character by character.

Chosen for three reasons. It has genuine tabular figures, which a column of
money needs. It reads as institutional rather than fashionable. And it is not
Inter, which is the default of every generated interface and would undo the work
of avoiding the default palette. Public Sans is a reasonable alternative if you
want something plainer.

Use IBM Plex Mono for: amounts in tables, M-Pesa receipts, conversation IDs,
correlation IDs, masked phone numbers, and the hashes in the verification block.
Those are all things somebody compares against another screen, character by
character, and a proportional font makes that harder than it needs to be.

```
Display    32px / 38px   600    the total on the approval screen
H1         24px / 32px   600    page titles
H2         18px / 26px   600    section headings
H3         15px / 22px   600    card and group headings
Body       14px / 22px   400    default
Body bold  14px / 22px   500
Small      13px / 20px   400    table cells, secondary copy
Caption    12px / 18px   400    timestamps, hints
Mono       13px / 20px   400    figures, receipts, identifiers
```

Turn on `font-variant-numeric: tabular-nums` everywhere a number appears in a
column. Right-align money. This is most of what makes a financial table feel
professional and it costs one line of CSS.

## Spacing, radius, motion

```
Space     2 4 6 8 12 16 20 24 32 40 56 80
Radius    2 (inputs, pills)  4 (cards, dialogs)  0 (table cells)
Border    1px default, 1.5px for the unresolved dashed treatment
Shadow    one only: 0 1px 2px rgba(0,0,0,0.06) on dialogs and popovers.
          Nothing else gets a shadow. Use borders.
```

A tight spacing scale, because this is a data tool. Small radii, because large
rounding on every surface is one of the clearest generated-interface tells.

Motion: 120ms for hover and focus, 160ms for a dialog, `ease-out`. Nothing
longer. No spring, no bounce, no staggered entrance animation on lists. Respect
`prefers-reduced-motion` and drop to zero.

## Focus

One focus treatment everywhere: a 2px accent ring at 2px offset. It must be
visible on white, on a hovered row, on a selected row, and on true black. Test
it on all four before committing. Never remove an outline without replacing it.

## Before you commit to this

- Check every status pair against a contrast checker for WCAG AA. The values
  here were chosen to clear it comfortably, but verify rather than trust.
- Screenshot the status palette and desaturate it. All six must still be
  separable. That is what the dashed unresolved treatment is protecting.
- Look at a full 300 row table in both themes for a minute. If anything vibrates
  or is tiring, the borders are too strong or the text is too close to pure
  white.
