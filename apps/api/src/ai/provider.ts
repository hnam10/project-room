import type { ActionItem, BrainstormTrigger, IdeaDraft, IdeaTheme, Priority, ResearchSource, StrategyPlan } from '@project-room/shared';

// The contract every AI backend implements. The rest of the API only talks to this interface,
// so swapping the mock for a real model is a change in src/ai/index.ts alone.
//
// Everything a provider returns is a *proposal*. The engine stores it as a suggestion, and only a
// member's approval changes tasks, polls or ideas (see services/suggestions.ts).
// Exception: interpretChatIntent extracts an explicit member instruction and verbatim title;
// validated member-authored chat commands are not generated brainstorm content.

export interface ConversationMessage {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt?: string;
  /** Set when the line was recalled from another channel, or from earlier than the thread window. */
  channelName?: string;
}

/** Extracts a member's instruction, not an AI-generated brainstorm proposal. */
export interface ChatIntentInput {
  message: ConversationMessage;
  recentMessages: ConversationMessage[];
  topics: { id: string; title: string; description: string }[];
  /** Server-side validation feedback for one bounded interpretation repair. */
  validationFeedback?: string;
}

export interface ChatIntent {
  action: 'none' | 'create_topic' | 'add_idea' | 'suggest_idea' | 'use_topic' | 'clarify';
  explicitRequest: boolean;
  /** Exact words in the latest member message that authorize this action. */
  requestQuote: string | null;
  /** Verbatim member-authored title, never a generated idea. */
  title: string | null;
  titleSourceMessageId: string | null;
  topicId: string | null;
  /** Exact target-topic phrase from the member, or null when the topic is implicit. */
  topicReference: string | null;
}

/** A short passage from a project file, already extracted by Agent Memory. */
export interface FileExcerpt {
  name: string;
  text: string;
  /** The Agent Memory document the passage came from, when the search returned it. */
  documentId?: string;
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

/** A task that looks likely to slip, with what the conversation or the board says about it. */
export interface ProposedRisk {
  taskId: string;
  title: string;
  reason: string;
  quote: string | null;
}

export interface ConversationAnalysis {
  actionItems: ActionItem[];
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
  strategy?: StrategyPlan;
  summary: string;
  ideas: ProposedIdea[];
  tasks: ActionItem[];
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
  listPendingSuggestions(): Promise<
    { kind: string; title: string; proposal: string | null; taskId: string | null; ideaTitle: string | null }[]
  >;
  listIdeas(): Promise<{ id: string; title: string }[]>;
}

export interface AiProvider {
  readonly name: string;
  /** True when output comes from simple local rules rather than a model; shown in the UI. */
  readonly isMock: boolean;

  /** Null means no model is available; callers may retain literal command support. */
  interpretChatIntent(input: ChatIntentInput): Promise<ChatIntent | null>;

  /**
   * Reads recent conversation and proposes action items and risks, each with a reason and a
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
}
