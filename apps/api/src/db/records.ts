import { DateTime, RecordId } from 'surrealdb';

export type TableName =
  | 'member'
  | 'project'
  | 'channel'
  | 'message'
  | 'task'
  | 'idea'
  | 'suggestion'
  | 'file'
  | 'meeting'
  | 'live_meeting'
  | 'transcript_line'
  | 'poll'
  | 'note';

/** Builds a record id from the plain id used by the API ("t19" -> task:t19). */
export function rid(table: TableName, id: string): RecordId {
  return new RecordId(table, id);
}

export function ridOrNull(table: TableName, id: string | null | undefined): RecordId | null {
  return id ? rid(table, id) : null;
}

/**
 * Converts a SurrealDB result into the plain JSON shape the API returns:
 * record ids become their id part ("task:t19" -> "t19"), datetimes become ISO strings,
 * and missing optional fields become null.
 */
export function toPlain<T>(value: unknown): T {
  if (value instanceof RecordId) return String(value.id) as T;
  if (value instanceof DateTime) return value.toISOString() as T;
  if (value === undefined) return null as T;
  if (Array.isArray(value)) return value.map((v) => toPlain(v)) as T;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toPlain(v)])) as T;
  }
  return value as T;
}

/** Thrown by repositories when a record doesn't exist (or belongs to another project); mapped to 404. */
export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
    this.name = 'NotFoundError';
  }
}

/** Thrown for requests that are valid JSON but not allowed in the current state; mapped to 409. */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

/** Thrown when the caller is a project member but may not do this; mapped to 403. */
export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}
