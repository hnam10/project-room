import { z } from 'zod';

/** Retains support for roadmaps saved before the concise strategy format. */
const legacyStrategyPlanSchema = z.object({
  goal: z.string().min(1).max(400),
  context: z.string().max(600),
  assumptions: z
    .array(
      z.object({
        rank: z.number().int().min(1).max(6),
        assumption: z.string().max(400),
        impact: z.string().max(400),
        validation: z.string().max(500),
      }),
    )
    .max(6),
  evidence: z
    .array(
      z.object({
        finding: z.string().max(600),
        status: z.enum(['verified', 'assumption', 'unknown']),
        sourceUrls: z.array(z.string()).max(3),
      }),
    )
    .max(6),
  recommendation: z.object({
    direction: z.string().min(1).max(700),
    rationale: z.string().min(1).max(700),
    changeIf: z.string().min(1).max(600),
  }),
  steps: z
    .array(
      z.object({
        title: z.string().min(1).max(160),
        focus: z.string().min(1).max(400),
        why: z.string().min(1).max(400),
        action: z.string().min(1).max(700),
        deliverable: z.string().min(1).max(400),
        successCriterion: z.string().min(1).max(500),
        nextStep: z.string().min(1).max(500),
      }),
    )
    .min(1)
    .max(6),
  scope: z.object({
    essential: z.array(z.string().max(400)).max(6),
    deferred: z.array(z.object({ item: z.string().max(300), reason: z.string().max(400) })).max(6),
  }),
});

/** AI plans stay at six steps; members can add two more while editing. */
export const STRATEGY_AI_STEPS_MAX = 6;
export const STRATEGY_STEPS_MAX = 8;

/** The three concise sections used for new strategy responses. */
export const strategyPlanSchema = z.object({
  recommendation: z.string().min(1).max(500),
  steps: z.array(z.string().min(1).max(350)).min(1).max(STRATEGY_STEPS_MAX),
  essentialScope: z.string().min(1).max(500),
});

export const aiStrategyPlanSchema = strategyPlanSchema.extend({
  steps: z.array(z.string().min(1).max(350)).min(1).max(STRATEGY_AI_STEPS_MAX),
});

export type StrategyPlan = z.infer<typeof strategyPlanSchema>;

/** Keeps legacy sections to two sentences and a short preview-sized paragraph. */
function brief(text: string, limit: number): string {
  const sentences = text
    .trim()
    .split(/(?<=[.!?])\s+/)
    .slice(0, 2)
    .join(' ');
  if (sentences.length <= limit) return sentences;
  const cut = sentences.slice(0, limit - 1);
  const wordEnd = cut.lastIndexOf(' ');
  return `${wordEnd > limit / 2 ? cut.slice(0, wordEnd) : cut}…`;
}

/** Reads new JSON strategy records while allowing existing plain-text strategies to remain usable. */
export function readStrategyPlan(description: string): StrategyPlan | null {
  try {
    const value: unknown = JSON.parse(description);
    const result = strategyPlanSchema.safeParse(value);
    if (result.success) return result.data;
    const legacy = legacyStrategyPlanSchema.safeParse(value);
    if (!legacy.success) return null;
    return {
      recommendation: brief(legacy.data.recommendation.direction, 500),
      steps: legacy.data.steps.slice(0, 4).map((step) => brief(step.action, 350)),
      essentialScope: brief(legacy.data.scope.essential.join('; '), 500) || 'Not specified in the saved strategy.',
    };
  } catch {
    return null;
  }
}
