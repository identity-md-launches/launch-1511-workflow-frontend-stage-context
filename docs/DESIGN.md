# SOREN implemented design

## Overview

SOREN is an onchain mystery hunt presented as an intercepted terminal transmission. The implementation uses a near-black background, pale green text, bright green actions, red errors, a static scanline layer, a brief title glitch and a typewriter effect for opened transmissions. The main interaction stays ahead of background story: wallet, vault counters, chapter selection and commit/reveal controls precede swaps, the solver records and lore.

This document is under `docs/` because the assignment's overriding write scope forbids creating root `DESIGN.md`. It describes `web/src/` and the delivered static export, not a proposed redesign.

## Colors

All semantic colors are in `web/src/styles.css :root`; there is one intentional dark theme and no theme toggle.

| Token | Value | Role |
| --- | --- | --- |
| `--bg` | `#080c09` | Page and field background |
| `--surface` | `#101710` | Console, standard buttons |
| `--surface-raised` | `#172017` | Hover/selected controls and disabled primary surface |
| `--text` | `#dce8dc` | Body and headings |
| `--muted` | `#a0b09f` | Supporting text, units, metadata |
| `--accent` | `#9cfc7b` | Main action, links, successful/active signal |
| `--accent-hover` | `#b9ffa2` | Interactive hover |
| `--danger` | `#ff8c87` | Errors and loss-of-signal cue |
| `--line` | `#344433` | Structural boundaries |
| `--focus` | `#d5ffbe` | Two-pixel keyboard focus outline |
| `--on-accent` | `#102008` | Text on the green primary button |

Every status has text or a shape as well as color. Error and muted text are never substituted with the border token. `::selection` uses the accent/on-accent pair. The probe measured the resolvable text/background pairs and passed its contrast threshold; the decorative scanline overlay is not independently measured by that probe. See the measured evidence and limitations in `FRONTEND_VALIDATION.md`.

## Typography

The local system stack is `SFMono-Regular, Consolas, Liberation Mono, Menlo, monospace`. No remote fonts are loaded. The monospace prose deliberately follows the explicit terminal brief. A platform may choose a different installed member of that stack.

| Token | Size at 16px root | Use |
| --- | --- | --- |
| `--text-sm` | 13px | Status, metadata, compact controls and help |
| `--text-base` | 16px | Body, inputs, chapter headings |
| `--text-lg` | 20px | Compact section headings, mobile counters |
| `--text-xl` | 24px | Desktop section headings, intermediate counters |
| `--text-title` | 32px | Narrow-screen headline, timers, desktop counters |
| `--text-display` | 56px | Wide-screen headline and lore symbol |

Weights are 400, 600 and 700. The main headline uses 700, 1.08 line height and -0.05em tracking on wide screens; it becomes 32px with -0.035em tracking below 54rem. Section headings use 600. Body line height is 1.5; transmission text uses 1.65. Headings balance their wrapping. Long-form paragraphs have a 70ch cap. Inputs remain 16px or larger. Changing amounts use tabular numbers; critical addresses and values wrap rather than being clipped. The header's compact wallet address expands to the complete checksummed, copyable address.

## Layout

The header, main and footer share a 1160px maximum outer width with 2rem inline padding. Internal spacing uses quarter-rem increments, with 0.5–0.75rem inside controls and 1–3rem between groups. The desktop console has two columns: transmission and guess. Swap and owner forms use two columns; lore pairs its mark with a readable text column.

At 54rem the headline and outer spacing contract. At 42rem the console becomes one column, and its DOM parts are ordered visually as chapter selection, selected status, the main guess control, then the disclosed transmission. This keeps the action in the first screen while leaving a visible “Read transmission” disclosure. Other forms become one column, the decorative waveform and lore mark disappear, and outer padding becomes 1rem. The header and chapter status row can wrap, including with enlarged text.

The seven chapter selectors use `minmax(0, 1fr)` and a seven-column grid. The disclosed chapter-record archive uses three columns, then two at 42rem. Long addresses, hashes, balances, transmissions and errors use wrapping. There are no fixed-position transaction buttons or menus covering the page. Wallet details expand in normal flow.

