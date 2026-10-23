# AI Meeting Room — design

Status: draft for review · 2026-10-21 · Product rules in [AGENTS.md](../../../AGENTS.md) apply throughout.

## 1. Intent

Teams hold voice meetings **inside Project Room**. Claude joins as a **read-only participant**: it never speaks,
it reads a live transcript and proposes actions in a side panel while the meeting runs. Members decide.

What the team asked for:

- An in-app voice meeting with a live transcript.
- Claude appears as a member that only reads.
- Real-time suggestions from the transcript:
  - a conflict between members → "open a poll?"
  - an idea comes up → "develop this idea?" (or "make it a card?")
  - a task comes up → "make it a ticket?"
- A meeting lasts **at most 60 minutes** (token cost).
- After the meeting, the conversation is saved and the next meeting **continues from where this one ended**.

Assumptions we added (confirmed in discussion or chosen as defaults):

- Voice only, no video. Headphones recommended.
- Voice is carried by **WebRTC mesh** (browser to browser), with our existing WebSocket for signaling (option A).
- Every member's browser transcribes **its own microphone**. That makes speaker labels exact without diarization.
- Opening a poll, creating a card or ticket, and confirming the carry-over notes all need a member click.
  Claude can't vote, be assigned, or decide.
- "Continue next time" carries a **short, member-confirmed note**, not the full transcript. The full
  transcript is kept for reading.

Success looks like a 4-person team that can:

1. Hold a 30-minute meeting in Project Room.
2. See their words appear live with the right names.
3. Get a ticket, an idea and a poll suggestion during the meeting, and approve them.
4. End the meeting and get a summary.
5. Start the next meeting with "last time we left off at…", for less than $0.50 of model usage per meeting.

## 2. Scope

In scope (this spec, phases 1–4):

- The meeting lifecycle: start, join, leave, a 60-minute cap, end.
- A live transcript.
- A WebRTC audio mesh.
- Live AI suggestions: tickets, ideas, polls.
- Polls.
- The end-of-meeting summary.
- Carry-over notes.

Phase 0 is a small foundation (see §10).

Out of scope (later specs): text-highlight actions, AI modes on cards, chat-channel discovery batching,
semantic duplicate search, decision → task with acceptance criteria, video, recording audio, TURN relay,
meetings in the Picture-in-Picture window, multi-instance deployment of live features.

## 3. Architecture

```
 Browser (each participant)                     API                                   SurrealDB
 ─────────────────────────                      ───                                   ─────────
 mic ─▶ RTCPeerConnection (mesh) ◀── rtc signal relay (WS, not stored) ──▶ other browsers
 mic ─▶ SpeechRecognition ─ final line ─▶ POST /meetings/:id/lines ─▶ transcript_line ──┐
                                                    │                                    │
                                                    ▼                                    │
                                      services/meeting-live.ts                           │
                                      (per-meeting trigger, in process)                  │
                                                    │ MeetingAi.meetingTick             │
                                                    ▼ (fast model)                       │
                                      suggestion (meetingId) ───────────────────────────▶│
 Meeting page ◀──────────── realtime (LIVE SELECT): meeting, transcript_line, poll, suggestion
                                                    │
 End / 60 min ─▶ services/meeting-summary.ts ─▶ MeetingAi.summarizeMeeting (main model)
                 ─▶ meeting.summary + action_items + meeting_notes suggestions
```

New API modules, following the existing route → service → repository layering:

| Module                        | Purpose                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------ |
| `repositories/meetings.ts`    | `meeting` CRUD and participants                                                            |
| `repositories/transcripts.ts` | Append and list `transcript_line` for a meeting                                            |
| `repositories/polls.ts`       | `poll` create, vote, close                                                                 |
| `services/meetings.ts`        | Start (one live meeting per project), join/leave, end, auto-end at `endsAt`                |
| `services/meeting-live.ts`    | Decides when to call the AI during a meeting; builds the small context; stores suggestions |
| `services/meeting-summary.ts` | Runs once when the meeting ends; retries; stores the summary and suggestions               |
| `http/routes/meetings.ts`     | REST routes in §6                                                                          |
| `realtime/hub.ts` (changed)   | Adds the `rtc` relay; adds realtime tables                                                 |

