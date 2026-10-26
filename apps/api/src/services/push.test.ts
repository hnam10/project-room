import { describe, expect, it } from 'vitest';
import { isReviewableSuggestion } from './push.js';

describe('isReviewableSuggestion', () => {
  it('notifies idea, risk and topic drafts', () => {
    expect(isReviewableSuggestion({ kind: 'idea', status: 'pending', title: 'Draft' })).toBe(true);
    expect(isReviewableSuggestion({ kind: 'risk', status: 'pending', title: 'Slip' })).toBe(true);
    expect(isReviewableSuggestion({ kind: 'brainstorm_topic', status: 'pending', title: 'New topic' })).toBe(true);
  });

  it('skips dismissed cards and hidden brainstorm checks', () => {
    expect(isReviewableSuggestion({ kind: 'idea', status: 'dismissed', title: 'Draft' })).toBe(false);
    expect(isReviewableSuggestion({ kind: 'brainstorm_analysis', status: 'pending', title: 'Brainstorm checked: product' })).toBe(false);
  });

  it('notifies research cards the Assistant tab shows', () => {
    expect(isReviewableSuggestion({ kind: 'brainstorm_analysis', status: 'pending', title: 'Topic research: fitness' })).toBe(true);
  });
});
