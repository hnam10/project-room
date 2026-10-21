import { pathToFileURL } from 'node:url';
import { closeDb, connectDb, getDb } from './client.js';
import { rid } from './records.js';

// Demo data for the "Hackathon 2026" project. Runs automatically on an empty database, or
// `npm run db:seed` to wipe and reseed.

const TABLES = ['suggestion', 'message', 'task', 'idea', 'decision', 'channel', 'project', 'member'] as const;

const day = (offsetDays: number, time = '10:00') => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const [h, m] = time.split(':').map(Number);
  d.setHours(h ?? 10, m ?? 0, 0, 0);
  return d;
};
const isoDay = (offsetDays: number) => day(offsetDays).toISOString().slice(0, 10);
// Recent chat is anchored to "now" so new messages always sort after the seeded ones.
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

export async function isDatabaseEmpty(): Promise<boolean> {
  const [rows] = await getDb().query('SELECT count() AS n FROM project GROUP ALL').collect<[{ n: number }[]]>();
  return !rows?.[0]?.n;
}

export async function seedDemoData(): Promise<void> {
  const db = getDb();
  const p = rid('project', 'hackathon');
  const m = (id: string) => rid('member', id);
  const ch = (name: string) => rid('channel', `hackathon-${name}`);

  const members = [
    { id: m('alex'), name: 'Alex', color: '#5b4ff0', role: 'Product & frontend' },
    { id: m('jamie'), name: 'Jamie', color: '#0e9f6e', role: 'Backend' },
    { id: m('taylor'), name: 'Taylor', color: '#e07a1f', role: 'Design' },
    { id: m('morgan'), name: 'Morgan', color: '#d6409f', role: 'Data & DevOps' },
  ];

  const tasks: [number, string, string, string, string, string | null, string | null][] = [
    [12, 'User authentication flow', 'feature', 'high', 'todo', 'jamie', isoDay(3)],
    [14, 'Design system setup', 'design', 'medium', 'todo', 'taylor', null],
    [16, 'Database schema', 'backend', 'high', 'todo', 'morgan', isoDay(2)],
    [18, 'Landing page UI', 'frontend', 'medium', 'todo', null, isoDay(4)],
    [8, 'Homepage UI implementation', 'frontend', 'high', 'progress', 'alex', isoDay(2)],
    [11, 'API integration (OpenAI)', 'backend', 'high', 'progress', 'jamie', null],
    [13, 'Figma design - main screens', 'design', 'medium', 'progress', 'taylor', null],
    [15, 'Team logo & branding', 'design', 'low', 'progress', 'morgan', null],
    [6, 'Project proposal draft', 'docs', 'medium', 'review', 'alex', null],
    [9, 'Demo video script', 'docs', 'low', 'review', 'morgan', null],
    [17, 'Testing & bug fixes', 'test', 'high', 'review', 'jamie', null],
    [1, 'Team ideation session', 'research', 'medium', 'done', 'alex', null],
    [2, 'Competitor analysis', 'research', 'medium', 'done', 'taylor', null],
    [3, 'Tech stack decision', 'docs', 'high', 'done', 'jamie', null],
    [4, 'Project repository setup', 'devops', 'medium', 'done', 'morgan', null],
  ];

  const messages: [string, string, string, string, number][] = [
    ['m1', 'general', 'alex', "Let's focus on the core features first. What do you think?", 40],
    ['m2', 'general', 'jamie', "I'll work on the password reset flow.", 39],
    ['m3', 'general', 'taylor', 'I can handle the onboarding screens in Figma.', 38],
    ['m4', 'general', 'morgan', "We still haven't decided which database to use, and the demo is due Friday.", 37],
    ['m5', 'general', 'alex', '@AI can you create tasks based on our discussion?', 36],
    ['m7', 'design', 'taylor', 'Uploaded the first moodboard. Leaning towards a calm, light palette.', 180],
    ['m8', 'design', 'alex', 'Looks great — keep the accent colour for actions only.', 170],
    ['m9', 'development', 'jamie', 'Repo is set up with CI. PRs need one review before merge.', 120],
    ['m10', 'research', 'taylor', 'Competitor notes are in Files → research/competitors.pdf', 3 * 24 * 60],
    ['m11', 'random', 'morgan', 'Pizza order for Saturday night? 🍕', 3 * 24 * 60 - 90],
  ];

  const ideas: [string, string, string, string, string, string[]][] = [
    [
      'i1',
      'AI-powered study planner',
      'Personalized schedule based on goals and deadlines.',
      'Product',
      'alex',
      ['jamie', 'taylor', 'morgan'],
    ],
    ['i2', 'Collaborative note-taking', 'Real-time collaboration with AI summaries.', 'Product', 'jamie', ['alex', 'taylor', 'morgan']],
    ['i3', 'Smart resource recommendation', 'Suggest relevant papers, videos, and tools.', 'Product', 'taylor', ['alex', 'jamie']],
    ['i4', 'Gamification', 'Motivate users with streaks and achievements.', 'Engagement', 'morgan', ['taylor']],
    ['i5', 'Cross-platform sync', 'Access your study plan anywhere.', 'Platform', 'alex', []],
  ];

  await db
    .query(
      `BEGIN;
       INSERT INTO member $members;
       CREATE $project CONTENT $projectContent;
       INSERT INTO channel $channels;
       INSERT INTO task $tasks;
       INSERT INTO message $messages;
       INSERT INTO idea $ideas;
       INSERT INTO decision $decisions;
       INSERT INTO suggestion $suggestions;
       CREATE message:m6 CONTENT $aiMessage;
       COMMIT;`,
      {
        members,
        project: p,
        projectContent: {
          name: 'Hackathon 2026',
          description: 'Build something amazing together.',
          emoji: '🚀',
          color: '#2f80ed',
          dueDate: isoDay(4),
          memberIds: members.map((x) => x.id),
          taskCounter: 18,
        },
        channels: ['general', 'design', 'development', 'research', 'random'].map((name) => ({ id: ch(name), projectId: p, name })),
        tasks: tasks.map(([num, title, label, priority, status, assignee, dueDate]) => ({
          id: rid('task', `t${num}`),
          projectId: p,
          num,
          title,
          label,
          priority,
          status,
          assigneeId: assignee ? m(assignee) : null,
          dueDate,
        })),
        messages: messages.map(([id, channel, author, text, ago]) => ({
          id: rid('message', id),
          projectId: p,
          channelId: ch(channel),
          authorId: author,
          text,
          createdAt: minutesAgo(ago),
        })),
        ideas: ideas.map(([id, title, description, theme, author, voters], i) => ({
          id: rid('idea', id),
          projectId: p,
          title,
          description,
          theme,
          authorId: m(author),
          voterIds: voters.map(m),
          createdAt: day(-2, `09:0${i}`),
        })),
        decisions: [
          {
            id: rid('decision', 'd1'),
            projectId: p,
            title: 'Use Next.js + Supabase for the stack',
            status: 'decided',
            raisedById: m('jamie'),
            decidedById: m('jamie'),
            createdAt: day(-5),
            decidedAt: day(-4),
          },
          {
            id: rid('decision', 'd2'),
            projectId: p,
            title: 'Target users: students working on group projects',
            status: 'decided',
            raisedById: m('alex'),
            decidedById: m('alex'),
            createdAt: day(-6),
            decidedAt: day(-6),
          },
        ],
        suggestions: [
          {
            id: rid('suggestion', 's1'),
            projectId: p,
            kind: 'action_items',
            status: 'pending',
            title: '3 action items from the conversation',
            reason: 'A team member asked the AI to turn the recent discussion into tasks.',
            items: [
              { title: 'Implement password reset flow', assigneeId: m('jamie'), priority: 'high', include: true },
              { title: 'Design onboarding screens in Figma', assigneeId: m('taylor'), priority: 'medium', include: true },
              { title: 'Decide which database to use', assigneeId: null, priority: 'high', include: true },
            ],
            createdAt: minutesAgo(35),
          },
          {
            id: rid('suggestion', 's2'),
            projectId: p,
            kind: 'decision',
            status: 'pending',
            title: 'Database choice is still undecided',
            proposal: 'Which database to use',
            reason: 'Morgan raised it in #general and no decision has been recorded. Task #16 “Database schema” depends on it.',
            quote: "We still haven't decided which database to use, and the demo is due Friday.",
            cite: `Morgan · #general · ${minutesAgo(37).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`,
            sourceMessageId: rid('message', 'm4'),
            createdAt: minutesAgo(34),
          },
          {
            id: rid('suggestion', 's3'),
            projectId: p,
            kind: 'risk',
            status: 'pending',
            title: 'Landing page UI has no owner',
            reason: `Task #18 is due ${isoDay(4)} and nobody is assigned. Alex and Morgan currently have the lightest load.`,
            taskId: rid('task', 't18'),
            createdAt: minutesAgo(33),
          },
        ],
        aiMessage: {
          projectId: p,
          channelId: ch('general'),
          authorId: 'ai',
          text: 'I’ve detected the following action items:',
          suggestionId: rid('suggestion', 's1'),
          createdAt: minutesAgo(35),
        },
      },
    )
    .collect();
}

export async function wipe(): Promise<void> {
  await getDb()
    .query(TABLES.map((t) => `DELETE ${t};`).join('\n'))
    .collect();
}

// `npm run db:seed`
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await connectDb();
  await wipe();
  await seedDemoData();
  await closeDb();
  console.log('Database reset with demo data.');
}
