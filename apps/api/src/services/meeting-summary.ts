import type { ActionItem, Meeting } from '@project-room/shared';
import { getMeetingAi, type MeetingAi, type SummarizeInput, type SummarizeResult } from '../ai/meeting.js';
import { failSummary, finishSummary, getMeeting, listSummarizingMeetings } from '../repositories/meetings.js';
import { listIdeas } from '../repositories/ideas.js';
import { getProject, listMembers } from '../repositories/projects.js';
import { createSuggestion, listSuggestions } from '../repositories/suggestions.js';
import { listTasks } from '../repositories/tasks.js';
import { listLinesAfter } from '../repositories/transcripts.js';
import { endExpiredMeetings } from './meetings.js';

const MAX_LINES = 2000;
const ATTEMPTS = 3;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Summarizes a meeting that is in 'summarizing' and ends it. Retries up to 3 times (waiting delays[i] before
 * retry i+1); after that the error is stored in summaryError and the meeting ends without a summary.
 * Never throws for AI failures.
 */
export async function summarize(
  projectId: string,
  meetingId: string,
  ai: MeetingAi = getMeetingAi(),
  delays: number[] = [1000, 4000],
): Promise<Meeting> {
  const meeting = await getMeeting(projectId, meetingId);
  if (meeting.status !== 'summarizing') return meeting;

  let input: SummarizeInput;
  try {
    const project = await getProject(projectId);
    const [members, ideas, tasks, all, lines, previous] = await Promise.all([
      listMembers(project?.memberIds ?? []),
      listIdeas(projectId),
      listTasks(projectId),
      listSuggestions(projectId),
      listLinesAfter(projectId, meetingId, null, MAX_LINES),
      meeting.previousMeetingId ? getMeeting(projectId, meeting.previousMeetingId) : null,
    ]);
    const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? 'Someone';
    input = {
      lines: lines.map((l) => ({ id: l.id, speakerId: l.speakerId, speakerName: nameOf(l.speakerId), text: l.text })),
      carryOver: previous?.carryOver ?? [],
      ideas: ideas.map((i) => ({ id: i.id, title: i.title })),
      taskTitles: tasks.map((t) => t.title),
      suggestions: all.filter((s) => s.meetingId === meetingId).map((s) => ({ title: s.title, status: s.status })),
      members: members.map((m) => ({ id: m.id, name: m.name, role: m.role })),
    };
  } catch (error) {
    // Don't leave the meeting stuck in 'summarizing'; ending with summaryError lets /end rerun it.
    console.error(`Meeting summary setup failed for ${meetingId}`, error);
    return failSummary(meetingId, error instanceof Error ? error.message : String(error));
  }

  let result: SummarizeResult | null = null;
  let lastError = 'Summary failed';
  for (let attempt = 0; attempt < ATTEMPTS && !result; attempt++) {
    if (attempt > 0) await sleep(delays[attempt - 1] ?? 0);
    try {
      result = await ai.summarizeMeeting(input);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      console.error(`Meeting summary attempt ${attempt + 1} failed for ${meetingId}`, error);
    }
  }
  if (!result) return failSummary(meetingId, lastError);

  // Suggestions are stored before the meeting ends, under fixed ids, so a failure leaves summaryError for /end to
  // rerun and the rerun skips whichever suggestion already exists.
  try {
    const base = { meetingId };
    if (result.actionItems.length) {
      const n = result.actionItems.length;
      await createSuggestion(
        projectId,
        {
          ...base,
          kind: 'action_items',
          title: `${n} action item${n === 1 ? '' : 's'} from the meeting summary`,
          reason: 'Claude found these in the meeting summary.',
          items: result.actionItems,
        },
        `${meetingId}-summary-actions`,
      );
    }
    if (result.carryOverItems.length) {
      const items: ActionItem[] = result.carryOverItems.map((title) => ({
        title,
        assigneeId: null,
        priority: 'medium',
        include: true,
        reason: null,
        quote: null,
      }));
      await createSuggestion(
        projectId,
        {
          ...base,
          kind: 'meeting_notes',
          title: 'Notes for next meeting',
          reason: "Claude's proposed carry-over notes; confirm the ones to keep.",
          items,
        },
        `${meetingId}-summary-notes`,
      );
    }
  } catch (error) {
    console.error(`Creating summary suggestions failed for ${meetingId}`, error);
    return failSummary(meetingId, `Saving the summary suggestions failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  return finishSummary(meetingId, result.summary, result.usage);
}

/** On API start: end meetings left live past their cap, then finish every summary that was interrupted. */
export async function resumeMeetings(): Promise<void> {
  // Snapshot first: meetings ended by the sweep below are summarized by it, not again by this loop.
  const interrupted = await listSummarizingMeetings();
  await endExpiredMeetings();
  for (const meeting of interrupted) {
    try {
      await summarize(meeting.projectId, meeting.id);
    } catch (error) {
      console.error(`Resuming the summary of ${meeting.id} failed`, error);
    }
  }
}
