import type { StrategyPlan } from '@project-room/shared';
import type { BrainstormMode, ExistingIdeaBrief } from './provider.js';

/** Gives a short planning template without claiming research or feedback has happened. */
export function mockStrategy(problem: ExistingIdeaBrief | null, mode: BrainstormMode): StrategyPlan {
  const topic = (problem?.title ?? 'this topic').slice(0, 80);
  return mode === 'product'
    ? {
        recommendation: `For “${topic}”, start with one user group and one recurring problem. This mock plan is a starting hypothesis, not a research finding.`,
        steps: [
          'Ask a few intended users about the last time they faced this problem and what they tried. Check whether the stated barrier matters more than time, cost, access or motivation.',
          'Compare two or three existing alternatives using reliable sources. Identify one unmet need supported by the user conversations rather than assuming a gap exists.',
          'Sketch a small solution and have users try its main flow. Revise the direction if it does not help with the problem they described.',
          'Build only that core flow, then run a small pilot. Use the feedback to choose what to improve next.',
        ],
        essentialScope:
          'One user group, one problem and one working end-to-end flow. Leave extra features until the core approach has been tested.',
      }
    : {
        recommendation: `For “${topic}”, choose one practical option that fits the group’s constraints. This mock plan has not been validated by the team.`,
        steps: [
          'Check preferences, budget, time and non-negotiable restrictions, including allergies for food choices.',
          'Compare two or three feasible options and confirm one with the group.',
          'Try the choice and make a small adjustment if it misses an important requirement.',
        ],
        essentialScope: 'Make this one decision or run a small trial. Keep extra planning out unless it helps the group choose.',
      };
}
