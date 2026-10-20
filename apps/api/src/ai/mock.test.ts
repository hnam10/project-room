import { describe, expect, it } from 'vitest';
import { detectOpenQuestionByRules, extractActionItemsByRules } from './mock.js';

const msg = (authorId: string, text: string) => ({ id: text, authorId, authorName: authorId, text });

describe('mock AI rules', () => {
  it('turns commitments into tasks owned by the speaker', () => {
    const items = extractActionItemsByRules([msg('jamie', "I'll work on the password reset flow.")], []);
    expect(items).toEqual([{ title: 'Work on password reset flow', assigneeId: 'jamie', priority: 'medium', include: true }]);
  });

  it('finds several items in one message and marks deadline talk as high priority', () => {
    const items = extractActionItemsByRules([msg('alex', "I'll build the demo page. We still need to record the video by Friday.")], []);
    expect(items.map((i) => [i.title, i.assigneeId, i.priority])).toEqual([
      ['Build demo page', 'alex', 'medium'],
      ['Record the video by Friday', null, 'high'],
    ]);
  });

  it('skips tasks that already exist', () => {
    expect(extractActionItemsByRules([msg('alex', 'We need to write tests.')], ['Write tests'])).toEqual([]);
  });

  it('spots open questions', () => {
    expect(detectOpenQuestionByRules("We still haven't decided which database to use.")).toEqual({ topic: 'which database to use' });
    expect(detectOpenQuestionByRules('Should we ship dark mode first?')).toEqual({ topic: 'ship dark mode first' });
    expect(detectOpenQuestionByRules('Nice work everyone')).toBeNull();
  });
});
