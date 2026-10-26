import { z } from 'zod';
import { readStrategyPlan } from './strategy.js';
import { ideaDraftSchema, pollDraftSchema } from './meeting.js';
import {
  BRAINSTORM_TRIGGERS,
  IDEA_THEMES,
  MAX_FILE_BYTES,
  PRIORITIES,
  STRATEGY_DESCRIPTION_MAX,
  TASK_LABELS,
  TASK_STATUSES,
} from './domain.js';

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
  fileId: z.string().trim().min(1).max(64).nullable().optional(),
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

export const ideaCreateSchema = z
  .object({
    topicId: id.nullable().optional(),
    title: z.string().trim().min(1).max(80),
    description: z.string().trim().max(STRATEGY_DESCRIPTION_MAX).default(''),
    theme: z.enum(IDEA_THEMES).default('Option'),
    kind: z.enum(['problem', 'idea']).default('idea'),
  })
  .superRefine((idea, ctx) => {
    if (idea.theme === 'Strategy' && idea.description.trim().startsWith('{') && !readStrategyPlan(idea.description))
      ctx.addIssue({ code: 'custom', path: ['description'], message: 'Strategy JSON must match the roadmap format' });
    if ((idea.kind === 'problem' || idea.theme !== 'Strategy') && idea.description.length > 240)
      ctx.addIssue({ code: 'custom', path: ['description'], message: 'Keep topic and direct idea details within 240 characters' });
  });
export type IdeaCreateInput = z.input<typeof ideaCreateSchema>;
export const ideaUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(STRATEGY_DESCRIPTION_MAX).optional(),
    theme: z.enum(IDEA_THEMES).optional(),
  })
  .superRefine((idea, ctx) => {
    if (idea.theme === 'Strategy' && idea.description?.trim().startsWith('{') && !readStrategyPlan(idea.description))
      ctx.addIssue({ code: 'custom', path: ['description'], message: 'Strategy JSON must match the roadmap format' });
  });
export type IdeaUpdateInput = z.input<typeof ideaUpdateSchema>;
export const brainstormActionSchema = z.object({
  topicId: id.nullable().optional(),
  trigger: z.enum(BRAINSTORM_TRIGGERS),
  ideaId: id.nullable().default(null),
});
export type BrainstormActionInput = z.input<typeof brainstormActionSchema>;

/** Display name of an upload, after the path has been stripped. */
export const fileNameSchema = z
  .string()
  .trim()
  .min(1, 'Give the file a name')
  .max(120, 'File names must be 120 characters or fewer')
  .refine((name) => name !== '.' && name !== '..', 'That file name is not allowed');

export const fileSizeSchema = z.number().int().positive('Choose a file to upload').max(MAX_FILE_BYTES, 'That file is larger than 10 MB');

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

export const suggestionApproveSchema = z.object({
  assigneeId: z.string().min(1).max(64).nullable().optional(),
  topicId: z.string().min(1).max(64).optional(),
  replaceTopicId: z.string().min(1).max(64).optional(),
});
/** Input accepted when a member explicitly approves an AI suggestion. */
export type SuggestionApproveInput = z.input<typeof suggestionApproveSchema>;

/** Expo push token registered by the mobile app. */
export const pushTokenSchema = z.object({
  token: z
    .string()
    .trim()
    .min(20)
    .max(200)
    .regex(/^Expo(nent)?PushToken\[.+\]$/, 'Expected an Expo push token'),
});
export type PushTokenInput = z.input<typeof pushTokenSchema>;
