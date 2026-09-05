# Vantage: assets

Read after `00-brief.md` and `01-structure.md`.

Part of your output is a set of **image generation prompts** the team will run
through ChatGPT to produce assets. Write them as specified at the bottom of this
file. Everything above that is what the prompts have to respect.

## Read this before writing any prompt

Image generation is good at some assets and bad at others, and pretending
otherwise wastes the team's time.

**Do not write generation prompts for interface icons.** Generated icon sets
come back inconsistent in stroke weight, off-grid, raster rather than vector,
and never pixel-crisp at 16 or 20px. Ten generated icons will not look like a
set. For the interface, specify an existing open icon library instead. Phosphor,
Radix Icons, Lucide and Heroicons are all fine. Name the one you chose, name the
weight and size you are using it at, and list the exact icons each screen needs.
Where a needed icon does not exist in that library, draw it as SVG yourself on
the same grid and stroke weight.

**Do write generation prompts for** the things generation is genuinely good at:
textures, paper and print surfaces, abstract geometric compositions, cover
artwork for the pack, illustrative marks for empty states, and exploration
sheets for the wordmark. These are decorative, they get placed by hand, and
small inconsistencies do not matter.

Say this distinction out loud in your output so nobody spends an afternoon
generating icons that will be thrown away.

## The constraint every asset inherits

Everything in `00-brief.md` under "Do not let it look AI-generated" applies to
generated assets, and generated assets are exactly where it goes wrong.

Every prompt you write must explicitly exclude: gradients, glows, neon, purple
to pink schemes, glassmorphism, 3D renders, glossy plastic, drop shadows,
lens flare, bokeh, stock-photo realism, mascots, cartoon characters, sparkles,
and any text or lettering inside the image.

Every prompt must explicitly require: flat colour, a stated limited palette,
transparent or plain background, consistent stroke weight where there are
strokes, and even margins.

Assets are for a document a donor's auditor will read. If it would look out of
place printed in one colour on the cover of an audit pack, it is wrong.

## What the product actually needs

Work out the real list from your own designs, but at minimum:

**Identity.** A wordmark, an app mark that survives at 16px, and a favicon.
One colour and reversed versions of each, because the pack cover prints.

**Empty states.** Six or so, one per screen that can be empty. These carry
personality, so they matter, but keep them abstract and geometric. No characters,
no mascots, no scenes. The reconciliation empty state is the important one, since
empty there means healthy and it should read as reassurance.

**Pack surfaces.** The cover of the reconciliation pack is the one thing in this
product that leaves the building and gets read by somebody who has never seen the
interface. It deserves real attention. A restrained cover treatment, and a very
subtle paper or fibre texture if you want the printed version to feel considered.

**Structural graphics.** Whatever your designs need to explain the payout
lifecycle, the maker-checker separation, or the verification block. Diagrams, not
decoration.

**Status and state marks.** Any non-icon visual language you invent for the seven
item statuses and ten batch statuses, particularly for `unknown`, which needs to
read as an open question rather than a failure.

## How to write the prompts

Batch them. Each prompt should produce a **sheet of many related assets in one
generation**, not a single asset, so the team runs a handful of prompts rather
than fifty. A sheet also keeps a set internally consistent, which separate
generations will not be.

Aim for six to ten prompts total, each producing a full sheet.

### Required format for each prompt

Give each one as a fenced code block the team can copy whole, preceded by a short
line saying what it is for and what to do with the output.

Each prompt must state, in this order:

1. The layout. "A 4 by 3 grid of separate marks on a single sheet, even spacing,
   generous margin between each, each mark centred in its cell."
2. The subject list, numbered, one line each, concrete and specific.
3. The visual system. Flat vector, stroke weight, corner treatment, geometry.
4. The exact palette, as hex values taken from your design tokens. Do not write
   "muted tones", write the colours.
5. The background. Transparent, or a named flat colour.
6. The exclusion list. Explicit, every time, because it will drift otherwise.
7. The output framing. Square or a stated ratio, high resolution, no text or
   lettering anywhere in the image.

### Worked example of the shape expected

Not the actual content, which you should derive from your designs. This is the
level of specificity required.

> **Sheet 3 of 8: empty state marks.** Generate, then cut each cell out and
> place at roughly 160px wide in the empty states.
>
> ```
> A single flat vector sheet arranged as a 3 by 2 grid of six separate abstract
> marks, evenly spaced, each centred in its own cell with generous margin, no
> cell borders.
>
> The six marks, in order:
> 1. An empty ledger: a rectangle with four evenly spaced horizontal rules, one
>    rule shorter than the rest
> 2. A cleared queue: five short horizontal bars in a stack, the top three
>    dissolving into dots toward the right
> 3. ...
>
> Visual system: flat two dimensional vector illustration, geometric
> construction, uniform 3px stroke weight, rounded stroke ends, no fills except
> where stated, no perspective, no depth.
>
> Palette, exactly these and nothing else: #1A1A1A for strokes, #E8E6E1 for
> fills, #2F6F5E as a single accent used sparingly on one element per mark.
>
> Background: fully transparent.
>
> Do not include: gradients, shadows, glows, neon, 3D rendering, glossy or
> plastic surfaces, textures, characters, mascots, faces, hands, sparkles,
> stars, any text, letters, numbers or labels anywhere in the image.
>
> Output: square, high resolution, flat, evenly lit, print safe.
> ```

### Also give the team

- A one line note per sheet saying what to do with the output: which screen it
  goes on, and at what size.
- A short paragraph on what to check before accepting a generation. At minimum:
  stroke weights match across the sheet, no lettering crept in, the palette was
  respected, and it still reads at the size it will actually be used.
- A note that generated raster needs tracing to SVG, or exporting at 3x, before
  it goes anywhere near the interface.