New web modules:

| Module                               | Purpose                                                        |
| ------------------------------------ | -------------------------------------------------------------- |
| `pages/MeetingPage.tsx`              | Route `/p/:projectId/meeting`                                  |
| `features/meeting/useMeshAudio.ts`   | One `RTCPeerConnection` per other participant; mute            |
| `features/meeting/useTranscriber.ts` | Wraps `SpeechRecognition`; posts final lines                   |
| `features/meeting/*`                 | Participants, timer, transcript, AI panel, summary, carry-over |
| `features/polls/PollCard.tsx`        | Poll card                                                      |

## 4. Data model (`schema.surql`, types in `packages/shared/src/domain.ts`)

### New tables

**`meeting`**

| Field               | Type                                 | Notes                                                                                      |
| ------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------ |
| `projectId`         | `record<project>`                    |                                                                                            |
| `title`             | string                               | Default "Meeting · <date>"                                                                 |
| `status`            | `'live' \| 'summarizing' \| 'ended'` |                                                                                            |
| `language`          | string                               | BCP-47 tag for speech recognition, default `ko-KR`                                         |
| `startedById`       | `record<member>`                     |                                                                                            |
| `participantIds`    | `array<record<member>>`              | Members currently in the call                                                              |
| `attendeeIds`       | `array<record<member>>`              | Everyone who joined at any point                                                           |
| `aiEnabled`         | bool                                 | Any participant can remove or re-invite Claude                                             |
| `startedAt`         | datetime                             |                                                                                            |
| `endsAt`            | datetime                             | `startedAt + 60m`, READONLY                                                                |
| `endedAt`           | `null \| datetime`                   |                                                                                            |
| `previousMeetingId` | `null \| record<meeting>`            | The last ended meeting with confirmed notes, set at start                                  |
| `runningSummary`    | string                               | ≤ 150 words, rewritten by each live AI call; internal context, not shown as fact           |
| `aiCursor`          | `null \| record<transcript_line>`    | Last line the live AI has read                                                             |
| `summary`           | `null \| object`                     | `{ overview, decisions[], openQuestions[], nextSteps[] }`; written at the end; labelled AI |
| `carryOver`         | `array<string>`                      | Member-confirmed notes for the next meeting (from the `meeting_notes` suggestion)          |
| `usage`             | object                               | `{ calls, inputTokens, outputTokens }` from `response.usage`                               |
| `summaryError`      | `null \| string`                     |                                                                                            |

**`transcript_line`**

| Field       | Type              | Notes                                  |
| ----------- | ----------------- | -------------------------------------- |
| `projectId` | `record<project>` |                                        |
| `meetingId` | `record<meeting>` |                                        |
| `speakerId` | `record<member>`  | Always the caller; never from the body |
| `text`      | string            | 1–1000 characters                      |
| `spokenAt`  | datetime          | Server time                            |

Index on `meetingId, spokenAt`.

**`poll`**

| Field                | Type                                                    | Notes                              |
| -------------------- | ------------------------------------------------------- | ---------------------------------- |
| `projectId`          | `record<project>`                                       |                                    |
| `meetingId`          | `null \| record<meeting>`                               |                                    |
| `question`           | string                                                  | ≤ 160 characters                   |
| `options`            | `array<{ id, label, voterIds: array<record<member>> }>` | 2–5 options                        |
| `status`             | `'open' \| 'closed'`                                    |                                    |
| `createdById`        | `record<member>`                                        | The member who approved opening it |
| `sourceSuggestionId` | `null \| record<suggestion>`                            |                                    |
| `createdAt`          | datetime                                                |                                    |
| `closedAt`           | `null \| datetime`                                      |                                    |

