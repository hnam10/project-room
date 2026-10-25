import {
  AI_AUTHOR,
  splitLine,
  type ActionItem,
  type Meeting,
  type Member,
  type Suggestion,
  type TranscriptLine,
} from '@project-room/shared';
import { getAiProvider } from '../ai/index.js';
import type { AiProvider, FileExcerpt } from '../ai/provider.js';
import { getMeetingAi, type MeetingAi, type MeetingTickInput } from '../ai/meeting.js';
import { getMeeting, recordTick } from '../repositories/meetings.js';
import { getProject, listMembers } from '../repositories/projects.js';
import { listIdeas } from '../repositories/ideas.js';
import { createSuggestion, listSuggestions } from '../repositories/suggestions.js';
import { listTasks } from '../repositories/tasks.js';
import { getFile } from '../repositories/files.js';
import { createLine, listLines, listLinesAfter, listMeetingFiles } from '../repositories/transcripts.js';
import { projectLookup } from './ai-engine.js';
import { readStoredFile } from './file-store.js';
import { onLine } from './meetings.js';
import { getProjectMemory, memoryMediaType, type ProjectMemory } from './project-memory.js';
import { QUIET_WORDS, shouldRun, type TriggerState } from './meeting-trigger.js';
import { proposeMeetingTopic } from './meeting-topic.js';

const MAX_LINES = 200;
/** The AI reads typed chat like speech; the tag tells it the line was typed. @AI replies are the AI's own. */
export const speakerName = (name: string, line: Pick<TranscriptLine, 'source'>) =>
  line.source === 'ai' ? 'AI' : line.source === 'chat' ? `${name} (chat)` : name;
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

const MENTIONS_AI = /@ai\b/i;
const MENTION_LINES = 40;
const FULL_TEXT_FILES = 3;
const FULL_TEXT_CHARS = 8000;

/**
 * Passages from the files shared in this meeting's chat that match the new lines. Searched only once a file was
 * shared, so ticks without files cost no Agent Memory call; an outage leaves the AI working from the transcript.
 * `fullText` (for @AI) also reads the latest shared text files whole, so "summarize the file" works on them
 * even without Agent Memory.
 */
async function sharedFileExcerpts(
  projectId: string,
  meetingId: string,
  lines: TranscriptLine[],
  memory: ProjectMemory | null,
  fullText = false,
): Promise<FileExcerpt[]> {
  try {
    const shared = await listMeetingFiles(projectId, meetingId);
    if (!shared.length) return [];
    // A deleted file drops out here.
    const files = (await Promise.all(shared.map((s) => getFile(projectId, s.fileId).catch(() => null)))).filter((f) => !!f);
    const whole: FileExcerpt[] = [];
    const readWhole = new Set<string>();
    if (fullText) {
      for (const file of files.slice(-FULL_TEXT_FILES)) {
        const type = memoryMediaType(file.name, file.contentType);
        if (!type || !(type.startsWith('text/') || type === 'application/json')) continue;
        const bytes = await readStoredFile(projectId, file.id);
        if (!bytes) continue;
        whole.push({ name: file.name, text: bytes.toString('utf8').slice(0, FULL_TEXT_CHARS) });
        readWhole.add(file.id);
      }
    }
    // Names can repeat across project files, so passages are matched by Agent Memory document id.
    const documentIds = new Set(files.filter((f) => !readWhole.has(f.id) && f.memoryDocumentId).map((f) => f.memoryDocumentId));
    if (!memory || !documentIds.size) return whole;
    const query = [...files.map((f) => f.name), ...lines.map((l) => l.text)].join('\n');
    // The search covers every project file; keep passages from this meeting's files only.
    const excerpts = await memory.excerpts(projectId, query);
    return [...whole, ...excerpts.filter((e) => e.documentId && documentIds.has(e.documentId))];
  } catch (error) {
    console.error(`Could not read meeting files for ${meetingId}`, error);
    return [];
  }
}

/**
 * Answers an @AI line in the meeting chat from the recent transcript and the files shared in the meeting. The reply
 * joins the transcript as 'ai' lines. Action items still come from the live ticks, into the AI panel. Never throws.
 */
