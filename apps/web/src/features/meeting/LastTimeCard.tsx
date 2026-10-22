import { useEffect, useState } from 'react';
import type { MeetingDetail } from '@project-room/shared';
import { meetingsApi } from '../../api/meetings';

/** The confirmed carry-over notes of the previous meeting, shown at the top of a live meeting. */
export function LastTimeCard({ projectId, previousId }: { projectId: string; previousId: string }) {
  const [prev, setPrev] = useState<MeetingDetail['meeting'] | null>(null);
  useEffect(() => {
    let cancelled = false;
    meetingsApi
      .get(projectId, previousId)
      .then((d) => !cancelled && setPrev(d.meeting))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [projectId, previousId]);

  if (!prev?.carryOver.length) return null;
  return (
    <div className="last-time">
      <h3>
        Last time · {prev.title} · {new Date(prev.startedAt).toLocaleDateString()}
      </h3>
      <ul>
        {prev.carryOver.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
    </div>
  );
}
