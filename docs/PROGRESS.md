# Progress

Living status for humans and AI agents. Update it at the end of every work session (see AGENTS.md).
Newest entries at the top of each section. Dates are YYYY-MM-DD.

## Done

- 2026-10-29 — **Cleaner topic research cards.** The research status ("Research is ready…") replaces the intro line
  inside the "Research the topic" card instead of a separate purple box. Topic research cards show a short
  AI-written label (2-6 words, fallback: the source title) instead of the generic "Topic research" heading.
  Research again skips sources the topic already shows and says when no new ones remain.
- 2026-10-29 — **Clerk profile names stay authoritative.** Organization membership name differences
  trigger a profile refresh before writing, so stale public data cannot restore an old name after
  the refresh window expires. Regression coverage includes full names, usernames and profile outages.
- 2026-10-27 — **Dragging a task keeps its assignee.** A status or priority move sent only that field, but the task
  update schema filled every omitted field with the create defaults, so the assignee, due date, priority
  and label were cleared. Updates now change only the fields that were sent. An explicit empty assignee
  still unassigns. Schema and HTTP tests cover a column move and a deliberate unassign.

- 2026-10-27 — **Calendar navigation and layout review fixes.** Automatic date padding is capped at 52 weeks
  in each direction, missing focus targets are cleared, month navigation starts from the displayed month,
  scroll expansion grows the rendered range, and narrow weeks grow to fit all seven days and their tasks.

- 2026-10-26 — **Calendar scrolls like a week view.** Week titles are gone. Weekday names stay in one sticky
  header, the visible month sits beside the Calendar title, four week rows fit in the scroll area with four future
  weeks preloaded ahead of this week, days share
  one bordered grid per week (today is only the date circle), scrollbars are hidden, and scrolling loads more
  weeks in either direction so a task with no due date can be dropped on a later day.
- 2026-10-26 — **Notes tab.** Brainstorm → Notes lists project-wide member notes (new `note` table, author-only
  edit/delete, realtime) and the AI summary of every ended meeting, read-only, with Open meeting. Both are
  brainstorm-style tickets: team notes light purple, AI meeting notes light pink. Only the last two meeting
  summaries show; a tile links to the Meeting tab's history for older ones. API flow test
  covers create, snapshot, realtime, author-only edits and validation.
- 2026-10-25 — **Chat accepts pasted images.** Images copied to the clipboard can be pasted directly into
  the chat composer; they upload through the existing project Files flow, appear as downloadable chat
  attachments, and are available to Agent Memory for OCR/vision retrieval.
- 2026-10-25 — **Capture natural direct and tentative chat ideas.** “I want to add no-equipment dorm
  workouts to the fitness app” adds the member's idea; “I am thinking of adding…” saves a pending
  review draft. The interpreter uses topic names/descriptions and recent chat; the service fills omitted
  ids for a unique target-reference match or a sole implicit topic, preserving unknown/ambiguous targets.
  Drafts retain source messages, quotes, reasons and topic versions, suppress duplicate pending titles,
  and create cards only after approval. The Assistant badge now counts the same pending cards its panel
  shows, including idea drafts. Regression and HTTP/realtime tests cover direct creation, tentative
  capture/approval, sole-topic defaults, semantic selection and ambiguous/unknown references.
  Full check passes with 284 tests and the web production bundle builds with local environment loading
  disabled. Browser control could not start, so live model/browser verification remains unconfirmed.
  No new dependencies.

- 2026-10-25 — **Accept sufficiently named chat topics.** The lowercase fitness-app request exposed a
  brittle exact-case excerpt check: model capitalization/spacing could trigger the generic clarification.
  Excerpt verification now accepts those presentation differences and stores the original member text.
  The intent prompt explicitly treats a named project goal as enough to create a topic without an idea
  or existing topic id. Unusable extractions/clarifications get one bounded recheck with validation feedback;
  unsupported titles and targets remain rejected. Regression tests cover the exact reported wording,
  normalized model output, clarification recovery and bounded failure. Full check passes with 278 tests.
  Live model response remains unverified. The earlier app permission-helper failure was resolved before publishing the branch.

- 2026-10-25 — **Contextual chat intent replaces template-only natural requests.** The frequent AI host
  interprets the latest member message with recent channel history and existing topic titles/descriptions,
  including typos such as `woiuld`, contribution/creation verbs, contextual references and semantic topic
  duplicates. The server verifies request/title excerpts, same-member title provenance, shared validation
  and current project topic ids before writing. Unclear targets ask for clarification; reused boards are
  preserved. Generated AI ideas stay pending. Literal commands survive model outages; the labelled mock
  retains template-only support. Tests cover interpretation routing, context, invalid/foreign ids,
  fabricated titles, uncertainty and outages. Tests disable local environment loading; formatting excludes
  environment files, so validation does not read developer credentials. Full check passes with 275 tests.
  Model responses in intent tests are simulated; live-model/browser verification remains unconfirmed.
  No new dependencies.

- 2026-10-25 — **Brainstorm requests without @AI.** Chat recognizes explicit natural creation goals
  (`I would like to create a Fitness app for students with limited equipment`) and member ideas
  (`I have an idea for No-equipment dorm workouts to Fitness app for students`). Existing topic lookup
  prefers normalized exact names, then unique distinctive prefixes; duplicate requests reuse the board,
  unknown/ambiguous targets ask for a full name, and context stays within the channel. Questions, quoted
  instructions and tentative discussion do not create records. Generated AI proposals remain pending;
  task commands still require `@AI`. Full check passes with 267 tests, including HTTP/realtime coverage. Browser flow remains
  unverified: the local page cannot reach the API and the embedded database is locked by another process.

- 2026-10-25 — **Meeting "Chat only" filter.** A checkbox above the meeting transcript (live and in the summary)
  hides spoken lines and shows only typed chat, `@AI` replies and shared files. Display only: the meeting AI and
  the summary still read every line.

- 2026-10-25 — **Text-only header branding.** Removed the decorative main logo beside Project Room
  and its unused styles; the header keeps the product name and project breadcrumb. Browser-verified
  the authenticated workspace header.

- 2026-10-25 — **Validate edits against the saved idea.** Idea updates now validate the combined stored
  record and patch with the creation rules before writing or resetting a topic board. Omitting the theme
  cannot bypass strategy JSON validation, and description-only or theme-only edits cannot bypass the
  240-character topic/direct-idea limit. Regression tests cover rejected edits leaving boards unchanged,
  valid partial strategy edits, category changes and legacy plain-text guidance. Full check passes (261 tests).

- 2026-10-25 — **Brainstorming rebased onto main.** Replayed the ten brainstorming commits over the
  latest polls, chat, evaluation and dialog updates. Resolved shared imports and UI/documentation conflicts;
  preserved concise strategies, plain-text editing, immediate hearts and direct approval. Saved strategy
  cards use the same teal direction token as pending strategies. Kept a local pre-rebase backup branch.
  Full check passes (258 tests) and shared/API/web builds pass. Authenticated browser verification remains
  blocked by the local project's connection error, including after retrying with the API started.

- 2026-10-25 — **Roomier AI review dialogs.** The idea, direction, topic and poll review dialogs open wide (640px),
  stack each label over a full-width field, and give the description 10 rows, so a draft reads at a glance.
