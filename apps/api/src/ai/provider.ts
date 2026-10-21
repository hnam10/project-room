import type { ActionItem, Decision, Priority } from '@project-room/shared';

// The contract every AI backend implements. The rest of the API only talks to this interface,
// so swapping the mock for a real model is a change in src/ai/index.ts alone.
//
// Everything a provider returns is a *proposal*. The engine stores it as a suggestion, and only a
// member's approval changes tasks or decisions (see services/suggestions.ts).

export interface ConversationMessage {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
}

/** An existing task, so the AI can avoid duplicates and point at the ones that are at risk. */
export interface TaskBrief {
  id: string;
  num: number;
  title: string;
  status: string;
  priority: Priority;
  assigneeId: string | null;
  dueDate: string | null;
}

export interface MemberBrief {
  id: string;
  name: string;
  role: string;
}

/** A choice the conversation raised or settled. */
export interface ProposedDecision {
  /** The question, e.g. "Which database to use". */
  topic: string;
  /** What the team settled on, e.g. "Use SurrealDB". Null when the question is still open. */
  outcome: string | null;
  reason: string;
  quote: string | null;
}

/** A task that looks likely to slip, with what the conversation or the board says about it. */
export interface ProposedRisk {
  taskId: string;
  title: string;
  reason: string;
  quote: string | null;
}

export interface ConversationAnalysis {
  actionItems: ActionItem[];
  decisions: ProposedDecision[];
  risks: ProposedRisk[];
}

export interface AnalyzeInput {
  messages: ConversationMessage[];
  tasks: TaskBrief[];
  members: MemberBrief[];
}

export interface MemoryAnswerDraft {
  answer: string;
  /** Ids of the approved decisions the answer relies on. Empty when none covers the question. */
  sourceDecisionIds: string[];
}

export interface AiProvider {
  readonly name: string;
  /** True when output comes from simple local rules rather than a model; shown in the UI. */
  readonly isMock: boolean;

  /**
   * Reads recent conversation and proposes action items, decisions and risks, each with a reason and a
   * quote from the conversation. Must not repeat existing task titles.
   */
  analyzeConversation(input: AnalyzeInput): Promise<ConversationAnalysis>;

  /** Cheap per-message check: does this message raise (or settle) a choice the team hasn't recorded? */
  detectOpenQuestion(message: ConversationMessage): Promise<ProposedDecision | null>;

  /**
   * Answers a question about the project using only the approved decisions passed in, never the chat
   * log. If they don't cover the question, says so with no sources.
   */
  answerFromDecisions(input: { question: string; decisions: Decision[]; members: MemberBrief[] }): Promise<MemoryAnswerDraft>;
}
