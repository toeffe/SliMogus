/** How long living players can talk before voting opens (~10s). */
export const DISCUSSION_TICKS = 600;
/** How long voting stays open (~20s). */
export const VOTING_TICKS = 1200;
/** Brief pause after the tally so peers can show the result (~3s). */
export const RESULTS_TICKS = 180;
/** Emergency meetings each living player may call over the whole game. */
export const EMERGENCY_MEETINGS_PER_PLAYER = 1;
/** Sentinel vote target meaning "skip". */
export const VOTE_SKIP_TARGET = -1;

export type MeetingStage = 'discussion' | 'voting' | 'results';
export type MeetingReason = 'body' | 'emergency';

export interface MeetingState {
  reason: MeetingReason;
  reportedBy: number;
  bodyId: number | null;
  stage: MeetingStage;
  discussionTicksRemaining: number;
  votingTicksRemaining: number;
  resultsTicksRemaining: number;
  /** voterId → targetPlayerId (or `VOTE_SKIP_TARGET`). Only living players' votes count. */
  votes: Map<number, number>;
  /** Set once the tally runs; `null` means a tie / all-skip → no ejection. */
  ejectedPlayerId: number | null;
  /** Guards against tallying twice (early "everyone voted" path vs timer expiry). */
  tallied: boolean;
}

export function createMeetingState(options: {
  reason: MeetingReason;
  reportedBy: number;
  bodyId: number | null;
}): MeetingState {
  return {
    reason: options.reason,
    reportedBy: options.reportedBy,
    bodyId: options.bodyId,
    stage: 'discussion',
    discussionTicksRemaining: DISCUSSION_TICKS,
    votingTicksRemaining: VOTING_TICKS,
    resultsTicksRemaining: RESULTS_TICKS,
    votes: new Map(),
    ejectedPlayerId: null,
    tallied: false,
  };
}

/**
 * Plurality tally: the living player (or skip) with the most votes wins.
 * Any tie for first place — including a tie involving skip — ejects nobody.
 * Only votes whose `voterId` is in `livingVoterIds` are counted (a player
 * who died mid-meeting can't vote; their earlier vote is ignored).
 */
export function tallyVotes(
  votes: ReadonlyMap<number, number>,
  livingVoterIds: ReadonlySet<number>,
  livingCandidateIds: ReadonlySet<number>,
): number | null {
  const counts = new Map<number, number>();
  counts.set(VOTE_SKIP_TARGET, 0);
  for (const candidateId of livingCandidateIds) counts.set(candidateId, 0);

  for (const [voterId, targetId] of votes) {
    if (!livingVoterIds.has(voterId)) continue;
    if (targetId !== VOTE_SKIP_TARGET && !livingCandidateIds.has(targetId)) continue;
    counts.set(targetId, (counts.get(targetId) ?? 0) + 1);
  }

  let bestTarget: number | null = null;
  let bestCount = -1;
  let tied = false;
  for (const [targetId, count] of [...counts.entries()].sort((a, b) => a[0] - b[0])) {
    if (count > bestCount) {
      bestCount = count;
      bestTarget = targetId;
      tied = false;
    } else if (count === bestCount) {
      tied = true;
    }
  }

  if (tied || bestCount <= 0 || bestTarget === VOTE_SKIP_TARGET) return null;
  return bestTarget;
}

/** Advances discussion → voting → results. Returns `'ongoing'` while the meeting continues, `'finished'` once results have played out. */
export function advanceMeetingTimers(meeting: MeetingState): 'ongoing' | 'finished' {
  if (meeting.stage === 'discussion') {
    meeting.discussionTicksRemaining -= 1;
    if (meeting.discussionTicksRemaining <= 0) {
      meeting.stage = 'voting';
      meeting.discussionTicksRemaining = 0;
    }
    return 'ongoing';
  }
  if (meeting.stage === 'voting') {
    meeting.votingTicksRemaining -= 1;
    if (meeting.votingTicksRemaining <= 0) {
      meeting.stage = 'results';
      meeting.votingTicksRemaining = 0;
    }
    return 'ongoing';
  }
  meeting.resultsTicksRemaining -= 1;
  if (meeting.resultsTicksRemaining <= 0) return 'finished';
  return 'ongoing';
}
