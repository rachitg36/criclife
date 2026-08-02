# Self-hosted fonts

Two variable font files, **committed to the repo**. The SIL Open Font Licence
permits redistribution, and the build has no font-fetching step — so if these
were gitignored, every CI build and every deploy would ship an app that 404s on
its own preloads.

| File | Source | Licence |
|---|---|---|
| `inter-variable.woff2` | https://rsms.me/inter/ (or `npm pack @fontsource-variable/inter`) | SIL Open Font Licence 1.1 — `Inter-LICENSE.txt` |
| `geist-variable.woff2` | https://vercel.com/font (or `npm pack geist`) | SIL Open Font Licence 1.1 — `Geist-LICENSE.txt` |

They are wired up in `index.html`: a `<link rel=preload>` and an `@font-face`
per file, both `font-display: swap`. `src/styles/tokens.css` maps them to
`--font-ui` (Inter) and `--font-display` (Geist).

To refresh them to a newer release:

```bash
npm i -D @fontsource-variable/inter geist
cp node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2 public/fonts/inter-variable.woff2
cp node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2              public/fonts/geist-variable.woff2
cp node_modules/@fontsource-variable/inter/LICENSE public/fonts/Inter-LICENSE.txt
cp node_modules/geist/LICENSE.txt                  public/fonts/Geist-LICENSE.txt
npm rm @fontsource-variable/inter geist
```

Both are latin-subset, weight-variable, upright only. There is no italic file —
nothing in the design system calls for one. `--font-mono` in `tokens.css` names
`'Geist Mono'`, which is **not** self-hosted; it falls back to `ui-monospace`.
Nothing uses `--font-mono` yet, so that is currently cosmetic.

Self-hosting rather than using the Google Fonts CDN is deliberate: it removes a
third-party request, improves LCP, and means the app renders correctly offline.
See `docs/14-FREE-TIER-PLAN.md` § 5.

Until these files exist the app falls back to the system UI font — everything
still works, it just looks less distinctive.
