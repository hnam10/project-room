# AI Meeting Room Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In-app voice meetings with a live transcript, in which Claude reads along and suggests tickets, ideas and
polls. Meetings are capped at 60 minutes, and member-confirmed notes carry over to the next meeting.

**Architecture:** New `meeting` / `transcript_line` / `poll` tables live in their own schema file. Meeting services
follow the existing route → service → repository layering. Audio is a WebRTC mesh signalled over the existing
`/ws` hub. Each browser transcribes its own mic with the Web Speech API. A separate `MeetingAi` interface (Claude or
mock) runs from an in-process trigger. All AI output is a `suggestion` approved through `approveSuggestion`.

**Tech Stack:** Express 5, SurrealDB 3 (`surrealdb` 2.x SDK), `ws`, zod, `@anthropic-ai/sdk` (`messages.parse`),
React 19 + Vite, vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-21-ai-meeting-room-design.md`. Read it with this plan; § numbers below
refer to it.

## Global Constraints

- Branches: one per phase (`feat/meeting-foundation`, `feat/meeting-room`, `feat/meeting-voice`, `feat/meeting-live-ai`,
  `feat/meeting-summary`), each rebased on `main` before its PR. Never commit to `main`.
- Shared files get only the edits listed in spec §15. Don't reformat or move code in them. Don't touch
  `WorkspaceSnapshot`, the `idea` table, `BoardPage.tsx`, `provider.ts`, `anthropic.ts`, `mock.ts` or `ai-engine.ts`.
  Additions to the §15 list found while planning: `apps/api/src/db/records.ts` (`TableName`),
  `apps/api/src/http/errors.ts` (`ForbiddenError`), `apps/api/src/index.ts` (clock, live and resume hooks),
  `apps/web/src/api/client.ts` (`export` on `request` and `p`) and one `@import` line in `styles/index.css`.
- Meeting length: `endsAt = startedAt + 60 minutes`, enforced on the server. Warning toasts at 50 and 55 minutes.
- One `live` meeting per project.
- `transcript_line.text`: 1–1000 characters. `speakerId` always comes from the caller, never from the body.
- Polls have 2–5 options with one vote per member, which the member can move. Any member can close a poll.
- Live trigger: ≥ 80 new words and ≥ 45 s since the last call, **or** ≥ 30 new words and 20 s of silence. At most
  60 calls per meeting, one in flight at a time, only while `aiEnabled`. Silence check every 5 s.
- Live model: `ANTHROPIC_FAST_MODEL` (default `claude-haiku-5-5`, `output_config.effort: 'low'`). Summary model:
  `ANTHROPIC_MODEL`.
- `runningSummary` ≤ 150 words. Transcript goes inside `<transcript>` tags as untrusted data. A quote is kept only
  if it is verbatim in a line.
- Summary: 3 attempts with backoff (1 s, 4 s), then `summaryError`.
- ICE servers: `RTC_ICE_SERVERS` (JSON array). Default `[{"urls":"stun:stun.l.google.com:19302"}]`. Mesh warning
  above 6 participants.
- Every new route sits under the project router (`requireProjectMember`), and every repository query filters by
  `projectId`.
- `npm run check` passes at the end of every task.

## Review Focus

1. **The same member joins from two tabs or reloads.** `participantIds` must not hold duplicates, and a join must
   be idempotent → test in Task 3.
2. **A final speech result longer than 1000 characters.** The client splits it at word boundaries into ≤ 1000-char
   lines, and the server answers 400 for anything longer → server test in Task 3; client split in Task 4.
3. **The API restarts during a meeting.** A meeting left `live` past `endsAt` must end; one left `summarizing` must
   resummarize → test in Task 10.
4. **The model returns an `ideaId` or member id from outside this project, or a made-up quote.** It is dropped,
   never stored → tests in Task 7.
5. **A vote with an unknown `optionId` or on a closed poll.** 400 for the unknown option, 409 for the closed poll,
   and the vote is unchanged → test in Task 2.

---

## Phase 0 — Foundation (branch `feat/meeting-foundation`)

### Task 1: Shared types, schema and suggestion fields

**Files:**

- Create: `packages/shared/src/meeting.ts`, `apps/api/src/db/schema.meeting.surql`
- Modify:
  - `packages/shared/src/index.ts` (one export)
  - `packages/shared/src/domain.ts` (`SuggestionKind`, `Suggestion`)
  - `packages/shared/src/schemas.ts` (`suggestionUpdateSchema`)
  - `packages/shared/src/realtime.ts` (`RealtimeRecords`)
  - `apps/api/src/db/schema.surql` (suggestion `kind` ASSERT, new suggestion fields)
  - `apps/api/src/db/client.ts` (`applySchema`)
  - `apps/api/src/db/records.ts` (`TableName`)
  - `apps/api/src/repositories/suggestions.ts` (`SuggestionDraft`, `createSuggestion`, new `updateSuggestionDrafts`)
  - `apps/web/src/state/workspace.tsx` (`CollectionTable` made explicit, `if (!key) return state`)
- Test: `apps/api/src/repositories/suggestions.test.ts`

**Interfaces:**

- Produces, from `@project-room/shared`:
  - `MeetingStatus = 'live' | 'summarizing' | 'ended'`
  - `MeetingSummary { overview: string; decisions: string[]; openQuestions: string[]; nextSteps: string[] }`
  - `MeetingUsage { calls: number; inputTokens: number; outputTokens: number }`
  - `Meeting`: the fields in spec §4. Ids are plain strings and datetimes are ISO strings.
  - `TranscriptLine { id, projectId, meetingId, speakerId, text, spokenAt }`
  - `PollOption { id: string; label: string; voterIds: string[] }`
  - `Poll`: the fields in spec §4
  - `IdeaDraft { title: string; description: string; theme: IdeaTheme }`
  - `PollDraft { question: string; options: string[] }`
  - `MeetingDetail { meeting: Meeting; lines: TranscriptLine[]; polls: Poll[] }`
  - `RtcSignal { kind: 'offer' | 'answer' | 'ice'; data: unknown }`
  - `ClientRtc { type: 'rtc'; meetingId: string; to: string; signal: RtcSignal }`
  - `ServerRtc { type: 'rtc'; meetingId: string; from: string; signal: RtcSignal }`
  - zod schemas:
    - `meetingCreateSchema`: `{ title?: string ≤80; language?: string ≤16, default 'ko-KR' }`
    - `transcriptLineCreateSchema`: `{ text: trimmed 1..1000 }`
    - `meetingAiSchema`: `{ enabled: boolean }`
    - `pollVoteSchema`: `{ optionId: string }`
    - `ideaDraftSchema`
    - `pollDraftSchema`: question 1..160, options 2..5 strings of 1..80
- Changes to existing shared types:
  - `SuggestionKind` gains `'idea' | 'poll' | 'meeting_notes'`.
  - `Suggestion` gains `meetingId`, `sourceLineId`, `ideaId: string | null`, `ideaDraft: IdeaDraft | null` and
    `pollDraft: PollDraft | null`.
  - `suggestionUpdateSchema` becomes `{ items?: ActionItem[]; ideaDraft?: IdeaDraft; pollDraft?: PollDraft }`.
    `routes/suggestions.ts` must keep working when `items` is absent; it skips the assignee check.
  - `RealtimeRecords` gains `meeting`, `transcript_line` and `poll`.
- Repository additions (`repositories/suggestions.ts`):
  - `SuggestionDraft` gains optional `meetingId`, `sourceLineId`, `ideaId`, `ideaDraft` and `pollDraft`.
  - `updateSuggestionDrafts(suggestionId: string, patch: { ideaDraft?: IdeaDraft; pollDraft?: PollDraft }): Promise<Suggestion>`

- [ ] **Step 1: Write the failing test** (`suggestions.test.ts`, connecting `mem://` and seeding like `app.test.ts`)

