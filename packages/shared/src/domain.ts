// Domain model shared by the API and the web app. IDs are plain strings on the wire;
// the API maps them to SurrealDB record IDs (e.g. "t19" <-> task:t19).
import type { IdeaDraft, Poll, PollDraft } from './meeting.js';

export const TASK_STATUSES = ['todo', 'progress', 'review', 'done'] as const;
export const PRIORITIES = ['high', 'medium', 'low'] as const;
export const TASK_LABELS = ['feature', 'frontend', 'backend', 'design', 'docs', 'research', 'test', 'devops'] as const;
// Engagement and Platform remain valid for ideas saved before the simpler categories were introduced.
export const IDEA_THEMES = ['Option', 'Product', 'Strategy', 'Engagement', 'Platform'] as const;
export const IDEA_THEME_CHOICES = ['Option', 'Product', 'Strategy'] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type TaskLabel = (typeof TASK_LABELS)[number];
export type IdeaTheme = (typeof IDEA_THEMES)[number];

/** The AI assistant's author id in chat. */
export const AI_AUTHOR = 'ai';

/** Largest file a member can upload. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export interface Member {
  id: string;
  name: string;
  color: string;
  role: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  emoji: string;
  color: string;
  dueDate: string | null;
  memberIds: string[];
}

export interface Channel {
  id: string;
  projectId: string;
  name: string;
}

export interface Message {
  id: string;
  projectId: string;
  channelId: string;
  /** A member id, or AI_AUTHOR. */
  authorId: string;
  text: string;
  createdAt: string;
  /** Set when an AI message carries a suggestion (e.g. extracted action items). */
  suggestionId: string | null;
  /** Set when the message shares a project file. The bytes stay in the file store. */
  fileId: string | null;
}

export interface Task {
  id: string;
  projectId: string;
  num: number;
  title: string;
  status: TaskStatus;
  priority: Priority;
  label: TaskLabel;
  assigneeId: string | null;
  dueDate: string | null;
  /** Where the task came from, when it wasn't created by hand. */
  sourceKind: 'suggestion' | 'idea' | null;
  sourceId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Idea {
  id: string;
  projectId: string;
  /** Topics use kind=problem and have no parent; every board card belongs to one topic. */
  topicId: string | null;
  /** Incremented when a topic's board is reset, invalidating in-flight AI work. */
  boardVersion: number;
  title: string;
  description: string;
  theme: IdeaTheme;
  kind: 'problem' | 'idea';
  shortlisted: boolean;
  approved: boolean;
  researchStale: boolean;
  significantChangeAt: string | null;
  updatedAt: string;
  authorId: string;
  voterIds: string[];
  /** Voting stays closed until a member explicitly starts it. */
  votingOpen: boolean;
  sourceSuggestionId: string | null;
  researchSources: ResearchSource[];
  taskId: string | null;
  createdAt: string;
}

export interface ResearchSource {
  title: string;
  url: string;
}

export type SuggestionKind = 'action_items' | 'risk' | 'idea' | 'brainstorm_topic' | 'poll' | 'meeting_notes' | 'brainstorm_analysis';
export const BRAINSTORM_TRIGGERS = [
  'problem_created',
  'first_idea',
  'multiple_ideas',
  'research_completed',
  'idea_updated',
  'discussion_inactive',
  'ideas_shortlisted',
  'idea_approved',
  'manual',
] as const;
export type BrainstormTrigger = (typeof BRAINSTORM_TRIGGERS)[number];
export type SuggestionStatus = 'pending' | 'approved' | 'dismissed';

export interface ActionItem {
  title: string;
  assigneeId: string | null;
  priority: Priority;
  include: boolean;
  /** Why the AI proposed this task. */
  reason: string | null;
  /** The words in the conversation it is based on. */
  quote: string | null;
}

/** Structured AI output. Nothing in here changes project data until a member approves it. */
export interface Suggestion {
  id: string;
  projectId: string;
  topicId: string | null;
  topicVersion: number | null;
  kind: SuggestionKind;
  status: SuggestionStatus;
  title: string;
  /** What approving creates, when that isn't a list of items (e.g. a research summary). */
  proposal: string | null;
  /** Why the AI produced this suggestion. */
  reason: string;
  /** Supporting context from the conversation, when there is any. */
  quote: string | null;
  cite: string | null;
  /** Web pages used to ground an AI-proposed idea. Empty for conversation-only suggestions. */
  researchSources: ResearchSource[];
  sourceMessageId: string | null;
  items: ActionItem[];
  /** Task this suggestion is about (e.g. a risk on an existing task). */
  taskId: string | null;
  /** Tasks created when the suggestion was approved. */
  createdTaskIds: string[];
  meetingId: string | null;
  sourceLineId: string | null;
  ideaId: string | null;
  /** Idea that prompted a new direction; approval still creates a separate idea. */
  originIdeaId: string | null;
  brainstormTrigger: BrainstormTrigger | null;
  ideaDraft: IdeaDraft | null;
  pollDraft: PollDraft | null;
  createdAt: string;
  resolvedById: string | null;
}

/** A file shared with the project. The bytes live on disk; this is only the metadata. */
export interface ProjectFile {
  id: string;
  projectId: string;
  name: string;
  size: number;
  contentType: string;
  uploadedById: string;
  createdAt: string;
  /** SurrealDB Agent Memory document id, once that service has accepted the bytes. */
  memoryDocumentId: string | null;
}

/** Everything the workspace UI needs for one project, in one request. */
export interface WorkspaceSnapshot {
  project: Project;
  members: Member[];
  channels: Channel[];
  tasks: Task[];
  ideas: Idea[];
  /** Every poll opened in a meeting, newest first; the Polls tab lists them. */
  polls: Poll[];
  suggestions: Suggestion[];
  files: ProjectFile[];
}
