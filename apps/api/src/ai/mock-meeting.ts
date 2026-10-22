import type { MeetingAi, MeetingTickInput, RawTick } from './meeting.js';
import { validateTick } from './meeting.js';

// Rule-based stand-in for the live meeting AI: cue phrases only, no external service. Labelled mock in the UI.

const ITEM = /(?:\bi'll|\bwe need to)\s+(.+?)(?:[.!?]|$)/i;
const ITEM_KO = /(.+?)\s*(?:할게요|해야 해)/;
const IDEA = /what if|how about|어때/i;
const DISAGREE = /\bbut\b|\bdisagree\b|근데/i;

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const mockMeetingAi: MeetingAi = {
  name: 'mock',
  isMock: true,

  async meetingTick(input: MeetingTickInput) {
    const raw: RawTick = { actionItems: [], ideas: [], polls: [], runningSummary: '' };
    input.lines.forEach((line, i) => {
      const { text } = line;
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
        raw.ideas.push({
          ideaId: null,
          title: text.replace(/[?!.]+$/, '').slice(0, 80),
          description: '',
          theme: 'Product',
          reason: `${line.speakerName} floated this idea.`,
          quote: text,
        });
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

  async summarizeMeeting() {
    throw new Error('summarizeMeeting is not implemented yet');
  },
};
