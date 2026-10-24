import { useState } from 'react';
import { MAX_FILE_BYTES, type ProjectFile } from '@project-room/shared';
import { api } from '../../api/client';
import { useFeedback } from '../../components/Feedback';
import { useWorkspace } from '../../state/workspace';

/**
 * Uploads files to the project's Files, then hands each one to `share` (post it to a channel or the meeting chat).
 * One `attaching` state covers both the + button and dropping files.
 */
export function useAttachFiles(share: (file: ProjectFile) => Promise<unknown>) {
  const { projectId, applyRecord } = useWorkspace();
  const { toast, toastError } = useFeedback();
  const [attaching, setAttaching] = useState(false);

  const attach = async (files: File[]) => {
    if (!files.length) return;
    if (attaching) return toast('Wait for the current upload to finish');
    setAttaching(true);
    try {
      for (const file of files) {
        if (file.size === 0) {
          toast(`${file.name || 'That file'} is empty or a folder`);
          continue;
        }
        if (file.size > MAX_FILE_BYTES) {
          toast(`${file.name} is larger than 10 MB`);
          continue;
        }
        try {
          const uploaded = await api.uploadFile(projectId, file);
          applyRecord('file', uploaded);
          await share(uploaded);
        } catch (error) {
          toastError(error);
        }
      }
    } finally {
      setAttaching(false);
    }
  };
  return { attach, attaching };
}

/** Drag-and-drop handlers that pass dropped files to `onFiles`; `fileOver` is true while files hover the target. */
export function useFileDrop(enabled: boolean, onFiles: (files: File[]) => void) {
  const [fileOver, setFileOver] = useState(false);
  const hasFiles = (e: React.DragEvent) => enabled && e.dataTransfer.types.includes('Files');
  return {
    fileOver,
    dropProps: {
      onDragOver: (e: React.DragEvent) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setFileOver(true);
      },
      onDragLeave: (e: React.DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFileOver(false);
      },
      onDrop: (e: React.DragEvent) => {
        setFileOver(false);
        if (!hasFiles(e)) return;
        e.preventDefault();
        onFiles([...e.dataTransfer.files]);
      },
    },
  };
}