A member has one vote per poll and can move it. Any member can close the poll.

### Changed tables

**`suggestion`**

- New kinds: `idea` (a new card, or developing an existing card), `poll` and `meeting_notes`. Tickets reuse `action_items`.
- New fields:
  - `meetingId: null | record<meeting>`
  - `sourceLineId: null | record<transcript_line>`: the line the quote came from, used for the cite
    "Mina · Meeting · 14:02"
  - `ideaId: null | record<idea>`: set when developing an existing card
  - `ideaDraft: null | { title, description, theme }`
  - `pollDraft: null | { question, options: string[] }`
- `meeting_notes` reuses `items[]`. Each item's `title` is a note and `include` picks it.

**`idea`**: unchanged, to stay out of teammates' brainstorm work (§15). "Develop this idea" proposes a new
`description`. Approving writes the member-edited text.

**Realtime:** add `meeting`, `transcript_line` and `poll` to `TABLES` in `realtime/hub.ts` and to `RealtimeRecords`.
All three carry `projectId`.

## 5. Approval paths (`services/suggestions.ts#approveSuggestion`)

| Kind             | Approve does                                                          | Needs from the member           |
| ---------------- | --------------------------------------------------------------------- | ------------------------------- |
| `action_items`   | Unchanged: creates the selected tasks with `sourceKind: 'suggestion'` | Item selection, editable        |
| `idea` (new)     | Creates an `idea` from `ideaDraft`, edited                            | The edited draft                |
| `idea` (develop) | Updates `description` on `ideaId`, edited                             | The edited text                 |
| `poll`           | Creates an open `poll` from `pollDraft`, edited                       | The edited question and options |
| `meeting_notes`  | Sets `meeting.carryOver` to the included items                        | Item selection and edits        |

Edits go through `PATCH /suggestions/:id`, which extends `suggestionUpdateSchema` with `ideaDraft`, `pollDraft` and
`items`. Dismiss is unchanged. Nothing the AI returns writes to `idea`, `poll`, `task` or `meeting.carryOver` directly.

## 6. API

All routes are under the existing project router, so `requireProjectMember` applies to every one. Every
repository query filters by `projectId`.

| Route                                  | What it does                                                                                                                  |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `POST   /meetings`                     | `{ title?, language? }`. 409 if a meeting is already live. Sets `previousMeetingId`. Caller joins                             |
| `GET    /meetings`                     | Recent meetings, newest first, without transcripts                                                                            |
| `GET    /meetings/:id`                 | The meeting plus its transcript lines                                                                                         |
| `POST   /meetings/:id/join` · `/leave` | Updates `participantIds`. The last leave does not end the meeting; it ends at `endsAt` or on `/end`                           |
| `POST   /meetings/:id/lines`           | `{ text }`. 409 unless `status = 'live'` and now < `endsAt`. 403 unless the caller is a participant                           |
| `POST   /meetings/:id/ai`              | `{ enabled }`. Remove or re-invite Claude                                                                                     |
| `POST   /meetings/:id/end`             | Any participant. Sets `summarizing` and starts the summary                                                                    |
| `POST   /polls/:id/vote`               | `{ optionId }`                                                                                                                |
| `POST   /polls/:id/close`              |                                                                                                                               |
| `GET    /rtc-config`                   | `{ iceServers }` from `RTC_ICE_SERVERS` (JSON) or the default public STUN, so TURN credentials can be added server-side later |

`WorkspaceSnapshot` is **not** changed (§15). The meeting page loads its own data with `GET /meetings` and
`GET /meetings/:id`, and keeps it current from realtime events.

## 7. Voice: WebRTC mesh

- **Signaling:**
  - New client → server WS message: `{ type: 'rtc', meetingId, to: memberId, signal }`, where `signal` is
    `{ kind: 'offer' | 'answer' | 'ice', data }`.
  - The hub keeps `memberId` for each socket. It relays the message as `{ type: 'rtc', meetingId, from, signal }`
    only if:
    - the sender's socket is subscribed to the meeting's project,
    - both sender and recipient are in `participantIds`, and
    - the meeting is live.
  - Nothing is stored.