```ts
it('stores and returns meeting suggestion fields', async () => {
  const s = await createSuggestion('hackathon', {
    kind: 'poll',
    title: 'Poll: login method',
    reason: 'Jamie and Alex disagree',
    pollDraft: { question: 'Which login?', options: ['Google', 'Email'] },
  });
  expect(s.kind).toBe('poll');
  expect(s.pollDraft).toEqual({ question: 'Which login?', options: ['Google', 'Email'] });
  expect(s.meetingId).toBeNull();
  expect(s.ideaDraft).toBeNull();
});
it('rejects an unknown kind', async () => {
  await expect(createSuggestion('hackathon', { kind: 'nope' as never, title: 't', reason: 'r' })).rejects.toThrow();
});
```

- [ ] **Step 2: Run** `npm test -w apps/api -- suggestions.test`. Expected: FAIL (`pollDraft` undefined, or a type error).
- [ ] **Step 3: Implement the shared types and zod schemas, the schema changes and the repository fields.**
  - `schema.meeting.surql` defines `meeting`, `transcript_line` and `poll` as SCHEMAFULL with ASSERTs, using
    `DEFINE … OVERWRITE` like `schema.surql`.
    - `meeting.endsAt` has `DEFAULT time::now() + 1h` and is READONLY.
    - Index `transcript_line_meeting_time` on `meetingId, spokenAt`.
  - `applySchema` reads `schema.surql`, then `schema.meeting.surql`.
  - Copy the `.surql` files in the API build if the build copies `schema.surql` (check `apps/api/package.json`
    and the Dockerfile; mirror whatever they do for `schema.surql`).
