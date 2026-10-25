import type { ActionItem, Meeting, Suggestion, TranscriptLine } from '@project-room/shared';
import { getMeetingAi, type MeetingAi, type MeetingTickInput } from '../ai/meeting.js';
import { getMeeting, recordTick } from '../repositories/meetings.js';
import { getProject, listMembers } from '../repositories/projects.js';
import { listIdeas } from '../repositories/ideas.js';
import { createSuggestion, listSuggestions } from '../repositories/suggestions.js';
import { listTasks } from '../repositories/tasks.js';
import { listLinesAfter } from '../repositories/transcripts.js';
import { onLine } from './meetings.js';
import { QUIET_WORDS, shouldRun, type TriggerState } from './meeting-trigger.js';
import { proposeMeetingTopic } from './meeting-topic.js';

const MAX_LINES = 200;
/** The AI reads typed chat like speech; the tag tells it the line was typed. */
export const speakerName = (name: string, line: Pick<TranscriptLine, 'source'>) => (line.source === 'chat' ? `${name} (chat)` : name);
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/** Reads the new transcript, asks the AI, stores its proposals as suggestions. Never throws. */
export async function runLiveTick(projectId: string, meetingId: string, ai: MeetingAi = getMeetingAi()): Promise<Suggestion[]> {
  try {
    const meeting = await getMeeting(projectId, meetingId);
    if (meeting.status !== 'live' || !meeting.aiEnabled) return [];
    const lines = await listLinesAfter(projectId, meetingId, meeting.aiCursor, MAX_LINES);
    if (!lines.length) return [];

    const previous = meeting.previousMeetingId ? await getMeeting(projectId, meeting.previousMeetingId) : null;
    const project = await getProject(projectId);
    const [members, ideas, tasks, suggestions] = await Promise.all([
      listMembers(project?.memberIds ?? []),
      listIdeas(projectId),
      listTasks(projectId),
      listSuggestions(projectId),
    ]);
    const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? 'Someone';
    const input: MeetingTickInput = {
      lines: lines.map((l) => ({ id: l.id, speakerId: l.speakerId, speakerName: speakerName(nameOf(l.speakerId), l), text: l.text })),
      runningSummary: meeting.runningSummary ?? '',
      carryOver: previous?.carryOver ?? [],
      ideas: ideas.filter((i) => i.kind === 'idea').map((i) => ({ id: i.id, title: i.title, topicId: i.topicId })),
      topics: ideas.filter((i) => i.kind === 'problem').map((i) => ({ id: i.id, title: i.title, description: i.description })),
      currentTopic: ideas.find((idea) => idea.kind === 'problem') ?? null,
      taskTitles: tasks.map((t) => t.title),
      alreadySuggested: suggestions.filter((s) => s.meetingId === meetingId).map((s) => s.title),
      members: members.map((m) => ({ id: m.id, name: m.name, role: m.role })),
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
          reason: 'Claude heard these commitments in the meeting.',
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
      aiCursor: lines[lines.length - 1]!.id,
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
  });
  const timer = setInterval(() => {
    for (const id of [...states.keys()]) void checkMeeting(id).catch((e) => console.error('Meeting live check failed', e));
  }, 2_000);
  return () => clearInterval(timer);
}
