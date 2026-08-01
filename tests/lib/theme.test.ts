import { beforeEach, describe, expect, it } from 'vitest';
import { applyAccent, applyCalm, resolveTheme, setTeamAccent } from '@/lib/theme';

describe('resolveTheme', () => {
  it('passes explicit modes straight through', () => {
    expect(resolveTheme('dark')).toBe('dark');
    expect(resolveTheme('light')).toBe('light');
  });

  it('falls back to light when the OS reports no dark preference', () => {
    // tests/setup.ts stubs matchMedia to always report `matches: false`.
    expect(resolveTheme('system')).toBe('light');
  });
});

describe('applyAccent', () => {
  beforeEach(() => {
    delete document.documentElement.dataset.accent;
  });

  it('writes the preset onto the root element', () => {
    applyAccent('violet');
    expect(document.documentElement.dataset.accent).toBe('violet');
  });

  it("maps 'team' to the cyan base, since the live match overrides it", () => {
    applyAccent('team');
    expect(document.documentElement.dataset.accent).toBe('cyan');
  });
});

describe('applyCalm', () => {
  it('sets and removes the calm flag', () => {
    applyCalm(true);
    expect(document.documentElement.dataset.calm).toBe('true');
    applyCalm(false);
    expect(document.documentElement.dataset.calm).toBeUndefined();
  });
});

describe('setTeamAccent', () => {
  beforeEach(() => {
    document.documentElement.dataset.theme = 'dark';
    setTeamAccent(null);
  });

  it('applies a team colour as an inline accent', () => {
    setTeamAccent('#004ba0');
    const accent = document.documentElement.style.getPropertyValue('--accent');
    expect(accent).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('lightens a very dark team colour so it stays readable on a dark surface', () => {
    setTeamAccent('#000814');
    const accent = document.documentElement.style.getPropertyValue('--accent');
    expect(accent.toLowerCase()).not.toBe('#000814');
  });

  it('picks a foreground colour that contrasts with the accent', () => {
    setTeamAccent('#fdd835'); // bright yellow → needs dark text
    expect(document.documentElement.style.getPropertyValue('--accent-fg')).toBe('#04141a');
  });

  it('clears the override when passed null', () => {
    setTeamAccent('#ff0000');
    setTeamAccent(null);
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('');
  });
});
