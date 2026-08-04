import { describe, expect, it } from 'vitest';
import {
  createCustomConfig,
  CUSTOM_DEFAULTS,
  DEFAULT_CONFIG,
  resolveMaxOversPerBowler,
} from '../../src/engine/config';

describe('resolveMaxOversPerBowler', () => {
  it("resolves 'auto' to ceil(oversPerInnings / 5)", () => {
    expect(
      resolveMaxOversPerBowler({
        ...DEFAULT_CONFIG,
        oversPerInnings: 20,
        maxOversPerBowler: 'auto',
      })
    ).toBe(4);
    expect(
      resolveMaxOversPerBowler({ ...DEFAULT_CONFIG, oversPerInnings: 8, maxOversPerBowler: 'auto' })
    ).toBe(2);
  });

  it('passes an explicit number straight through', () => {
    expect(resolveMaxOversPerBowler({ ...DEFAULT_CONFIG, maxOversPerBowler: 10 })).toBe(10);
  });
});

describe('createCustomConfig', () => {
  it('seeds from CUSTOM_DEFAULTS, not DEFAULT_CONFIG, and labels itself Custom', () => {
    // Deliberately *not* the app-wide default. `DEFAULT_CONFIG` is a
    // twenty-over eleven-a-side game; "Custom" is reached in practice by
    // someone setting up a short game, so it starts where they are going.
    const config = createCustomConfig();
    expect(config).toEqual({ ...CUSTOM_DEFAULTS, rulesProfileName: 'Custom' });
    expect(config.oversPerInnings).toBe(2);
    expect(config.playersPerSide).toBe(3);
    expect(config.freeHitAfterNoBall).toBe(true);
    expect(config.superOverOnTie).toBe(true);
  });

  it('applies overrides on top of those defaults', () => {
    const config = createCustomConfig({ oversPerInnings: 15, ballsPerOver: 8 });
    expect(config.oversPerInnings).toBe(15);
    expect(config.ballsPerOver).toBe(8);
    expect(config.rulesProfileName).toBe('Custom');
    expect(config.playersPerSide).toBe(CUSTOM_DEFAULTS.playersPerSide);
  });
});
