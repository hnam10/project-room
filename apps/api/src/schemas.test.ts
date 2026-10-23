import { describe, expect, it } from 'vitest';
import { projectUpdateSchema, taskCreateSchema, taskUpdateSchema } from '@project-room/shared';

describe.each([
  ['project update', projectUpdateSchema],
  ['task create', taskCreateSchema],
  ['task update', taskUpdateSchema],
])('%s due date', (_name, schema) => {
  it.each(['2026-01-31', '2026-04-30', '2026-02-28', '2024-02-29', '2000-02-29', '2400-02-29', '0096-02-29', null])(
    'accepts %s',
    (dueDate) => {
      expect(schema.parse({ title: 'Calendar task', dueDate }).dueDate).toBe(dueDate);
    },
  );

  it.each([
    '2026-02-30',
    '2024-02-30',
    '2026-02-29',
    '1900-02-29',
    '2100-02-29',
    '2026-04-31',
    '2026-00-10',
    '2026-13-01',
    '2026-01-00',
    '2026-01-32',
    '2026-1-01',
    '2026-01-1',
    '2026-01-01T00:00:00Z',
    '',
  ])('rejects %s', (dueDate) => {
    expect(schema.safeParse({ title: 'Calendar task', dueDate }).success).toBe(false);
  });
});
