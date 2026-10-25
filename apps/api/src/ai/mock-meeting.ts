import type { MeetingAi, MeetingTickInput, RawTick, SummarizeInput } from './meeting.js';
import { validateSummary, validateTick } from './meeting.js';

// Rule-based stand-in for the live meeting AI: cue phrases only, no external service. Labelled mock in the UI.

const ITEM = /(?:\bi'll|\bwe need to)\s+(.+?)(?:[.!?]|$)/i;
const ITEM_KO = /(.+?)\s*(?:할게요|해야 해)/;
const IDEA = /what if|how about|어때/i;
const DISAGREE = /\bbut\b|\bdisagree\b|근데/i;
const TOPIC = /(?:\b(?:brainstorm|ideas? for|how (?:can|should) we|what should we)\b|아이디어|어떻게)/i;

/** Capitalizes the first character for readable mock meeting output. */
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const GENERIC_WORDS = new Set(
  'what should about ideas could with the for how can would will our your this that from and but want need use add new app application product project feature build create make help users team brainstorm topic'.split(
    ' ',
  ),
);
/** Extracts distinctive words that can safely associate a transcript with a topic. */
const topicWords = (text: string) =>
  new Set(
    (
      text
        .normalize('NFKC')
        .toLowerCase()
        .match(/[\p{L}\p{N}]+/gu) ?? []
    ).filter((word) => (word.length > 2 || /\p{Script=Hangul}/u.test(word)) && !GENERIC_WORDS.has(word)),
  );

/** A mock cannot infer meaning: require distinctive evidence and abstain on shared or tied matches. */
function matchTopic(text: string, topics: NonNullable<MeetingTickInput['topics']>) {
  const words = topicWords(text);
  const candidates = topics.map((topic) => ({ topic, words: topicWords(topic.title) }));
  const matches = candidates
    .map((candidate) => ({
      ...candidate,
      score: [...candidate.words].filter((word) => words.has(word)).length,
    }))
    .filter(
      (candidate) =>
        candidate.score >= 2 ||
        (candidate.words.size === 1 &&
          candidate.score === 1 &&
          !candidates.some((other) => other.topic.id !== candidate.topic.id && [...candidate.words].some((word) => other.words.has(word)))),
    )
    .sort((a, b) => b.score - a.score);
  return matches[0] && matches[0].score !== matches[1]?.score ? matches[0].topic : null;
}

export const mockMeetingAi: MeetingAi = {
  name: 'mock',
  isMock: true,

  async meetingTick(input: MeetingTickInput) {
    const raw: RawTick = { actionItems: [], ideas: [], polls: [], runningSummary: '' };
    input.lines.forEach((line, i) => {
      const { text } = line;
      if (!raw.topic && TOPIC.test(text)) {
        raw.topic = {
          title: text
            .trim()
            .replace(/[.!]+$/, '')
            .slice(0, 80),
          description: '',
          reason: `${line.speakerName} framed the team's brainstorm goal.`,
          quote: text,
        };
      }
      const item = text.match(ITEM) ?? text.match(ITEM_KO);
      if (item?.[1]) {
        raw.actionItems.push({
          title: capitalize(item[1].trim()),
          assigneeId: /\bi'll|할게요/i.test(text) ? line.speakerId : null,
          priority: 'medium',
          reason: `${line.speakerName} said this needs doing.`,
          quote: text,
        });
      }
      if (IDEA.test(text)) {
        const matched = matchTopic(text, input.topics ?? []);
        if (matched) {
          raw.ideas.push({
            topicId: matched.id,
            ideaId: null,
            title: text.replace(/[?!.]+$/, '').slice(0, 80),
            description: '',
            theme: 'Product',
            reason: `${line.speakerName} floated this idea.`,
            quote: text,
          });
        }
      }
      const other = input.lines
        .slice(0, i)
        .reverse()
        .find((l) => l.speakerId !== line.speakerId);
      if (other && DISAGREE.test(text) && !raw.polls.length) {
        raw.polls.push({
          question: 'Which direction should we take?',
          options: [other.text, text],
          reason: `${line.speakerName} and ${other.speakerName} seem to disagree.`,
          quote: text,
        });
      }
    });
    const prev = input.runningSummary.trim().split(/\s+/).filter(Boolean);
    const last = input.lines.at(-1)?.text.split(/\s+/) ?? [];
    raw.runningSummary = [...prev, ...last].slice(-150).join(' ');
    return validateTick(raw, input);
  },

  async summarizeMeeting(input: SummarizeInput) {
    // The first sentence of each speaker turn, plus cue-phrase decisions and questions.
    const turns: string[] = [];
    let last: string | null = null;
    for (const line of input.lines) {
      if (line.speakerId !== last) turns.push(line.text.split(/(?<=[.!?])\s/)[0]!);
      last = line.speakerId;
    }
    const texts = input.lines.map((l) => l.text);
    const openQuestions = texts.filter((t) => /\?\s*$/.test(t));
    const tick = await mockMeetingAi.meetingTick({ ...input, runningSummary: '', alreadySuggested: [] });
    const actionItems = tick.actionItems.map(({ sourceLineId: _s, include: _i, reason, ...item }) => ({ ...item, reason: reason ?? '' }));
    return validateSummary(
      {
        topic: tick.topic,
        summary: {
          overview: turns.join(' '),
          decisions: texts.filter((t) => /decided|let's go with|정했/i.test(t)),
          openQuestions,
          nextSteps: actionItems.map((i) => i.title),
        },
        actionItems,
        carryOverItems: openQuestions.slice(0, 5),
      },
      input,
    );
  },
};
