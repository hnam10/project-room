import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, connectDb } from '../db/client.js';
import { seedDemoData } from '../db/seed.js';
import { THREAD_LIMIT, createMessage, messagesForMention, searchMessages, searchTerms } from './messages.js';

beforeAll(async () => {
  await connectDb('mem://');
  await seedDemoData();
});

afterAll(closeDb);

describe('searchMessages', () => {
  it('finds a phrase in this project only, ignoring case', async () => {
    await createMessage({
      projectId: 'hackathon',
      channelId: 'hackathon-general',
      authorId: 'morgan',
      text: 'The neon pineapple demo is on Thursday',
    });

    const hits = await searchMessages('hackathon', 'NEON pineapple');
    expect(hits.some((message) => message.text.includes('neon pineapple'))).toBe(true);
    expect(await searchMessages('other-project', 'neon pineapple')).toEqual([]);
    expect(await searchMessages('hackathon', 'n')).toEqual([]);
  });
});

describe('message recall', () => {
  it('keeps words that identify what was asked', () => {
    expect(searchTerms('@AI where do we host the demo?')).toEqual(['host', 'demo']);
  });

  it('finds an older message by those words and ignores other projects', async () => {
    await createMessage({
      projectId: 'recall',
      channelId: 'recall-general',
      authorId: 'morgan',
      text: 'The venue is the campus hall.',
    });
    for (let i = 0; i < THREAD_LIMIT; i++) {
      await createMessage({
        projectId: 'recall',
        channelId: 'recall-general',
        authorId: 'alex',
        text: `Filler note ${i} about the standup.`,
      });
    }
    await createMessage({
      projectId: 'other',
      channelId: 'other-general',
      authorId: 'alex',
      text: 'The venue is a secret warehouse.',
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    await createMessage({
      projectId: 'recall',
      channelId: 'recall-general',
      authorId: 'alex',
      text: '@AI where is the venue?',
    });

    const thread = await messagesForMention('recall', 'recall-general');
    expect(thread.some((message) => message.text === 'The venue is the campus hall.')).toBe(true);
    expect(thread.some((message) => message.text.includes('secret warehouse'))).toBe(false);
    expect(thread.at(-1)?.text).toBe('@AI where is the venue?');
    expect(thread.filter((message) => message.text.startsWith('Filler note')).length).toBeLessThan(THREAD_LIMIT);
  });
});