- 2026-10-25 — **Polls replace decisions.** The Decisions tab is now **Polls** (`/polls`): every poll opened in a
  meeting, open ones to vote on or close, closed ones with the winning option highlighted. Polls are in the
  workspace snapshot and patched by realtime. Removed: the per-message open-question check, `@AI` decision
  suggestions (`propose_decision`, `list_decisions`), the decision API and repository, "Ask the project"
  (`/decisions/ask`, `answerFromDecisions`) and the seeded decisions. The `decision` table definition stays so
  old rows still read; nothing writes it. Meeting summaries keep their "Decisions" section as summary text.
- 2026-10-24 — **AI colour roles and dashed pending suggestions.** An AI suggestion nobody has confirmed has a
  dashed outline in the colour of where it lands once approved, and its main button matches: brainstorm topics and
  ideas yellow, brainstorm directions (theme Strategy) teal, before and after approval, research blue, polls green, decisions, action items, deadline risks and meeting notes purple.
  Confirmed things (saved ideas, open polls, approved action items) stay solid. Tokens `--research` /
  `--research-weak` and buttons `.btn.idea-btn` / `.btn.research-btn` in `base.css`; the Decision label moved from
  amber to purple so it doesn't read as an idea.
- 2026-10-25 — **Clerk profile identities power member avatars.** All member circles resolve current Clerk
  names and profile photos, including the top-bar member stack and task, chat, brainstorm, calendar, files
  and meeting surfaces; the signed-in sidebar name uses the same identity with API data as a fallback.

- 2026-10-25 — **Chat AI retrieves durable context and accepts pasted images.** `@AI` now receives recent
  Agent Memory file passages alongside the latest confirmed decisions, labeled separately so it can distinguish
  evidence from durable project facts and call out conflicts instead of guessing. Images copied to the clipboard
  can be pasted directly into the chat composer; they upload through the existing project Files flow, appear as
  downloadable chat attachments, and are available to Agent Memory for OCR/vision retrieval. AI suggestions remain
  reviewable and approval-gated.

- 2026-10-25 — **Channel `@AI` can search meeting transcripts.** The regular mention agent now has a
  project-scoped, read-only meeting-line search tool, so it can answer channel questions from meeting
  contents and ground proposal quotes without loading every transcript into the prompt. Regression coverage
  verifies meeting context lookup and quote preservation.

- 2026-10-24 — **Agent Memory accepts Clerk organization scopes.** Clerk organization ids can contain uppercase
  letters, while Agent Memory scope segments are lowercase-only. Project scopes now normalize ids consistently
  before upload and retrieval, with a regression test; rejected scope responses include the service detail.
- 2026-10-24 — **Action-item eval runner.** `npm run eval -w apps/api [dataset.json] [--details]` asks
  every configured host (mock, plus OpenAI and Nebius when their keys are set) for action items the way `@AI` does
  (the mention agent on real hosts, `analyzeConversation` on the mock) over conversations with an answer key and prints found / invented / missed as precision, recall, F1 and assignee
  accuracy. Titles match by word overlap (`src/eval/score.ts`). Ships with a hand-written 4-case sample, labelled
  as not Era data; an Era export needs a converter to the same shape. No new dependencies.
- 2026-10-25 — **Removed Make task shortcuts.** Idea and strategy cards no longer expose a direct
  task-conversion button; removed its handler and styles. Existing task links remain visible, and
  relevant approval-generated task suggestions still require review before creating tasks.
  Browser-checked both card types in a temporary fixture, then removed it. Full check passes with
  261 tests; the web production build passes.

- 2026-10-25 — **Immediate hearts and direct approval.** Brainstorm cards always show a heart/count,
  with a filled active heart and no Start voting control. Hearts toggle personal support without
  opening a vote or approving the idea. Removed Shortlist; every unapproved card offers Approve
  directly, retaining confirmation and showing Approved afterward. The API no longer requires an open
  vote or shortlist, while rejecting hearts/approval on central topics and duplicate approval.
  Legacy fields/endpoints remain compatible with older clients. Browser-checked heart/unheart and
  confirmed approval using a temporary local fixture, then removed it. API regression tests cover
  immediate hearts, separate approval and multiple members.
  Full check passes with 261 tests; API and web production builds pass.

- 2026-10-25 — **Category-free brainstorming UI.** Removed category selectors from add/edit and AI
  review dialogs, the idea category filter and saved-card category tags. Options and ideas share one
  card style; strategies remain separate. New member ideas use the existing Option default, while editing
  existing records and reviewing drafts preserves their internal themes and behavior. Full check passes
  with 259 tests; the web build passes. Browser-checked card rendering in a temporary fixture, then
  removed it; the authenticated local project remained unavailable in this browser session.

- 2026-10-25 — **Plain-text strategy editing.** Draft review and saved-strategy editing now use labelled
  direction, step and scope fields instead of a JSON textarea. Steps can be added/removed within the
  one-to-four limit; incomplete fields remain editable and native required-field validation prevents
  incomplete submission. JSON serialization stays internal and old plain-text strategies keep a prose
  editor. Browser-checked clearing/editing fields, adding/removing steps and saving to the rendered plan
  with a temporary fixture, then removed the fixture.
  Full check passes with 259 tests; the web production build passes.

- 2026-10-25 — **Much shorter brainstorming strategies.** New JSON contains only recommended direction,
  up to four short step sentences, and essential scope. Each section/step requests one or two sentences;
  product guidance targets 120–180 words overall and simple decisions less. Removed the repeated
  focus/why/action/deliverable/criteria/gate fields and extra assumptions/evidence/deferred sections.
  Older detailed JSON renders compactly without rewriting saved records; plain text remains readable.
  Regression tests cover concise generation, review/approval/edit/refresh and old-format compatibility.
  Browser-checked the three-section display with a temporary fixture, then removed it. A live provider
  check returned a 93-word plan with four short steps. Full check passes with 259 tests; both builds pass.

- 2026-10-25 — **Research survives AI service limits.** Reproduced the fitness-topic failure as an
  upstream daily-token 429. Topic preparation now retains web sources and reports unavailable AI
  summaries/strategies explicitly instead of aborting the whole board. Unsummarized source cards are
  labelled honestly and pending cards recover summaries on a later manual retry. No strategy is faked,
  and no provider/model/key is changed. Collapsed sections show AI unavailable; upstream AI failures
  outside preparation return a clear 503. Live isolated-memory verification returned two research cards
  while the real strategy call was rate limited. Full check passes with 258 tests; both builds pass.
  Direct and proxied local API health checks returned 200. The browser session could not reopen its
  authenticated project, so the new status label remains browser-unverified; availability is covered by API tests.

- 2026-10-25 — **Fixed live strategy JSON failures.** Reproduced a provider 400 when generated
  deferred-scope entries did not match the nested nullable response schema. Topic preparation now
  requests the roadmap directly at the JSON root, with explicit nested-shape examples; other stages
  keep their smaller facilitation schema. Structured calls retry malformed output at most twice with
  corrective feedback, while request/auth/rate-limit/service failures are never retried. Invalid JSON
  is never accepted. Live configured-provider checks passed for product (five steps) and non-product
  (four steps) topics. Regression tests cover the root schema, correction retries, limits and exclusions.
  Full check passes with 256 tests; the API production build passes.

- 2026-10-25 — **Strategies use structured JSON.** A shared schema defines the goal, context,
  assumptions, evidence, recommendation, steps and scope. Each step has focus/why, action, deliverable,
  success criterion and a next-step gate. Real and mock providers return the same shape; source URLs
  are checked against supplied research and unsupported verified findings become unknown. Plans persist
  as JSON in the existing description field (20,000-character limit); review/edit rejects malformed
  JSON objects. The UI renders clean sections and steps with a collapsed goal preview, and keeps legacy
  text readable. No Markdown dependency was installed. Browser-checked expansion and layout using a
  temporary local fixture without changing project data; removed the fixture afterward.
  Full check passes with 250 tests; API and web production builds pass.