- [ ] **Step 4: Run** `npm test -w apps/api` then `npm run check`. Expected: all PASS.
- [ ] **Step 5: Commit** `feat: meeting, transcript and poll types; suggestion meeting fields`.

### Task 2: Polls and approval paths for `idea` and `poll`

**Files:**

- Create: `apps/api/src/repositories/polls.ts`, `apps/api/src/services/meeting-approvals.ts`, `apps/api/src/http/routes/polls.ts`
- Modify:
  - `apps/api/src/services/suggestions.ts`: one `case` per new kind, delegating
  - `apps/api/src/http/routes/suggestions.ts`: PATCH accepts drafts
  - `apps/api/src/app.ts`: `project.use('/polls', pollsRouter)`
  - `apps/api/src/realtime/hub.ts`: add `'poll'` to `TABLES`
  - `apps/api/src/repositories/ideas.ts`: add `updateIdeaDescription`
- Test: `apps/api/src/meeting-approvals.test.ts`

**Interfaces:**

- Consumes: Task 1 types and `updateSuggestionDrafts`.
- Produces, in `repositories/polls.ts`:
  - `createPoll(projectId, createdById, draft: PollDraft, opts: { meetingId: string | null; sourceSuggestionId: string | null }): Promise<Poll>`.
    Option ids are `o1`…`o5`.
  - `getPoll(projectId, pollId): Promise<Poll>`, which throws `NotFoundError`
  - `listPolls(projectId, meetingId: string): Promise<Poll[]>`
  - `votePoll(projectId, pollId, memberId, optionId): Promise<Poll>`. It removes the member from every option, then
    adds them to `optionId`. Closed poll → `ConflictError`; unknown option → `NotFoundError('Option')`, which the
    route maps to 400.
  - `closePoll(projectId, pollId): Promise<Poll>`
- Produces, in `services/meeting-approvals.ts`:
  - `approveIdea(projectId, suggestion, memberId): Promise<Suggestion>`. With `ideaId`, it calls
    `updateIdeaDescription(projectId, ideaId, ideaDraft.description)`. Without it, it calls `createIdea(projectId,
memberId, ideaDraft)`. Either way it then calls `resolveSuggestion(…, 'approved', …)`.
  - `approvePoll(projectId, suggestion, memberId): Promise<Suggestion>`
- Produces, in `repositories/ideas.ts`: `updateIdeaDescription(projectId, ideaId, description): Promise<Idea>`.
- Routes: `POST /polls/:pollId/vote` (`pollVoteSchema`) and `POST /polls/:pollId/close`.

- [ ] **Step 1: Write the failing tests**

```ts
it('approving a poll suggestion opens a poll', async () => {
  /* createSuggestion kind 'poll' → POST approve → listPolls(meetingId null) has question, 2 options, status 'open', createdById 'alex' */
});
it('approving a new-idea suggestion creates an idea; develop updates only the description', async () => {
  /* a new idea appears with the draft title/theme; the develop variant keeps the title, changes description */
});
it('PATCH edits a draft before approval and rejects edits after', async () => {
  /* PATCH { pollDraft } → 200 with new question; approve; PATCH again → 409 */
});
it('voting moves a vote, rejects unknown options and closed polls', async () => {
  /* vote o1 then o2 → o1.voterIds [] and o2.voterIds ['alex']; vote 'o9' → 400; close; vote → 409; votes unchanged */
});
it('approving twice is a conflict', async () => {
  /* second approve → 409 */
});
```