export async function answerMeetingMention(
  projectId: string,
  meetingId: string,
  askerId: string,
  ai: AiProvider = getAiProvider(),
  memory: ProjectMemory | null = getProjectMemory(),
): Promise<TranscriptLine[]> {
  try {
    const lines = (await listLines(projectId, meetingId)).slice(-MENTION_LINES);
    const project = await getProject(projectId);
    const members = new Map<string, Member>((await listMembers(project?.memberIds ?? [])).map((m) => [m.id, m]));
    const files = await sharedFileExcerpts(projectId, meetingId, lines.slice(-5), memory, true);
    let reply: string;
    if (ai.runMention) {
      const messages = lines.map((l) => ({
        id: l.id,
        authorId: l.source === 'ai' ? AI_AUTHOR : l.speakerId,
        authorName: speakerName(members.get(l.speakerId)?.name ?? 'Someone', l),
        text: l.fileId ? `(shared a file) ${l.text}` : l.text,
        createdAt: l.spokenAt,
      }));
      reply = (await ai.runMention({ messages, files, lookup: projectLookup(projectId, members) })).reply.trim();
      if (!reply) reply = 'I didn’t find anything to add.';
    } else {
      reply = files.length
        ? `(Mock AI) I can see ${[...new Set(files.map((f) => f.name))].join(', ')}, but reading files needs a real model. Set OPENAI_API_KEY.`
        : '(Mock AI) Set OPENAI_API_KEY for real answers.';
    }
    const created: TranscriptLine[] = [];
    for (const chunk of splitLine(reply)) created.push(await createLine(projectId, meetingId, askerId, chunk, 'ai'));
    return created;
  } catch (error) {
    console.error(`Meeting @AI reply failed for ${meetingId}`, error);
    return createLine(projectId, meetingId, askerId, 'I couldn’t reach the AI model just now. Please try again.', 'ai').then(
      (line) => [line],
      () => [],
    );
  }
}

/** Reads the new transcript, asks the AI, stores its proposals as suggestions. Never throws. */
export async function runLiveTick(
  projectId: string,
  meetingId: string,
  ai: MeetingAi = getMeetingAi(),
  memory: ProjectMemory | null = getProjectMemory(),
): Promise<Suggestion[]> {
  try {
    const meeting = await getMeeting(projectId, meetingId);
    if (meeting.status !== 'live' || !meeting.aiEnabled) return [];
    // @AI replies are the AI's own words, not the team's: skip them, but move the cursor past them.
    const read = await listLinesAfter(projectId, meetingId, meeting.aiCursor, MAX_LINES);
    const lines = read.filter((l) => l.source !== 'ai');
    if (!lines.length) return [];

    const previous = meeting.previousMeetingId ? await getMeeting(projectId, meeting.previousMeetingId) : null;
    const project = await getProject(projectId);
    const [members, ideas, tasks, suggestions, files] = await Promise.all([
      listMembers(project?.memberIds ?? []),
      listIdeas(projectId),
      listTasks(projectId),
      listSuggestions(projectId),
      sharedFileExcerpts(projectId, meetingId, lines, memory),
    ]);
    const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? 'Someone';
    const input: MeetingTickInput = {
      lines: lines.map((l) => ({
        id: l.id,
        speakerId: l.speakerId,
        speakerName: speakerName(nameOf(l.speakerId), l),
        text: l.fileId ? `(shared a file) ${l.text}` : l.text,
      })),
      runningSummary: meeting.runningSummary ?? '',
      carryOver: previous?.carryOver ?? [],
      ideas: ideas.filter((i) => i.kind === 'idea').map((i) => ({ id: i.id, title: i.title, topicId: i.topicId })),
      topics: ideas.filter((i) => i.kind === 'problem').map((i) => ({ id: i.id, title: i.title, description: i.description })),
      currentTopic: ideas.find((idea) => idea.kind === 'problem') ?? null,
      taskTitles: tasks.map((t) => t.title),
      alreadySuggested: suggestions.filter((s) => s.meetingId === meetingId).map((s) => s.title),
      members: members.map((m) => ({ id: m.id, name: m.name, role: m.role })),
      files,
    };

    const result = await ai.meetingTick(input);
    const cite = (lineId: string | null) => {
      const line = lines.find((l) => l.id === lineId);
      return line
        ? `${nameOf(line.speakerId)} · ${line.source === 'chat' ? 'Meeting chat' : 'Meeting'} · ${timeLabel(line.spokenAt)}`
        : null;
    };
    const base = { meetingId };
    const created: Suggestion[] = [];

    const topic = await proposeMeetingTopic(
      projectId,
      meetingId,
      result.topic,
      input.currentTopic ?? null,
      suggestions,
      cite(result.topic?.sourceLineId ?? null),
    );
    if (topic) created.push(topic);

    if (result.actionItems.length) {
      const items: ActionItem[] = result.actionItems.map(({ sourceLineId: _s, ...item }) => item);
      const n = items.length;
      created.push(
        await createSuggestion(projectId, {
          ...base,
          kind: 'action_items',
          title: `${n} action item${n === 1 ? '' : 's'} from the meeting`,
          reason: 'The AI heard these commitments in the meeting.',
          items,
          sourceLineId: result.actionItems[0]!.sourceLineId,
          cite: cite(result.actionItems[0]!.sourceLineId),
        }),
      );
    }
    for (const idea of result.ideas) {
      const topic = ideas.find((i) => i.kind === 'problem' && i.id === idea.topicId);
      const existing = idea.ideaId ? ideas.find((i) => i.kind === 'idea' && i.id === idea.ideaId) : null;
      if (!topic || (idea.ideaId && (!existing || existing.topicId !== topic.id))) continue;
      created.push(
        await createSuggestion(projectId, {
          ...base,
          kind: 'idea',
          topicId: topic.id,
          topicVersion: topic.boardVersion,
          title: `${existing ? 'Develop' : 'New idea'}: ${existing?.title ?? idea.draft.title}`,
          reason: idea.reason,
          quote: idea.quote,
          sourceLineId: idea.sourceLineId,
          cite: cite(idea.sourceLineId),
          ideaId: idea.ideaId,
          ideaDraft: idea.draft,
        }),
      );
    }
    for (const poll of result.polls) {
      created.push(
        await createSuggestion(projectId, {
          ...base,
          kind: 'poll',
          title: `Poll: ${poll.draft.question}`,
          reason: poll.reason,
          quote: poll.quote,
          sourceLineId: poll.sourceLineId,
          cite: cite(poll.sourceLineId),
          pollDraft: poll.draft,
        }),
      );
    }

    await recordTick(meetingId, {
      aiCursor: read[read.length - 1]!.id,
      runningSummary: result.runningSummary,
      usageDelta: { calls: 1, ...result.usage },
    });
    return created;
  } catch (error) {
    console.error(`Live meeting AI failed for ${meetingId}`, error);
    return [];
  }
}

