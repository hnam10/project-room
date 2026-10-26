import type { Channel, Idea, Message, Note, ProjectFile, Suggestion, Task } from './domain.js';
import type { ClientRtc, Meeting, Poll, ServerRtc, TranscriptLine } from './meeting.js';

// Messages pushed from the API to browsers over the /ws socket.

export interface RealtimeRecords {
  task: Task;
  channel: Channel;
  message: Message;
  idea: Idea;
  suggestion: Suggestion;
  meeting: Meeting;
  transcript_line: TranscriptLine;
  poll: Poll;
  file: ProjectFile;
  note: Note;
}

export type RealtimeTable = keyof RealtimeRecords;
export type RealtimeAction = 'create' | 'update' | 'delete';

export type RealtimeEvent = {
  [T in RealtimeTable]: { type: 'change'; table: T; action: RealtimeAction; record: RealtimeRecords[T] };
}[RealtimeTable];

export type ServerMessage = RealtimeEvent | { type: 'ready'; projectId: string } | ServerRtc;

/** Client -> server: which project this socket wants events for. */
export interface ClientSubscribe {
  type: 'subscribe';
  projectId: string;
}

export type ClientMessage = ClientSubscribe | ClientRtc;
