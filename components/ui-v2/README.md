# TechTrend Design System - UI V2 Components

Modern design system foundation for TechTrend UI/UX, aligned with 2024-2025 design trends.

## Overview

The TechTrend Design System provides a consistent, accessible, and modern UI foundation built on:
- **Design Tokens**: Single source of truth for colors, typography, shadows, spacing, and borders
- **Component Primitives**: CardV2, BadgeV2, ButtonV2 with modern styling
- **Utility Classes**: Tailwind CSS v4 component and utility layers
- **Typography**: Space Grotesk (headings), Inter (body), JetBrains Mono (code)

## Design Tokens

All design tokens are defined in `lib/design-tokens/` and auto-generated to CSS custom properties in `app/generated-tokens.css`.
The same file also defines the shadcn/ui variables (`--background`, `--primary`, ...) and the Tailwind `@theme` mapping, so `bg-tt-primary` / `text-tt-text-muted` and `bg-primary` / `text-muted-foreground` share one source. The critical CSS in `app/layout.tsx` is built from the same tokens (`lib/utils/design-tokens/build-css.ts`).

### Usage

```typescript
import { designTokens } from '@/lib/design-tokens';

// Access tokens
const primaryColor = designTokens.colors.light.primary; // #157439
const headingFont = designTokens.typography.family.heading; // Space Grotesk
const cardShadow = designTokens.shadows.cardRest;
```

### Color Palette

One brand color (green) and one neutral scale (slate) in both modes. State colors (positive / warning / negative / info) are for state messages only; actions and decoration use primary. Every fill has an `on*` text color, and each combination meets WCAG AA (checked by `__tests__/lib/design-tokens/contrast.test.ts`).

#### Light Mode
- **Primary**: `#157439` (green; white text 5.9:1)
- **Background / Surface**: `#FFFFFF`
- **Text**: `#0F172A` (slate-900)

#### Dark Mode
- **Primary**: `#22C55E` (green; `#020617` text 8.9:1)
- **Background**: `#020617` (slate-950)
- **Surface**: `#0F172A` (slate-900)
- **Text**: `#E2E8F0` (slate-200)

#### Usage in components

```tsx
<span className="bg-tt-primary text-tt-on-primary" />          // solid fill
<span className="bg-tt-primary-bg text-tt-primary" />          // tinted badge
<span className="bg-tt-negative text-tt-on-negative" />        // state fill
```

### Typography

#### Font Families
- **Heading**: `Space Grotesk` (modern, distinctive)
- **Body**: `Inter` (high readability)
- **Code**: `JetBrains Mono` (technical clarity)

#### Font Sizes
- `xs`: 12px, `sm`: 14px, `base`: 16px, `lg`: 18px, `xl`: 20px
- `2xl`: 24px, `3xl`: 30px, `4xl`: 36px, `5xl`: 48px

#### Line Heights
- `tight`: 1.25 (headings), `normal`: 1.5 (default), `relaxed`: 1.625, `loose`: 2

### Shadows

- One scale (`xs` ... `2xl`), emitted to Tailwind's `@theme` so `shadow-sm` etc. use the same values
- **cardRest** = `sm`, **cardHover** = `md`

## Component Primitives

### CardV2

Modern card component with soft shadows and hover effects.

#### Variants
- **default**: Standard card with border and shadow
- **hover**: Interactive card with lift animation on hover
- **ghost**: Borderless, shadowless card

#### Usage

```tsx
import { CardV2, CardV2Header, CardV2Title, CardV2Content } from '@/components/ui-v2';

<CardV2 variant="hover">
  <CardV2Header>
    <CardV2Title>Card Title</CardV2Title>
  </CardV2Header>
  <CardV2Content>
    Card content goes here
  </CardV2Content>
</CardV2>
```

### BadgeV2

Pill-shaped badge component with semantic variants.

#### Variants
- **default**: Gray badge for neutral information
- **primary**: Green badge for primary actions/states
- **secondary**: Tinted green badge (unread, scores)
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
- **primary**: Primary action button (green)
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
Card hover effect with lift and shadow transition.

### .animate-stagger
Staggered fade-in animation with delays (0.1s - 0.5s).

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
