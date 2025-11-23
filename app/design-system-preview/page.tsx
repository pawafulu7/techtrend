import {
  CardV2,
  CardV2Header,
  CardV2Title,
  CardV2Content,
  BadgeV2,
  ButtonV2,
} from '@/components/ui-v2';
import { designTokens } from '@/lib/design-tokens';

export default function DesignSystemPreviewPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="space-y-12">
        <section>
          <h1 className="text-4xl font-bold mb-2">TechTrend Design System</h1>
          <p className="text-lg text-muted-foreground mb-8">
            Modern design system primitives for UI/UX modernization
          </p>
        </section>

        <section>
          <h2 className="text-3xl font-semibold mb-6">Color Palette</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <div className="h-20 rounded-lg bg-(--tt-color-primary)" />
              <p className="text-sm font-medium">Primary</p>
              <p className="text-xs text-muted-foreground">{designTokens.colors.light.primary}</p>
            </div>
            <div className="space-y-2">
              <div className="h-20 rounded-lg bg-(--tt-color-secondary)" />
              <p className="text-sm font-medium">Secondary</p>
              <p className="text-xs text-muted-foreground">{designTokens.colors.light.secondary}</p>
            </div>
            <div className="space-y-2">
              <div className="h-20 rounded-lg bg-(--tt-color-positive)" />
              <p className="text-sm font-medium">Positive</p>
              <p className="text-xs text-muted-foreground">{designTokens.colors.light.positive}</p>
            </div>
            <div className="space-y-2">
              <div className="h-20 rounded-lg bg-(--tt-color-negative)" />
              <p className="text-sm font-medium">Negative</p>
              <p className="text-xs text-muted-foreground">{designTokens.colors.light.negative}</p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-3xl font-semibold mb-6">Typography</h2>
          <div className="space-y-4">
            <div>
              <h1 className="text-5xl font-bold">Heading 1 (Space Grotesk)</h1>
              <p className="text-xs text-muted-foreground mt-1">48px / Bold / Line height: tight</p>
            </div>
            <div>
              <h2 className="text-4xl font-semibold">Heading 2 (Space Grotesk)</h2>
              <p className="text-xs text-muted-foreground mt-1">36px / Semibold / Line height: tight</p>
            </div>
            <div>
              <h3 className="text-3xl font-semibold">Heading 3 (Space Grotesk)</h3>
              <p className="text-xs text-muted-foreground mt-1">30px / Semibold / Line height: tight</p>
            </div>
            <div>
              <p className="text-base">
                Body text using Inter font. This is optimized for readability with a line height of 1.5.
                The Inter font family provides excellent legibility across all screen sizes.
              </p>
              <p className="text-xs text-muted-foreground mt-1">16px / Regular / Line height: normal</p>
            </div>
            <div>
              <code className="text-sm bg-(--tt-color-surface-hover) px-2 py-1 rounded">
                const code = &apos;JetBrains Mono&apos;;
              </code>
              <p className="text-xs text-muted-foreground mt-1">14px / Regular / Monospace</p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-3xl font-semibold mb-6">CardV2 Component</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <CardV2 variant="default">
              <CardV2Header>
                <CardV2Title>Default Card</CardV2Title>
              </CardV2Header>
              <CardV2Content>
                <p className="text-sm text-muted-foreground">
                  Standard card with border and subtle shadow.
                </p>
              </CardV2Content>
            </CardV2>

            <CardV2 variant="hover">
              <CardV2Header>
                <CardV2Title>Hover Card</CardV2Title>
              </CardV2Header>
              <CardV2Content>
                <p className="text-sm text-muted-foreground">
                  Interactive card with lift animation on hover.
                </p>
              </CardV2Content>
            </CardV2>

            <CardV2 variant="ghost">
              <CardV2Header>
                <CardV2Title>Ghost Card</CardV2Title>
              </CardV2Header>
              <CardV2Content>
                <p className="text-sm text-muted-foreground">
                  Borderless, shadowless card for minimal design.
                </p>
              </CardV2Content>
            </CardV2>
          </div>
        </section>

        <section>
          <h2 className="text-3xl font-semibold mb-6">BadgeV2 Component</h2>
          <div className="flex flex-wrap gap-3">
            <BadgeV2 variant="default">Default</BadgeV2>
            <BadgeV2 variant="primary">Primary</BadgeV2>
            <BadgeV2 variant="secondary">Secondary</BadgeV2>
            <BadgeV2 variant="outline">Outline</BadgeV2>
            <BadgeV2 variant="primary" disabled>Disabled</BadgeV2>
          </div>
        </section>

        <section>
          <h2 className="text-3xl font-semibold mb-6">ButtonV2 Component</h2>

          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-semibold mb-4">Variants</h3>
              <div className="flex flex-wrap gap-3">
                <ButtonV2 variant="default">Default</ButtonV2>
                <ButtonV2 variant="primary">Primary</ButtonV2>
                <ButtonV2 variant="secondary">Secondary</ButtonV2>
                <ButtonV2 variant="ghost">Ghost</ButtonV2>
                <ButtonV2 variant="outline">Outline</ButtonV2>
              </div>
            </div>

            <div>
              <h3 className="text-xl font-semibold mb-4">Sizes</h3>
              <div className="flex flex-wrap items-center gap-3">
                <ButtonV2 variant="primary" size="sm">Small</ButtonV2>
                <ButtonV2 variant="primary" size="md">Medium</ButtonV2>
                <ButtonV2 variant="primary" size="lg">Large</ButtonV2>
              </div>
            </div>

            <div>
              <h3 className="text-xl font-semibold mb-4">States</h3>
              <div className="flex flex-wrap gap-3">
                <ButtonV2 variant="primary">Normal</ButtonV2>
                <ButtonV2 variant="primary" loading>Loading</ButtonV2>
                <ButtonV2 variant="primary" disabled>Disabled</ButtonV2>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-3xl font-semibold mb-6">Utility Classes</h2>

          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-semibold mb-4">Card Hover Effect</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="card-hover p-6 bg-(--tt-color-surface) border border-(--tt-color-border) rounded-lg">
                  <p className="text-sm">Hover over this card to see the lift effect</p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-xl font-semibold mb-4">Text Gradient</h3>
              <h2 className="text-4xl font-bold text-gradient">
                Gradient Heading Effect
              </h2>
            </div>

            <div>
              <h3 className="text-xl font-semibold mb-4">Glassmorphic</h3>
              <div className="glassmorphic p-6 rounded-lg">
                <p className="text-sm">Glassmorphism effect with backdrop blur</p>
              </div>
            </div>

            <div>
              <h3 className="text-xl font-semibold mb-4">Staggered Animation</h3>
              <div className="space-y-2">
                <div className="animate-stagger animate-stagger-delay-1 p-4 bg-(--tt-color-surface) border border-(--tt-color-border) rounded-lg">
                  Item 1 (0.1s delay)
                </div>
                <div className="animate-stagger animate-stagger-delay-2 p-4 bg-(--tt-color-surface) border border-(--tt-color-border) rounded-lg">
                  Item 2 (0.2s delay)
                </div>
                <div className="animate-stagger animate-stagger-delay-3 p-4 bg-(--tt-color-surface) border border-(--tt-color-border) rounded-lg">
                  Item 3 (0.3s delay)
                </div>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-3xl font-semibold mb-6">Accessibility</h2>
          <CardV2>
            <CardV2Header>
              <CardV2Title>WCAG AA Compliance</CardV2Title>
            </CardV2Header>
            <CardV2Content>
              <ul className="list-disc list-inside space-y-2 text-sm">
                <li>Light mode text contrast: 15.8:1 (AAA)</li>
                <li>Dark mode text contrast: 14.2:1 (AAA)</li>
                <li>Primary color contrast: 4.6:1 (AA)</li>
                <li>Focus-visible rings on all interactive elements</li>
                <li>Keyboard navigation support</li>
                <li>Reduced motion support (prefers-reduced-motion)</li>
              </ul>
            </CardV2Content>
          </CardV2>
        </section>
      </div>
    </div>
  );
}
