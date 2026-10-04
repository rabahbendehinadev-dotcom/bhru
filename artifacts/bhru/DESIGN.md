# BHRU Design System (demo)

Dense, professional dark navy interface shared by Login, Platform Admin and the Subscriber Panel.

- Tokens: `tokens.json` (DTCG) mirrored as CSS variables in `src/index.css` (`--background`, `--card`, `--primary`, `--brand`, `--ok`, `--warn`, `--danger`, `--violet`).
- Accents: blue = primary action, orange = logo and registration CTA, green = online/success, orange = warning, red = suspended/error, purple = subtle.
- Typography: Geist 13px base, Geist Mono for keys/IDs; tables 12px.
- Primitives (`src/components/bhru/ui.tsx`, classes in `index.css`): `Card`, `Btn` (`.btn`, variants primary/brand/ok/warn/danger), `Field`, `Badge`, `StatusBadge`, `PlanBadge`, `Modal`, `ConfirmDialog`, `Metric`, `Pager`, `.tbl` tables.
- Rules: 1px restrained borders, no heavy gradients or animation, compact rows, no emojis.
- Vocabulary: "BHRU Subscriber" (platform customer) is always distinct from "Subscriber Customer" (end customer of a subscriber).
- All data is synthetic and stored in localStorage (demo only; passwords are never stored).
