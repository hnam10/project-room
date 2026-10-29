import { useState } from 'react';
import type { ResearchSource } from '@project-room/shared';
import { Modal } from '../../components/Modal';

const SOURCES_SHOWN = 2;

export function IdeaSources({ sources, label, title }: { sources: ResearchSource[]; label: string; title: string }) {
  const [open, setOpen] = useState(false);
  if (!sources.length) return null;
  const hidden = sources.length - SOURCES_SHOWN;

  return (
    <>
      <div className="idea-sources">
        <strong>{label}:</strong>
        {sources.slice(0, SOURCES_SHOWN).map((source) => (
          <a key={source.url} href={source.url} target="_blank" rel="noreferrer" title={source.title}>
            {source.title}
          </a>
        ))}
        {hidden > 0 && (
          <button type="button" className="idea-more" onClick={() => setOpen(true)}>
            +{hidden} more
          </button>
        )}
      </div>
      {open && (
        <Modal
          open
          eyebrow={label}
          title={title}
          onClose={() => setOpen(false)}
          footer={
            <>
              <span className="spacer" />
              <button type="button" className="btn primary" onClick={() => setOpen(false)}>
                Close
              </button>
            </>
          }
        >
          <ul className="idea-sources-full">
            {sources.map((source) => (
              <li key={source.url}>
                <a href={source.url} target="_blank" rel="noreferrer">
                  {source.title}
                </a>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </>
  );
}
