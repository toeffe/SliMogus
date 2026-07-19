import { describe, expect, it } from 'vitest';
import {
  advanceMeetingTimers,
  createMeetingState,
  DISCUSSION_TICKS,
  tallyVotes,
  VOTE_SKIP_TARGET,
} from './meeting';

describe('tallyVotes', () => {
  it('ejects the plurality winner', () => {
    const votes = new Map([
      [0, 1],
      [1, 1],
      [2, 0],
    ]);
    expect(tallyVotes(votes, new Set([0, 1, 2]), new Set([0, 1, 2]))).toBe(1);
  });

  it('returns null on a tie', () => {
    const votes = new Map([
      [0, 1],
      [1, 0],
    ]);
    expect(tallyVotes(votes, new Set([0, 1]), new Set([0, 1]))).toBeNull();
  });

  it('returns null when skip wins or ties', () => {
    const skipWins = new Map([
      [0, VOTE_SKIP_TARGET],
      [1, VOTE_SKIP_TARGET],
      [2, 0],
    ]);
    expect(tallyVotes(skipWins, new Set([0, 1, 2]), new Set([0, 1, 2]))).toBeNull();
  });

  it('ignores votes from dead voters', () => {
    const votes = new Map([
      [0, 1],
      [1, 1],
      [2, 0], // dead — ignored
    ]);
    expect(tallyVotes(votes, new Set([0, 1]), new Set([0, 1]))).toBe(1);
  });
});

describe('advanceMeetingTimers', () => {
  it('moves discussion → voting → results → finished', () => {
    const meeting = createMeetingState({ reason: 'emergency', reportedBy: 0, bodyId: null });
    meeting.discussionTicksRemaining = 1;
    expect(advanceMeetingTimers(meeting)).toBe('ongoing');
    expect(meeting.stage).toBe('voting');

    meeting.votingTicksRemaining = 1;
    expect(advanceMeetingTimers(meeting)).toBe('ongoing');
    expect(meeting.stage).toBe('results');

    meeting.resultsTicksRemaining = 1;
    expect(advanceMeetingTimers(meeting)).toBe('finished');
  });

  it('starts with a full discussion timer', () => {
    const meeting = createMeetingState({ reason: 'body', reportedBy: 1, bodyId: 3 });
    expect(meeting.discussionTicksRemaining).toBe(DISCUSSION_TICKS);
    expect(meeting.tallied).toBe(false);
  });
});
