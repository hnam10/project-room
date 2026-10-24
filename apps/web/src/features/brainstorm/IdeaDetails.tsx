import { useState } from 'react';

const PREVIEW_LENGTH = 85;

export function IdeaDetails({ description, previewLength = PREVIEW_LENGTH }: { description: string; previewLength?: number }) {
  const [expanded, setExpanded] = useState(false);
  const details = description.trim();
  if (!details) return null;

  const canExpand = details.length > previewLength;
  const cut = details.slice(0, previewLength).trimEnd();
  const wordEnd = cut.lastIndexOf(' ');
  const preview = `${wordEnd > previewLength / 2 ? cut.slice(0, wordEnd) : cut}…`;

  return (
    <div className="idea-details">
      <p>{canExpand && !expanded ? preview : details}</p>
      {canExpand && (
        <button type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
  );
}
