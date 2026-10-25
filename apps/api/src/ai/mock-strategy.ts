import type { BrainstormMode, ExistingIdeaBrief } from './provider.js';
import type { StrategyPlan } from '@project-room/shared';

/** Provides an honestly labelled planning template when no model is configured. */
export function mockStrategy(problem: ExistingIdeaBrief | null, mode: BrainstormMode): StrategyPlan {
  const topic = problem?.title ?? 'this topic';
  const steps =
    mode === 'product'
      ? [
          [
            'Discover the real problem',
            `Ask a proposed sample of five intended users about a recent experience with “${topic}”. Compare the stated barrier against time, space, cost, motivation and experience.`,
            'Interview notes and a ranked barrier list.',
            'A proposed gate is three concrete examples of the same important problem; this is a target, not a finding.',
            'Narrow the audience or revise the hypothesis if that pattern does not appear.',
          ],
          [
            'Compare existing solutions',
            'Check two or three relevant alternatives using official information and supplied sources. Record strengths, possible gaps and unknowns separately.',
            'A sourced comparison of alternatives and a possible unmet need.',
            'Each factual claim has a checked source, and users can explain where current workarounds fall short.',
            'Revisit the direction if there is no meaningful unmet need.',
          ],
          [
            'Test one focused direction',
            `Sketch one core workflow for “${topic}” and ask intended users to complete a realistic task without coaching.`,
            'A small prototype and observation notes.',
            'A proposed gate is three of five users completing the core task and explaining its benefit; agree the target with the team.',
            'Revise the confusing steps or problem hypothesis before writing more code.',
          ],
          [
            'Build the smallest useful version',
            'Implement only the single workflow supported by the observations, including its essential error cases.',
            'A working MVP and acceptance checklist.',
            'All essential acceptance criteria pass and a new user completes the flow.',
            'Cut optional scope if delivery exceeds the team’s time or skills.',
          ],
          [
            'Evaluate before expanding',
            'Run a small pilot and collect observations tied to the original user barrier.',
            'Pilot notes and a continue, revise or stop recommendation.',
            'Users demonstrate the intended outcome without a blocking issue.',
            'Fix the largest observed problem first; expand only when evidence supports it.',
          ],
        ]
      : [
          [
            'Clarify constraints',
            `Ask the people involved what matters for “${topic}”: preferences, budget, time and non-negotiable restrictions, including allergies for food choices.`,
            'An agreed requirements list.',
            'Everyone can identify any option that would not work for them.',
            'Resolve conflicting requirements before comparing options.',
          ],
          [
            'Compare feasible options',
            `List two or three realistic choices for “${topic}”; directly check availability, cost and any unknowns where needed.`,
            'A small comparison against the requirements.',
            'At least one choice satisfies every non-negotiable requirement.',
            'Adjust preferences or find another option if none fits.',
          ],
          [
            'Agree and try',
            'Ask the group to confirm a preferred choice and try it on the smallest practical scale.',
            'A confirmed choice and a short outcome note.',
            'The group confirms it is feasible and meets the agreed requirements.',
            'Keep the approach if it helps; otherwise revisit the unmet requirement.',
          ],
        ];
  return {
    goal: `${mode === 'product' ? 'Validate the problem and define the smallest useful version of' : 'Agree on a practical next step for'} “${topic}”.`,
    context:
      'Mock guidance: a planning template, not verified research or user feedback. Check supplied sources before treating any claim as evidence.',
    assumptions:
      mode === 'product'
        ? [
            {
              rank: 1,
              assumption: 'Users experience a meaningful recurring problem.',
              impact: 'Without a real need, there is no useful product.',
              validation: 'Ask for recent real examples and current workarounds.',
            },
            {
              rank: 2,
              assumption: 'The proposed barrier is the main obstacle.',
              impact: 'Solving a secondary barrier may not help.',
              validation: 'Compare time, space, cost, motivation, access and experience.',
            },
            {
              rank: 3,
              assumption: 'Existing solutions leave a meaningful gap.',
              impact: 'An adequate existing solution reduces the need to build.',
              validation: 'Check official sources and compare user experiences.',
            },
          ]
        : [],
    evidence: [{ finding: 'No research findings are verified by this mock template.', status: 'unknown', sourceUrls: [] }],
    recommendation: {
      direction:
        mode === 'product'
          ? 'Focus on one user segment and one repeated, underserved problem.'
          : 'Agree on one feasible choice that meets the group’s constraints.',
      rationale: 'Keep the work proportionate and test the important unknowns first.',
      changeIf: 'Revisit the direction if feedback or checked sources contradict the hypothesis.',
    },
    steps: steps.map(([focus, action, deliverable, success, next]) => ({
      title: focus!,
      focus: focus!,
      why: `Resolve this question before committing further effort to “${topic}”.`,
      action: action!,
      deliverable: deliverable!,
      successCriterion: success!,
      nextStep: next!,
    })),
    scope: {
      essential:
        mode === 'product'
          ? ['One user segment', 'One validated problem', 'One usable core flow']
          : ['One feasible decision or small trial'],
      deferred: [
        {
          item: mode === 'product' ? 'Social feeds, advanced personalization and integrations' : 'Elaborate planning or additional work',
          reason: 'Add scope only when the evidence and team capacity justify it.',
        },
      ],
    },
  };
}
