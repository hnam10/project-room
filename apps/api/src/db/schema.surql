-- Project Room schema (SurrealDB 3.x). Applied on every API start; OVERWRITE keeps it idempotent.
-- Reference fields keep their API names (projectId, assigneeId, ...) but hold record links,
-- so they can be traversed in queries (e.g. SELECT assigneeId.name FROM task).
-- DEFAULT ALWAYS: records created before a field existed have it as NONE; plain DEFAULT only fills it
-- on CREATE, so every later UPDATE of such a record would fail type coercion.

DEFINE TABLE OVERWRITE member SCHEMAFULL;
DEFINE FIELD OVERWRITE name  ON member TYPE string ASSERT string::len($value) > 0;
DEFINE FIELD OVERWRITE color ON member TYPE string;
DEFINE FIELD OVERWRITE role  ON member TYPE string DEFAULT ALWAYS '';

DEFINE TABLE OVERWRITE project SCHEMAFULL;
DEFINE FIELD OVERWRITE name        ON project TYPE string ASSERT string::len($value) > 0;
DEFINE FIELD OVERWRITE description ON project TYPE string DEFAULT ALWAYS '';
DEFINE FIELD OVERWRITE emoji       ON project TYPE string DEFAULT ALWAYS '📁';
DEFINE FIELD OVERWRITE color       ON project TYPE string DEFAULT ALWAYS '#2f80ed';
DEFINE FIELD OVERWRITE dueDate     ON project TYPE null | string DEFAULT ALWAYS null;
DEFINE FIELD OVERWRITE memberIds   ON project TYPE array<record<member>> DEFAULT ALWAYS [];
DEFINE FIELD OVERWRITE taskCounter ON project TYPE int DEFAULT ALWAYS 0;

DEFINE TABLE OVERWRITE channel SCHEMAFULL;
DEFINE FIELD OVERWRITE projectId ON channel TYPE record<project>;
DEFINE FIELD OVERWRITE name      ON channel TYPE string ASSERT $value = /^[a-z0-9-]{1,32}$/;
DEFINE INDEX OVERWRITE channel_project_name ON channel FIELDS projectId, name UNIQUE;

DEFINE TABLE OVERWRITE message SCHEMAFULL;
DEFINE FIELD OVERWRITE projectId    ON message TYPE record<project>;
DEFINE FIELD OVERWRITE channelId    ON message TYPE record<channel>;
DEFINE FIELD OVERWRITE authorId     ON message TYPE string; -- member id, or 'ai'
DEFINE FIELD OVERWRITE text         ON message TYPE string ASSERT string::len($value) > 0 AND string::len($value) <= 2000;
DEFINE FIELD OVERWRITE suggestionId ON message TYPE null | record<suggestion> DEFAULT ALWAYS null;
DEFINE FIELD OVERWRITE fileId       ON message TYPE null | record<file> DEFAULT ALWAYS null;
DEFINE FIELD OVERWRITE createdAt    ON message TYPE datetime DEFAULT time::now() READONLY;
DEFINE INDEX OVERWRITE message_channel_time ON message FIELDS channelId, createdAt;
-- BM25 over every message in the project, so a mention can pull an older line that fell outside the thread.
DEFINE ANALYZER OVERWRITE message_search TOKENIZERS class FILTERS lowercase, ascii;
DEFINE INDEX OVERWRITE message_text ON message FIELDS text FULLTEXT ANALYZER message_search BM25;

