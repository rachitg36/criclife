import { render, screen } from '@testing-library/react';
import { describe, expect, it, beforeEach } from 'vitest';
import { WinCelebration } from '@/components/ui/WinCelebration';
import { useUiStore } from '@/stores/uiStore';

/**
 * The confetti has now been invisible twice, in two different ways, and both
 * times everything else on the screen rendered perfectly — so nothing caught
 * it but a human looking.
 *
 * First it animated `y: '110vh'` inside a card a few hundred pixels tall with
 * `overflow: hidden`, and spent the animation clipped. Then the "fix" made it
 * `y: '115%'` — which in motion, exactly like a CSS transform, is a percentage
 * of *the element's own height*. Twelve-pixel pieces moved twelve pixels, from
 * a starting position above the card, so they never appeared at all.
 *
 * These do not test that it looks good. They test that the pieces exist and
 * that calm mode removes them, which is the difference between "the animation
 * is subtle" and "the animation is not there".
 */
describe('WinCelebration', () => {
  beforeEach(() => useUiStore.setState({ calmMode: false }));

  const props = {
    teamName: 'Cologne',
    teamColor: '#2266ff',
    headline: 'Cologne won by 4 wickets.',
    players: [{ id: 'p1', name: 'Rahul', note: '64*' }],
  };

  it('renders confetti pieces', () => {
    const { container } = render(<WinCelebration {...props} />);
    // jsdom has no IntersectionObserver, which is the path that plays
    // immediately — deliberately, since never showing is the worse failure.
    expect(container.querySelectorAll('[aria-hidden] span').length).toBeGreaterThan(0);
  });

  it('names the winners and lists the side', () => {
    render(<WinCelebration {...props} />);
    expect(screen.getByText('Cologne')).toBeInTheDocument();
    expect(screen.getByText('Rahul')).toBeInTheDocument();
    expect(screen.getByText('64*')).toBeInTheDocument();
  });

  it('shows the player of the match, labelled as our own pick', () => {
    render(<WinCelebration {...props} playerOfTheMatch={{ name: 'Rahul', summary: '64* · 2-11' }} />);
    expect(screen.getByText('Player of the match')).toBeInTheDocument();
    // The label matters: there is no ICC rule behind this number.
    expect(screen.getByText(/CricLife/)).toBeInTheDocument();
  });

  it('drops the confetti entirely in calm mode', () => {
    useUiStore.setState({ calmMode: true });
    const { container } = render(<WinCelebration {...props} />);
    expect(container.querySelectorAll('[aria-hidden] span').length).toBe(0);
    // The screen itself still stands — calm mode removes motion, not content.
    expect(screen.getByText('Cologne')).toBeInTheDocument();
  });
});
