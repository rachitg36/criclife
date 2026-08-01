# Self-hosted fonts

Two variable font files are expected here. They are **not** committed —
download them once during setup.

| File | Source | Licence |
|---|---|---|
| `inter-variable.woff2` | https://rsms.me/inter/ (or `npm pack @fontsource-variable/inter`) | SIL Open Font Licence 1.1 |
| `geist-variable.woff2` | https://vercel.com/font (or `npm pack geist`) | SIL Open Font Licence 1.1 |

Quickest route:

```bash
npm i -D @fontsource-variable/inter geist
cp node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2 public/fonts/inter-variable.woff2
cp node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2            public/fonts/geist-variable.woff2
npm rm @fontsource-variable/inter geist
```

Self-hosting rather than using the Google Fonts CDN is deliberate: it removes a
third-party request, improves LCP, and means the app renders correctly offline.
See `docs/14-FREE-TIER-PLAN.md` § 5.

Until these files exist the app falls back to the system UI font — everything
still works, it just looks less distinctive.
