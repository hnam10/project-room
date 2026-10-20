# Commonroom — AI-powered project workspace

A dependency-free MVP for moving team work from conversation to action. It includes a shared project room, a task board, an idea board, and a review queue for AI suggestions.

## Run locally

Requires Node.js 18 or newer. From the project folder, run:

```sh
npm start
```

Open <http://127.0.0.1:4173> in your browser. The app has no install step and saves changes in that browser using `localStorage`. To reset the demo to its original sample data, clear the site's local storage.

## MVP behavior

- Send team messages; the mock assistant follows the conversation and surfaces possible tasks or open decisions in AI insights.
- Review, edit, approve, or dismiss task suggestions. Approval creates a task and moves the view to the task board.
- Create, edit, assign, prioritize, move, and delete tasks. Convert ideas into tasks.
- Add and vote on ideas, and filter them by theme.
- Project content is shared within this browser profile only. There is no account, multi-user sync, invitation, upload, or server-side persistence yet.

## AI integration

The current assistant is an explicit local mock adapter in `app.js`: it uses simple phrase matching and canned replies, and does not call an AI provider or send project data anywhere. To enable a real provider, add a server-side endpoint and credentials in environment variables, then replace `detectInsight` / `mockReply` with a provider adapter. Keep credentials out of browser code and preserve the approval step for consequential actions.
