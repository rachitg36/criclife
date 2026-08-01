import { useEffect, type ReactNode } from 'react';
import { useUiStore } from '@/stores/uiStore';
import { applyAccent, applyCalm, applyTheme, STORAGE_KEYS, watchSystemTheme } from '@/lib/theme';

/**
 * Applies persisted preferences to <html> on mount, and keeps the discrete
 * localStorage keys in sync with the ones the blocking script in index.html
 * reads. Zustand persists a single JSON blob; the blocking script needs plain
 * scalar keys because it must run before any JS parsing cost.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useUiStore((s) => s.theme);
  const accent = useUiStore((s) => s.accent);
  const calmMode = useUiStore((s) => s.calmMode);

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEYS.theme, theme);
    } catch {
      /* private mode */
    }
  }, [theme]);

  useEffect(() => {
    applyAccent(accent);
    try {
      localStorage.setItem(STORAGE_KEYS.accent, accent);
    } catch {
      /* private mode */
    }
  }, [accent]);

  useEffect(() => {
    applyCalm(calmMode);
    try {
      localStorage.setItem(STORAGE_KEYS.calm, String(calmMode));
    } catch {
      /* private mode */
    }
  }, [calmMode]);

  // Keep 'system' mode live if the OS flips theme while the app is open.
  useEffect(() => {
    if (theme !== 'system') return;
    return watchSystemTheme(() => applyTheme('system'));
  }, [theme]);

  return <>{children}</>;
}
