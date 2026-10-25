import type { BrainstormMode, ExistingIdeaBrief } from './provider.js';

/** Provides an honestly labelled planning template when no model is configured. */
export function mockStrategy(problem: ExistingIdeaBrief | null, mode: BrainstormMode): string {
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
  return [
    `Goal: ${mode === 'product' ? 'Validate the problem and define the smallest useful version of' : 'Agree on a practical next step for'} “${topic}”.`,
    'Mock guidance: a planning template, not verified research or user feedback. Check supplied sources before treating any claim as evidence.',
    ...(mode === 'product'
      ? [
          'Assumptions, highest impact first: users experience an important recurring problem; the proposed barrier is the main obstacle; current alternatives leave a meaningful gap; the team can deliver the essential flow. Test these in that order through real examples, source checks and a prototype.',
          'Provisional direction: focus on one user segment and one repeated, underserved problem. Change direction if interviews or existing solutions contradict the hypothesis.',
        ]
      : []),
    ...steps.map(
      ([focus, action, deliverable, success, next], index) =>
        `${index + 1}. ${focus}\nFocus / Why: ${focus} before committing further effort to “${topic}”.\nAction: ${action}\nDeliverable: ${deliverable}\nSuccess: ${success}\nNext: ${next}`,
    ),
    mode === 'product'
      ? 'Essential scope: one user segment, one validated problem and one usable core flow. Defer social feeds, advanced personalization and integrations unless evidence makes them essential; they add work before the core need is established.'
      : 'Scope: complete this decision or small trial first. Defer elaborate planning or additional work unless the team needs it.',
  ].join('\n\n');
}
