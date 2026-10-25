import { useState } from 'react';
import { readStrategyPlan } from '@project-room/shared';
import { IdeaDetails } from './IdeaDetails';

/** Displays validated strategy JSON as readable sections; legacy text remains readable. */
export function StrategyDetails({ description }: { description: string }) {
  const [expanded, setExpanded] = useState(false);
  const plan = readStrategyPlan(description);
  if (!plan) return <IdeaDetails description={description} />;
  return (
    <div className="strategy-plan">
      <p>{plan.goal}</p>
      {expanded && (
        <>
          {plan.context && <p className="strategy-context">{plan.context}</p>}
          {plan.assumptions.length > 0 && (
            <section>
              <h4>Assumptions to test</h4>
              <ol>
                {[...plan.assumptions]
                  .sort((a, b) => a.rank - b.rank)
                  .map((item, index) => (
                    <li key={index}>
                      <strong>{item.assumption}</strong>
                      <p>{item.impact}</p>
                      <p>
                        <strong>Test:</strong> {item.validation}
                      </p>
                    </li>
                  ))}
              </ol>
            </section>
          )}
          {plan.evidence.length > 0 && (
            <section>
              <h4>Evidence &amp; unknowns</h4>
              <ul>
                {plan.evidence.map((item, index) => (
                  <li key={index}>
                    <span className="strategy-evidence-status">
                      {item.status === 'verified' ? 'Sourced finding' : item.status === 'assumption' ? 'Assumption' : 'Unknown'}
                    </span>
                    <p>{item.finding}</p>
                    {item.sourceUrls
                      .filter((url) => /^https?:\/\//i.test(url))
                      .map((url) => (
                        <a key={url} href={url} target="_blank" rel="noreferrer">
                          Source
                        </a>
                      ))}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section>
            <h4>Recommended direction</h4>
            <p>{plan.recommendation.direction}</p>
            <p>{plan.recommendation.rationale}</p>
            <p>
              <strong>Reconsider if:</strong> {plan.recommendation.changeIf}
            </p>
          </section>
          <section>
            <h4>Step-by-step plan</h4>
            <ol className="strategy-steps">
              {plan.steps.map((step, index) => (
                <li key={index}>
                  <h5>{step.title}</h5>
                  <dl>
                    <dt>Focus</dt>
                    <dd>{step.focus}</dd>
                    <dt>Why</dt>
                    <dd>{step.why}</dd>
                    <dt>Action</dt>
                    <dd>{step.action}</dd>
                    <dt>Deliverable</dt>
                    <dd>{step.deliverable}</dd>
                    <dt>Success criterion</dt>
                    <dd>{step.successCriterion}</dd>
                    <dt>Next step</dt>
                    <dd>{step.nextStep}</dd>
                  </dl>
                </li>
              ))}
            </ol>
          </section>
          <section>
            <h4>Essential scope</h4>
            <ul>
              {plan.scope.essential.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </section>
          {plan.scope.deferred.length > 0 && (
            <section>
              <h4>Save for later</h4>
              <ul>
                {plan.scope.deferred.map((item, index) => (
                  <li key={index}>
                    <strong>{item.item}</strong> — {item.reason}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      <button type="button" className="strategy-expand" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
        {expanded ? 'Show less' : 'Read plan'}
      </button>
    </div>
  );
}
