const GENERIC_WORDS = new Set([
  'a',
  'an',
  'and',
  'app',
  'apps',
  'application',
  'build',
  'building',
  'create',
  'creating',
  'for',
  'idea',
  'new',
  'our',
  'platform',
  'product',
  'project',
  'software',
  'test',
  'the',
  'to',
  'tool',
  'with',
]);

export function researchTerms(text: string): string[] {
  return [
    ...new Set(
      (text.toLowerCase().match(/[\p{L}][\p{L}\p{N}]{1,}/gu) ?? [])
        .filter((word) => !GENERIC_WORDS.has(word))
        .map((word) => (word.length > 4 && word.endsWith('s') ? word.slice(0, -1) : word)),
    ),
  ];
}

/** Avoid sending placeholder or one-word ideas to paid web search. */
export function hasResearchableDetail(idea: { title: string; description: string }): boolean {
  return (idea.title.trim().length >= 12 && researchTerms(idea.title).length >= 2) || researchTerms(idea.description).length >= 4;
}
export const RESEARCH_SUMMARY_REASON = 'AI summary of related work';
