import { z } from 'zod';
import { ideaDraftSchema, pollDraftSchema } from './meeting.js';
import { BRAINSTORM_TRIGGERS, IDEA_THEMES, PRIORITIES, TASK_LABELS, TASK_STATUSES } from './domain.js';

// Request bodies accepted by the API. The web app uses the inferred types when calling it.

const isoDate = z.iso.date('Expected a valid calendar date (YYYY-MM-DD)');
const id = z.string().min(1).max(64);

export const taskCreateSchema = z.object({
  title: z.string().trim().min(1).max(120),
  status: z.enum(TASK_STATUSES).default('todo'),
  priority: z.enum(PRIORITIES).default('medium'),
  label: z.enum(TASK_LABELS).default('feature'),
  assigneeId: id.nullable().default(null),
  dueDate: isoDate.nullable().default(null),
});
export type TaskCreateInput = z.input<typeof taskCreateSchema>;

export const taskUpdateSchema = taskCreateSchema.partial();
export type TaskUpdateInput = z.input<typeof taskUpdateSchema>;

/** Fields a member can change on the project itself. */
export const projectUpdateSchema = z.object({
  dueDate: isoDate.nullable(),
});
export type ProjectUpdateInput = z.input<typeof projectUpdateSchema>;

export const messageCreateSchema = z.object({
  text: z.string().trim().min(1).max(2000),
});
export type MessageCreateInput = z.input<typeof messageCreateSchema>;

export const channelCreateSchema = z.object({
  name: z
    .string()
    .trim()
    .toLowerCase()
    .min(1)
    .max(32)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});
export type ChannelCreateInput = z.input<typeof channelCreateSchema>;

export const ideaCreateSchema = z.object({
  topicId: id.nullable().optional(),
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().max(240).default(''),
  theme: z.enum(IDEA_THEMES).default('Option'),
  kind: z.enum(['problem', 'idea']).default('idea'),
});
export type IdeaCreateInput = z.input<typeof ideaCreateSchema>;
export const ideaUpdateSchema = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(240).optional(),
  theme: z.enum(IDEA_THEMES).optional(),
});
export type IdeaUpdateInput = z.input<typeof ideaUpdateSchema>;
export const brainstormActionSchema = z.object({
  topicId: id.nullable().optional(),
  trigger: z.enum(BRAINSTORM_TRIGGERS),
  ideaId: id.nullable().default(null),
});
export type BrainstormActionInput = z.input<typeof brainstormActionSchema>;

export const decisionCreateSchema = z.object({
  title: z.string().trim().min(1).max(160),
});
export type DecisionCreateInput = z.input<typeof decisionCreateSchema>;

/** Recording a decision as decided; the outcome is what makes it useful to read later. */
export const decisionDecideSchema = z.object({
  outcome: z.string().trim().min(1).max(240).nullable().default(null),
  reason: z.string().trim().max(400).nullable().default(null),
});
export type DecisionDecideInput = z.input<typeof decisionDecideSchema>;

export const memoryQuestionSchema = z.object({
  question: z.string().trim().min(3).max(300),
});
export type MemoryQuestionInput = z.input<typeof memoryQuestionSchema>;

export const actionItemSchema = z.object({
  title: z.string().trim().min(1).max(120),
  assigneeId: id.nullable(),
  priority: z.enum(PRIORITIES),
  include: z.boolean(),
  reason: z.string().max(400).nullable().default(null),
  quote: z.string().max(600).nullable().default(null),
});

export const suggestionUpdateSchema = z.object({
  items: z.array(actionItemSchema).max(20).optional(),
  ideaDraft: ideaDraftSchema.optional(),
  pollDraft: pollDraftSchema.optional(),
});
export type SuggestionUpdateInput = z.input<typeof suggestionUpdateSchema>;
