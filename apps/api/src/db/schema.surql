-- Project Room schema (SurrealDB 3.x). Applied on every API start; OVERWRITE keeps it idempotent.
-- Reference fields keep their API names (projectId, assigneeId, ...) but hold record links,
-- so they can be traversed in queries (e.g. SELECT assigneeId.name FROM task).

DEFINE TABLE OVERWRITE member SCHEMAFULL;
DEFINE FIELD OVERWRITE name  ON member TYPE string ASSERT string::len($value) > 0;
DEFINE FIELD OVERWRITE color ON member TYPE string;
DEFINE FIELD OVERWRITE role  ON member TYPE string DEFAULT '';

DEFINE TABLE OVERWRITE project SCHEMAFULL;
DEFINE FIELD OVERWRITE name        ON project TYPE string ASSERT string::len($value) > 0;
DEFINE FIELD OVERWRITE description ON project TYPE string DEFAULT '';
DEFINE FIELD OVERWRITE emoji       ON project TYPE string DEFAULT '📁';
DEFINE FIELD OVERWRITE color       ON project TYPE string DEFAULT '#2f80ed';
DEFINE FIELD OVERWRITE dueDate     ON project TYPE null | string DEFAULT null;
DEFINE FIELD OVERWRITE memberIds   ON project TYPE array<record<member>> DEFAULT [];
DEFINE FIELD OVERWRITE taskCounter ON project TYPE int DEFAULT 0;

DEFINE TABLE OVERWRITE channel SCHEMAFULL;
DEFINE FIELD OVERWRITE projectId ON channel TYPE record<project>;
DEFINE FIELD OVERWRITE name      ON channel TYPE string ASSERT $value = /^[a-z0-9-]{1,32}$/;
DEFINE INDEX OVERWRITE channel_project_name ON channel FIELDS projectId, name UNIQUE;

DEFINE TABLE OVERWRITE message SCHEMAFULL;
DEFINE FIELD OVERWRITE projectId    ON message TYPE record<project>;
DEFINE FIELD OVERWRITE channelId    ON message TYPE record<channel>;
DEFINE FIELD OVERWRITE authorId     ON message TYPE string; -- member id, or 'ai'
DEFINE FIELD OVERWRITE text         ON message TYPE string ASSERT string::len($value) > 0 AND string::len($value) <= 2000;
DEFINE FIELD OVERWRITE suggestionId ON message TYPE null | record<suggestion> DEFAULT null;
DEFINE FIELD OVERWRITE createdAt    ON message TYPE datetime DEFAULT time::now() READONLY;
DEFINE INDEX OVERWRITE message_channel_time ON message FIELDS channelId, createdAt;

DEFINE TABLE OVERWRITE task SCHEMAFULL;
DEFINE FIELD OVERWRITE projectId  ON task TYPE record<project>;
DEFINE FIELD OVERWRITE num        ON task TYPE int READONLY;
DEFINE FIELD OVERWRITE title      ON task TYPE string ASSERT string::len($value) > 0 AND string::len($value) <= 120;
DEFINE FIELD OVERWRITE status     ON task TYPE string ASSERT $value IN ['todo', 'progress', 'review', 'done'];
DEFINE FIELD OVERWRITE priority   ON task TYPE string ASSERT $value IN ['high', 'medium', 'low'];
DEFINE FIELD OVERWRITE label      ON task TYPE string ASSERT $value IN ['feature', 'frontend', 'backend', 'design', 'docs', 'research', 'test', 'devops'];
DEFINE FIELD OVERWRITE assigneeId ON task TYPE null | record<member> DEFAULT null;
DEFINE FIELD OVERWRITE dueDate    ON task TYPE null | string DEFAULT null;
DEFINE FIELD OVERWRITE sourceKind ON task TYPE null | string DEFAULT null ASSERT $value IN [NONE, NULL, 'suggestion', 'idea'];
DEFINE FIELD OVERWRITE sourceId   ON task TYPE null | string DEFAULT null;
DEFINE FIELD OVERWRITE createdAt  ON task TYPE datetime DEFAULT time::now() READONLY;
DEFINE FIELD OVERWRITE updatedAt  ON task TYPE datetime VALUE time::now();
DEFINE INDEX OVERWRITE task_project_num ON task FIELDS projectId, num UNIQUE;

DEFINE TABLE OVERWRITE idea SCHEMAFULL;
DEFINE FIELD OVERWRITE projectId   ON idea TYPE record<project>;
DEFINE FIELD OVERWRITE title       ON idea TYPE string ASSERT string::len($value) > 0 AND string::len($value) <= 80;
DEFINE FIELD OVERWRITE description ON idea TYPE string DEFAULT '';
DEFINE FIELD OVERWRITE theme       ON idea TYPE string ASSERT $value IN ['Product', 'Engagement', 'Platform'];
DEFINE FIELD OVERWRITE authorId    ON idea TYPE record<member>;
DEFINE FIELD OVERWRITE voterIds    ON idea TYPE array<record<member>> DEFAULT [];
DEFINE FIELD OVERWRITE taskId      ON idea TYPE null | record<task> DEFAULT null;
DEFINE FIELD OVERWRITE createdAt   ON idea TYPE datetime DEFAULT time::now() READONLY;

