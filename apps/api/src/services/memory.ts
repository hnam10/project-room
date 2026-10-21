import type { Member, MemoryAnswer } from '@project-room/shared';
import { getAiProvider } from '../ai/index.js';
import { listDecidedDecisions } from '../repositories/decisions.js';

// The project's memory is its approved decisions. Questions are answered from those records only,
// never from the raw chat log, so every answer can be traced to something the team confirmed.

export async function askProject(projectId: string, question: string, members: Member[]): Promise<MemoryAnswer> {
  const ai = getAiProvider();
  const decisions = await listDecidedDecisions(projectId);
  const draft = await ai.answerFromDecisions({
    question,
    decisions,
    members: members.map((m) => ({ id: m.id, name: m.name, role: m.role })),
  });
  const cited = new Set(draft.sourceDecisionIds);
  return {
    question,
    answer: draft.answer,
    found: cited.size > 0,
    sources: decisions.filter((d) => cited.has(d.id)),
    ai: { provider: ai.name, isMock: ai.isMock },
  };
}
