/**
 * One thing plays at a time.
 *
 * A dataset page holds many cards, each with a video and an audio player, so a
 * second play used to leave two soundtracks running on top of each other. Every
 * player announces itself here before starting; the announcement pauses
 * whatever was playing, including the read-aloud voice.
 *
 * No React context: the state is a single module variable, which is exactly the
 * scope it needs and keeps working across a remount.
 */

type Stoppable = { pause: () => void };

let current: Stoppable | null = null;

/** Stop whatever is playing and make `player` the one that is. */
export function claimPlayback(player: Stoppable): void {
  if (current && current !== player) {
    try {
      current.pause();
    } catch {
      // A detached element can throw; it is not playing any more either way.
    }
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  current = player;
}

/** Called when a player pauses or ends on its own. */
export function releasePlayback(player: Stoppable): void {
  if (current === player) current = null;
}