- [ ] **Step 2: Run** `npm test -w apps/api -- meeting-approvals`. Expected: FAIL.
- [ ] **Step 3: Implement the repositories, the service, the routes and the delegation `case`s.**
- [ ] **Step 4: Run** `npm run check`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: polls and idea/poll suggestion approvals`.

---

## Phase 1 — Meeting room without AI or voice (branch `feat/meeting-room`)

### Task 3: Meeting lifecycle and transcript API

**Files:**

- Create:
  - `apps/api/src/repositories/meetings.ts`
  - `apps/api/src/repositories/transcripts.ts`
  - `apps/api/src/services/meetings.ts`
  - `apps/api/src/http/routes/meetings.ts`
- Modify: `apps/api/src/app.ts` (mount `/meetings`), `apps/api/src/realtime/hub.ts` (add `'meeting'` and `'transcript_line'` to `TABLES`)
- Test: `apps/api/src/meetings.test.ts`

**Interfaces:**

- Produces, in `services/meetings.ts`:
  - `startMeeting(projectId, memberId, input): Promise<Meeting>`. A meeting already live → `ConflictError`. The
    caller becomes a participant and an attendee.
  - `joinMeeting(projectId, meetingId, memberId)` / `leaveMeeting(projectId, meetingId, memberId)`, both
    `Promise<Meeting>`. Uses `array::union` / `array::complement`, so both are idempotent.
  - `addLine(projectId, meetingId, memberId, text): Promise<TranscriptLine>`. Not a participant → `ForbiddenError`;
    not live, or `now ≥ endsAt` → `ConflictError`. After storing the line it calls the `onLine` listeners.
  - `onLine(listener: (meeting: Meeting, line: TranscriptLine) => void): void`, used by Task 9.
  - `endMeeting(projectId, meetingId, memberId): Promise<Meeting>`. In this phase it sets `ended` and `endedAt`;
    Task 10 changes it.
  - `endExpiredMeetings(now = new Date()): Promise<void>`. It ends every live meeting with `endsAt ≤ now`.
  - `startMeetingClock(): () => void`. It runs `endExpiredMeetings` every 15 s and returns the stop function. It is
    called from `createApp`'s caller, i.e. `index.ts`, plus the test setup.
- `ForbiddenError` is added to `http/errors.ts` and mapped to 403. That's one more additive shared edit.
- Routes from spec §6: `POST /`, `GET /`, `GET /:id` (returns `MeetingDetail`), `/join`, `/leave`, `/lines`, `/end`.

- [ ] **Step 1: Write the failing tests**

```ts
it('allows one live meeting per project', async () => {
  /* start → 201; start again → 409 */
});
it('join is idempotent and leave removes the member', async () => {
  /* join twice → participantIds has 'jamie' once */
});
it('only participants post lines; lines are capped at 1000 chars', async () => {
  /* taylor (not joined) → 403; jamie → 201 with speakerId 'jamie' even if body has speakerId:'alex'; 1001 chars → 400 */
});
it('rejects lines after the meeting ends or expires', async () => {
  /* endExpiredMeetings(new Date(Date.now() + 61*60_000)) → status 'ended'; post line → 409 */
});
it('keeps other projects out', async () => {
  /* ensureProject({id:'other',name:'Other'}); addProjectMember('other','stranger'); stranger GET /projects/hackathon/meetings/:id → 403 */
});
it('broadcasts transcript lines over realtime', async () => {
  /* listen('hackathon'); post line → waitFor change table 'transcript_line' */
});
```

- [ ] **Step 2: Run** `npm test -w apps/api -- meetings.test`. Expected: FAIL.
- [ ] **Step 3: Implement the repositories, the service, the routes and the error mapping.** Wire
      `startMeetingClock()` in `index.ts` next to `startRealtime`, and stop it in `shutdown`.
- [ ] **Step 4: Run** `npm run check`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: meeting lifecycle and transcript API with 60-minute cap`.

### Task 4: Meeting page, transcript and timer (web)

**Files:**

- Create:
  - `apps/web/src/api/meetings.ts`
  - `apps/web/src/features/meeting/useMeeting.ts`
  - `apps/web/src/features/meeting/useTranscriber.ts`
  - `apps/web/src/features/meeting/splitLine.ts`
  - `apps/web/src/features/meeting/ConsentDialog.tsx`
  - `apps/web/src/features/meeting/MeetingTimer.tsx`
  - `apps/web/src/features/meeting/TranscriptView.tsx`
  - `apps/web/src/features/meeting/Participants.tsx`
  - `apps/web/src/pages/MeetingPage.tsx`
  - `apps/web/src/styles/meeting.css`
- Modify:
  - `apps/web/src/api/client.ts`: `export` on `request` and `p`
  - `apps/web/src/App.tsx`: `<Route path="meeting" element={<MeetingPage />} />`
  - `apps/web/src/styles/index.css`: `@import './meeting.css';`

**Interfaces:**

- Consumes: Task 3 routes; `useRealtime` (unchanged here); `useWorkspace()` for `projectId` and `members`;
  `useSession()` for `memberId`.
- Produces:
  - `meetingsApi.{list, get, start, join, leave, postLine, end, setAi, vote, closePoll, rtcConfig}`
  - `useMeeting(projectId): { current: MeetingDetail | null; recent: Meeting[]; reload(): Promise<void>; apply(event: RealtimeEvent): void }`.
    It opens its own `useRealtime` socket and merges `meeting`, `transcript_line` and `poll` events.
  - `useTranscriber({ language, enabled, onFinal(text) }): { supported: boolean; interim: string; listening: boolean }`.
    It restarts on `end` while enabled.
  - `splitLine(text: string, max = 1000): string[]`

- [ ] **Step 1: Implement `splitLine`.** It splits at the last space before `max`, or hard-cuts when there is no
      space. The web workspace has no unit-test runner, so keep this pure; Task 12 adds it to the Playwright item.
