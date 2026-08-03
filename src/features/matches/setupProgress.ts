/**
 * What match setup still needs before `start_innings` will accept it.
 *
 * Pure, because the answer is worth testing and the screen it drives is four
 * Supabase queries deep.
 *
 * This mirrors `start_innings`'s own preconditions — a toss, and a squad for
 * each side — deliberately and narrowly. The server stays the authority and
 * will refuse anyway; the point of checking here is that the refusal used to
 * arrive as a raw `XI_REQUIRED: …` after a round trip, on a button sitting
 * below the fold, with nothing on the page saying which of the three steps
 * were done. Somebody who filled in the first team's squad and stopped had
 * every reason to think setup was finished, went back to the hub, and was
 * offered "Continue setup" — which returned them to the screen they had just
 * left. That loop is what this closes.
 *
 * Anything beyond those two conditions belongs on the server only. Mirroring
 * more of it is how `record_delivery` drifted from the engine (HANDOFF § 8.14).
 */

export type SetupProgress = {
  tossSet: boolean;
  aReady: boolean;
  bReady: boolean;
  canStart: boolean;
  /** What to tell the user, or null when nothing is in the way. */
  blocker: string | null;
};

export function setupProgress(input: {
  tossWinnerTeamId: string | null | undefined;
  squadACount: number;
  squadBCount: number;
  teamAName: string;
  teamBName: string;
}): SetupProgress {
  const tossSet = Boolean(input.tossWinnerTeamId);
  // Any squad at all, not a full one: `playersPerSide` is the cap, and sides
  // turn up short. `start_innings` asks the same question — `exists (...)`.
  const aReady = input.squadACount > 0;
  const bReady = input.squadBCount > 0;
  const canStart = tossSet && aReady && bReady;

  // One thing at a time, in the order the screen presents them.
  const blocker = !tossSet
    ? 'Confirm the toss first.'
    : !aReady
      ? `Pick a squad for ${input.teamAName} first.`
      : !bReady
        ? `Pick a squad for ${input.teamBName} first.`
        : null;

  return { tossSet, aReady, bReady, canStart, blocker };
}
