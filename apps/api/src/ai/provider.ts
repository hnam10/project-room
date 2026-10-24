import type { ActionItem, BrainstormTrigger, Decision, IdeaDraft, IdeaTheme, Priority, ResearchSource } from '@project-room/shared';

// The contract every AI backend implements. The rest of the API only talks to this interface,
// so swapping the mock for a real model is a change in src/ai/index.ts alone.
//
// Everything a provider returns is a *proposal*. The engine stores it as a suggestion, and only a
// member's approval changes tasks, decisions or ideas (see services/suggestions.ts).

export interface ConversationMessage {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt?: string;
  /** Set when the line was recalled from another channel, or from earlier than the thread window. */
  channelName?: string;
}

/** A short passage from a project file, already extracted by Agent Memory. */
export interface FileExcerpt {
  name: string;
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

export interface ExistingIdeaBrief {
  title: string;
  description: string;
}

export interface BrainstormResearchResult extends ResearchSource {
  content: string;
}

export interface ResearchSummaryInput {
  idea: ExistingIdeaBrief;
  results: BrainstormResearchResult[];
}

export interface ResearchSummary {
  url: string;
  summary: string;
}

export interface BrainstormInput {
  messages: ConversationMessage[];
  currentTopic?: ExistingIdeaBrief | null;
  existingIdeas: ExistingIdeaBrief[];
  research: BrainstormResearchResult[];
  mode?: BrainstormMode;
}

export type BrainstormMode = 'product' | 'non_product' | 'unclear';

export interface BrainstormContext {
  problem: ExistingIdeaBrief | null;
  ideas: ExistingIdeaBrief[];
  request?: string;
}

export interface ProposedIdea {
  draft: IdeaDraft;
  reason: string;
  quote: string | null;
  /** URLs must point to results supplied in BrainstormInput; unknown URLs are discarded. */
  sourceUrls: string[];
}

export interface ProposedBrainstormTopic {
  title: string;
  description: string;
  reason: string;
  quote: string | null;
}

export interface BrainstormResult {
  topic: ProposedBrainstormTopic | null;
  ideas: ProposedIdea[];
}

export interface FacilitateInput {
  trigger: BrainstormTrigger;
  problem: ExistingIdeaBrief | null;
  ideas: ExistingIdeaBrief[];
  research: BrainstormResearchResult[];
  mode?: BrainstormMode;
}

export interface FacilitateResult {
  summary: string;
  ideas: ProposedIdea[];
  tasks: ActionItem[];
}

export interface MemoryAnswerDraft {
  answer: string;
  /** Ids of the approved decisions the answer relies on. Empty when none covers the question. */
  sourceDecisionIds: string[];
}

/** A brainstorm card the model wants a person to approve. */
export interface IdeaProposal {
  title: string;
  description: string;
  theme: IdeaTheme;
  reason: string;
  quote: string | null;
}

export interface MentionResult extends ConversationAnalysis {
  ideas: IdeaProposal[];
  /** Plain answer to the @AI mention. Empty when the model had nothing to say. */
  reply: string;
}

/** A message the model found by searching, so a quote can be checked against it. */
export interface MessageHit {
  id: string;
  authorName: string;
  text: string;
}

/**
 * Read-only project lookups the @AI tool loop may call. Implementations filter by project.
 * The model never receives SurrealQL.
 */
export interface ProjectLookup {
  listMembers(): Promise<MemberBrief[]>;
  listTasks(filter: { status: string; assigneeId: string }): Promise<TaskBrief[]>;
  searchMessages(query: string): Promise<MessageHit[]>;
  listDecisions(): Promise<{ id: string; title: string; status: string; outcome: string | null }[]>;
  listPendingSuggestions(): Promise<
    { kind: string; title: string; proposal: string | null; taskId: string | null; ideaTitle: string | null }[]
  >;
  listIdeas(): Promise<{ id: string; title: string }[]>;
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

  /** Proposes a reviewable board topic and at most two editable idea drafts, grounded in chat and optional web research. */
  brainstorm(input: BrainstormInput): Promise<BrainstormResult>;

  /** Briefly explains relevant existing work using only the supplied search results. */
  summarizeResearch(input: ResearchSummaryInput): Promise<ResearchSummary[]>;

  /** Assess whether the team's goal is a product, another kind of project, or still unclear. */
  classifyBrainstorm(input: BrainstormContext): Promise<BrainstormMode>;

  /** Produces reviewable guidance and, where useful, editable idea or task drafts for a brainstorm trigger. */
  facilitateBrainstorm(input: FacilitateInput): Promise<FacilitateResult>;

  /**
   * @AI path that looks the project up through ProjectLookup, then proposes suggestions.
   * Absent on the mock, which keeps the one-shot analyzeConversation call.
   */
  runMention?(input: { messages: ConversationMessage[]; files?: FileExcerpt[]; lookup: ProjectLookup }): Promise<MentionResult>;

  /** Cheap per-message check: does this message raise (or settle) a choice the team hasn't recorded? */
  detectOpenQuestion(message: ConversationMessage): Promise<ProposedDecision | null>;

  /**
   * Answers a question about the project using only the approved decisions passed in, never the chat
   * log. If they don't cover the question, says so with no sources.
   */
  answerFromDecisions(input: { question: string; decisions: Decision[]; members: MemberBrief[] }): Promise<MemoryAnswerDraft>;
}