DEFINE TABLE OVERWRITE task SCHEMAFULL;
DEFINE FIELD OVERWRITE projectId  ON task TYPE record<project>;
DEFINE FIELD OVERWRITE num        ON task TYPE int READONLY;
DEFINE FIELD OVERWRITE title      ON task TYPE string ASSERT string::len($value) > 0 AND string::len($value) <= 120;
DEFINE FIELD OVERWRITE status     ON task TYPE string ASSERT $value IN ['todo', 'progress', 'review', 'done'];
DEFINE FIELD OVERWRITE priority   ON task TYPE string ASSERT $value IN ['high', 'medium', 'low'];
DEFINE FIELD OVERWRITE label      ON task TYPE string ASSERT $value IN ['feature', 'frontend', 'backend', 'design', 'docs', 'research', 'test', 'devops'];
DEFINE FIELD OVERWRITE assigneeId ON task TYPE null | record<member> DEFAULT ALWAYS null;
DEFINE FIELD OVERWRITE dueDate    ON task TYPE null | string DEFAULT ALWAYS null;
DEFINE FIELD OVERWRITE sourceKind ON task TYPE null | string DEFAULT ALWAYS null ASSERT $value IN [NONE, NULL, 'suggestion', 'idea'];
DEFINE FIELD OVERWRITE sourceId   ON task TYPE null | string DEFAULT ALWAYS null;
DEFINE FIELD OVERWRITE createdAt  ON task TYPE datetime DEFAULT time::now() READONLY;
DEFINE FIELD OVERWRITE updatedAt  ON task TYPE datetime VALUE time::now();
DEFINE INDEX OVERWRITE task_project_num ON task FIELDS projectId, num UNIQUE;

DEFINE FIELD OVERWRITE brainstormTopicsMigrated ON project TYPE bool DEFAULT ALWAYS false;

DEFINE TABLE OVERWRITE idea SCHEMAFULL;
DEFINE FIELD OVERWRITE topicId ON idea TYPE null | record<idea> DEFAULT ALWAYS null;
DEFINE FIELD OVERWRITE boardVersion ON idea TYPE int DEFAULT ALWAYS 0;
DEFINE FIELD OVERWRITE projectId   ON idea TYPE record<project>;
DEFINE FIELD OVERWRITE title       ON idea TYPE string ASSERT string::len($value) > 0 AND string::len($value) <= 80;
DEFINE FIELD OVERWRITE description ON idea TYPE string DEFAULT ALWAYS '';
DEFINE FIELD OVERWRITE theme       ON idea TYPE string ASSERT $value IN ['Option', 'Product', 'Strategy', 'Engagement', 'Platform'];
DEFINE FIELD OVERWRITE kind        ON idea TYPE string DEFAULT ALWAYS 'idea' ASSERT $value IN ['problem', 'idea'];
DEFINE FIELD OVERWRITE shortlisted ON idea TYPE bool DEFAULT ALWAYS false;
DEFINE FIELD OVERWRITE approved    ON idea TYPE bool DEFAULT ALWAYS false;
DEFINE FIELD OVERWRITE researchStale ON idea TYPE bool DEFAULT ALWAYS false;
DEFINE FIELD OVERWRITE significantChangeAt ON idea TYPE null | datetime DEFAULT ALWAYS null;
DEFINE FIELD OVERWRITE updatedAt   ON idea TYPE datetime VALUE time::now();
DEFINE FIELD OVERWRITE authorId    ON idea TYPE record<member>;
DEFINE FIELD OVERWRITE voterIds    ON idea TYPE array<record<member>> DEFAULT ALWAYS [];
DEFINE FIELD OVERWRITE votingOpen  ON idea TYPE bool DEFAULT ALWAYS false;
DEFINE FIELD OVERWRITE sourceSuggestionId ON idea TYPE null | record<suggestion> DEFAULT ALWAYS null;
DEFINE FIELD OVERWRITE researchSources ON idea TYPE array<object> DEFAULT ALWAYS [];
DEFINE FIELD OVERWRITE researchSources.*.title ON idea TYPE string;
DEFINE FIELD OVERWRITE researchSources.*.url   ON idea TYPE string;
DEFINE FIELD OVERWRITE taskId      ON idea TYPE null | record<task> DEFAULT ALWAYS null;
DEFINE FIELD OVERWRITE createdAt   ON idea TYPE datetime DEFAULT time::now() READONLY;

