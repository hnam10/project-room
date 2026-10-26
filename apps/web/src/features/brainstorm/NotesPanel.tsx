import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Meeting, Note } from '@project-room/shared';
import { api } from '../../api/client';
import { Avatar } from '../../components/Avatar';
import { Icon } from '../../components/Icon';
import { Modal } from '../../components/Modal';
import { useFeedback } from '../../components/Feedback';
import { useMeetingCall } from '../../state/meetingCall';
import { useSession } from '../../state/session';
import { useSnapshot, useWorkspace } from '../../state/workspace';

const MEETING_NOTES_SHOWN = 2;

type Entry = { kind: 'note'; at: string; note: Note } | { kind: 'meeting'; at: string; meeting: Meeting };

function NoteDialog({ note, onClose }: { note: Note | null; onClose: () => void }) {
  const { projectId, applyRecord } = useWorkspace();
  const { toastError } = useFeedback();
  const [title, setTitle] = useState(note?.title ?? '');
  const [body, setBody] = useState(note?.body ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      const input = { title: title.trim(), body: body.trim() };
      applyRecord('note', note ? await api.updateNote(projectId, note.id, input) : await api.createNote(projectId, input));
      onClose();
    } catch (error) {
      toastError(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={note ? 'Edit note' : 'New note'}
      onClose={onClose}
      onSubmit={save}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={saving || !title.trim()}>
            {note ? 'Save changes' : 'Add note'}
          </button>
        </>
      }
    >
      <label>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} autoFocus />
      </label>
      <label>
        Note
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} maxLength={10000} />
      </label>
    </Modal>
  );
}

const Section = ({ title, items }: { title: string; items: string[] }) =>
  items.length ? (
    <>
      <h4>{title}</h4>
      <ul>
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </>
  ) : null;

/** Project-wide notes: what members write, plus the AI summary of every ended meeting (read-only). */
export function NotesPanel() {
  const { projectId, applyRecord, members } = useWorkspace();
  const { notes } = useSnapshot();
  const { memberId } = useSession();
  const { recent, select, dismiss, live } = useMeetingCall();
  const { toast, toastError, confirm } = useFeedback();
  const meetingPath = `/p/${projectId}/meeting`;
  // Switching the shown meeting would tear down a live call, so during one we only go to the room.
  const leaveForLive = () => {
    toast('A meeting is live. Its history opens once the meeting ends.');
    navigate(meetingPath);
  };
  const navigate = useNavigate();
  const [editing, setEditing] = useState<Note | 'new' | null>(null);

  // Only the latest meeting summaries; older ones are in the Meeting tab's history.
  const summarized = recent.filter((m) => m.summary).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const hasOlder = summarized.length > MEETING_NOTES_SHOWN;
  const entries: Entry[] = [
    ...notes.map((note): Entry => ({ kind: 'note', at: note.createdAt, note })),
    ...summarized.slice(0, MEETING_NOTES_SHOWN).map((meeting): Entry => ({ kind: 'meeting', at: meeting.startedAt, meeting })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const openHistory = () => {
    if (live) return leaveForLive();
    dismiss();
    navigate(meetingPath);
  };

  const remove = async (note: Note) => {
    if (!(await confirm({ title: 'Delete note?', text: `Delete “${note.title}”?`, okLabel: 'Delete' }))) return;
    try {
      await api.deleteNote(projectId, note.id);
      applyRecord('note', note, true);
    } catch (error) {
      toastError(error);
    }
  };

  const openMeeting = async (meeting: Meeting) => {
    if (live) return leaveForLive();
    try {
      await select(projectId, meeting.id);
      navigate(meetingPath);
    } catch (error) {
      toastError(error);
    }
  };

  return (
    <div className="notes-panel">
      <p className="notes-intro">
        <span className="notes-key member">Team notes</span> are shared with everyone.{' '}
        <span className="notes-key meeting">Meeting notes</span> show the last {MEETING_NOTES_SHOWN} meetings; older ones are in the Meeting
        tab.
      </p>
      <div className="idea-grid">
        <button className="idea-add note-add" onClick={() => setEditing('new')}>
          <span>
            <Icon name="plus" />
            New note
          </span>
        </button>
        {entries.map((entry) =>
          entry.kind === 'note' ? (
            <article className="idea note-card" key={`note:${entry.note.id}`}>
              <h3>{entry.note.title}</h3>
              {entry.note.body && <p className="note-body">{entry.note.body}</p>}
              {entry.note.authorId === memberId && (
                <div className="idea-stage-actions">
                  <button type="button" onClick={() => setEditing(entry.note)}>
                    Edit
                  </button>
                  <button type="button" className="idea-delete" onClick={() => void remove(entry.note)}>
                    Delete
                  </button>
                </div>
              )}
              <div className="idea-foot">
                <Avatar member={members.get(entry.note.authorId)} />
                {members.get(entry.note.authorId)?.name ?? 'Former member'}
                <span className="idea-meta">{new Date(entry.note.createdAt).toLocaleDateString()}</span>
              </div>
            </article>
          ) : (
            <article className="idea note-meeting" key={`meeting:${entry.meeting.id}`}>
              <span className="ai-draft-label">
                <Icon name="sparkle" />
                AI meeting summary
              </span>
              <h3>{entry.meeting.title}</h3>
              {entry.meeting.summary!.overview && <p>{entry.meeting.summary!.overview}</p>}
              <details className="note-meeting-details">
                <summary>Decisions, next steps and notes</summary>
                <Section title="Decisions" items={entry.meeting.summary!.decisions} />
                <Section title="Open questions" items={entry.meeting.summary!.openQuestions} />
                <Section title="Next steps" items={entry.meeting.summary!.nextSteps} />
                <Section title="Notes for next time" items={entry.meeting.carryOver} />
              </details>
              <div className="idea-stage-actions">
                <button type="button" onClick={() => void openMeeting(entry.meeting)}>
                  Open meeting
                </button>
              </div>
              <div className="idea-foot">
                <Icon name="mic" />
                Meeting
                <span className="idea-meta">{new Date(entry.meeting.startedAt).toLocaleDateString()}</span>
              </div>
            </article>
          ),
        )}
        {hasOlder && (
          <button className="idea-add note-history" onClick={openHistory}>
            <span>
              <Icon name="mic" />
              Older meeting notes · Meeting history
            </span>
          </button>
        )}
      </div>
      {editing && <NoteDialog note={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
