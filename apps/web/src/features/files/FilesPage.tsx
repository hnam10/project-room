import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { MAX_FILE_BYTES, type ProjectFile } from '@project-room/shared';
import { api } from '../../api/client';
import { Avatar } from '../../components/Avatar';
import { useFeedback } from '../../components/Feedback';
import { Icon } from '../../components/Icon';
import { useSnapshot, useWorkspace } from '../../state/workspace';

const date = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`;
}

export function FilesPage() {
  const { projectId, members, applyRecord } = useWorkspace();
  const { files } = useSnapshot();
  const { toast, toastError, confirm } = useFeedback();
  const picker = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Files · Project Room';
    return () => {
      document.title = 'Project Room';
    };
  }, []);

  const sorted = [...files].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const uploadMany = async (list: FileList | File[]) => {
    setBusy(true);
    try {
      for (const file of list) {
        if (file.size === 0) {
          toast('Choose a file to upload');
          continue;
        }
        if (file.size > MAX_FILE_BYTES) {
          toast(`${file.name} is larger than 10 MB`);
          continue;
        }
        try {
          applyRecord('file', await api.uploadFile(projectId, file));
        } catch (error) {
          toastError(error);
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files;
    event.target.value = '';
    if (picked?.length) void uploadMany(picked);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    dragDepth.current = 0;
    setOver(false);
    if (event.dataTransfer.files.length) void uploadMany(event.dataTransfer.files);
  };

  const remove = async (file: ProjectFile) => {
    const ok = await confirm({ title: 'Delete file', text: `Delete “${file.name}” for the whole project?`, okLabel: 'Delete' });
    if (!ok) return;
    setDeletingId(file.id);
    applyRecord('file', file, true);
    try {
      await api.deleteFile(projectId, file.id);
    } catch (error) {
      applyRecord('file', file);
      toastError(error);
    } finally {
      setDeletingId(null);
    }
  };

  const save = async (file: ProjectFile) => {
    try {
      const blob = await api.downloadFile(projectId, file.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toastError(error);
    }
  };

  return (
    <div
      className={`page files-page${over ? ' dropping' : ''}`}
      onDragEnter={(event) => {
        event.preventDefault();
        dragDepth.current += 1;
        setOver(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => {
        dragDepth.current -= 1;
        if (dragDepth.current <= 0) {
          dragDepth.current = 0;
          setOver(false);
        }
      }}
      onDrop={onDrop}
    >
      <section className="page-head">
        <span className="page-emoji" aria-hidden="true">
          <Icon name="file" />
        </span>
        <div className="page-title">
          <h1>Files</h1>
          <p>Shared with everyone in this project. Drop a file here, or upload one. 10 MB max.</p>
        </div>
        <div className="head-actions">
          <button className="btn primary" type="button" disabled={busy} onClick={() => picker.current?.click()}>
            <Icon name="plus" />
            {busy ? 'Uploading…' : 'Upload'}
          </button>
          <input ref={picker} type="file" multiple hidden onChange={onPick} />
        </div>
      </section>

      {sorted.length ? (
        <ul className="file-list">
          {sorted.map((file) => {
            const uploader = members.get(file.uploadedById);
            return (
              <li key={file.id} className="file-row">
                <Icon name="file" />
                <div className="file-main">
                  <strong>{file.name}</strong>
                  <span className="meta">
                    {formatSize(file.size)} · {uploader?.name ?? 'someone'} · {date(file.createdAt)}
                  </span>
                </div>
                <Avatar member={uploader} />
                <div className="file-actions">
                  <button className="btn sm" type="button" onClick={() => void save(file)}>
                    <Icon name="download" />
                    Download
                  </button>
                  <button className="btn sm danger-ghost" type="button" disabled={deletingId === file.id} onClick={() => void remove(file)}>
                    <Icon name="trash" />
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="empty-state">
          <p>No files yet. Upload a spec, a slide deck, or anything the team needs in one place.</p>
        </div>
      )}
    </div>
  );
}