Production rendering has been checked at 320, 390, 768 and 1440 CSS pixels. The first 390×844 screen shows the product, counters, chapter state, wallet and primary action. Browser-native zoom and physical devices are distinct checks and are not inferred from viewport emulation.

## Elevation & depth

The interface is flat. Borders communicate the console edge, selected chapter, field boundaries and section separators. It does not use card shadows or gradient text. The console surface is slightly lighter than the page; interactive hover is lighter again.

The body scanlines are a fixed, low-opacity, noninteractive pseudo-element (`pointer-events: none`, z-index 5). They do not capture clicks or change layout. The skip link sits above it when focused. There are no modal layers or focus traps because there are no dialogs.

## Shapes

Controls have a 3px radius; the console has 4px. These small radii support the terminal character without introducing nested rounded cards. The signal indicator is a 7px circle. Chapter marks use a dot for locked/open state and a short bar for solved state; the explicit text status remains available in the selected panel and all chapter records.

## Components

- `ui.tsx / Field`: visible, programmatically associated label; help text is separate and connected through `aria-describedby`. Native inputs and textareas. UTF-8 counters sit by owner text fields.
- `ui.tsx / ActionButton`: normal or primary action, per-action pending label and indicator, native disabled state. A positive label names the exact transaction. Busy state spans simulation, signing and mined confirmation.
- `ui.tsx / Status`: persistent inline success/error/pending text and transaction explorer link. Errors use `role="alert"`; routine updates use `role="status"`.
- `ui.tsx / AddressLink`: complete checksummed address, explorer link, clipboard action and failure feedback. Long values wrap. The primary explorer destination comes from runtime configuration.
- `ui.tsx / WalletGate`: connect action, visible wrong-chain guidance, then the eligible action. Swap connection says “Connect to swap”; the hunt says “Connect to play”.
- `App.tsx`: header wallet disclosure, metrics, chapter selectors, transcript disclosure, chapter-record archive, lore and contract footer. Native `<details>` is used for secondary information. Transmission text is rendered as text, never HTML.
- `Guess.tsx`: prepare/backup/approve/commit/reveal states, chain-derived countdown, recovery export/import and archived-record restoration. The irreversible cost and backup requirement remain beside the main control.
- `Swap.tsx`: direction controls, amount/slippage fields, quote review, separate approvals and final swap. Changing input or wallet invalidates the quote.
- `Owner.tsx`: owner-only setup, funding, publication and hints. Permanent choices have explicit acknowledgements.
- `History.tsx`: solver records, wallet totals and a range-scoped event leaderboard. Loading, cancellation, errors and partial coverage are named explicitly.

Native buttons and disclosures support keyboard activation. `:focus-visible` uses a 2px outline with a 4px offset and respects forced colors. Buttons aim for 44px height; address copy actions are 32px and comfortably separated. The typewriter starts when the transmission is opened and has a “Show full transmission” action. Under reduced motion it immediately shows the full text. The title glitch runs once for 650ms; button transitions target specific properties for 150ms. The spinner runs only during pending work and stops under reduced motion.

## Do's and don'ts

Use the shared width and spacing, semantic color tokens, `Field`, `ActionButton`, `Status` and `AddressLink` for additional controls. Put the consequence, units, prerequisites and recoverable error next to an action. Preserve full values and use progressive disclosure for secondary detail.

Keep the headline strongest and the transaction controls above lore. Keep the actual contract state authoritative; use an unknown state until a verified read succeeds. Do not add marketing labels above each heading, cards inside cards, remote fonts, endless decorative animation, fake players or invented USD prices. Do not change the terminal's deliberate monospace typography to satisfy a generic sans-serif preference.

A future screen should compose existing section/field patterns, use hash navigation or a separately exported static page, and consume the same runtime deployment manifest. Contract behavior and new address configuration are separate engineering changes, not visual styling choices.
