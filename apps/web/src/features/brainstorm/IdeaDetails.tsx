import { useState } from 'react';
import { Modal } from '../../components/Modal';

const PREVIEW_LENGTH = 85;

export function IdeaDetails({
  description,
  title = 'Details',
  previewLength = PREVIEW_LENGTH,
  onEdit,
}: {
  description: string;
  title?: string;
  previewLength?: number;
  onEdit?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const details = description.trim();
  if (!details) return null;

  const canExpand = details.length > previewLength;
  const cut = details.slice(0, previewLength).trimEnd();
  const wordEnd = cut.lastIndexOf(' ');
  const preview = `${wordEnd > previewLength / 2 ? cut.slice(0, wordEnd) : cut}…`;

  return (
    <div className="idea-details">
      <p>
        {canExpand ? preview : details}
        {canExpand && (
          <>
            {' '}
            <button type="button" className="idea-more" onClick={() => setOpen(true)}>
              more
            </button>
          </>
        )}
      </p>
      {open && (
        <Modal
          open
          title={title}
          onClose={() => setOpen(false)}
          footer={
            <>
              <span className="spacer" />
              {onEdit && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setOpen(false);
                    onEdit();
                  }}
                >
                  Edit
                </button>
              )}
              <button type="button" className="btn primary" onClick={() => setOpen(false)}>
                Close
              </button>
            </>
          }
        >
          <p className="idea-details-full">{details}</p>
        </Modal>
      )}
    </div>
  );
}
