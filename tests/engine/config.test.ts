import { describe, expect, it } from 'vitest';
import {
  createCustomConfig,
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
  it('seeds from DEFAULT_CONFIG and labels itself Custom', () => {
    const config = createCustomConfig();
    expect(config).toEqual({ ...DEFAULT_CONFIG, rulesProfileName: 'Custom' });
  });

  it('applies overrides on top of the defaults', () => {
    const config = createCustomConfig({ oversPerInnings: 15, ballsPerOver: 8 });
    expect(config.oversPerInnings).toBe(15);
    expect(config.ballsPerOver).toBe(8);
    expect(config.rulesProfileName).toBe('Custom');
    expect(config.playersPerSide).toBe(DEFAULT_CONFIG.playersPerSide);
  });
});
