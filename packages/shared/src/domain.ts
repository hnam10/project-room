// Domain model shared by the API and the web app. IDs are plain strings on the wire;
// the API maps them to SurrealDB record IDs (e.g. "t19" <-> task:t19).

export const TASK_STATUSES = ['todo', 'progress', 'review', 'done'] as const;
export const PRIORITIES = ['high', 'medium', 'low'] as const;
export const TASK_LABELS = ['feature', 'frontend', 'backend', 'design', 'docs', 'research', 'test', 'devops'] as const;
export const IDEA_THEMES = ['Product', 'Engagement', 'Platform'] as const;

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
  title: string;
  description: string;
  theme: IdeaTheme;
  authorId: string;
  voterIds: string[];
  taskId: string | null;
  createdAt: string;
}

export type DecisionStatus = 'open' | 'decided';

export interface Decision {
  id: string;
  projectId: string;
  title: string;
  status: DecisionStatus;
  raisedById: string;
  decidedById: string | null;
  /** What the team settled on, e.g. "Use SurrealDB". Set when the decision is recorded as decided. */
  outcome: string | null;
  /** Why it was decided that way, when someone said so. */
  reason: string | null;
  /** Words from the conversation that back the decision. */
  quote: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export type SuggestionKind = 'action_items' | 'decision' | 'risk';
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
  kind: SuggestionKind;
  status: SuggestionStatus;
  title: string;
  /** What approving creates, when that isn't a list of items (e.g. the decision to log). */
  proposal: string | null;
  /** Decisions only: what the conversation already settled on. Null means the question is still open. */
  outcome: string | null;
  /** Why the AI produced this suggestion. */
  reason: string;
  /** Supporting context from the conversation, when there is any. */
  quote: string | null;
  cite: string | null;
  sourceMessageId: string | null;
  items: ActionItem[];
  /** Task this suggestion is about (e.g. a risk on an existing task). */
  taskId: string | null;
  /** Tasks created when the suggestion was approved. */
  createdTaskIds: string[];
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
}

/** Everything the workspace UI needs for one project, in one request. */
export interface WorkspaceSnapshot {
  project: Project;
  members: Member[];
  channels: Channel[];
  tasks: Task[];
  ideas: Idea[];
  decisions: Decision[];
  suggestions: Suggestion[];
  files: ProjectFile[];
}

/** The answer to a question about the project, written only from approved decisions. */
export interface MemoryAnswer {
  question: string;
  answer: string;
  /** False when no approved decision covers the question. */
  found: boolean;
  /** The approved decisions the answer relies on. */
  sources: Decision[];
  ai: { provider: string; isMock: boolean };
}
