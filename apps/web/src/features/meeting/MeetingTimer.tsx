import { useEffect, useRef, useState } from 'react';
import { useFeedback } from '../../components/Feedback';

const MIN = 60_000;

/** Counts down to `endsAt`; toasts at 10 and 5 minutes left (once each), calls `onExpire` at 0. */
export function MeetingTimer(props: { meetingId: string; startedAt: string; endsAt: string; onExpire: () => void }) {
  const { toast } = useFeedback();
  const [now, setNow] = useState(() => Date.now());
  const fired = useRef(new Set<string>());
  const onExpire = useRef(props.onExpire);
  useEffect(() => {
    onExpire.current = props.onExpire;
  });

  const end = new Date(props.endsAt).getTime();
  const left = Math.max(0, end - now);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    const mark = (key: string, run: () => void) => {
      const id = `${props.meetingId}:${key}`;
      if (fired.current.has(id)) return;
      fired.current.add(id);
      run();
    };
    // Only toast when we're within the threshold window, so joining late doesn't replay old warnings.
    if (left > 0 && left <= 5 * MIN) mark('5', () => toast('5 minutes left'));
    else if (left > 5 * MIN && left <= 10 * MIN) mark('10', () => toast('10 minutes left'));
    if (left === 0) mark('end', () => onExpire.current());
  }, [left, props.meetingId, toast]);

  const s = Math.ceil(left / 1000);
  const text = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  return (
    <span className={`meeting-timer${left <= 5 * MIN ? ' warn' : ''}`} title="Meetings last at most 60 minutes">
      {text} left
    </span>
  );
}
