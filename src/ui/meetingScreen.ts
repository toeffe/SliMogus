import type { MeetingState } from '@game/meeting';
import type { PlayerInfo } from '@net/protocol';

export interface MeetingScreenHandle {
  update: (meeting: MeetingState | null, aliveById: ReadonlyMap<number, boolean>) => void;
  destroy: () => void;
}

export interface MeetingScreenOptions {
  players: readonly PlayerInfo[];
  localPlayerId: number;
  onVote: (targetId: number | 'skip') => void;
}

/**
 * HTML meeting overlay: discussion/voting timers + per-player vote buttons.
 * Votes are forwarded to the scene's `KeyboardController.queueAction` so they
 * ride the same lockstep input path as keyboard actions.
 */
export function createMeetingScreen(
  root: HTMLElement,
  options: MeetingScreenOptions,
): MeetingScreenHandle {
  const el = document.createElement('div');
  el.className = 'meeting';
  el.hidden = true;
  root.appendChild(el);

  let lastKey = '';
  let hasVoted = false;

  const update = (meeting: MeetingState | null, aliveById: ReadonlyMap<number, boolean>): void => {
    if (!meeting) {
      el.hidden = true;
      lastKey = '';
      hasVoted = false;
      return;
    }

    const localAlive = aliveById.get(options.localPlayerId) === true;
    const seconds = (ticks: number): number => Math.ceil(ticks / 60);
    // Key on whole seconds (not raw ticks) so vote buttons aren't torn down/rebuilt
    // 60 times a second — that was detaching the DOM under Playwright's click.
    const statusSeconds =
      meeting.stage === 'discussion'
        ? seconds(meeting.discussionTicksRemaining)
        : meeting.stage === 'voting'
          ? seconds(meeting.votingTicksRemaining)
          : seconds(meeting.resultsTicksRemaining);
    const structureKey = [
      meeting.stage,
      meeting.ejectedPlayerId ?? 'n',
      meeting.tallied ? 1 : 0,
      hasVoted ? 1 : 0,
      [...aliveById.entries()].map(([id, alive]) => `${id}:${alive ? 1 : 0}`).join(','),
    ].join('|');
    const statusText =
      meeting.stage === 'discussion'
        ? `Discussion — ${statusSeconds}s`
        : meeting.stage === 'voting'
          ? `Voting — ${statusSeconds}s`
          : meeting.ejectedPlayerId === null
            ? 'No one was ejected.'
            : `${options.players.find((player) => player.playerId === meeting.ejectedPlayerId)?.name ?? `Player ${meeting.ejectedPlayerId + 1}`} was ejected.`;

    el.hidden = false;

    // Fast path: only the countdown label changed — patch text, keep vote buttons mounted.
    if (structureKey === lastKey) {
      const statusEl = el.querySelector('.meeting__status');
      if (statusEl) statusEl.textContent = statusText;
      return;
    }
    lastKey = structureKey;

    const reason = meeting.reason === 'body' ? 'Body reported' : 'Emergency meeting';

    const voteButtons =
      meeting.stage === 'voting' && localAlive && !hasVoted
        ? [
            ...options.players
              .filter((player) => aliveById.get(player.playerId))
              .map(
                (player) =>
                  `<button type="button" class="meeting__vote" data-vote="${player.playerId}">${player.name}</button>`,
              ),
            `<button type="button" class="meeting__vote meeting__vote--skip" data-vote="skip">Skip</button>`,
          ].join('')
        : hasVoted
          ? `<p class="meeting__voted">Vote cast.</p>`
          : '';

    el.innerHTML = `
      <div class="meeting__card">
        <h2 class="meeting__title">${reason}</h2>
        <p class="meeting__status">${statusText}</p>
        <div class="meeting__votes">${voteButtons}</div>
      </div>
    `;

    el.querySelectorAll<HTMLButtonElement>('[data-vote]').forEach((button) => {
      button.addEventListener('click', () => {
        const value = button.dataset.vote;
        if (!value || hasVoted) return;
        hasVoted = true;
        if (value === 'skip') options.onVote('skip');
        else options.onVote(Number(value));
        lastKey = ''; // force re-render to show "Vote cast"
        update(meeting, aliveById);
      });
    });
  };

  return {
    update,
    destroy: () => el.remove(),
  };
}