DEFINE TABLE OVERWRITE decision SCHEMAFULL;
DEFINE FIELD OVERWRITE projectId   ON decision TYPE record<project>;
DEFINE FIELD OVERWRITE title       ON decision TYPE string ASSERT string::len($value) > 0 AND string::len($value) <= 160;
DEFINE FIELD OVERWRITE status      ON decision TYPE string ASSERT $value IN ['open', 'decided'];
DEFINE FIELD OVERWRITE raisedById  ON decision TYPE record<member>;
DEFINE FIELD OVERWRITE decidedById ON decision TYPE null | record<member> DEFAULT ALWAYS null;
DEFINE FIELD OVERWRITE outcome     ON decision TYPE null | string DEFAULT ALWAYS null;
DEFINE FIELD OVERWRITE reason      ON decision TYPE null | string DEFAULT ALWAYS null;
DEFINE FIELD OVERWRITE quote       ON decision TYPE null | string DEFAULT ALWAYS null;
DEFINE FIELD OVERWRITE createdAt   ON decision TYPE datetime DEFAULT time::now() READONLY;
DEFINE FIELD OVERWRITE decidedAt   ON decision TYPE null | datetime DEFAULT ALWAYS null;

-- AI suggestions are structured data. They only change other tables when a member approves them.
DEFINE TABLE OVERWRITE suggestion SCHEMAFULL;
DEFINE FIELD OVERWRITE topicId ON suggestion TYPE null | record<idea> DEFAULT ALWAYS null;
DEFINE FIELD OVERWRITE topicVersion ON suggestion TYPE null | int DEFAULT ALWAYS null;
DEFINE FIELD OVERWRITE projectId        ON suggestion TYPE record<project>;
DEFINE FIELD OVERWRITE kind             ON suggestion TYPE string ASSERT $value IN ['action_items', 'decision', 'risk', 'idea', 'brainstorm_topic', 'poll', 'meeting_notes', 'brainstorm_analysis'];
DEFINE FIELD OVERWRITE status           ON suggestion TYPE string ASSERT $value IN ['pending', 'approved', 'dismissed'];
DEFINE FIELD OVERWRITE title            ON suggestion TYPE string;
DEFINE FIELD OVERWRITE proposal         ON suggestion TYPE null | string DEFAULT ALWAYS null;
DEFINE FIELD OVERWRITE outcome          ON suggestion TYPE null | string DEFAULT ALWAYS null;
DEFINE FIELD OVERWRITE reason           ON suggestion TYPE string;
DEFINE FIELD OVERWRITE quote            ON suggestion TYPE null | string DEFAULT ALWAYS null;
DEFINE FIELD OVERWRITE cite             ON suggestion TYPE null | string DEFAULT ALWAYS null;
DEFINE FIELD OVERWRITE researchSources  ON suggestion TYPE array<object> DEFAULT ALWAYS [];
DEFINE FIELD OVERWRITE researchSources.*.title ON suggestion TYPE string;
DEFINE FIELD OVERWRITE researchSources.*.url   ON suggestion TYPE string;
DEFINE FIELD OVERWRITE sourceMessageId  ON suggestion TYPE null | record<message> DEFAULT ALWAYS null;
DEFINE FIELD OVERWRITE items            ON suggestion TYPE array<object> DEFAULT ALWAYS [];
DEFINE FIELD OVERWRITE items.*.title      ON suggestion TYPE string;
DEFINE FIELD OVERWRITE items.*.assigneeId ON suggestion TYPE null | record<member>;
DEFINE FIELD OVERWRITE items.*.priority   ON suggestion TYPE string;
DEFINE FIELD OVERWRITE items.*.include    ON suggestion TYPE bool;
DEFINE FIELD OVERWRITE items.*.reason     ON suggestion TYPE null | string DEFAULT ALWAYS null;
DEFINE FIELD OVERWRITE items.*.quote      ON suggestion TYPE null | string DEFAULT ALWAYS null;
DEFINE FIELD OVERWRITE taskId           ON suggestion TYPE null | record<task> DEFAULT ALWAYS null;
DEFINE FIELD OVERWRITE meetingId        ON suggestion TYPE null | record<meeting> DEFAULT ALWAYS null;
DEFINE FIELD OVERWRITE sourceLineId     ON suggestion TYPE null | record<transcript_line> DEFAULT ALWAYS null;
DEFINE FIELD OVERWRITE ideaId           ON suggestion TYPE null | record<idea> DEFAULT ALWAYS null;
DEFINE FIELD OVERWRITE originIdeaId     ON suggestion TYPE null | record<idea> DEFAULT ALWAYS null;
DEFINE FIELD OVERWRITE brainstormTrigger ON suggestion TYPE null | string DEFAULT ALWAYS null;
DEFINE FIELD OVERWRITE ideaDraft        ON suggestion TYPE null | object FLEXIBLE DEFAULT ALWAYS null;
DEFINE FIELD OVERWRITE pollDraft        ON suggestion TYPE null | object FLEXIBLE DEFAULT ALWAYS null;
DEFINE FIELD OVERWRITE createdTaskIds   ON suggestion TYPE array<record<task>> DEFAULT ALWAYS [];
DEFINE FIELD OVERWRITE resolvedById     ON suggestion TYPE null | record<member> DEFAULT ALWAYS null;
DEFINE FIELD OVERWRITE createdAt        ON suggestion TYPE datetime DEFAULT time::now() READONLY;

