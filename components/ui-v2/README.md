# TechTrend Design System - UI V2 Components

Design system foundation for TechTrend UI/UX. The direction is an observatory: trend data is the hero, and the rest of the UI stays quiet.

## Overview

The TechTrend Design System provides a consistent, accessible, and modern UI foundation built on:

- **Design Tokens**: Single source of truth for colors, typography, shadows, spacing, and borders
- **Component Primitives**: CardV2, BadgeV2, ButtonV2 with modern styling
- **Utility Classes**: Tailwind CSS v4 component and utility layers
- **Typography**: Mona Sans (Latin and numerals, headings and body), JetBrains Mono (code). Japanese uses the OS font

## Design Tokens

All design tokens are defined in `lib/design-tokens/` and auto-generated to CSS custom properties in `app/generated-tokens.css`.
The same file also defines the shadcn/ui variables (`--background`, `--primary`, ...) and the Tailwind `@theme` mapping, so `bg-tt-primary` / `text-tt-text-muted` and `bg-primary` / `text-muted-foreground` share one source. The critical CSS in `app/layout.tsx` is built from the same tokens (`lib/utils/design-tokens/build-css.ts`).

### Usage

```typescript
import { designTokens } from '@/lib/design-tokens';

// Access tokens
const primaryColor = designTokens.colors.light.primary; // #3A3FC0
const headingFont = designTokens.typography.family.heading; // Mona Sans
const cardShadow = designTokens.shadows.cardRest;
```

### Color Palette

One brand color (indigo) and one neutral system per mode (`ink` for light, `night` for dark, both indigo-tinted; see `lib/design-tokens/palette.ts`). State colors (positive / warning / negative / info) are for state messages only; actions and decoration use primary. The heat colors (`heat1`–`heat4`, indigo → violet → magenta → orange) encode data intensity only (trend growth); never use them for buttons or decoration. Every fill has an `on*` text color, and each combination meets WCAG AA (checked by `__tests__/lib/design-tokens/contrast.test.ts`).

#### Light Mode

- **Primary**: `#3A3FC0` (indigo; white text 7.9:1)
- **Canvas**: `#F0F2F8` (flat; no gradient)
- **Surface**: `#FFFFFF`
- **Text**: `#111633`, muted `#525B78`
- **Heat**: `#5B4BD6` / `#A23BB5` / `#BE2B57` / `#B83A0B`

#### Dark Mode

- **Primary**: `#A3ADFF` (indigo; `#090E22` text 9.1:1)
- **Canvas / Background**: `#090E22`
- **Surface**: `#10172F`
- **Text**: `#E3E7F5`, muted `#98A1C2`
- **Heat**: `#8C7DFF` / `#D27BEA` / `#FF7A9B` / `#FFA25C`

#### Usage in components

```tsx
<span className="bg-tt-primary text-tt-on-primary" />          // solid fill
<span className="bg-tt-primary-bg text-tt-primary" />          // tinted badge
<span className="bg-tt-negative text-tt-on-negative" />        // state fill
```

### Typography

#### Font Families

- **Heading / Body**: `Mona Sans` (variable: weight 200–900, width 75–125%). Japanese glyphs come from the OS font stack; headings use `palt`
- **Code**: `JetBrains Mono`
- **Readouts** (`.readout` in `app/globals.css`): Mona Sans at width 75%, weight 700, tabular numerals, for counts and metrics

#### Font Sizes

- `xs`: 12px, `sm`: 14px, `base`: 16px, `lg`: 18px, `xl`: 20px
- `2xl`: 24px, `3xl`: 30px, `4xl`: 36px, `5xl`: 48px

#### Line Heights

- `tight`: 1.25 (headings), `normal`: 1.5 (default), `relaxed`: 1.625, `loose`: 2

### Shadows

- One scale (`xs` ... `2xl`), emitted to Tailwind's `@theme` so `shadow-sm` etc. use the same values
- **cardRest** = `sm`, **cardHover** = `md` (kept as tokens). Cards themselves do not use shadows: they are separated by borders, and `.card-hover` darkens the border on hover

## Component Primitives

### CardV2

Card component separated by a border (no shadow).

#### Variants

- **default**: Standard card with border
- **hover**: Interactive card; the border darkens on hover
- **ghost**: Borderless, shadowless card

#### Usage

```tsx
import {
  CardV2,
  CardV2Header,
  CardV2Title,
  CardV2Content,
} from '@/components/ui-v2';

<CardV2 variant="hover">
  <CardV2Header>
    <CardV2Title>Card Title</CardV2Title>
  </CardV2Header>
  <CardV2Content>Card content goes here</CardV2Content>
</CardV2>;
```

### BadgeV2

Pill-shaped badge component with semantic variants.

#### Variants

- **default**: Gray badge for neutral information
- **primary**: Green badge for primary actions/states
- **secondary**: Tinted indigo badge (unread, scores)
- **outline**: Bordered transparent badge

#### Usage

```tsx
import { BadgeV2 } from '@/components/ui-v2';

<BadgeV2 variant="primary">New</BadgeV2>
<BadgeV2 variant="outline" disabled>Disabled</BadgeV2>
```

### ButtonV2

Enhanced button component with loading states and icon support.

#### Variants

- **default**: Primary-colored button (alias of primary)
- **primary**: Primary action button (indigo)
- **secondary**: Neutral secondary button
- **ghost**: Transparent button with hover background
- **outline**: Bordered transparent button

#### Sizes

- **sm**: Small (text: 14px)
- **md**: Medium (text: 16px)
- **lg**: Large (text: 18px)

#### Props

- `loading`: Show spinner icon and disable interaction
- `iconOnly`: Adjust padding for icon-only buttons
- `disabled`: Disable button (50% opacity)

#### Usage

```tsx
import { ButtonV2 } from '@/components/ui-v2';

<ButtonV2 variant="primary" size="md">Click me</ButtonV2>
<ButtonV2 variant="primary" loading>Loading...</ButtonV2>
<ButtonV2 variant="ghost" size="sm" iconOnly><Icon /></ButtonV2>
```

## Utility Classes

### .card-hover

Darkens the card border on hover / focus-within (no lift, no shadow).

### Navigation tabs

`navTabClass(active)` and `isNavActive(pathname, href, { exact })` in `nav-tab.ts`: text tabs with a 2px indigo underline for the current page (header navigation and its "その他" menu). The trend sub-navigation shares `isNavActive` only. `aria-current="page"` goes on the exact page; a parent item whose section is open gets `aria-current="true"`.

## Accessibility

### WCAG AA Compliance

- Brand / state fills and their `on*` text, and brand / state colors as text, meet AA (4.5:1) in both modes
- Computed per token pair in `__tests__/lib/design-tokens/contrast.test.ts`

### Keyboard Navigation

- Focus-visible rings on all interactive elements
- Proper ARIA attributes

### Reduced Motion

All animations respect `prefers-reduced-motion: reduce`.

## Development

### Generate CSS Tokens

```bash
npm run generate:tokens
```

### Preview Components

Visit: [Design System Preview](http://localhost:3000/design-system-preview)

### Testing

```bash
npm run build
npm run lint
npm run type-check
```

## References

- Investigation: `.claude/docs/investigate/investigate_20251123_125410_637_ui-ux-modernization.md`
- Plan: `.claude/docs/plan/plan_20251123_132615_089_ui-ux-modernization-phase0.md`
