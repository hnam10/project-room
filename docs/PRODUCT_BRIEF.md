# Product Brief

> The original product prompt for Project Room. This is the source of truth for *what* we are building and *why*.
> Status and next steps live in [PROGRESS.md](PROGRESS.md); technical structure in [ARCHITECTURE.md](ARCHITECTURE.md).

## Project: AI-Powered Collaborative Workspace

## 1. Your Role

Act as a senior full-stack engineer, product designer, and AI product architect. Help me build a polished, functional MVP of an AI-powered collaborative workspace for teams.

Think critically about product decisions, UI/UX, architecture, usability, and implementation trade-offs. Do not blindly follow the requirements if you identify a better solution. Explain significant trade-offs and recommend improvements when appropriate.

Start by inspecting the existing repository, understanding its architecture, and identifying what already exists before making changes. Preserve existing working functionality and follow the project's established conventions unless there is a good reason to change them.

## 2. Product Vision

We are building an AI-powered collaborative workspace where people work with AI and other team members to turn conversations into organized decisions and actionable progress.

Unlike a traditional chatbot, AI is integrated directly into the team's workflow. It understands the context of conversations, shared materials, project goals, and existing tasks. It proactively identifies opportunities to help the team make progress.

The core product philosophy is:

**Conversations → Insights → Decisions → Actions → Progress**

> Implementation note (2026-10-25): the team makes decisions by voting. Polls opened in meetings are listed in
> the Polls tab with their results; there is no separate decision record or "Ask the project".

The AI should act as an intelligent team assistant that helps users think, collaborate, plan, and execute. It should not simply generate text in response to prompts.

The initial target audience is students working on academic group projects, hackathon teams, and small collaborative teams.

## 3. Core User Experience

The application should revolve around three primary workspaces:

### A. Chat Room

A shared conversation space for team members and their AI assistant.

Users should be able to:
- Communicate with team members through messages.
- Ask the AI questions using the context of their project.
- Discuss ideas, requirements, problems, and possible solutions.
- Share project instructions, documents, screenshots, and other relevant materials where supported.
- View AI-generated insights and suggestions associated with the conversation.
- Identify decisions that have been made and questions that remain unresolved.

The AI should understand that conversations are part of an ongoing project, not isolated chat sessions.

Examples:
- A team member says, "We still haven't decided which database to use."
- Two members disagree about the application's navigation.
- Someone identifies a problem but nobody volunteers to solve it.
- A team member mentions that an assignment deadline is approaching.

The AI should identify these situations and suggest useful next steps when appropriate.

### B. Task Management Board

A centralized place for tracking project work and accountability.

Users should be able to:
- Create, edit, assign, prioritize, and complete tasks.
- Set deadlines and track task status.
- Organize tasks into an intuitive board with statuses such as To Do, In Progress, and Done.
- See who is responsible for each task.
- View tasks in the context of project goals and deadlines.
- Track unresolved work, overdue tasks, and upcoming deadlines.

AI should help break large goals into smaller actionable tasks, recommend priorities, identify dependencies, and suggest reasonable task assignments based on team members' stated responsibilities, current workload, and existing assignments.

Task assignments must remain suggestions until an authorized user confirms them.

### C. Brainstorming Board

A collaborative space for exploring ideas and solving problems.

The flow is: pick a topic → review AI research and strategies → add ideas → iterate and decide.
Projects can keep several topics in tabs, each with its own ideas, research and strategies. A topic is
required before starting a board. Changing or deleting a topic clears its board after confirmation;
a separate Clear ideas action keeps the topic, research and strategies. Other topics and already-created
tasks or decisions are preserved. AI drafts remain reviewable before they change the board.

Users should be able to:
- Add and organize ideas.
- Group related ideas into themes.
- Identify problems, possible solutions, advantages, disadvantages, and risks.
- Compare competing proposals.
- Vote on ideas or initiate a team decision.
- Convert selected ideas into tasks.

AI should facilitate productive brainstorming rather than dominate it.

When team members disagree, AI should neutrally summarize the different positions, explain their trade-offs, identify assumptions, and suggest ways to resolve the disagreement. It must not automatically decide who is right.

## 4. The AI Action Engine

This is the defining feature of the product.

The AI should analyze relevant conversation context and project information to identify actionable insights. It should surface suggestions through a dedicated activity or recommendations panel rather than constantly interrupting the conversation.