- 2026-10-25 — **Actionable brainstorm strategies.** Topic preparation now requests a specific goal,
  ranked assumptions, sourced comparisons, a provisional direction and numbered steps with focus/why,
  action, deliverable, success criterion and a next-step gate. Student projects get an evidence-to-MVP
  roadmap and explicit scope/deferred features; non-product topics get proportionate guidance instead.
  Strategy drafts and editing support 10,000 characters, preserve line breaks and use full-width cards.
  Direct ideas keep their short entry/preview limits. Research again can create a new reviewable roadmap
  without changing saved strategies. The labelled mock offers a planning template, never fake findings.
  Full check passes with 250 tests, including long-strategy review/approval/edit/refresh and non-product
  guidance; API and web builds pass. Browser verification was blocked by an unreachable API and a database
  file locked by another process; that process was left untouched.

- 2026-10-24 — **Sidebar cleanup.** Removed the placeholder Project Room workspace dropdown above
  the organization switcher, along with its unused styles and toast.

- 2026-10-24 — **Shared mute, simpler brainstorming, task commands.** Participant tiles show everyone's
  mute status via meeting realtime updates and fresh reads. Only a live participant can update their own
  status; leaving/ending clears it. Local mic changes stay immediate and status writes are serialized.
  Removed Mind Map from the brainstorming tabs. `@AI create task TITLE` creates an unassigned To Do task;
  a bare command asks for the same member's next message in that channel. Titles use shared validation;
  no model call, assignment or scheduling is involved. API/realtime tests cover mute and task command isolation.
  Full check passes with 247 tests; API and web builds pass. Browser-checked the removed tab; shared mute
  delivery is covered by the realtime test (no active meeting for a two-person browser check).

- 2026-10-24 — **Header cleanup.** Removed the blue placeholder Share button from the top-right header.

- 2026-10-24 — **Overview navigation label.** Renamed the Tasks navigation tab to Overview.

- 2026-10-24 — **Clean topic overflow navigation.** Topic tabs hide the native horizontal scrollbar,
  support mouse dragging and native touch scrolling, and show side arrows only when overflowing.
  New topic stays visible. Arrow/Home/End keys select and reveal tabs; dragging suppresses accidental
  selection. Checked overflow, arrows, dragging, keyboard navigation and panel resizing in Edge.
  Full check passes with 245 tests; the web production build passes.

- 2026-10-24 — **Brainstorm tab order refined.** Brainstorm/Mind Map/Notes sit above the topic tabs;
  both rows remain inside the panel container, above its scrolling content.

- 2026-10-24 — **Explicit brainstorm commands in chat.** `@AI create topic Weekend plans` immediately
  creates that member-named board; `@AI add idea pool to Weekend plans topic` adds the exact idea.
  Quotes are optional; add/create and polite prefixes work. Omitted targets use recent successful
  command context from the same channel or a sole topic; unknown/ambiguous targets ask for clarification.
  Commands validate titles, reject duplicates and skip all model/research calls. Normal brainstorming
  remains reviewable. Integration tests cover creation, channel isolation, ambiguity and invalid input.
  Full check passes with 245 tests; the API production build passes.

- 2026-10-24 — **Quieter brainstorm layout.** Topic tabs sit at the very top of the container, above
  the view tabs. Suggested topics, research and strategies use keyboard-accessible disclosure sections
  closed by default and reset closed when switching topics. Counts and research progress remain visible;
  automatic preparation continues while collapsed. Checked research expansion and topic switching in Edge.
  Full check passes with 241 tests; the web production build passes.