- **Mesh:**
  - The member who joins sends an offer to each current participant. Each pair has one
    `RTCPeerConnection` carrying audio only.
  - Mic constraints: `{ echoCancellation: true, noiseSuppression: true, autoGainControl: true }`.
  - The mesh is built for up to 6 participants; the UI warns above that.
- **Mute** stops both the outgoing audio track and transcription. Muted speech is never transcribed.
- **NAT:** public STUN only for now. A network that blocks peer connections shows "Can't connect audio
  on this network — the transcript and AI still work". Members can then talk over another app and keep using
  the room (option (가) as a fallback).
- **Leaving or closing the tab** closes the peer connections. The server removes the member on `/leave` or
  when their socket closes.

## 8. Transcript

- `useTranscriber` uses `SpeechRecognition` / `webkitSpeechRecognition` with `continuous`, `interimResults` and
  `lang = meeting.language`.
  - Interim text is shown only in the speaker's own browser as a grey line.
  - Final results are posted as one line each.
  - It restarts automatically on `end`, because Chrome stops long sessions.
- **Consent screen** before joining. It explains the microphone, that the browser sends audio to its speech
  service (Google in Chrome), that the transcript is saved to the project, and that Claude reads it. Joining
  means accepting.
- **Unsupported browser** (no `SpeechRecognition`, e.g. Firefox): the member can join the call; the UI says
  "Your speech isn't transcribed in this browser".
- **Language:** the meeting language is set at start (Korean or English). Mixed-language speech is
  transcribed in that one language; this is a known limit.
- **Retention:** transcripts are kept with the project. Deleting a meeting is out of scope for this spec and
  will be logged as a known gap.

## 9. Claude during and after the meeting

### Live (`services/meeting-live.ts`)

The **trigger** is a pure function `shouldRun(state, now)`, which keeps it testable with a fake clock. Each
meeting keeps in-process state: words since `aiCursor`, last run time, last line time, calls so far. A call
runs when all of these hold:

- `aiEnabled` is on and the meeting is live, and
- one of these:
  - at least **80 new words** have arrived and at least **45 s** have passed since the last call, or
  - at least **30 new words** have arrived, followed by **20 s of silence** (a pause in the discussion), and
- the meeting has made fewer than **60 calls** (the per-meeting cap), and no call is in flight.

A timer per live meeting (every 5 s) checks the silence rule. A new line checks the word rule.

The **context** stays a fixed size, whatever the meeting length:

- the confirmed `carryOver` of the previous meeting
- `runningSummary`
- the new transcript lines since `aiCursor` (`Name: text`)
- the project's idea titles and ids, and task titles
- the titles of suggestions already made in this meeting, so the model doesn't repeat them

Transcript text goes inside `<transcript>` tags as untrusted data, the same rule as chat today.

The **call** is `MeetingAi.meetingTick(input)` with structured output. It returns:

- `actionItems[]`: same shape as today, i.e. tickets
- `ideas[]`: `{ ideaId | null, draft, reason, quote }`. With `ideaId` it means "develop this card",
  without it "new card"
- `polls[]`: `{ question, options[], reason, quote }`, only when two or more speakers disagree
- `runningSummary`

It uses `ANTHROPIC_FAST_MODEL` (new; default `claude-haiku-5-5`, low effort).

**Validation** works like the Claude provider today:

- Unknown `ideaId`s or member ids are dropped.
- A quote is kept only if it is verbatim in one of the new lines; `sourceLineId` and the cite come from that line.
- Polls need 2–5 non-empty options.
- Anything matching the title of a suggestion already made in this meeting is dropped.

Then the service stores the suggestions (`meetingId` set), moves `aiCursor`, saves `runningSummary` and adds
`usage`.

**Failure:** the call is logged and skipped. The next trigger tries again, and the meeting is never blocked.