Examples of potential insights include:

- An unresolved decision that needs a team vote.
- A problem that needs investigation.
- A conversation that implies a new task.
- An idea that could be developed further.
- A task that needs to be broken into smaller steps.
- An approaching deadline that creates a project risk.
- An imbalance in workload that may require task redistribution.
- Conflicting opinions that could benefit from a structured comparison.
- A meeting that should be summarized and converted into follow-up actions.

Every suggestion should explain why the AI generated it and provide relevant context from the conversation when available.

### Action categories

**Automatic assistance — no approval required for low-risk, reversible actions:**
- Transcribe and summarize an uploaded or supported meeting recording.
- Summarize discussions and extract key points.
- Organize information into themes.
- Identify possible unresolved decisions.
- Generate proposed task breakdowns.
- Identify potential risks, dependencies, and conflicting opinions.
- Draft action items and recommendations.

**Actions requiring explicit confirmation:**
- Assigning or reassigning tasks to team members.
- Scheduling, changing, or canceling meetings.
- Sending invitations or notifications.
- Starting a team vote.
- Conducting substantial market research or external research.
- Converting a tentative idea into an official team decision.
- Sending reminders or messages on behalf of the team.

The AI may prepare these actions automatically, but it must obtain confirmation from an authorized user before executing them.

**Optional features for later releases:**
- Meeting scheduling and attendance tracking.
- Calendar integration and notifications.
- Automated check-ins before deadlines.
- Voice meeting transcription.
- External market research and competitor analysis.
- Guided brainstorming sessions.
- Academic assignment requirement analysis.
- UI/UX audits of application screenshots or prototypes.
- AI-assisted project idea discovery through interactive questions.

Do not attempt to implement all these capabilities in the first iteration.

## 5. AI Suggestion Workflow

Create a consistent workflow for AI-generated actions.

1. The AI detects a potential issue, opportunity, or action from available project context.
2. It generates a structured suggestion containing a title, explanation, supporting context, proposed action, and relevant details.
3. The suggestion appears in a dedicated recommendations area.
4. A team member can review, approve, edit, dismiss, or defer the suggestion.
5. Approved suggestions create or update the appropriate project resource.
6. The resulting task or decision becomes visible in the relevant workspace.
7. The team can track the resulting progress.

For example:

A team member says, "We need to finish the prototype before Friday, but nobody has implemented the authentication flow."

The AI identifies:
- A potential task: Implement authentication.
- A deadline: Friday, if confirmed by the project context.
- A possible dependency: The prototype cannot be completed until authentication is implemented.
- A suggested action: Create a task and assign an owner.

The AI presents the proposed task and asks the team to confirm the assignee and deadline if these details are not already established.

After approval, the task appears on the Task Management Board.

Maintain a distinction between suggestions, approved actions, and completed work. Never represent an action as completed merely because the AI proposed it.

## 6. MVP Priorities

Focus on a coherent, demonstrable MVP with the following features, in order:

**Priority 1 — Core application experience**
- A polished, cohesive application layout.
- Project or workspace selection.
- A shared chat room with a usable message composer.
- A task management board with functional task creation, editing, assignment, status changes, and deletion.
- A brainstorming board with functional idea creation and organization.
- Consistent navigation between the three workspaces.

**Priority 2 — AI-powered collaboration**
- An AI chat assistant that uses relevant project context.
- An AI recommendations panel.
- Structured suggestions for tasks, decisions, and unresolved issues.
- Approve, edit, dismiss, and execute workflows for suggestions.
- Ability to convert brainstorming ideas into tasks.
- Ability to summarize conversations and extract action items.

**Priority 3 — End-to-end demonstration**
- Create a sample project.
- Populate it with realistic conversations, ideas, and tasks.
- Demonstrate the AI identifying a problem in a conversation.
- Show the team reviewing and approving a recommendation.
- Show the approved recommendation becoming a task.
- Show the task progressing through the board.

Prioritize working, connected features over a large number of disconnected screens or placeholder buttons.

If a capability requires an external API, integration, or infrastructure that is not configured, clearly identify the dependency and implement a clean interface or mock adapter where appropriate. Do not pretend that an integration is functional when it is not.

## 7. UI/UX Design Requirements

The interface should feel like a modern, premium productivity application built for serious collaborative work.