- 2026-10-24 — **CodeRabbit brainstorm fixes (PR #24).** Topic-change proposals appear on their target
  board, name that board in the card and modal, and require destructive confirmation and the exact
  `replaceTopicId` on approval. The shared inbox contains only new-topic proposals. Mock meeting idea
  routing rejects generic single-word overlaps, repeated-word bias and tied matches. Explicit meeting
  scopes now use an atomic topic/version guard when storing suggestions, including resets between the
  validation read and write. Full check passes with 241 tests; API and web builds pass.

- 2026-10-24 — **Brainstorming integrated with current main.** Resolved the meeting provider, tests and
  documentation conflicts while retaining file context, OpenAI/Nebius routing, topic-scoped ideas and
  duplicate-topic checks. Full `npm run check` passes with all 235 tests after rebuilding shared outputs
  and normalizing local checkout line endings (no content-only formatting changes). API and web builds
  pass; production audit reports zero vulnerabilities. Checked existing topic switching in Edge.

- 2026-10-24 — **Meeting duplicate topics check every board.** Live and summary analysis compare against
  every existing topic rather than only the first. Summary prompts now include all topic titles and
  descriptions. The model identifies semantic matches by existing topic id; normalized title checks
  and a fresh server read block exact duplicates even if the model proposes them. Reworded discussions
  are directed to existing boards for idea suggestions. All 201 tests, lint and typecheck pass; full
  check remains blocked by existing repository formatting drift.

- 2026-10-24 — **Meeting ideas identify an existing topic.** The meeting AI reads all topic titles and
  descriptions, selects the topic being discussed, and includes its id on idea proposals. Validation
  rejects absent/unknown topics and developments on the wrong board; new topic proposals cannot receive
  ideas until approved. Meeting and brainstorm idea suggestions display their topic. Topic tabs and
  New topic share compact sizing, rounded corners and design tokens. Checked tab switching and opening
  New topic in Edge; topic routing and approval are covered by API tests. All 198 tests, lint, typecheck
  and web build pass. Full check still stops at existing repository formatting drift.

- 2026-10-24 — **Meeting topics use a shared proposal inbox.** New topic proposals appear above the
  topic tabs, with an explicit Add topic action that creates a separate board. Meetings can propose
  multiple distinct topics while repeated titles remain suppressed; approval preserves existing topics
  and pending ideas. Topic tabs use visible inactive backgrounds and borders, with board-aligned
  margins. All 195 tests, lint, typecheck and the web build pass. Checked styling and switching two
  existing topic tabs in Edge; meeting approval isolation is covered by the API regression test.

- 2026-10-24 — **Stable research controls across topic tabs.** Research loading state belongs to each
  topic, so background work on another board does not flash Working on the selected board. The guide
  keeps its attempted research states across topic and view switches, and duplicate in-flight requests
  are blocked. Checked switching to Mind Map/Notes and back on an existing topic in Edge. All 195 tests,
  lint, typecheck and the web build pass. Full check remains blocked by existing repository formatting drift.
- 2026-10-24 — **Meeting AI panel no longer overlaps in a narrow column.** The panel stacks cards in a flex
  column instead of a grid, and action items put owner and priority under the title, so cards stay inside the column.
  The ended meeting's summary now scrolls (the page is a fixed-height column), with the scrollbar at the page edge.
- 2026-10-24 — **Calendar scheduling ignores stale task requests.** Only the latest pending update per task
  may apply its response or rollback; workspace deletion tombstones prevent either from restoring a deleted task.

- 2026-10-24 — **Calendar tasks can be dragged onto a day.** Tasks with no due date, and tasks already on a day,
  set or move `dueDate` by dropping on a day (`PATCH` the task). The day highlights while the task is over it.
  Opening a task still uses the dialog. A drop on the task's current day does nothing.

- 2026-10-24 — **The meeting follows you.** The call moved from `MeetingPage` to `MeetingCallProvider` in the
  workspace layout, so changing pages keeps the mic, audio and transcript going; a floating bar (live, title,
  mute, leave) shows off the meeting page. "End for everyone" is gone: the last participant leaving ends the
  meeting and starts the summary, and a dropped last socket ends it after 30s unless someone rejoins (tab-close
  leave call removed so a refresh doesn't end it).
- 2026-10-23 — **OpenAI and Nebius split the model calls.** OpenAI handles `@AI`, Ask the project, chat
  brainstorm drafts, and the end-of-meeting summary. Nebius handles the open-question check, live meeting
  ticks, brainstorm classification, board facilitation, and research summaries. One key covers both jobs.
  Meeting speech-to-text stays on Groq.

- 2026-10-23 — **@AI reads the channel thread, and Agent Memory reads project files.** A mention always sees the
  latest 80 messages in that channel, including turns from before the last AI reply. Older lines in the same
  project are added when their words match the question (full-text index `message_text`). With a model key,
  `@AI` answers in chat from that thread. A PDF, image, or plain-text upload is sent to SurrealDB Agent Memory,
  scoped to the project, and `@AI` receives a few short passages. The chat paperclip posts the same file into
  the channel. Word and PowerPoint stay download-only. "Ask the project" still answers from approved decisions only.
- 2026-10-23 — **Anthropic removed.** Suggestions, project memory and live meeting AI call the existing
  OpenAI-compatible client (`src/ai/openai.ts`). No `OPENAI_API_KEY` falls back to the labelled mock.
  The meeting UI no longer calls the listener Claude.
- 2026-10-23 — **Concurrent meeting start.** A write conflict on the live-meeting reservation is a 409,
  the same outcome as the reservation already existing.
- 2026-10-23 — **Nebius-compatible AI client and a tool-using @AI.** OpenAI-compatible hosts other than
  `api.openai.com` (Nebius Token Factory, Groq) are sent `max_tokens`, and structured calls set `strict: true`.
  When `OPENAI_API_KEY` is set, `@AI` looks up tasks, decisions, ideas and messages through tools and files
  suggestions only. The mock still uses one-shot analysis.
- 2026-10-23 — **File deletion and batch upload fixes.** Deletes enforce the project boundary in the write
  and retain metadata when disk removal fails so DELETE can be retried. Batch uploads continue after each failed file.

- 2026-10-23 — **Simpler brainstorm header.** Removed the numbered workflow strip. Topic tabs and
  New topic appear only after a topic exists; the empty board uses Set topic as its single entry point.

- 2026-10-23 — **Topic-based brainstorm boards.** Multiple topic tabs keep ideas, research, strategies
  and pending AI drafts separate. A topic is required; its initial preparation researches relevant sources
  and proposes a strategy before enabling idea entry. Missing research is reported honestly. Confirmed
  topic edits/deletion clear that board; Clear ideas preserves research and strategies. Existing tasks
  and decisions remain. Topic versions reject AI results arriving after a reset, and concurrent research
  requests share one operation. Chat/meeting topic approvals add tabs; inbox ideas choose a topic on
  approval. Older board data is migrated into a topic once, without deleting it. Verified two topic tabs,
  live sourced research, a strategy draft, isolated idea entry and clear/edit confirmations in Edge.
  All 191 tests, lint and typecheck pass; the web production build passes.

- 2026-10-24 — **Drop files into chat and meetings.** Dropping files on the chat panel shares them in the open
  channel, like the + button. In a live meeting, the meeting chat gets a + button and the transcript column takes
  dropped files: each upload lands in Files and joins the transcript as a chat line with `fileId` (text = file name,
  shown as a download chip). Once a file is shared, each live AI tick asks Agent Memory for passages matching the
  new lines and passes the ones from this meeting's files as `<files>` (quotes still come from the transcript only).
  The end-of-meeting summary sees file names, not passages. `@AI` in the meeting chat runs the same mention agent
  as channel `@AI` over the last 40 transcript lines plus the meeting's files (latest text files read whole, other
  types through Agent Memory) and posts the reply as `source: 'ai'` lines (speakerId = who asked). Live ticks skip
  those lines; action items still arrive in the AI panel from the ticks.
- 2026-10-24 — **Meeting chat.** Participants can type in a live meeting. A message is stored as a
  `transcript_line` with `source: 'chat'`, shows in the transcript with a chat tag, and the live AI and the
  summary read it like speech (tagged "(chat)"; cites say "Meeting chat"). One chat line is enough for an AI
  run after a 2s pause (speech still needs 15 words and 8s), so short typed requests get suggestions quickly.
- 2026-10-24 — **Meeting and brainstorm UI polish.** The transcript / AI suggestions divider in a live meeting
  drags to resize (reuses the dock's `ResizeHandle`; double-click resets). Meetings are English-only: the
  Korean option and the language picker are gone and the default is `en-US`. The "Brainstorming ideas"
  wall (heading, AI idea drafts, Add idea hover) is yellow like its tickets; the rest stays purple.
- 2026-10-23 — **Organization switching stays in sync.** URL-to-Clerk synchronization runs once per
  project URL change above the signed-in gate, so the gate's transition cannot reactivate the previous
  team. Project changes remount workspace data and UI together, discarding old messages and channel
  selection. Checked round-trip switching and a direct project link in Edge; the selected team and
  project agree. Lint, typecheck, all 177 tests, and the web production build passed.
- 2026-10-24 — **Older ideas remain editable.** Missing research sources are treated as empty before an
  idea update, allowing schema defaults to fill them; significant edits still flag populated sources as stale.

- 2026-10-23 — **Calendar review fixes.** Deadline controls wait for the pending save, including clear and error rollback.
  Week columns switch to day rows when the agenda is too narrow for task metadata, including beside the undated rail.
  Project and task due dates reject impossible calendar dates, with leap-year checks; clearing still uses null.

- 2026-10-23 — **Project deadline reads as a deadline.** The calendar header chip always says Deadline, shows the
  weekday and how soon (soon, today, or past). A calendar icon opens the date picker, and × clears it.
  With no date, the whole chip says Set a date and opens the picker. Empty and set are both only as wide
  as their text. A set date colors the whole chip (later, soon, today, or past).
- 2026-10-23 — **Project deadline is a short chip.** A flag, the short date, and how soon, only as wide as the text.
  The date jumps to that week. A calendar icon changes it, and × clears it.
- 2026-10-23 — **Month view removed.** The calendar is the week columns only. Tasks with no due date stay in the
  side list. Every dated task is already on a week, so nothing is hidden by dropping the month grid.
- 2026-10-23 — **Week view is columns, month view stays the grid.** This week is listed first. Each week is seven
  vertical days: the weekday sits above the date, and tasks stack under it. Earlier weeks sit under "Earlier".
  The project deadline is a card under the title: the date written out, how soon it is, Change, and clear.
  Clicking the date jumps to that week or month. Its day keeps a flag on the agenda and on the month grid.
- 2026-10-23 — **Month view keeps the tasks it does not draw.** Beside the grid: tasks with no due date, and tasks
  whose date falls on another month (open one, or jump to that month). Week view is still the full agenda:
  a week is listed when it has a task. The two views answer different questions.
- 2026-10-23 — **Project deadline can be set from the calendar.** A compact date field in the calendar header
  saves `project.dueDate` (`PATCH /api/projects/:id`). The old banner is gone; the day on the grid still
  shows a flag, and the relative date ("in 4 days") jumps to that week or month.
- 2026-10-23 — **Calendar month view.** A Week / Month switch in the header (remembered in the browser). Month
  view shows one month at a time, with previous, next, and Today. A day still opens or creates a task.
  The project deadline and the overdue jump land on that month. Days from the neighboring months stay
  visible so a task on the edge of the month does not disappear.
- 2026-10-22 — **Calendar page.** Tasks with a due date are grouped by week (Monday start), and the project
  deadline is marked on its day. A task opens in the existing dialog; a day can also start a new task
  already dated. Overdue uses the local calendar day, on the board as well as here, and done tasks are not overdue.

- 2026-10-23 — **Research cards summarize related ideas.** Relevant Tavily results are summarized in
  short, source grounded descriptions instead of showing raw search snippets. Results without a reliable
  summary are omitted; earlier pending cards offer a Summarize source action. Direct AI idea drafts,
  including those with source links, stay in the Ideas section at the bottom, below guidance, research,
  and strategies.
- 2026-10-23 — **Voice meetings propose brainstorm topics.** Live transcript analysis can suggest a
  separate topic draft, and the end-of-meeting summary can find one if the live pass missed it. Members
  edit, approve, or dismiss the topic in the meeting or Brainstorm board. Meeting idea suggestions stay
  pending and visible in Brainstorm while the topic is chosen; approving the topic does not clear them.
- 2026-10-23 — **Chat brainstorms propose the board topic.** An `@AI brainstorm` request now yields a
  separate, editable topic suggestion alongside any idea drafts. Approving it creates the Brainstorm
  topic or updates the existing topic; dismissing it leaves the board unchanged. The chat reply directs
  members to review both. A later brainstorm can propose a new topic without deleting earlier ideas.
- 2026-10-23 — **Broader brainstorm categories.** New direct choices use `Option` (including everyday
  questions such as what to eat), things to build use `Product`, and approaches use `Strategy`.
  Previously saved Engagement and Platform cards remain readable and editable. AI can propose a concrete
  meal option without web research or follow-up task drafts. The upper section labels sourced examples
  and sourced AI drafts as Research; approving a sourced draft still creates a direct idea.
- 2026-10-23 — **Brainstorm board separates planning from direct ideas.** Guidance, sourced research,
  reviewable strategy drafts, saved strategies, and next-step drafts appear above the idea grid. The idea
  grid and its theme filter show direct ideas and direct AI idea drafts only; strategy review and card
  actions remain available in the upper section.
- 2026-10-23 — **Problem-aware brainstorming.** The AI classifies a specific central problem or chat
  brainstorm as product, non-product, or unclear before choosing an action. Product problems can yield an
  editable concept with related web sources and existing product ideas can surface similar work. Events,
  campaigns, and other non-product goals yield reviewable ideas or strategies with no automatic web search.
  Strategies have their own theme; approved strategies get relevant next steps rather than MVP language.
  Automatic exploration runs once per meaningful problem or idea state and old product-search cards are
  hidden when a newer non-product assessment makes them irrelevant.
- 2026-10-23 — **Sourced brainstorm examples replace generic guidance.** Specific product ideas trigger a
  bounded Tavily search on creation or major edit. At most two relevant, distinct web results per idea
  appear with their original links; automatic searches pause while two examples await review. No result or
  unavailable search produces no card. Members may save a
  source to an idea. Generic problem, comparison, and inactivity prose no longer fills the board; MVP
  task drafts still follow an approved idea. Old unsourced automatic guidance is hidden from the board.
- 2026-10-23 — **Compact brainstorm details.** Idea cards, AI idea drafts, and AI guidance show
  short previews with Read more/Show less controls; the full text is preserved for review and editing.
- 2026-10-23 — **Ideas can be deleted.** Members can delete an idea or the central problem after a
  confirmation. Pending AI suggestions linked to it are dismissed; converted tasks and other ideas remain.
  The brainstorm board updates immediately, and a new central problem can be defined afterward.
- 2026-10-23 — **Concurrent Clerk project provisioning retries SurrealDB write conflicts.** Creating a
  project and its general channel now happens in one transaction; simultaneous requests safely retry the
  whole transaction. Member upserts and membership updates retry their single writes as well.
- 2026-10-23 — **Solo starting path and brainstorm facilitator (original trigger behavior, revised above).** An empty solo task board points to the
  Meeting Room and gives a starting script. The brainstorm board now has a central problem, editable ideas,
  shortlist and explicit idea approval. Nine state-based triggers offer clarifying questions, market research,
  connections, improvements, re-evaluation after major edits, an inactivity nudge, comparison, MVP tasks,
  and a manual AI request. The eight automatic actions run while the brainstorm board is open; output
  remains a pending suggestion until reviewed and also appears in the AI Assistant panel.
  Approved research attaches source links to the idea. Major edits clear idea approval and flag old research.
- 2026-10-23 — **Project text channels.** Completed the previously unfinished create-channel path, including
  project-scoped validation, realtime updates, sidebar dialog, and selection of the new channel while keeping
  the current workspace page.

- 2026-10-22 — **AI-guided brainstorming and confirmed voting.** `@AI brainstorm …` turns recent chat into
  one or two editable idea suggestions. With `TAVILY_API_KEY`, the server searches the web and keeps only
  validated result URLs as sources on the suggestion and approved card; without it, the AI clearly falls
  back to conversation context. A member must review/approve every AI draft, then explicitly confirm
  "Start voting" before teammates can vote.

- 2026-10-21 — **AI Meeting Room** (Hansol). In-app voice meetings (WebRTC mesh, 60-minute cap) with a live
  transcript from each browser's speech recognition. Claude (fast model) joins read-only and proposes tickets,
  ideas and polls as suggestions; ending the meeting writes an AI summary and a "Notes for next time"
  checklist. Confirmed notes become the next meeting's "Last time" card. Spec:
  [superpowers/specs/2026-10-21-ai-meeting-room-design.md](superpowers/specs/2026-10-21-ai-meeting-room-design.md).

- 2026-10-21 — **Files page.** Members can upload, download, and delete project files from the Files nav item.
  Metadata is a `file` record (in the snapshot and over realtime); the bytes live on disk under `FILES_DIR`
  (default `./data/files`, `/data/files` in the image). Uploads are capped at 10 MB and always download as
  attachments. A file name is stored as its last path segment.
- 2026-10-20 — **Claude provider, structured suggestions and project memory.** `ANTHROPIC_API_KEY` switches
  the AI from the mock to Claude (`src/ai/anthropic.ts`, `messages.parse` + zod). One `@AI` call returns
  action items, decisions and risks, each with a `reason` and a `quote`. Output is validated before use
  (unknown member/task ids dropped, quotes kept only if verbatim in a message). New "Ask the project" box
  in the Decisions tab (`POST .../decisions/ask`) answers from approved decisions only, with the decisions
  as sources. Decisions now carry `outcome`/`reason`/`quote`; "Mark decided" asks for the outcome. The mock
  runs only without a key and keeps its UI label. Seed rewritten around this (five approved decisions
  including a reversed hosting choice, items with reasons and quotes).
- 2026-10-20 — **"Acting as" removed; Clerk is required.** The API exits at startup without Clerk keys and
  the web app shows a setup screen. Only the test suite runs keyless (`x-member-id`).
- 2026-10-20 — **Deployable image.** `Dockerfile` builds one image where the API also serves the built web
  app; the demo loads into a Clerk organization via `SEED_ORG_ID` / `npm run db:seed -- --org org_xxx`.
- 2026-10-20 — **Clerk authentication + organizations.** With Clerk keys set, the web app shows Clerk
  sign-in and the API verifies Clerk session tokens (`clerkMiddleware` + `getAuth`; the WebSocket gets
  `?token=`). A Clerk Organization is a project: the sidebar uses `<OrganizationSwitcher>` to create and
  switch teams, the top-bar "+" opens Clerk's invite dialog, and members/projects (with `#general`) are
  created on first use. Without keys the app stays in dev mode ("Acting as"), which tests use.
- 2026-10-20 — **AI tool entry files.** `GEMINI.md` and `.github/copilot-instructions.md` point to
  AGENTS.md like `CLAUDE.md` does; shared notes moved from CLAUDE.md into AGENTS.md; personal AI settings
  (`CLAUDE.local.md`, `.claude/settings.local.json`, …) are git-ignored.
- 2026-10-20 — **CI and code quality.** GitHub Actions on every PR and `main`: Prettier check, ESLint
  (typescript-eslint + react-hooks), typecheck, tests, build, `npm audit` (production deps). `npm run check`
  runs the same locally. Fixed the issues the new React hooks rules found (ref writes during render,
  form resets in effects).
- 2026-10-20 — **Full-stack scaffold.** npm workspaces (`packages/shared`, `apps/api`, `apps/web`).
  - API: Express 5 + SurrealDB 3 (embedded `surrealkv`, or remote via `SURREAL_URL`), schema with
    ASSERTs, per-project membership checks, zod validation, demo seed, realtime via LIVE SELECT → WebSocket.
  - AI action engine with a mock provider: @AI action-item extraction, open-question detection,
    approve/edit/dismiss workflow; risk suggestions require choosing an assignee.
  - Web: React + Router pages per feature (Board, Chat, Brainstorm, Decisions, placeholders),
    task CRUD with drag-and-drop and grouping, chat channels, AI Assistant, decisions log,
    ideas (add, vote, convert to task), live sync across browsers.
  - Chat can be docked, floated in the page, or opened in a separate window (PiP / popup);
    dock height and chat/brainstorm split are resizable.
  - Tests: mock AI rules + HTTP/realtime end-to-end flow (`npm test`).
- 2026-10-19 — Static HTML prototype of the light-theme UI (`prototype/`).

## Next up

Pick from the top unless the team agrees otherwise. Put your name next to an item when you start it.

Hackathon prizes first — the plan for each sponsor is in [HACKATHON.md](HACKATHON.md).

- [ ] **Clerk roles** (Clerk prize, follow-up) — use org roles for product rules, e.g. only `org:admin`
      can close a poll; Clerk webhooks to drop members who leave a team.
- [ ] **Live URL** (needs a host account) — build and deploy the Dockerfile with a persistent volume at
      `/data`, set the env vars from `apps/api/.env.example`, `SEED_ORG_ID`, and the Clerk production keys.
- [ ] **Summarize this channel** as a suggestion kind (Claude provider follow-up).
- [ ] **SurrealDB Agent Memory** (Agent Memory prize) — file upload and `@AI` excerpts are in. Still open:
      remember messages and poll results, and recall that memory before suggesting.
- [ ] **Era eval harness** (Eon prize) — the local runner is in (`npm run eval -w apps/api`, see Done). Still open:
      convert an Era Slack/Jira export to its dataset shape, then compare hosts and with/without Agent Memory.
- [ ] **Expo mobile companion** (Expo prize) — `apps/mobile`: approval notifications, approve/dismiss,
      chat, my tasks; Clerk Expo sign-in; EAS Build/Update.
- [ ] **Overview page** — progress, overdue tasks, upcoming deadlines, open polls, workload per member.

- [ ] **Brainstorm grouping** — themes as columns and a comparison view for proposals; starting a vote still needs confirmation.

- [ ] **Web tests** — Playwright for: approve AI action items → task appears; drag task; detach chat.

## Known gaps

- Meeting file passages come from a project-wide Agent Memory search filtered to the meeting's files afterwards; with
  many uploaded files the top hits can all be other files. Scope the query to the meeting's document ids if the API allows.
- Meeting `@AI` reloads the whole transcript and re-reads shared files on every call, and the meeting AI panel keeps
  its own poll list next to the snapshot's. Fine at hackathon scale; revisit if meetings get long.
- The Files picker clears its live `FileList` before starting uploads; use drag and drop until that separate issue is fixed.

- Brainstorm topic selection is a browser preference; each browser may work on a different topic.
  Topic resets intentionally discard that board's drafts and cards; there is no board undo/history yet.
- Current local validation: `npm run check` stops at existing formatting drift in 140 unrelated files.
  The root production build compiles shared/API TypeScript, then stops at the API's Unix `cp` command
  on Windows; the web production build succeeds independently.
- Organization-switching checks pass individually, but `npm run check` still stops at the existing
  repository-wide formatting baseline (171 files after formatting the three changed web files).

- Goal classification can be wrong or unclear, especially for mixed product and activity goals. Members can
  refine the problem and retry, but there is no explicit goal-type override yet.
- Product similar-work search runs while the brainstorm board is open, uses search snippets rather than full page
  content, and relies on conservative word overlap for relevance. Useful semantic matches can be missed.
  There is no automatic voice response from the Meeting Room AI.
- Meaningful idea edits use a conservative text-change heuristic. Ambiguous semantic changes can be missed;
  members can manually search the latest specific idea. Research stores approved source links, not a full
  research-node history or comparison matrix.
- The solo board entry, Meeting Room starting prompts, and Brainstorm problem form were checked in Edge.
  The problem-aware strategy draft and suppression of older unrelated web cards were also checked there.
  The sourced web-result approval flow still needs an interactive check in a disposable project.
- The chat-to-topic flow passed API and realtime tests, and the Brainstorm page loaded in Edge. A fresh
  topic card was not exercised in the browser because the available project holds existing user data.
- Voice meeting topic creation, summary fallback, and persistence of pending ideas passed API tests.
  The local browser check reached Clerk sign-in, so the new meeting topic card was not exercised interactively.
- Research summaries and the placement of sourced idea drafts passed API tests and a web build. The local
  browser check reached Clerk sign-in, so the revised Brainstorm cards were not exercised interactively.
- Local `npm run check` still stops at the repository-wide Prettier baseline (103 unrelated files).
  The full suite passed 110 tests. Meeting start now retries a write conflict that made its concurrency
  test fail intermittently on earlier runs.
- Meetings: no TURN relay, so peer connections may fail on strict networks (transcript and AI still work).
- Meetings: live state, the AI trigger and the signaling relay are in-process (single API instance).
- Meetings: trigger state (cooldowns, running summary, call counts) is in memory and resets on API restart.
- Meetings: when the AI is re-invited it reads lines spoken while it was removed, and the end-of-meeting summary
  reads the full transcript (up to the line cap).
- Meetings: no rate limit on `POST /meetings/:id/lines`.
- Meetings: poll votes are read-modify-write, so two simultaneous votes can overwrite each other.
- Meetings: without `GROQ_API_KEY`, transcription is Chrome/Edge only (Web Speech API; audio goes to Google) and fails
  with `network` behind VPNs/strict networks.
- Meetings (Groq Whisper): fixed 6s clips can split a word at the boundary; no interim text while speaking; Groq's free
  tier has daily request limits (about one request per speaking participant every 6s). Not yet tried in a real browser.
- Meetings: no meeting or transcript deletion; mixed-language speech is transcribed in one language.
- The web meeting UI has no automated tests and hasn't been tried in a real browser by the agents.
- `@AI` tool use runs when `OPENAI_API_KEY` is set. The mock still analyzes in one call.
- The structured provider is covered by tests with a fake client (validation, prompts) but has not been run
  against the live API in CI; try it once with a real key (`@AI` in #general).
- The model is called synchronously on `@AI`.
  `OPENAI_MODEL` defaults to `gpt-4.1-mini`; `OPENAI_FAST_MODEL` is the live meeting model. A refusal posts
  an error message.
- Demo teammates (Alex, Jamie, Taylor, Morgan) are placeholder members with no login; real Clerk users are
  added to the project the first time they open it.
- Existing local databases created before this change lack the new decision/suggestion fields until
  reseeded (`npm run db:seed -- --org <id>`).
- Web research needs `TAVILY_API_KEY`; without it, brainstorm suggestions use only the recent conversation.
- Clerk mode: people who leave a Clerk team lose access (their tokens no longer carry that org) but
  stay in the project's member list until webhooks are added. Not yet tested against a real Clerk
  instance in CI; the API tests run in dev mode.
- The web bundle grew ~120 kB (Vite's 500 kB chunk warning) because `@clerk/react` is bundled even in
  dev mode; lazy-load it if load time matters.
- Clerk mode starts teams empty (only `#general`); the demo project stays dev-only.
- Picture-in-Picture chat works in Chrome/Edge only; other browsers get the popup window fallback.
- Messages load the latest 200 per channel; no pagination. Top-bar search only filters tasks. `@AI` reads the latest 80 in the channel, plus older lines that share words with the question.
- Word and PowerPoint uploads are not sent to Agent Memory. Export them as PDF first.
- A file can take a little while to become searchable. `@AI` immediately after upload may not see it yet.
- A question that shares no words with a message older than the 80-line thread will not bring that message back. SurrealDB Agent Memory still does not remember chat; it recalls uploaded files.
- AI only reacts to new messages; it doesn't yet watch deadlines/workload on a schedule (the seeded
  "risk" suggestion shows the intended UX).
- Mind Map tab is a placeholder.
- Meeting history (Meeting tab) lists the 20 most recent meetings only (`listMeetings` limit).
- Files have no in-browser preview or version history. Delete removes the record, the bytes, and the Agent Memory document when one was stored.

## Decision log

- 2026-10-27 — **Task updates do not reuse create defaults.** Dragging a card only sends the new column. Applying
  create defaults to missing fields wiped the assignee, due date, priority and label. The update schema
  has no defaults, matching notes. Sending `assigneeId: null` still unassigns.

- 2026-10-26 — **The calendar scrolls through untitled weeks.** Week titles ("This week", "Next week") made the
  page a list, and only weeks that already had a task were drawn, so an undated task had no later day to
  land on. A week now fills the view under a sticky weekday header, and scrolling either way loads more weeks.

- 2026-10-26 — **Strategies: AI up to six steps, members up to eight.** Four was too tight for real plans (Add step
  silently did nothing at four). The AI still aims for two to four steps; members get two spare slots, and a full
  editor greys out Add step with an "Up to 8 steps." note.
- 2026-10-25 — **Capture tentative concrete ideas as suggestions.** Members naturally say “thinking of
  adding” rather than issuing commands. Preserve that contribution for review while direct “want to add”
  requests create member-authored cards; use a sole topic by default unless an explicit target conflicts.

- 2026-10-25 — **Use contextual intent extraction for natural chat.** Exact phrase templates missed
  misspellings and semantic references. A structured model interprets the request, but only grounded
  member-authored titles and validated project topic ids reach repositories; generated content stays pending.
  This supersedes template-only natural request handling below.

- 2026-10-25 — **Explicit natural chat requests count as member input.** Brainstorm creation needs no
  AI tag or model call; anchored wording and conservative topic matching avoid interpreting ordinary
  discussion as permission. Existing-topic reuse preserves the board; generated ideas still require review.

- 2026-10-25 — **Polls replace decisions.** Members couldn't tell how a decision got created (only the AI's
  per-message open-question check made one) and decisions overlapped with polls. The team now decides by voting;
  closed polls are the record. "Ask the project" went with decisions because it answered only from them. This
  supersedes "Memory = approved decisions" (2026-10-20).
- 2026-10-24 — **Pending AI suggestions are dashed, in the colour of their destination.** Brainstorm yellow, research
  blue, polls green, decisions and tasks purple, on every page, so it reads at a glance what is unconfirmed and where
  approving it puts it.
- 2026-10-24 — **Team is a section of Settings, not its own sidebar item.** Members and roles are project
  administration, and the sidebar was already a long list of pages. Workload stays on the planned Overview
  page. `/team` redirects to `/settings`.
- 2026-10-24 — **An empty meeting ends itself; no "End for everyone".** A room nobody is in has nothing to keep
  live. Explicit leave ends at once; a dropped socket waits 30s so a refresh or blip doesn't end the meeting.
- 2026-10-23 — **Split model hosts by how often the call runs.** Nebius takes the frequent short calls
  (open-question check, live meeting ticks, brainstorm automation). OpenAI takes `@AI`, Ask the project,
  chat brainstorm drafts, and the meeting summary. Groq stays on Whisper only. A missing key falls back
  to the host that is configured.

- 2026-10-23 — **@AI reads a channel thread, then recalls older lines by full-text search.** The previous window stopped at the last AI reply and kept 12 messages, so the model could not follow the conversation. The latest 80 messages are always in the prompt. BM25 adds an older line that shares words with the question, including from another channel in the same project. File text comes from Agent Memory, not from sending the bytes to the chat model (scope `project/<id>`). "Ask the project" stays on approved decisions.
- 2026-10-23 — **Dropped `@anthropic-ai/sdk`.** Structured output goes through the OpenAI-compatible client
  (`response_format: json_schema` + zod). One chat API covers OpenAI, Groq and Nebius; `ANTHROPIC_*` is no
  longer read.
- 2026-10-23 — **@AI tools are named lookups, not SurrealQL** (Nebius / any OpenAI-compatible model): a cheaper
  model stays accurate when the server reads the project and checks ids and quotes. propose_* only creates
  suggestions, which keeps "AI suggests, people decide".

- 2026-10-23 — **Each brainstorm topic owns a board.** Topic edits reset its content instead of mixing
  old context into a new question. Clear-ideas keeps research/strategies, and versioned AI writes prevent
  cleared content from returning. Chat/meeting topics add tabs rather than silently replacing a board.

- 2026-10-23 — **Schema defaults are `DEFAULT ALWAYS`.** A record created before a field existed holds NONE, and
  plain DEFAULT only fills it on CREATE, so every later UPDATE failed (500 approving an older idea suggestion).
  ALWAYS also fills NONE on UPDATE; `createdAt` stays as is. Reads don't fill NONE, so the schema also touches
  ideas/suggestions missing `researchSources` once on start, which backfills every late field.

- 2026-10-23 — **Classify brainstorm goals before web search.** Product goals can justify similar-work
  research; non-product goals get context-based strategies. The mode and processed state are recorded in
  hidden check suggestions to prevent repeated or outdated cards.
- 2026-10-23 — **Retry only replay-safe provisioning writes on structured SurrealDB conflicts.** Clerk can
  issue parallel first-load requests; a transaction protects project plus channel creation, while the SDK
  retries those conflicts with bounded backoff.
- 2026-10-23 — **Automatic brainstorm triggers run AI while the board is open; manual requests need a click.**
  The server suppresses repeats for the same board state. AI stores analysis, ideas, and tasks as pending
  suggestions; only member approval attaches research or creates board records.
- 2026-10-23 — **A central problem is an idea record with `kind = problem`; shortlist and approval are explicit
  fields on ordinary ideas.** This reuses project-scoped realtime storage and keeps the first workflow step
  distinct from candidate solutions without adding another table.

- 2026-10-22 — **Tavily search is optional and sources survive approval**: a plain server-side `fetch`
  adds current web context without a client-side key or new dependency; model-returned URLs are accepted
  only when they match a search result. AI ideas remain pending suggestions, and voting starts only after
  a separate member confirmation.

- 2026-10-24 — **Dragging a task onto a calendar day sets its due date.** The task update already accepts `dueDate`,
  so the calendar adds no table or route. A drop on the same day is ignored.
- 2026-10-23 — **The deadline chip is the date control.** Clicking the date used to jump to the week, while a
  calendar icon opened the picker and × cleared it, so the chip looked like a tag. The chip now sets the
  date. Clear is a separate label. With no date, the whole chip opens the picker. It sits in the calendar header.
- 2026-10-23 — **No month view.** The week columns already list every week that has a task, so a second grid
  repeated the same work. The Week / Month switch and its saved preference are gone.
- 2026-10-23 — **Week view is seven vertical days; month view is the only month grid.** A horizontal day row was
  hard to scan, and one week at a time copied the month's previous / next pattern. Each week is columns,
  this week first, earlier weeks below. The deadline
  stays a card under the title, because a date field next to Week / Month looked like a form control. It
  still edits `project.dueDate` from the calendar.
- 2026-10-23 — **Month view is one month plus a side list.** The side list holds tasks with no due date and tasks
  on other months, so the grid can show empty days without hiding work.
- 2026-10-23 — **The project deadline is edited on the calendar, not in settings.** Settings is still a placeholder.
- 2026-10-23 — **Calendar layout is a per-browser preference, still with no new table.** Weeks start on Monday.
- 2026-10-22 — **Calendar is a view, weeks start Monday.** Task due dates and the project deadline are already
  on the records, so the page adds no table or API. A due date is a local calendar day (`YYYY-MM-DD`). Voice
  meetings stay off this page; they are live calls, not scheduled events.

- 2026-10-21 — **Voice via WebRTC mesh with WS signaling, no new dependency**: teams are <= 6, and a hosted SFU would add a vendor and key.
- 2026-10-21 — **Each participant transcribes their own mic with the browser speech API**: exact speaker labels, no speech-to-text vendor or cost.
- 2026-10-21 — **Meetings are capped at 60 minutes and live AI reads a bounded context** (running summary + new lines + project titles): cost stays bounded.
- 2026-10-21 — **Carry-over is a member-confirmed note, not the transcript**: consistent with "memory = confirmed records".
- 2026-10-22 — **Live meeting AI reacts faster** (40 words / 20s, or 15 words + 8s silence; cap 150 calls, silence check every 2s): the old 80 words / 45s felt like a post-meeting summary, not a participant. About 2-3x the calls.
- 2026-10-22 — **One live meeting per project via a `live_meeting:<projectId>` reservation record** (from PR review): SurrealDB 3.1 has no conditional unique index, and a fixed record id makes concurrent starts fail atomically without one.
- 2026-10-22 — **Summary suggestions are written before the meeting ends, under fixed ids** (from PR review): a failed write now sets `summaryError` so `/end` can retry, and retries never duplicate a suggestion.
- 2026-10-22 — **Meeting transcription via Whisper on Groq when `GROQ_API_KEY` is set** (replaces the 2026-10-21 browser-only choice): Chrome's speech service failed with `network` for the team; Groq's free tier costs nothing, works in any browser and keeps exact speaker labels (each client sends its own mic). Web Speech stays as the fallback.
- 2026-10-22 — **OpenAI-compatible provider via a `messages.parse` adapter (`src/ai/openai.ts`), plain `fetch`**: lets the team test without Claude credits (OpenAI, or Groq's free tier via `OPENAI_BASE_URL`) while reusing the Claude prompts and validation; no new dependency.
- 2026-10-21 — **`ANTHROPIC_FAST_MODEL`** (default `claude-haiku-5-5`) for frequent live calls; summaries stay on `ANTHROPIC_MODEL`.
- 2026-10-21 — **File bytes on disk, metadata in SurrealDB** (no S3): team uploads are small, and the same
  `/data` volume that keeps the embedded database keeps `FILES_DIR`. The snapshot and realtime carry only
  the `file` record, so a download is a separate authenticated request.
- 2026-10-20 — **Memory = approved decisions** (not a vector store over chat): answers must be traceable to
  something a member confirmed, which fits "AI suggests, people decide" and avoids answering from
  half-remembered chat. Decisions gained `outcome`/`reason`/`quote` so there is something to answer from.
  Agent Memory (SurrealDB) can still be layered on later for raw messages.
- 2026-10-20 — **No anonymous mode.** Removing "Acting as" is the security story for the Clerk prize; the
  test-only keyless path stays because tests act as several members, and the server refuses to start in it.
- 2026-10-20 — **New dependency `@anthropic-ai/sdk`** (api): official SDK; `messages.parse` + its zod helper
  give validated structured output without hand-written JSON parsing.
- 2026-10-20 — **Clerk for auth** (`@clerk/express`, `@clerk/react`; Clerk prize): a Clerk Organization
  _is_ a project (same id), so team creation, switching and invites come from Clerk instead of our own
  UI. Projects check membership from the org in the session token; the web asks for a token scoped to the
  URL's project (`getToken({ organizationId })`). Members/projects are created lazily on first request
  rather than via webhooks, so local development needs no public URL. Dev mode stays when keys are
  unset so tests and teammates without keys keep working.
- 2026-10-20 — **Hackathon: enter all five prizes** in the order in [HACKATHON.md](HACKATHON.md)
  (Clerk → Claude → Agent Memory → Era → Expo): auth unblocks everything, memory builds on the real
  model, the Era eval measures both, and the mobile app reuses auth and the API.
- 2026-10-20 — **ESLint + Prettier** (not Biome): the React hooks rules (incl. the React Compiler checks)
  only exist as an ESLint plugin. Prettier uses the existing style (single quotes, 140 columns) so the
  first format pass was small. Lint warnings fail CI so they don't pile up.
- 2026-10-20 — **SurrealDB** chosen by the team for the database: live queries fit realtime chat/board;
  record links model "message → suggestion → task" provenance. No ORM; schema lives in `schema.surql`.
- 2026-10-20 — **Embedded SurrealDB for development** (`@surrealdb/node`): no server to install; the
  same code connects to a server with `SURREAL_URL=ws://…`.
- 2026-10-20 — **React + Vite / Express** over Next.js: the UI is an app-like workspace (no SEO/SSR
  need) and a separate API keeps AI keys and the realtime hub server-side.
- 2026-10-20 — **Realtime from LIVE SELECT**, not an in-process event bus, so multiple API instances and
  direct DB writes stay in sync.
- 2026-10-20 — **Chat windows:** Document Picture-in-Picture first (Zoom-like always-on-top window,
  shares React state), popup fallback; a desktop app (Tauri) is deferred until notifications/tray are needed.
- 2026-10-20 — AI suggestions are **records with status**, never direct writes; approval is a separate
  endpoint so the confirmation rule is enforced server-side.
