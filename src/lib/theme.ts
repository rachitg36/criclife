/**
 * Theme application. Mirrors the blocking script in index.html —
 * if you change the storage keys or the logic here, change it there too.
 * docs/08-DESIGN-SYSTEM.md § 2
 */

export type ThemeMode = 'dark' | 'light' | 'system';
export type AccentName = 'cyan' | 'violet' | 'lime' | 'amber' | 'rose' | 'azure' | 'team';

export const STORAGE_KEYS = {
  theme: 'criclife.theme',
  accent: 'criclife.accent',
  calm: 'criclife.calm',
} as const;

export const ACCENT_PRESETS: readonly AccentName[] = [
  'cyan',
  'violet',
  'lime',
  'amber',
  'rose',
  'azure',
  'team',
];

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

export function resolveTheme(mode: ThemeMode): 'dark' | 'light' {
  if (mode === 'system') return darkQuery().matches ? 'dark' : 'light';
  return mode;
}

/** Writes the resolved theme onto <html> and syncs the browser chrome colour. */
export function applyTheme(mode: ThemeMode): void {
  const resolved = resolveTheme(mode);
  document.documentElement.dataset.theme = resolved;

  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]:not([media])');
  if (meta) meta.content = resolved === 'dark' ? '#05070d' : '#f6f8fc';
}

export function applyAccent(accent: AccentName): void {
  // 'team' means "follow the batting team" — the live match sets --accent
  // directly via setTeamAccent(), so we fall back to cyan as the base.
  document.documentElement.dataset.accent = accent === 'team' ? 'cyan' : accent;
}

export function applyCalm(calm: boolean): void {
  if (calm) document.documentElement.dataset.calm = 'true';
  else delete document.documentElement.dataset.calm;
}

/**
 * Tints the entire UI toward the batting team's colour during a live match.
 * Auto-corrects lightness so the colour always clears contrast against the
 * current surface — we shift the team's colour rather than reject it.
 * docs/08-DESIGN-SYSTEM.md § 2 "Team tinting".
 */
export function setTeamAccent(hex: string | null): void {
  const root = document.documentElement;
  if (!hex) {
    root.style.removeProperty('--accent');
    root.style.removeProperty('--accent-fg');
    return;
  }
  const isDarkTheme = root.dataset.theme === 'dark';
  const corrected = ensureReadable(hex, isDarkTheme);
  root.style.setProperty('--accent', corrected);
  root.style.setProperty(
    '--accent-fg',
    relativeLuminance(corrected) > 0.45 ? '#04141a' : '#ffffff'
  );
}

/** Nudges a colour's lightness until it has enough contrast to read as an accent. */
function ensureReadable(hex: string, onDark: boolean): string {
  const target = onDark ? 0.42 : 0.3;
  const { h, s, l: startL } = hexToHsl(hex);
  let l = startL;
  let guard = 0;
  while (guard++ < 24) {
    const lum = relativeLuminance(hslToHex(h, s, l));
    if (onDark ? lum >= target : lum <= target) break;
    l += onDark ? 4 : -4;
    if (l > 92 || l < 8) break;
  }
  return hslToHex(h, s, Math.min(92, Math.max(8, l)));
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: s * 100, l: l * 100 };
}

function hslToHex(h: number, s: number, l: number): string {
  const sN = s / 100;
  const lN = l / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lN - c / 2;
  const seg = Math.floor(h / 60) % 6;
  const table: ReadonlyArray<readonly [number, number, number]> = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ];
  const [r, g, b] = table[seg] ?? table[0]!;
  const to = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

function relativeLuminance(hex: string): number {
  const clean = hex.replace('#', '');
  const channel = (i: number) => {
    const v = parseInt(clean.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/** Calls back whenever the OS theme flips, so 'system' mode stays live. */
export function watchSystemTheme(cb: () => void): () => void {
  const mq = darkQuery();
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

/**
 * Circular wipe from the toggle position using the View Transitions API,
 * falling back to an instant swap where unsupported.
 */
export function transitionTheme(apply: () => void, origin?: { x: number; y: number }): void {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const calm = document.documentElement.dataset.calm === 'true';

  type DocWithVT = Document & {
    startViewTransition?: (cb: () => void) => { ready: Promise<void> };
  };
  const doc = document as DocWithVT;

  if (prefersReduced || calm || typeof doc.startViewTransition !== 'function') {
    apply();
    return;
  }

  const transition = doc.startViewTransition(apply);
  if (!origin) return;

  const { x, y } = origin;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));

  void transition.ready.then(() => {
    document.documentElement.animate(
      {
        clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`],
      },
      {
        duration: 420,
        easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
        pseudoElement: '::view-transition-new(root)',
      }
    );
  });
}
