import { readStrategyPlan, STRATEGY_DESCRIPTION_MAX, type StrategyPlan } from '@project-room/shared';

/** Accepts partially filled form fields while the saved plan still uses the strict shared schema. */
function editablePlan(description: string): StrategyPlan | null {
  if (!description.trim()) return { recommendation: '', steps: [''], essentialScope: '' };
  try {
    const value: unknown = JSON.parse(description);
    if (
      value &&
      typeof value === 'object' &&
      'recommendation' in value &&
      'steps' in value &&
      'essentialScope' in value &&
      typeof value.recommendation === 'string' &&
      typeof value.essentialScope === 'string' &&
      Array.isArray(value.steps) &&
      value.steps.length >= 1 &&
      value.steps.length <= 4 &&
      value.steps.every((step) => typeof step === 'string')
    ) {
      return { recommendation: value.recommendation, steps: value.steps, essentialScope: value.essentialScope };
    }
  } catch {
    // Existing plain-text strategies keep their original text editor.
  }
  return readStrategyPlan(description);
}

/** Edits strategy prose in ordinary fields and serializes the plan behind the scenes. */
export function StrategyEditor({ description, onChange }: { description: string; onChange: (description: string) => void }) {
  const plan = editablePlan(description);
  if (!plan)
    return (
      <label className="form-row">
        Strategy
        <textarea value={description} rows={5} maxLength={STRATEGY_DESCRIPTION_MAX} onChange={(event) => onChange(event.target.value)} />
      </label>
    );
  const update = (patch: Partial<StrategyPlan>) => onChange(JSON.stringify({ ...plan, ...patch }, null, 2));
  return (
    <fieldset className="strategy-editor">
      <legend>Strategy</legend>
      <label className="form-row">
        Recommended direction
        <textarea
          value={plan.recommendation}
          rows={3}
          maxLength={500}
          required
          onChange={(event) => update({ recommendation: event.target.value })}
        />
      </label>
      <fieldset className="strategy-editor-steps">
        <legend>Step-by-step plan</legend>
        {plan.steps.map((step, index) => (
          <div className="strategy-editor-step" key={index}>
            <label className="form-row">
              Step {index + 1}
              <textarea
                value={step}
                rows={2}
                maxLength={350}
                required
                onChange={(event) =>
                  update({ steps: plan.steps.map((value, position) => (position === index ? event.target.value : value)) })
                }
              />
            </label>
            <button
              type="button"
              className="btn danger-ghost sm"
              aria-label={`Remove step ${index + 1}`}
              disabled={plan.steps.length === 1}
              onClick={() => update({ steps: plan.steps.filter((_, position) => position !== index) })}
            >
              Remove
            </button>
          </div>
        ))}
        <button type="button" className="btn sm" disabled={plan.steps.length >= 4} onClick={() => update({ steps: [...plan.steps, ''] })}>
          Add step
        </button>
      </fieldset>
      <label className="form-row">
        Essential scope
        <textarea
          value={plan.essentialScope}
          rows={3}
          maxLength={500}
          required
          onChange={(event) => update({ essentialScope: event.target.value })}
        />
      </label>
    </fieldset>
  );
}