### After the meeting (`services/meeting-summary.ts`)

It runs on `/end` or automatically at `endsAt`.

- **Input:**
  - the full transcript
  - the previous carry-over
  - existing tasks and ideas
  - this meeting's suggestions and their status
- **Call:** `MeetingAi.summarizeMeeting` on `ANTHROPIC_MODEL`.
- **Output:**
  - `summary`: overview, decisions, open questions, next steps. It is shown labelled "AI summary". A decision
    becomes official only through the existing decision flow.
  - `actionItems` that live mode missed, deduped against this meeting's suggestions
  - `carryOverItems` → one `meeting_notes` suggestion
- **Retry:** 3 attempts with backoff. Then `summaryError` is set and the meeting ends without a summary.
  Members see "Summary failed — retry" (`POST /meetings/:id/end` again on an ended meeting reruns only the summary).
- **Restart safety:** on API start, meetings still `live` past `endsAt` are ended, and meetings left in
  `summarizing` are resummarized.

### Continuing next time

- When a meeting starts, `previousMeetingId` points to the last ended meeting with a non-empty `carryOver`.
- The meeting page shows a **"Last time"** card with those notes.
- The live AI receives them as context, so it can say "this continues the open question about school accounts".
- Only member-confirmed notes carry over, in line with the logged decision that memory comes from records a member
  confirmed.

### Cost guard

| Item                   | Bound                                                                                                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Meeting length         | 60 minutes (server-enforced)                                                                                                                                           |
| Live calls per meeting | ≤ 60                                                                                                                                                                   |
| Live call input        | About 4k tokens (fixed context)                                                                                                                                        |
| Summary                | 1 call, plus retries on failure                                                                                                                                        |
| Estimate               | ≈ $0.05 live (fast model) + ≈ $0.20 summary ≈ **$0.25 per meeting**. Measured, not assumed: `meeting.usage` records the real numbers and the summary screen shows them |

### Mock provider

`meetingTick` and `summarizeMeeting` get rule-based versions:

- "I'll …" or "we need to …" → a ticket
- "what if …" or "how about …" → an idea
- two speakers with "but" or "I disagree" → a poll
- the summary is the first sentence of each speaker turn

They return zero usage and stay labelled as mock in the UI.

## 10. UI

- **Entry:**
  - A "Meeting" item in the sidebar. This is a one-line change in `WorkspaceLayout.tsx`, added after
    `feat/task-search` merges (§15).
  - The meeting page itself has "Start meeting" and "Join" buttons.
  - A "meeting in progress" banner on other pages is deferred, so `BoardPage.tsx` isn't touched.
- **Meeting page**, three columns that collapse to tabs on narrow screens:
  - **Left:**
    - participants with a speaking indicator
    - Claude shown as "Claude · reads only", with a Remove/Invite toggle
    - mute and leave buttons
    - the timer, with a 50-minute toast "10 minutes left" and a 55-minute toast "5 minutes left"
  - **Centre:**
    - the live transcript, auto-scrolling, with "jump to latest"
    - your own interim line in grey
    - the "Last time" card at the top
  - **Right, the AI panel:**
    - this meeting's pending suggestions as cards with reason and quote: 🎫 Ticket, 💡 Idea / Develop, 🗳️ Poll
    - Ticket uses the existing `ActionItemsCard`
    - Idea and Poll open an edit dialog before approval
    - open polls render as `PollCard` with live votes
- **Ended meeting view:**
  - the summary (labelled AI)
  - the "Notes for next time" checklist (the `meeting_notes` suggestion) with **Confirm notes**
  - remaining suggestions
  - the full transcript
  - usage ("12 AI calls · 41k tokens")
- **Styling:** reuse `src/styles/*` classes and `Modal`/`Feedback`. AI content uses the existing sparkle badge.
  Use `confirm` for ending a meeting for everyone.

## 11. Testing

API (vitest, in-memory DB, mock AI):

