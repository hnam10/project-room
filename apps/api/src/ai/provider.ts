import type { ActionItem } from '@project-room/shared';

// The contract every AI backend implements. The rest of the API only talks to this interface,
// so swapping the mock for a real model is a change in src/ai/index.ts alone.

export interface ConversationMessage {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
}

export interface OpenQuestion {
  /** Short description of what's undecided, e.g. "which database to use". */
  topic: string;
}

export interface AiProvider {
  readonly name: string;
  /** True when output comes from simple local rules rather than a model; shown in the UI. */
  readonly isMock: boolean;

  /** Proposes tasks implied by the conversation. Must not repeat titles in existingTaskTitles. */
  extractActionItems(input: { messages: ConversationMessage[]; existingTaskTitles: string[] }): Promise<ActionItem[]>;

  /** Spots a choice the team hasn't settled in a single message, if any. */
  detectOpenQuestion(message: ConversationMessage): Promise<OpenQuestion | null>;
}
