import type { Decision, Idea, Message, Suggestion, Task } from './domain.js';
import type { Meeting, Poll, TranscriptLine } from './meeting.js';

// Messages pushed from the API to browsers over the /ws socket.

export interface RealtimeRecords {
  task: Task;
  message: Message;
  idea: Idea;
  decision: Decision;
  suggestion: Suggestion;
  meeting: Meeting;
  transcript_line: TranscriptLine;
  poll: Poll;
}

export type RealtimeTable = keyof RealtimeRecords;
export type RealtimeAction = 'create' | 'update' | 'delete';

export type RealtimeEvent = {
  [T in RealtimeTable]: { type: 'change'; table: T; action: RealtimeAction; record: RealtimeRecords[T] };
}[RealtimeTable];

export type ServerMessage = RealtimeEvent | { type: 'ready'; projectId: string };

/** Client -> server: which project this socket wants events for. */
export interface ClientSubscribe {
  type: 'subscribe';
  projectId: string;
}