- **Meetings:**
  - only one live meeting per project
  - join/leave
  - lines rejected from non-participants (403) and after `endsAt` or end (409)
  - auto-end at `endsAt` (fake timers)
  - project isolation: a member of project B can't read or post to A's meeting
- **Live trigger:** a `shouldRun` table test covering the word threshold, silence, minimum interval, call cap,
  `aiEnabled` off and the in-flight guard.
- **Live pipeline** with a fake provider: quotes verified against lines, unknown ids dropped, duplicate titles
  dropped, `aiCursor` and `usage` updated, provider failure swallowed.
- **Anthropic provider** with a fake client: `meetingTick` and `summarizeMeeting` validation; transcript passed in tags.
- **Approvals:** `idea` (new and develop), `poll`, `meeting_notes` → `carryOver`; dismissed or approved twice → 409.
- **Polls:** vote, move a vote, close, no vote after close.
- **Summary:** retries then `summaryError`; resummarize on restart; `previousMeetingId` picks the last meeting with notes.
- **Signaling** (WebSocket test): relay between two participants; refused for a non-participant, another project or an ended meeting.

Web: manual check in two Chrome profiles before each PR (join, hear each other, see lines, approve a
ticket, end, confirm notes, start the next meeting and see "Last time"). A Playwright test for the non-audio parts
is added to the existing "Web tests" item.

## 12. Phases (one PR each)

| #   | Scope                                                                                                                                                                                                  | AI      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| 0   | Foundation: `suggestion.meetingId`/`sourceLineId`/`ideaId`/`ideaDraft`/`pollDraft`; kinds `idea`, `poll`, `meeting_notes`; their approval paths and edit dialogs; the `poll` table with vote and close | —       |
| 1   | Meeting room without AI or voice: `meeting`, `transcript_line`, routes, 60-minute cap, consent screen, `useTranscriber`, the meeting page with live transcript and timer                               | —       |
| 2   | Voice: hub `rtc` relay, `/rtc-config`, `useMeshAudio`, mute, speaking indicator, connection-failure message                                                                                            | —       |
| 3   | Live Claude: `meetingTick` (Claude and mock), `meeting-live.ts`, `ANTHROPIC_FAST_MODEL`, the AI panel, Remove/Invite Claude, `usage`                                                                   | live    |
| 4   | After the meeting: `summarizeMeeting`, the summary view, `meeting_notes` → `carryOver`, the "Last time" card and context, restart safety                                                               | summary |

Phase 1 comes before voice because the transcript and AI are the core of the feature and the demo, and the
transcript works over any voice channel.

## 13. Risks and known limits

- **Peer connections may fail on restrictive networks** (no TURN). Mitigation: test at the venue early; the
  transcript and AI keep working; TURN can be added through `RTC_ICE_SERVERS` without code changes on the client.
- **Speech recognition quality** varies (crosstalk, accents, mixed Korean and English). Speakers without
  headphones may also get their speakers' audio transcribed. Mitigation: headphones advice and one recognizer per
  speaker.
- **Chrome's speech recognition sends audio to Google.** This is disclosed on the consent screen.
- **Live meeting state, the AI trigger and the signaling relay are in-process.** That is correct for the
  current single-instance Docker deployment. Several API instances would need a shared pub/sub; this is logged
  as a known gap.
- **The mesh doesn't scale past ~6 people.** That's acceptable for student and hackathon teams.

## 14. Decisions to log in PROGRESS.md

- Voice via WebRTC mesh with WS signaling, no new dependency: teams are ≤ 6, and a hosted SFU would add a
  vendor and key.
- Each participant transcribes their own mic with the browser speech API: exact speaker labels, no
  speech-to-text vendor or cost.
- Meetings are capped at 60 minutes, and live AI reads a fixed-size context (running summary + new lines):
  cost stays bounded.
- Carry-over is a member-confirmed note, not the transcript: consistent with "memory = confirmed records".
- New config `ANTHROPIC_FAST_MODEL` (default `claude-haiku-5-5`) for frequent live calls; summaries stay on
  `ANTHROPIC_MODEL`.

