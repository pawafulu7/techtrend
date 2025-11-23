# TechTrend Design System - UI V2 Components

Modern design system foundation for TechTrend UI/UX, aligned with 2024-2025 design trends.

## Overview

The TechTrend Design System provides a consistent, accessible, and modern UI foundation built on:
- **Design Tokens**: Single source of truth for colors, typography, shadows, spacing, and borders
- **Component Primitives**: CardV2, BadgeV2, ButtonV2 with modern styling
- **Utility Classes**: Tailwind CSS v4 component and utility layers
- **Typography**: Space Grotesk (headings), Inter (body), JetBrains Mono (code)

## Design Tokens

All design tokens are defined in `lib/design-tokens.ts` and auto-generated to CSS custom properties in `app/generated-tokens.css`.

### Usage

```typescript
import { designTokens } from '@/lib/design-tokens';

// Access tokens
const primaryColor = designTokens.colors.light.primary; // #16A34A
const headingFont = designTokens.typography.family.heading; // Space Grotesk
const cardShadow = designTokens.shadows.cardRest;
```

### Color Palette

#### Light Mode
- **Primary**: `#16A34A` (green, AA-compliant 4.6:1 contrast)
- **Secondary**: `#F97316` (orange)
- **Background**: `#F8FAFC` (off-white)
- **Surface**: `#FFFFFF` (card background)
- **Text**: `#0F172A` (dark slate, 15.8:1 contrast)

#### Dark Mode
- **Primary**: `#22C55E` (brighter green)
- **Secondary**: `#F97316` (orange)
- **Background**: `#0B1220` (deep blue-black)
- **Surface**: `#111827` (card background)
- **Text**: `#E5E7EB` (light gray, 14.2:1 contrast)

#### CSS Variables

```css
/* Light mode (default) */
--tt-color-primary: #16A34A;
--tt-color-on-primary: #FFFFFF;
--tt-color-surface: #FFFFFF;
--tt-color-text: #0F172A;

/* Dark mode (.dark class) */
.dark {
  --tt-color-primary: #22C55E;
  --tt-color-surface: #111827;
  --tt-color-text: #E5E7EB;
}
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

- **cardRest**: `0 2px 8px -2px rgb(0 0 0 / 0.08)` (soft shadow for cards)
- **cardHover**: `0 8px 16px -4px rgb(0 0 0 / 0.12)` (elevated shadow on hover)

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
- **secondary**: Orange badge for secondary actions/states
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
- **default**: Standard button with border
- **primary**: Primary action button (green)
- **secondary**: Secondary action button (orange)
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

### .text-gradient
Gradient text effect from primary to secondary color.

### .glassmorphic
Glassmorphism effect with backdrop blur.

### .animate-stagger
Staggered fade-in animation with delays (0.1s - 0.5s).

## Accessibility

### WCAG AA Compliance
- Light mode text: 15.8:1 (AAA)
- Dark mode text: 14.2:1 (AAA)
- Primary color: 4.6:1 (AA)

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
Visit: http://localhost:3000/design-system-preview

### Testing
```bash
npm run build
npm run lint
npm run type-check
```

## References
- Investigation: `.claude/docs/investigate/investigate_20251123_125410_637_ui-ux-modernization.md`
- Plan: `.claude/docs/plan/plan_20251123_132615_089_ui-ux-modernization-phase0.md`
