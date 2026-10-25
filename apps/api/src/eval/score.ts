// Scores proposed action items against an answer key. Pure functions, so the CLI and the tests share them.

export interface ExpectedItem {
  title: string;
  /** Member id of the owner, or null when the conversation names nobody. */
  assignee: string | null;
}

export interface ProposedItem {
  title: string;
  assigneeId: string | null;
}

export interface Score {
  expected: number;
  proposed: number;
  /** Proposed items matched to an expected one. */
  matched: number;
  /** Matched items whose assignee is also right. */
  assigneeRight: number;
}

const STOP = new Set(['a', 'an', 'the', 'to', 'for', 'of', 'and', 'on', 'in', 'with', 'by', 'our', 'we', 'i', 'will']);

const tokens = (title: string) =>
  new Set(
    title
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t && !STOP.has(t)),
  );

/** Dice overlap of the title words, 0..1. */
export function similarity(a: string, b: string): number {
  const x = tokens(a);
  const y = tokens(b);
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const t of x) if (y.has(t)) shared++;
  return (2 * shared) / (x.size + y.size);
}

// ponytail: word-overlap matching with a fixed threshold; swap in Era's own matching rule once we see its answer key.
export const MATCH_AT = 0.5;

/**
 * Pairs each proposal with at most one expected item, as many pairs as possible (augmenting paths), trying the best
 * overlap first. Greedy best-first can pair fewer: it may give an expected item the one proposal another one needed.
 */
export function scoreCase(expected: ExpectedItem[], proposed: ProposedItem[]): Score {
  // Candidate proposals per expected item, best overlap first.
  const options = expected.map((ex) =>
    proposed
      .map((pr, p) => ({ p, s: similarity(ex.title, pr.title) }))
      .filter((o) => o.s >= MATCH_AT)
      .sort((a, b) => b.s - a.s)
      .map((o) => o.p),
  );
  const ownerOf = new Map<number, number>(); // proposal -> expected
  const claim = (e: number, seen: Set<number>): boolean => {
    for (const p of options[e]!) {
      if (seen.has(p)) continue;
      seen.add(p);
      const owner = ownerOf.get(p);
      if (owner === undefined || claim(owner, seen)) {
        ownerOf.set(p, e);
        return true;
      }
    }
    return false;
  };
  expected.forEach((_, e) => claim(e, new Set()));
  let assigneeRight = 0;
  for (const [p, e] of ownerOf) if (expected[e]!.assignee === proposed[p]!.assigneeId) assigneeRight++;
  return { expected: expected.length, proposed: proposed.length, matched: ownerOf.size, assigneeRight };
}

export function sum(scores: Score[]): Score {
  return scores.reduce(
    (t, s) => ({
      expected: t.expected + s.expected,
      proposed: t.proposed + s.proposed,
      matched: t.matched + s.matched,
      assigneeRight: t.assigneeRight + s.assigneeRight,
    }),
    { expected: 0, proposed: 0, matched: 0, assigneeRight: 0 },
  );
}

/** Precision, recall, F1 and assignee accuracy (of matched items), each 0..1; 0 when undefined. */
export function rates(s: Score) {
  const precision = s.proposed ? s.matched / s.proposed : 0;
  const recall = s.expected ? s.matched / s.expected : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  const assignee = s.matched ? s.assigneeRight / s.matched : 0;
  return { precision, recall, f1, assignee };
}