## 15. Working alongside the rest of the team (merge safety)

Teammates are building other parts of Project Room at the same time. This feature is built to merge without
conflicts:

**1. New code goes in new files.** Almost everything lives in new files:

- `features/meeting/`, `features/polls/`, `pages/MeetingPage.tsx`
- `services/meeting*.ts`, `repositories/{meetings,transcripts,polls}.ts`, `http/routes/meetings.ts`
- `realtime/rtc-relay.ts`
- `packages/shared/src/meeting.ts`: types and zod schemas for meetings, lines, polls and rtc messages
- `db/schema.meeting.surql`: new tables
- the AI side, kept separate from `provider.ts` and `anthropic.ts`:
  - the `MeetingAi` interface with `getMeetingAi()` (`ai/meeting.ts`)
  - `ai/anthropic-meeting.ts`
  - `ai/mock-meeting.ts`
- tests in their own files (`meetings.test.ts`, …), not in `app.test.ts`

**2. Shared files get small, additive edits only.** No reformatting, no moving code, no renaming. The full list:

| File                                          | Edit                                                                                                                    |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/index.ts`                | `export * from './meeting.js'`                                                                                          |
| `packages/shared/src/domain.ts`               | Three values on `SuggestionKind`; five nullable fields on `Suggestion`                                                  |
| `packages/shared/src/schemas.ts`              | Optional `ideaDraft` / `pollDraft` on `suggestionUpdateSchema`                                                          |
| `packages/shared/src/realtime.ts`             | Three `RealtimeRecords` entries; `rtc` added to the server and client message unions                                    |
| `apps/api/src/db/schema.surql`                | `suggestion.kind` ASSERT list, plus the new suggestion fields appended to that table                                    |
| `apps/api/src/db/client.ts`                   | `applySchema` also applies `schema.meeting.surql`                                                                       |
| `apps/api/src/realtime/hub.ts`                | Three entries in `TABLES`; remember each socket's `memberId`; hand `rtc` messages to `rtc-relay.ts`                     |
| `apps/api/src/services/suggestions.ts`        | One `case` per new kind, delegating to `services/meeting-approvals.ts`                                                  |
| `apps/api/src/app.ts`                         | Mount the meetings and polls routers                                                                                    |
| `apps/api/src/config.ts`                      | `anthropicFastModel`, `rtcIceServers`                                                                                   |
| `apps/web/src/App.tsx`                        | One route                                                                                                               |
| `apps/web/src/state/workspace.tsx`            | Ignore realtime tables it doesn't hold (`if (!key) return state`); without this, meeting events would crash the reducer |
| `apps/web/src/features/chat/AssistantTab.tsx` | Show only `decision` / `risk` kinds; without this, meeting suggestions would hit a missing `KINDS` entry                |
| `apps/web/src/api/realtime.ts`                | Pass `rtc` messages to an optional handler instead of treating them as record changes                                   |
| `apps/web/src/layouts/WorkspaceLayout.tsx`    | One nav item, **after `feat/task-search` merges**                                                                       |

**3. Not touched:** `WorkspaceSnapshot`, `idea`, `BoardPage.tsx`, `provider.ts`, `anthropic.ts`, `mock.ts`,
`ai-engine.ts`, chat components (except the one filter line above) and shared CSS files. Meeting styles go in a
new `styles/meeting.css`.

**4. Process:**

- Claim the item in PROGRESS.md "Next up" with this spec's PR, so the team knows the feature exists and which
  files it touches.
- One phase per PR, kept small.
- Rebase on `main` before opening each PR, and at least daily while a phase is open.
- PROGRESS.md and ARCHITECTURE.md: add new lines, don't rewrite others' lines. A conflict there is resolved
  by keeping both sides.
- If a teammate's open PR touches one of the shared files above, merge theirs first or coordinate in chat.