Use established UX principles:
- Clear information hierarchy.
- Consistent spacing, typography, colors, and component styles.
- Intuitive navigation and predictable interactions.
- Strong visual distinction between conversations, tasks, ideas, decisions, and AI recommendations.
- Minimal unnecessary clutter.
- Useful empty, loading, success, and error states.
- Responsive layouts.
- Accessible contrast, keyboard navigation, and clear interaction states.
- Confirmation dialogs for destructive actions and sensitive operations.
- Helpful contextual actions instead of excessive menus.

Avoid making the application look like a generic chatbot with a sidebar.

AI should be integrated into the workspace naturally. For example, recommendations should appear near the project context they relate to, and approved tasks should be accessible directly from the task board.

Use realistic sample data to demonstrate the experience. Make it obvious what is actionable and what is simply informational.

Do not sacrifice usability for visual effects. Avoid excessive gradients, unnecessary animations, oversized cards, and decorative elements that compete with the actual work.

Make thoughtful design decisions based on the intended workflow rather than copying an existing application's interface.

## 8. Technical and Architectural Requirements

First inspect the existing repository and determine its current framework, language, dependencies, backend, and data model.

- Reuse the existing stack whenever practical.
- Avoid replacing working infrastructure without a compelling reason.
- Keep components modular and reusable.
- Separate UI components, application logic, AI integration, and data access.
- Use clear data models for projects, members, messages, tasks, ideas, decisions, and AI suggestions.
- Model AI suggestions as structured data rather than relying entirely on unstructured generated text.
- Validate user input and handle API failures gracefully.
- Keep secrets and API keys out of client-side code.
- Use environment variables for configuration.
- Make the AI provider replaceable through a well-defined adapter.
- Avoid unnecessary dependencies and overengineering.
- Do not expose private team information across workspaces or users.
- Maintain a clear distinction between mock data and persisted application data.

If the project already has a backend and database, use them. Otherwise, recommend the simplest reliable approach for the MVP.

For AI features, use the configured provider and available credentials. If no provider is configured, implement an appropriate mock mode for development and clearly explain how to enable the real integration.

## 9. Development Process

Work incrementally.

**Phase 1: Inspect and plan**
- Inspect the repository structure and existing application.
- Identify the framework, entry points, routing, reusable components, data persistence, and current functionality.
- Identify missing infrastructure and implementation constraints.
- Propose a concise architecture and implementation plan.
- Identify the smallest end-to-end workflow that demonstrates the product's core value.

**Phase 2: Establish the application foundation**
- Build or refine the application shell and navigation.
- Establish a consistent design system.
- Create the primary workspace layout.
- Implement the foundational data models and state management.

**Phase 3: Implement the core workflow**
- Implement chat, the task board, and brainstorming board.
- Connect these workspaces through shared project context.
- Implement AI suggestions and approval workflows.
- Ensure that approved actions produce real changes in the application.

**Phase 4: Polish and validate**
- Test important user flows.
- Fix broken interactions and obvious UX problems.
- Add realistic demonstration data.
- Handle errors and empty states.
- Ensure the project builds and runs successfully.

After each significant phase, verify that the application still works. Do not stop after producing a plan, mockup, or static prototype unless a genuine blocker requires clarification.

## 10. Working Principles

- Make sensible assumptions when details are missing, and state important assumptions briefly.
- Ask questions only when a decision materially affects architecture, feasibility, or the intended product.
- Do not ask me to approve every small implementation detail.
- Do not rewrite unrelated parts of the application.
- Do not leave prominent UI elements nonfunctional without clearly identifying them as placeholders.
- Do not implement AI automation that silently performs consequential actions.
- Do not fabricate research results, meeting attendance, task completion, or AI findings.
- Keep the implementation understandable and maintainable.
- Prefer a complete, polished workflow over an ambitious but unfinished feature list.

## 11. Definition of Success

A user should be able to open a project, discuss a problem with teammates, receive a useful AI recommendation, review and approve it, see the resulting task on the task board, and track its progress.

The application should clearly demonstrate that AI is helping the team move from conversation to execution, rather than merely generating responses.

## Your First Task

Begin by inspecting the existing repository and reporting:
1. What is already implemented.
2. Which technologies and architecture the project uses.
3. What is missing for the MVP.
4. Your recommended implementation sequence.
5. Any critical risks or decisions that need attention.

Then proceed with implementation using the existing project conventions. Focus on the core end-to-end workflow and a polished UI/UX, and verify your changes as you go.