DEFINE TABLE OVERWRITE decision SCHEMAFULL;
DEFINE FIELD OVERWRITE projectId   ON decision TYPE record<project>;
DEFINE FIELD OVERWRITE title       ON decision TYPE string ASSERT string::len($value) > 0 AND string::len($value) <= 160;
DEFINE FIELD OVERWRITE status      ON decision TYPE string ASSERT $value IN ['open', 'decided'];
DEFINE FIELD OVERWRITE raisedById  ON decision TYPE record<member>;
DEFINE FIELD OVERWRITE decidedById ON decision TYPE null | record<member> DEFAULT null;
DEFINE FIELD OVERWRITE outcome     ON decision TYPE null | string DEFAULT null;
DEFINE FIELD OVERWRITE reason      ON decision TYPE null | string DEFAULT null;
DEFINE FIELD OVERWRITE quote       ON decision TYPE null | string DEFAULT null;
DEFINE FIELD OVERWRITE createdAt   ON decision TYPE datetime DEFAULT time::now() READONLY;
DEFINE FIELD OVERWRITE decidedAt   ON decision TYPE null | datetime DEFAULT null;

-- AI suggestions are structured data. They only change other tables when a member approves them.
DEFINE TABLE OVERWRITE suggestion SCHEMAFULL;
DEFINE FIELD OVERWRITE projectId        ON suggestion TYPE record<project>;
DEFINE FIELD OVERWRITE kind             ON suggestion TYPE string ASSERT $value IN ['action_items', 'decision', 'risk', 'idea', 'poll', 'meeting_notes'];
DEFINE FIELD OVERWRITE status           ON suggestion TYPE string ASSERT $value IN ['pending', 'approved', 'dismissed'];
DEFINE FIELD OVERWRITE title            ON suggestion TYPE string;
DEFINE FIELD OVERWRITE proposal         ON suggestion TYPE null | string DEFAULT null;
DEFINE FIELD OVERWRITE outcome          ON suggestion TYPE null | string DEFAULT null;
DEFINE FIELD OVERWRITE reason           ON suggestion TYPE string;
DEFINE FIELD OVERWRITE quote            ON suggestion TYPE null | string DEFAULT null;
DEFINE FIELD OVERWRITE cite             ON suggestion TYPE null | string DEFAULT null;
DEFINE FIELD OVERWRITE sourceMessageId  ON suggestion TYPE null | record<message> DEFAULT null;
DEFINE FIELD OVERWRITE items            ON suggestion TYPE array<object> DEFAULT [];
DEFINE FIELD OVERWRITE items.*.title      ON suggestion TYPE string;
DEFINE FIELD OVERWRITE items.*.assigneeId ON suggestion TYPE null | record<member>;
DEFINE FIELD OVERWRITE items.*.priority   ON suggestion TYPE string;
DEFINE FIELD OVERWRITE items.*.include    ON suggestion TYPE bool;
DEFINE FIELD OVERWRITE items.*.reason     ON suggestion TYPE null | string DEFAULT null;
DEFINE FIELD OVERWRITE items.*.quote      ON suggestion TYPE null | string DEFAULT null;
DEFINE FIELD OVERWRITE taskId           ON suggestion TYPE null | record<task> DEFAULT null;
DEFINE FIELD OVERWRITE meetingId        ON suggestion TYPE null | record<meeting> DEFAULT null;
DEFINE FIELD OVERWRITE sourceLineId     ON suggestion TYPE null | record<transcript_line> DEFAULT null;
DEFINE FIELD OVERWRITE ideaId           ON suggestion TYPE null | record<idea> DEFAULT null;
DEFINE FIELD OVERWRITE ideaDraft        ON suggestion TYPE null | object FLEXIBLE DEFAULT null;
DEFINE FIELD OVERWRITE pollDraft        ON suggestion TYPE null | object FLEXIBLE DEFAULT null;
DEFINE FIELD OVERWRITE createdTaskIds   ON suggestion TYPE array<record<task>> DEFAULT [];
DEFINE FIELD OVERWRITE resolvedById     ON suggestion TYPE null | record<member> DEFAULT null;
DEFINE FIELD OVERWRITE createdAt        ON suggestion TYPE datetime DEFAULT time::now() READONLY;

-- File bytes live on disk (see FILES_DIR). This table is only the metadata the UI and realtime see.
DEFINE TABLE OVERWRITE file SCHEMAFULL;
DEFINE FIELD OVERWRITE projectId     ON file TYPE record<project>;
DEFINE FIELD OVERWRITE name          ON file TYPE string ASSERT string::len($value) > 0 AND string::len($value) <= 120;
DEFINE FIELD OVERWRITE size          ON file TYPE int ASSERT $value > 0 AND $value <= 10485760;
DEFINE FIELD OVERWRITE contentType   ON file TYPE string ASSERT string::len($value) > 0 AND string::len($value) <= 120;
DEFINE FIELD OVERWRITE uploadedById  ON file TYPE record<member>;
DEFINE FIELD OVERWRITE createdAt     ON file TYPE datetime DEFAULT time::now() READONLY;
DEFINE INDEX OVERWRITE file_project_time ON file FIELDS projectId, createdAt;
