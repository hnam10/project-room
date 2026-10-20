import { z } from 'zod';
import { IDEA_THEMES, PRIORITIES, TASK_LABELS, TASK_STATUSES } from './domain.js';

// Request bodies accepted by the API. The web app uses the inferred types when calling it.

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
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

export const messageCreateSchema = z.object({
  text: z.string().trim().min(1).max(2000),
});
export type MessageCreateInput = z.input<typeof messageCreateSchema>;

export const ideaCreateSchema = z.object({
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().max(240).default(''),
  theme: z.enum(IDEA_THEMES).default('Product'),
});
export type IdeaCreateInput = z.input<typeof ideaCreateSchema>;

export const decisionCreateSchema = z.object({
  title: z.string().trim().min(1).max(160),
});
export type DecisionCreateInput = z.input<typeof decisionCreateSchema>;

export const actionItemSchema = z.object({
  title: z.string().trim().min(1).max(120),
  assigneeId: id.nullable(),
  priority: z.enum(PRIORITIES),
  include: z.boolean(),
});

export const suggestionUpdateSchema = z.object({
  items: z.array(actionItemSchema).max(20),
});
export type SuggestionUpdateInput = z.input<typeof suggestionUpdateSchema>;
