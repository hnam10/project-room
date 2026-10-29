import { config } from '../config.js';

export interface WebResearchResult {
  title: string;
  url: string;
  content: string;
}

interface TavilyResponse {
  results?: Array<{ title?: unknown; url?: unknown; content?: unknown }>;
}

export interface WebResearch {
  configured: boolean;
  results: WebResearchResult[];
  error: string | null;
}

/**
 * Search is isolated here so AI providers never receive a key and callers can distinguish unavailable from empty.
 * `since` (YYYY-MM-DD) keeps only pages with a detectable publish date on or after it.
 */
export async function researchWeb(query: string, since?: string): Promise<WebResearch> {
  if (!config.tavilyApiKey) return { configured: false, results: [], error: null };
  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.tavilyApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: query.slice(0, 400),
        search_depth: 'advanced',
        max_results: 5,
        include_answer: false,
        ...(since ? { start_date: since, filter_by_published_date: true } : {}),
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error(`Tavily returned ${response.status}`);
    const body = (await response.json()) as TavilyResponse;
    const results = (body.results ?? [])
      .filter(
        (result): result is { title: string; url: string; content: string } =>
          typeof result.title === 'string' && typeof result.url === 'string' && typeof result.content === 'string',
      )
      .filter((result) => /^https?:\/\//i.test(result.url))
      .slice(0, 5)
      .map((result) => ({ title: result.title.slice(0, 160), url: result.url, content: result.content.slice(0, 1200) }));
    return { configured: true, results, error: null };
  } catch (error) {
    console.error('Web research failed', error);
    return { configured: true, results: [], error: error instanceof Error ? error.message : 'Search failed' };
  }
}