// In-process trigger state; calls is seeded from the stored usage so restarts don't reset the cap.
const states = new Map<string, TriggerState & { projectId: string }>();

function stateFor(meeting: Meeting) {
  let state = states.get(meeting.id);
  if (!state) {
    state = {
      projectId: meeting.projectId,
      newWords: 0,
      lastRunAt: null,
      lastLineAt: null,
      lastLineChat: false,
      calls: meeting.usage.calls,
      inFlight: false,
      aiEnabled: meeting.aiEnabled,
      live: meeting.status === 'live',
    };
    states.set(meeting.id, state);
  }
  state.aiEnabled = meeting.aiEnabled;
  state.live = meeting.status === 'live';
  return state;
}

/** Runs a tick when the thresholds say so. The interval calls this for the silence rule. */
export async function checkMeeting(meetingId: string, now = Date.now(), ai?: MeetingAi): Promise<void> {
  const state = states.get(meetingId);
  if (!state) return;
  if (!state.live) {
    states.delete(meetingId);
    return;
  }
  if (!shouldRun(state, now)) return;
  state.inFlight = true;
  const taken = state.newWords; // words noted while the tick runs must still count
  try {
    await runLiveTick(state.projectId, meetingId, ai);
  } finally {
    // Failures count as calls too, so the cap bounds retries.
    Object.assign(state, { inFlight: false, lastRunAt: now, newWords: Math.max(0, state.newWords - taken), calls: state.calls + 1 });
  }
}

/** Test hook: the current trigger state. */
export const triggerState = (meetingId: string) => states.get(meetingId);

/**
 * Test hook: feed a line into the trigger state as the onLine listener does. A typed chat line is a whole
 * thought, so it alone is enough for a run after the (shorter) chat pause, however short it is.
 */
export function noteLine(meeting: Meeting, text: string, now = Date.now(), chat = false): void {
  const state = stateFor(meeting);
  state.newWords += text.trim().split(/\s+/).filter(Boolean).length;
  if (chat) state.newWords = Math.max(state.newWords, QUIET_WORDS);
  state.lastLineAt = now;
  state.lastLineChat = chat;
}

let started = false;

export function startMeetingLive(): () => void {
  if (started) return () => {};
  started = true;
  onLine((meeting, line) => {
    noteLine(meeting, line.text, Date.now(), line.source === 'chat');
    void checkMeeting(meeting.id);
    if (line.source === 'chat' && MENTIONS_AI.test(line.text)) void answerMeetingMention(meeting.projectId, meeting.id, line.speakerId);
  });
  const timer = setInterval(() => {
    for (const id of [...states.keys()]) void checkMeeting(id).catch((e) => console.error('Meeting live check failed', e));
  }, 2_000);
  return () => clearInterval(timer);
}
