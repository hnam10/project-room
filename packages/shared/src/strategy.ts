import { z } from 'zod';

/** Structured guidance shared by generation, review and display; no Markdown is required. */
export const strategyPlanSchema = z.object({
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

export type StrategyPlan = z.infer<typeof strategyPlanSchema>;

/** Reads new JSON strategy records while allowing existing plain-text strategies to remain usable. */
export function readStrategyPlan(description: string): StrategyPlan | null {
  try {
    const result = strategyPlanSchema.safeParse(JSON.parse(description));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
