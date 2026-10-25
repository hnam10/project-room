import { useState } from 'react';
import { readStrategyPlan } from '@project-room/shared';
import { IdeaDetails } from './IdeaDetails';

/** Displays concise strategy sections while keeping older saved text readable. */
export function StrategyDetails({ description }: { description: string }) {
  const [expanded, setExpanded] = useState(false);
  const plan = readStrategyPlan(description);
  if (!plan) return <IdeaDetails description={description} />;
  return (
    <div className="strategy-plan">
      <section>
        <h4>Recommended direction</h4>
        <p>{plan.recommendation}</p>
      </section>
      {expanded && (
        <>
          <section>
            <h4>Step-by-step plan</h4>
            <ol className="strategy-steps">
              {plan.steps.map((step, index) => (
                <li key={index}>{step}</li>
              ))}
            </ol>
          </section>
          <section>
            <h4>Essential scope</h4>
            <p>{plan.essentialScope}</p>
          </section>
        </>
      )}
      <button type="button" className="strategy-expand" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
        {expanded ? 'Show less' : 'Read plan'}
      </button>
    </div>
  );
}
