-- AI Meeting Room tables. Applied after schema.surql (suggestion links to these).

DEFINE TABLE OVERWRITE meeting SCHEMAFULL;
DEFINE FIELD OVERWRITE projectId         ON meeting TYPE record<project>;
DEFINE FIELD OVERWRITE title             ON meeting TYPE string ASSERT string::len($value) > 0 AND string::len($value) <= 80;
DEFINE FIELD OVERWRITE status            ON meeting TYPE string ASSERT $value IN ['live', 'summarizing', 'ended'];
DEFINE FIELD OVERWRITE language          ON meeting TYPE string DEFAULT 'ko-KR' ASSERT string::len($value) > 0 AND string::len($value) <= 16;
DEFINE FIELD OVERWRITE startedById       ON meeting TYPE record<member>;
DEFINE FIELD OVERWRITE participantIds    ON meeting TYPE array<record<member>> DEFAULT [];
DEFINE FIELD OVERWRITE attendeeIds       ON meeting TYPE array<record<member>> DEFAULT [];
DEFINE FIELD OVERWRITE aiEnabled         ON meeting TYPE bool DEFAULT true;
DEFINE FIELD OVERWRITE startedAt         ON meeting TYPE datetime DEFAULT time::now() READONLY;
DEFINE FIELD OVERWRITE endsAt            ON meeting TYPE datetime DEFAULT time::now() + 1h READONLY;
DEFINE FIELD OVERWRITE endedAt           ON meeting TYPE null | datetime DEFAULT null;
DEFINE FIELD OVERWRITE previousMeetingId ON meeting TYPE null | record<meeting> DEFAULT null;
DEFINE FIELD OVERWRITE runningSummary    ON meeting TYPE string DEFAULT '';
DEFINE FIELD OVERWRITE aiCursor          ON meeting TYPE null | record<transcript_line> DEFAULT null;
DEFINE FIELD OVERWRITE summary           ON meeting TYPE null | object FLEXIBLE DEFAULT null;
DEFINE FIELD OVERWRITE carryOver         ON meeting TYPE array<string> DEFAULT [];
DEFINE FIELD OVERWRITE usage             ON meeting TYPE object DEFAULT { calls: 0, inputTokens: 0, outputTokens: 0 };
DEFINE FIELD OVERWRITE usage.calls        ON meeting TYPE int DEFAULT 0;
DEFINE FIELD OVERWRITE usage.inputTokens  ON meeting TYPE int DEFAULT 0;
DEFINE FIELD OVERWRITE usage.outputTokens ON meeting TYPE int DEFAULT 0;
DEFINE FIELD OVERWRITE summaryError      ON meeting TYPE null | string DEFAULT null;

-- One row per project while it has a live meeting. Its id is the project id (live_meeting:<projectId>), so a
-- second live meeting can't be created: CREATE fails on an existing id.
DEFINE TABLE OVERWRITE live_meeting SCHEMAFULL;
DEFINE FIELD OVERWRITE meetingId ON live_meeting TYPE record<meeting>;

DEFINE TABLE OVERWRITE transcript_line SCHEMAFULL;
DEFINE FIELD OVERWRITE projectId ON transcript_line TYPE record<project>;
DEFINE FIELD OVERWRITE meetingId ON transcript_line TYPE record<meeting>;
DEFINE FIELD OVERWRITE speakerId ON transcript_line TYPE record<member>;
DEFINE FIELD OVERWRITE text      ON transcript_line TYPE string ASSERT string::len($value) > 0 AND string::len($value) <= 1000;
-- 'chat' lines were typed in the meeting chat; the AI and the summary read them like speech.
DEFINE FIELD OVERWRITE source    ON transcript_line TYPE string DEFAULT ALWAYS 'voice' ASSERT $value IN ['voice', 'chat'];
DEFINE FIELD OVERWRITE spokenAt  ON transcript_line TYPE datetime DEFAULT time::now() READONLY;
DEFINE INDEX OVERWRITE transcript_line_meeting_time ON transcript_line FIELDS meetingId, spokenAt;

DEFINE TABLE OVERWRITE poll SCHEMAFULL;
DEFINE FIELD OVERWRITE projectId          ON poll TYPE record<project>;
DEFINE FIELD OVERWRITE meetingId          ON poll TYPE null | record<meeting> DEFAULT null;
DEFINE FIELD OVERWRITE question           ON poll TYPE string ASSERT string::len($value) > 0 AND string::len($value) <= 160;
DEFINE FIELD OVERWRITE options            ON poll TYPE array<object> ASSERT array::len($value) >= 2 AND array::len($value) <= 5;
DEFINE FIELD OVERWRITE options.*.id       ON poll TYPE string;
DEFINE FIELD OVERWRITE options.*.label    ON poll TYPE string;
DEFINE FIELD OVERWRITE options.*.voterIds ON poll TYPE array<record<member>> DEFAULT [];
DEFINE FIELD OVERWRITE status             ON poll TYPE string ASSERT $value IN ['open', 'closed'];
DEFINE FIELD OVERWRITE createdById        ON poll TYPE record<member>;
DEFINE FIELD OVERWRITE sourceSuggestionId ON poll TYPE null | record<suggestion> DEFAULT null;
DEFINE FIELD OVERWRITE createdAt          ON poll TYPE datetime DEFAULT time::now() READONLY;
DEFINE FIELD OVERWRITE closedAt           ON poll TYPE null | datetime DEFAULT null;
