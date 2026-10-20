import type { Task, TaskCreateInput, TaskUpdateInput } from '@project-room/shared';
import { queryMany, queryOne } from '../db/query.js';
import { NotFoundError, rid, ridOrNull } from '../db/records.js';

type TaskFields = Required<Omit<TaskCreateInput, 'assigneeId'>> & { assigneeId: string | null };

export function listTasks(projectId: string): Promise<Task[]> {
  return queryMany<Task>('SELECT * FROM task WHERE projectId = $project ORDER BY num', { project: rid('project', projectId) });
}

export async function getTask(projectId: string, taskId: string): Promise<Task> {
  const task = await queryOne<Task>('SELECT * FROM ONLY $id WHERE projectId = $project', {
    id: rid('task', taskId),
    project: rid('project', projectId),
  });
  if (!task) throw new NotFoundError('Task');
  return task;
}

/** Creates a task with the next per-project number (#1, #2, ...) in one transaction. */
export async function createTask(
  projectId: string,
  fields: TaskFields,
  source: { kind: 'suggestion' | 'idea'; id: string } | null = null,
): Promise<Task> {
  const content = {
    ...fields,
    projectId: rid('project', projectId),
    assigneeId: ridOrNull('member', fields.assigneeId),
    sourceKind: source?.kind ?? null,
    sourceId: source?.id ?? null,
  };
  const task = await queryOne<Task>(
    `BEGIN;
     LET $num = (UPDATE ONLY $project SET taskCounter += 1 RETURN VALUE taskCounter);
     LET $task = (CREATE ONLY task CONTENT object::extend($content, { num: $num }));
     COMMIT;
     RETURN $task;`,
    { project: rid('project', projectId), content },
  );
  if (!task) throw new Error('Task creation returned nothing');
  return task;
}

export async function updateTask(projectId: string, taskId: string, patch: TaskUpdateInput): Promise<Task> {
  await getTask(projectId, taskId);
  const changes: Record<string, unknown> = { ...patch };
  if ('assigneeId' in patch) changes.assigneeId = ridOrNull('member', patch.assigneeId);
  const task = await queryOne<Task>('UPDATE ONLY $id MERGE $changes RETURN AFTER', { id: rid('task', taskId), changes });
  if (!task) throw new NotFoundError('Task');
  return task;
}

export async function deleteTask(projectId: string, taskId: string): Promise<void> {
  await getTask(projectId, taskId);
  await queryOne('DELETE $id', { id: rid('task', taskId) });
}