- [ ] **Step 2: Implement the API client, the hooks and the page.**
  - States: "no meeting" (Start button with a language select, Korean or English) → consent dialog (copy per spec
    §8) → in meeting.
  - Layout: participants (left, Claude shown as "Claude · reads only"), transcript (centre, own interim line grey,
    "jump to latest"), and an empty AI panel placeholder (right).
  - Timer: toasts "10 minutes left" at 50 minutes and "5 minutes left" at 55 minutes.
  - End uses `confirm`.
  - Unsupported browser notice: "Your speech isn't transcribed in this browser".
- [ ] **Step 3: Run** `npm run check`. Expected: PASS.
- [ ] **Step 4: Manual check.** `npm run dev`, two Chrome profiles: start → both join → both see each other's lines
      with the right names → end → posting stops.
- [ ] **Step 5: Commit** `feat: meeting page with live transcript and timer`.

---

## Phase 2 — Voice (branch `feat/meeting-voice`)

### Task 5: Signaling relay and ICE config

**Files:**

- Create: `apps/api/src/realtime/rtc-relay.ts`
- Modify:
  - `apps/api/src/realtime/hub.ts`: keep `memberId` per socket; route `type: 'rtc'` to the relay
  - `packages/shared/src/realtime.ts`: `ServerMessage | ServerRtc`; `ClientSubscribe | ClientRtc`
  - `apps/api/src/config.ts`: `rtcIceServers`
  - `apps/api/src/http/routes/meetings.ts`: `GET /rtc-config` (served under `/meetings/rtc-config`, so `app.ts`
    isn't touched again)
- Test: `apps/api/src/rtc-relay.test.ts`

**Interfaces:**

- Produces:
  - `relayRtc(input: { projectId: string; from: string; msg: ClientRtc; socketsFor: (memberId: string) => Iterable<WebSocket> }): Promise<boolean>`.
    It sends a `ServerRtc` and returns true only when the meeting belongs to `projectId`, is live, and has both
    `from` and `msg.to` in `participantIds`.
  - `config.rtcIceServers: RTCIceServer[]`: JSON-parsed `RTC_ICE_SERVERS`, with the default from Global Constraints.
    Invalid JSON falls back to the default with a console warning.

- [ ] **Step 1: Write the failing tests** (two WS clients, `?member=alex` and `?member=jamie`, both subscribed to `hackathon`)

```ts
it('relays offers between participants', async () => {
  /* both join meeting; alex sends rtc to jamie → jamie receives { type:'rtc', from:'alex', signal } */
});
it('drops signals for non-participants, ended meetings and other projects', async () => {
  /* taylor not joined → nothing; after end → nothing; signal naming a meeting of 'other' → nothing */
});
it('serves ICE servers', async () => {
  /* GET /projects/hackathon/meetings/rtc-config → iceServers[0].urls contains 'stun:' */
});
```

- [ ] **Step 2: Run** `npm test -w apps/api -- rtc-relay`. Expected: FAIL.
- [ ] **Step 3: Implement.** Don't store signals or log their payloads.
- [ ] **Step 4: Run** `npm run check`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: WebRTC signaling relay over the realtime socket`.

### Task 6: Mesh audio (web)

**Files:**

- Create: `apps/web/src/features/meeting/useMeshAudio.ts`, `apps/web/src/features/meeting/useSpeaking.ts`
- Modify:
  - `apps/web/src/api/realtime.ts`: optional 5th parameter `onSignal?: (msg: ServerRtc) => void`; `rtc` messages
    go there instead of to `onEvent`
  - `apps/web/src/features/meeting/useMeeting.ts`: expose `sendSignal`
  - `MeetingPage.tsx` / `Participants.tsx`: mute button, speaking dots, failure notice

**Interfaces:**

- Produces:
  - `useMeshAudio({ meetingId, me, participantIds, iceServers, sendSignal, muted }): { peers: Map<string, 'connecting' | 'connected' | 'failed'>; localStream: MediaStream | null; remoteStreams: Map<string, MediaStream> }`.
    - The member who joined later sends the offers: for each pair, the member whose id is not already connected and
      who joined after the other creates the offer.
    - To avoid glare, the lower id waits for an offer when both join at once.
    - Each remote stream plays through a hidden `<audio autoplay>`.
  - `useSpeaking(stream: MediaStream | null): boolean`, an `AnalyserNode` RMS threshold.
  - Mute: `track.enabled = false` **and** `useTranscriber({ enabled: !muted })`.
  - A peer stuck in `failed` shows "Can't connect audio on this network — the transcript and AI still work".
  - More than 6 participants shows a warning toast.

- [ ] **Step 1: Implement the hooks and wire them into the page.**
- [ ] **Step 2: Run** `npm run check`. Expected: PASS.
- [ ] **Step 3: Manual check** with two Chrome profiles and headphones: each hears the other; mute stops both audio
      and transcript lines; leave closes the connection, and the other side shows the member gone.
- [ ] **Step 4: Commit** `feat: in-meeting voice over a WebRTC mesh`.

---

## Phase 3 — Live Claude (branch `feat/meeting-live-ai`)

### Task 7: `MeetingAi` interface, mock, Claude and validation

**Files:**

- Create:
  - `apps/api/src/ai/meeting.ts`: the interface, `getMeetingAi()`, shared validation
  - `apps/api/src/ai/mock-meeting.ts`
  - `apps/api/src/ai/anthropic-meeting.ts`
- Modify: `apps/api/src/config.ts` (`anthropicFastModel`)
- Test: `apps/api/src/ai/meeting.test.ts`

**Interfaces:**

- Produces:

```ts
export interface MeetingTickInput {
  lines: { id: string; speakerId: string; speakerName: string; text: string }[];
  runningSummary: string;
  carryOver: string[];
  ideas: { id: string; title: string }[];
  taskTitles: string[];
  alreadySuggested: string[];
  members: MemberBrief[];
}
export interface MeetingTickResult {
  actionItems: (ActionItem & { sourceLineId: string | null })[];
  ideas: { ideaId: string | null; draft: IdeaDraft; reason: string; quote: string | null; sourceLineId: string | null }[];
  polls: { draft: PollDraft; reason: string; quote: string | null; sourceLineId: string | null }[];
  runningSummary: string;
  usage: { inputTokens: number; outputTokens: number };
}
export interface MeetingAi {
  readonly name: string;
  readonly isMock: boolean;
  meetingTick(input: MeetingTickInput): Promise<MeetingTickResult>;
  summarizeMeeting(input: SummarizeInput): Promise<SummarizeResult>; // defined in Task 10; stub throws until then
}
```

- More from `ai/meeting.ts`:
  - `validateTick(raw, input): MeetingTickResult`. It is applied by both providers. It drops unknown `ideaId`s and
    member ids, keeps a quote only if it is verbatim in a line (`sourceLineId` = that line), drops polls without 2–5
    non-empty options, drops anything whose title matches `alreadySuggested` (normalised lowercase), and trims
    `runningSummary` to 150 words.
  - `getMeetingAi()`: Claude when `config.anthropicApiKey && !config.forceMockAi`, otherwise the mock.
  - `createAnthropicMeetingAi(apiKey, fastModel, mainModel, client?)`: same injectable-client pattern as
    `createAnthropicProvider`. It uses `messages.parse` + `zodOutputFormat` and `output_config: { effort: 'low', format }`.
    The system prompt states the untrusted-data rule. Usage comes from `response.usage`.
- Mock rules from spec §9:
  - "I'll" / "we need to" → item
  - "what if" / "how about" / "어때" → idea
  - two different speakers in the window, one line containing "but" / "disagree" / "근데" → poll with the two lines as options
  - usage 0

- [ ] **Step 1: Write the failing tests**

```ts
it('drops ideaIds, member ids and quotes that are not in the input', () => {
  /* validateTick with ideaId 'i-other', assigneeId 'stranger', quote 'never said' → ideaId null→ dropped idea, assigneeId null, quote null */
});
it('keeps verbatim quotes and links the source line', () => {
  /* quote substring of line l2 → sourceLineId 'l2' */
});
it('drops polls with fewer than 2 or more than 5 options and repeats of alreadySuggested', () => {});
it('mock proposes a ticket, an idea and a poll from cue phrases', async () => {});
it('Claude provider passes the transcript in tags and uses the fast model with low effort', async () => {
  /* fake client captures request: model === 'claude-haiku-5-5', content includes '<transcript>', output_config.effort 'low' */
});
```

- [ ] **Step 2: Run** `npm test -w apps/api -- ai/meeting`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run check`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: MeetingAi with Claude and mock providers`.

### Task 8: Live trigger and pipeline

**Files:**

- Create: `apps/api/src/services/meeting-trigger.ts` (pure), `apps/api/src/services/meeting-live.ts`
- Modify:
  - `apps/api/src/http/routes/meetings.ts`: `POST /:id/ai`
  - `apps/api/src/repositories/meetings.ts`: `recordTick(meetingId, { aiCursor, runningSummary, usageDelta })`
  - `index.ts`: `startMeetingLive()` alongside the clock
- Test: `apps/api/src/services/meeting-trigger.test.ts`, `apps/api/src/meeting-live.test.ts`

**Interfaces:**

- Produces:
  - `interface TriggerState { newWords: number; lastRunAt: number | null; lastLineAt: number | null; calls: number; inFlight: boolean; aiEnabled: boolean; live: boolean }`
  - `shouldRun(state: TriggerState, now: number): boolean`, using the values from Global Constraints. `lastRunAt`
    null counts as "45 s passed".
  - `runLiveTick(projectId: string, meetingId: string, ai: MeetingAi = getMeetingAi()): Promise<Suggestion[]>`. It
    builds `MeetingTickInput` from lines after `aiCursor`, stores the validated output with `createSuggestion`
    (`meetingId`, `sourceLineId`, a cite of `"<Name> · Meeting · HH:MM"`), then calls `recordTick`. It never
    throws: errors are logged and it returns `[]`.
    - Action items become **one** `action_items` suggestion per tick, titled `"N action item(s) from the meeting"`.
    - Each idea becomes one `idea` suggestion: title `"Develop: <idea title>"` or `"New idea: <title>"`.
    - Each poll becomes one `poll` suggestion: title `"Poll: <question>"`.
  - `startMeetingLive(): () => void`. It subscribes to `onLine`, which updates the state and checks `shouldRun`,
    and runs a 5 s interval for the silence rule.

- [ ] **Step 1: Write the failing tests**

```ts
// meeting-trigger.test.ts — table test
it.each([
  ['80 words, 45s since last run', { newWords: 80, lastRunAt: 0 }, 45_000, true],
  ['80 words, 30s since last run', { newWords: 80, lastRunAt: 0 }, 30_000, false],
  ['30 words then 20s silence', { newWords: 30, lastLineAt: 0, lastRunAt: null }, 20_000, true],
  ['29 words then silence', { newWords: 29, lastLineAt: 0 }, 60_000, false],
  ['call cap reached', { newWords: 500, calls: 60 }, 99_999, false],
  ['AI removed', { newWords: 500, aiEnabled: false }, 99_999, false],
  ['call in flight', { newWords: 500, inFlight: true }, 99_999, false],
  ['no new words', { newWords: 0, lastLineAt: 0 }, 99_999, false],
])('%s', (_name, partial, now, expected) => {
  /* defaults: calls 0, inFlight false, aiEnabled true, live true, lastRunAt null, lastLineAt now */
});

// meeting-live.test.ts — with a fake MeetingAi
it('stores suggestions with meetingId and moves the cursor', async () => {});
it('does not re-read lines before the cursor', async () => {
  /* second tick receives only the new line */
});
it('adds usage and saves the running summary', async () => {});
it('swallows provider errors', async () => {
  /* fake throws → returns [] and meeting unchanged */
});
it('POST /ai {enabled:false} stops ticks', async () => {});
```

- [ ] **Step 2: Run** `npm test -w apps/api -- meeting-trigger meeting-live`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run check`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: live meeting AI trigger and suggestion pipeline`.

### Task 9: AI panel (web)

**Files:**

- Create:
  - `apps/web/src/features/meeting/MeetingAiPanel.tsx`
  - `apps/web/src/features/meeting/IdeaSuggestionCard.tsx`
  - `apps/web/src/features/meeting/PollSuggestionCard.tsx`
  - `apps/web/src/features/polls/PollCard.tsx`
- Modify:
  - `apps/web/src/features/chat/AssistantTab.tsx`: the `pending` filter keeps only `decision` / `risk`
  - `MeetingPage.tsx`: mount the panel; add the Remove/Invite Claude toggle
  - `apps/web/src/api/meetings.ts`: `updateDrafts`

**Interfaces:**

- Consumes:
  - `useSnapshot().suggestions` filtered by `meetingId === current.meeting.id && status === 'pending'`. These
    already arrive through the workspace realtime.
  - `ActionItemsCard` (unchanged) for `action_items`.
  - `api.approveSuggestion` / `api.dismissSuggestion` + `applyRecord`.
  - Polls from `useMeeting`.
- Behaviour:
  - Idea and Poll cards open a `Modal` with the editable draft. Save calls PATCH with `ideaDraft` / `pollDraft`, then
    approve.
  - `PollCard` shows the options with counts and the caller's vote, plus a Close button.
  - Cards show the reason, the quote with its cite, and the sparkle badge. A mock label appears when
    `me.ai.isMock`.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Run** `npm run check`. Expected: PASS.
- [ ] **Step 3: Manual check (mock AI).** Two profiles talk: "I'll build the login page", "what if we use Google
      login", "근데 학교 계정은?". Within ~20 s of silence, ticket, idea and poll cards appear. Approve each → a task on
      the board, an idea in Brainstorm, and an open poll both profiles can vote on. The AI Assistant tab in chat does
      **not** show them.
- [ ] **Step 4: Commit** `feat: live AI suggestions panel and polls in meetings`.

---

## Phase 4 — After the meeting (branch `feat/meeting-summary`)

### Task 10: Summary, notes and continuation (API)

**Files:**

- Create: `apps/api/src/services/meeting-summary.ts`
- Modify:
  - `ai/meeting.ts`, `ai/mock-meeting.ts`, `ai/anthropic-meeting.ts`: `summarizeMeeting`
  - `services/meetings.ts`: `endMeeting` and `endExpiredMeetings` set `summarizing` and call `summarize`;
    `startMeeting` sets `previousMeetingId`
  - `services/meeting-approvals.ts`: `approveMeetingNotes`
  - `services/suggestions.ts`: `case 'meeting_notes'`
  - `services/meeting-live.ts`: include `carryOver` from `previousMeetingId`
  - `routes/meetings.ts`: `/end` on an ended meeting with `summaryError` reruns the summary
  - `index.ts`: `await resumeMeetings()` after `connectDb`
- Test: `apps/api/src/meeting-summary.test.ts`

**Interfaces:**

- Produces:
  - `SummarizeInput { lines; carryOver: string[]; ideas; taskTitles; suggestions: { title: string; status: SuggestionStatus }[]; members }`
  - `SummarizeResult { summary: MeetingSummary; actionItems: ActionItem[]; carryOverItems: string[]; usage }`.
    Validated like ticks: quotes verbatim, ids known, items deduped against the meeting's suggestion titles.
  - `summarize(projectId, meetingId, ai = getMeetingAi(), delays = [1000, 4000]): Promise<Meeting>`.
    - Up to 3 attempts.
    - On success: set `summary`, add `usage`, create one `action_items` suggestion (only if there are items) and one
      `meeting_notes` suggestion (items = `carryOverItems`, `include: true`), then set status `ended`.
    - After 3 failures: `summaryError` and status `ended`.
  - `approveMeetingNotes(projectId, suggestion, memberId)`: sets `meeting.carryOver` to the included item titles.
  - `resumeMeetings(): Promise<void>`: `endExpiredMeetings()`, then `summarize` for every `summarizing` meeting.

- [ ] **Step 1: Write the failing tests**

```ts
it('ending a meeting stores the summary and a notes suggestion', async () => {
  /* fake ai → meeting.status 'ended', summary.overview set, a pending 'meeting_notes' suggestion with meetingId */
});
it('retries then records summaryError', async () => {
  /* fake throws 3x with delays [0,0] → summaryError set, status 'ended'; POST /end again with working fake → summary set */
});
it('approving notes sets carryOver and the next meeting links to it', async () => {
  /* approve with one item include:false → carryOver has the rest; start new meeting → previousMeetingId = old id */
});
it('the live tick receives the previous carry-over', async () => {
  /* fake captures input.carryOver */
});
it('resumes after a restart', async () => {
  /* force one meeting live with past endsAt and one 'summarizing' → resumeMeetings → both 'ended' with summaries */
});
```

- [ ] **Step 2: Run** `npm test -w apps/api -- meeting-summary`. Expected: FAIL.
- [ ] **Step 3: Implement.** Use `setTimeout`-based backoff from `delays`, so tests pass `[0, 0]`.
- [ ] **Step 4: Run** `npm run check`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: meeting summaries and carry-over notes`.

### Task 11: Ended view, "Last time" card and docs (web + docs)

**Files:**

- Create: `apps/web/src/features/meeting/MeetingSummaryView.tsx`, `apps/web/src/features/meeting/LastTimeCard.tsx`
- Modify:
  - `MeetingPage.tsx`: show the summary view for the latest ended meeting; add a list of recent meetings
  - `apps/web/src/layouts/WorkspaceLayout.tsx`: one nav item "Meeting". **Only if `feat/task-search` has merged**;
    otherwise skip it and note that in the PR.
  - `docs/PROGRESS.md`, `docs/ARCHITECTURE.md`, `apps/api/.env.example` (`ANTHROPIC_FAST_MODEL`, `RTC_ICE_SERVERS`)
  - `.github/copilot-instructions.md`: only if a product rule changed (none expected)

**Behaviour:**

- The summary view shows:
  - the summary labelled "AI summary"
  - the "Notes for next time" checklist (the `meeting_notes` suggestion) with **Confirm notes**
  - remaining pending suggestions
  - the transcript
  - `"N AI calls · Xk tokens"` from `usage`
  - "Summary failed — retry" when `summaryError` is set
- `LastTimeCard` shows the `carryOver` of `previousMeetingId` at the top of a live meeting.
- PROGRESS.md: move the item to Done, add the five decisions from spec §14, and add these known gaps:
  - no TURN
  - single-instance live state
  - Chrome-only transcription
  - no meeting deletion
  - mixed-language transcripts
- ARCHITECTURE.md: add the new tables, the `rtc` relay and the meeting AI flow.

- [ ] **Step 1: Implement the views and the docs.**
- [ ] **Step 2: Run** `npm run check && npm run build`. Expected: PASS.
- [ ] **Step 3: Manual end-to-end** (spec §11 web check):
  1. Meeting 1 → talk → approve suggestions → end.
  2. Summary appears → confirm notes.
  3. Start meeting 2 → the "Last time" card shows the notes.
- [ ] **Step 4: Commit** `feat: meeting summary view and continuation from the last meeting`.
