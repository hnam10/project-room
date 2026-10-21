import { pathToFileURL } from 'node:url';
import { closeDb, connectDb, getDb } from './client.js';
import { rid } from './records.js';

// Demo data for the "Hackathon 2026" project. Runs automatically on an empty database (dev/test), or
// `npm run db:seed` to wipe and reseed. In Clerk mode the project id must be a Clerk organization id, so
// seed with `npm run db:seed -- --org org_xxx` (or set SEED_ORG_ID on the server). The demo teammates are
// placeholder members; real Clerk users join the project the first time they open it.

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

export const DEMO_PROJECT_ID = 'hackathon';

export async function seedDemoData({ projectId = DEMO_PROJECT_ID }: { projectId?: string } = {}): Promise<void> {
  const db = getDb();
  // Record ids are global per table, so a project other than the default gets prefixed ids.
  const scoped = (id: string) => (projectId === DEMO_PROJECT_ID ? id : `${projectId}_${id}`);
  const p = rid('project', projectId);
  const m = (id: string) => rid('member', scoped(id));
  const ch = (name: string) => rid('channel', `${projectId}-${name}`);

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
    ['m12', 'general', 'taylor', 'Landing page UI still has no owner and it is due Friday.', 33],
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
       CREATE $aiMessageId CONTENT $aiMessage;
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
          id: rid('task', scoped(`t${num}`)),
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
          id: rid('message', scoped(id)),
          projectId: p,
          channelId: ch(channel),
          authorId: author === 'ai' ? author : scoped(author),
          text,
          createdAt: minutesAgo(ago),
        })),
        ideas: ideas.map(([id, title, description, theme, author, voters], i) => ({
          id: rid('idea', scoped(id)),
          projectId: p,
          title,
          description,
          theme,
          authorId: m(author),
          voterIds: voters.map(m),
          createdAt: day(-2, `09:0${i}`),
        })),
        decisions: [
          // The project's memory: approved decisions with what was decided and why. Hosting was reversed
          // on purpose so "where do we host?" has a time-aware answer.
          {
            id: rid('decision', scoped('d1')),
            projectId: p,
            title: 'Target users',
            outcome: 'Students working on group projects',
            reason: 'The sharpest pain we can reach at campus hackathons, and we can interview them this week.',
            status: 'decided',
            raisedById: m('alex'),
            decidedById: m('alex'),
            createdAt: day(-7),
            decidedAt: day(-7),
          },
          {
            id: rid('decision', scoped('d2')),
            projectId: p,
            title: 'Which frontend framework to use',
            outcome: 'React + Vite, not Next.js',
            reason: 'We need an app-like workspace with no SEO or server rendering, and Vite keeps the dev loop fast.',
            status: 'decided',
            raisedById: m('jamie'),
            decidedById: m('jamie'),
            createdAt: day(-6),
            decidedAt: day(-5),
          },
          {
            id: rid('decision', scoped('d3')),
            projectId: p,
            title: 'Which AI model powers suggestions',
            outcome: 'Claude through the Anthropic API, behind our AiProvider interface',
            reason: 'Structured output gives every suggestion a reason and a quote, and the interface lets us swap models.',
            status: 'decided',
            raisedById: m('alex'),
            decidedById: m('alex'),
            createdAt: day(-4),
            decidedAt: day(-4),
          },
          {
            id: rid('decision', scoped('d4')),
            projectId: p,
            title: 'Where to host the demo',
            outcome: 'Vercel',
            reason: 'Free tier and one-click deploys from GitHub.',
            status: 'decided',
            raisedById: m('morgan'),
            decidedById: m('morgan'),
            createdAt: day(-6),
            decidedAt: day(-6),
          },
          {
            id: rid('decision', scoped('d5')),
            projectId: p,
            title: 'Where to host the demo (revisited)',
            outcome: 'Fly.io with a persistent volume, replacing Vercel',
            reason: 'The embedded SurrealDB needs a persistent disk, which Vercel functions do not provide.',
            status: 'decided',
            raisedById: m('morgan'),
            decidedById: m('jamie'),
            createdAt: day(-2),
            decidedAt: day(-2),
          },
        ],
        suggestions: [
          {
            id: rid('suggestion', scoped('s1')),
            projectId: p,
            kind: 'action_items',
            status: 'pending',
            title: '3 action items from the conversation',
            reason: 'A team member asked the AI to turn the recent discussion into tasks.',
            items: [
              {
                title: 'Implement password reset flow',
                assigneeId: m('jamie'),
                priority: 'high',
                include: true,
                reason: 'Jamie committed to this in chat, so it is proposed with them as owner.',
                quote: "I'll work on the password reset flow.",
              },
              {
                title: 'Design onboarding screens in Figma',
                assigneeId: m('taylor'),
                priority: 'medium',
                include: true,
                reason: 'Taylor offered to take the onboarding screens.',
                quote: 'I can handle the onboarding screens in Figma.',
              },
              {
                title: 'Decide which database to use',
                assigneeId: null,
                priority: 'high',
                include: true,
                reason: 'Morgan said the database is undecided and the demo is due Friday, and no approved decision covers it.',
                quote: "We still haven't decided which database to use, and the demo is due Friday.",
              },
            ],
            createdAt: minutesAgo(35),
          },
          {
            id: rid('suggestion', scoped('s2')),
            projectId: p,
            kind: 'decision',
            status: 'pending',
            title: 'Open question: Which database to use',
            proposal: 'Which database to use',
            reason: 'Morgan raised it in #general and no decision has been recorded. Task #16 “Database schema” depends on it.',
            quote: "We still haven't decided which database to use, and the demo is due Friday.",
            cite: `Morgan · #general · ${minutesAgo(37).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`,
            sourceMessageId: rid('message', scoped('m4')),
            createdAt: minutesAgo(34),
          },
          {
            id: rid('suggestion', scoped('s3')),
            projectId: p,
            kind: 'risk',
            status: 'pending',
            title: 'Landing page UI has no owner',
            reason: `Task #18 is due ${isoDay(4)} and nobody is assigned. Alex and Morgan currently have the lightest load.`,
            quote: 'Landing page UI still has no owner and it is due Friday.',
            cite: `Taylor · #general · ${minutesAgo(33).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`,
            sourceMessageId: rid('message', scoped('m12')),
            taskId: rid('task', scoped('t18')),
            createdAt: minutesAgo(33),
          },
        ],
        aiMessageId: rid('message', scoped('m6')),
        aiMessage: {
          projectId: p,
          channelId: ch('general'),
          authorId: 'ai',
          text: 'I’ve detected the following action items:',
          suggestionId: rid('suggestion', scoped('s1')),
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
  const orgFlag = process.argv.indexOf('--org');
  const projectId = (orgFlag > 0 && process.argv[orgFlag + 1]) || DEMO_PROJECT_ID;
  await connectDb();
  await wipe();
  await seedDemoData({ projectId });
  await closeDb();
  console.log(`Database reset with demo data (project id: ${projectId}).`);
}
