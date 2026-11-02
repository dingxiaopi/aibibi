# UI component sources

Retrieved 2026-10-15 from shadcn/ui's official Radix Nova registry:
`https://ui.shadcn.com/r/styles/radix-nova/<component>.json`.

Button, Input, Textarea, Select, Checkbox, Toggle, ToggleGroup, Skeleton,
Card, Badge, Separator and Spinner use the official Nova source, with these
project adaptations: `cn` and component imports resolve to local aliases;
registry icon placeholders resolve to Lucide; data-state selectors match
our installed Radix primitives; loading animations respect reduced motion.
The existing Radix dependencies are retained. `components.json` uses the
schema-supported `radix-nova` style.

License: MIT, retained in `LICENSE.shadcn`.
Upstream: https://github.com/shadcn-ui/ui

Typography and layout use the project's own tokens. No fonts, quotes or
inventory were copied from the reference website.