-- File bytes live on disk (see FILES_DIR). This table is only the metadata the UI and realtime see.
DEFINE TABLE OVERWRITE file SCHEMAFULL;
DEFINE FIELD OVERWRITE projectId     ON file TYPE record<project>;
DEFINE FIELD OVERWRITE name          ON file TYPE string ASSERT string::len($value) > 0 AND string::len($value) <= 120;
DEFINE FIELD OVERWRITE size          ON file TYPE int ASSERT $value > 0 AND $value <= 10485760;
DEFINE FIELD OVERWRITE contentType   ON file TYPE string ASSERT string::len($value) > 0 AND string::len($value) <= 120;
DEFINE FIELD OVERWRITE uploadedById  ON file TYPE record<member>;
DEFINE FIELD OVERWRITE memoryDocumentId ON file TYPE null | string DEFAULT null ASSERT $value = NONE OR $value = NULL OR (string::len($value) > 0 AND string::len($value) <= 80);
DEFINE FIELD OVERWRITE createdAt     ON file TYPE datetime DEFAULT time::now() READONLY;
DEFINE INDEX OVERWRITE file_project_time ON file FIELDS projectId, createdAt;

-- Expo push tokens for the mobile companion. A member can have several devices.
DEFINE TABLE OVERWRITE push_token SCHEMAFULL;
DEFINE FIELD OVERWRITE memberId ON push_token TYPE record<member>;
DEFINE FIELD OVERWRITE token ON push_token TYPE string ASSERT string::len($value) >= 20 AND string::len($value) <= 200;
DEFINE FIELD OVERWRITE updatedAt ON push_token TYPE datetime VALUE time::now();
DEFINE INDEX OVERWRITE push_token_unique ON push_token FIELDS token UNIQUE;
DEFINE INDEX OVERWRITE push_token_member ON push_token FIELDS memberId;

-- Backfill records from before the brainstorming fields existed: touching them fills every NONE field
-- with its DEFAULT ALWAYS, so readers can trust arrays like researchSources. A no-op once done.
-- ponytail: keyed on researchSources (added with most late fields); add a WHERE for any field added later.
UPDATE idea WHERE researchSources IS NONE;
UPDATE suggestion WHERE researchSources IS NONE;
