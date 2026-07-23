# HackLearn & Report Bot — Bot specification

**Archetype:** education

**Voice:** professional and encouraging — write every user-facing message, button label, error, and empty state in this voice.

A Telegram bot for ethical hacking and IT software engineering education, offering interactive lessons with quizzes and secure vulnerability/report submission tracking. Users progress through learning tracks while owners receive and manage technical reports with status tracking.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- individual learners (students, junior engineers)
- security/IT teams managing technical reports

## Success criteria

- Users complete lesson tracks with certificates
- Owners receive and resolve 90%+ submitted reports within 72h
- Quiz scores track learning progress

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open main menu with Learn/Report buttons
- **Start Learning** (button, actor: user, callback: learn:select_topic) — Begin interactive lessons
  - inputs: topic selection
  - outputs: lesson content, quiz interface
- **Submit Report** (button, actor: user, callback: report:start) — Initiate vulnerability/report submission flow
  - inputs: report type, description
  - outputs: report confirmation, tracking ID
- **/my_reports** (command, actor: user, command: /my_reports) — View submission history and statuses

## Flows

### Learning Session
_Trigger:_ learn:select_topic

1. Topic selection
2. Lesson display
3. Quiz attempt
4. Score feedback
5. Progress update

_Data touched:_ Lesson, Quiz Attempt, User Progress

### Report Submission
_Trigger:_ report:start

1. Form input (type/title)
2. Steps to reproduce
3. Severity tagging
4. Attachment upload
5. Preview confirmation

_Data touched:_ Report

### Owner Report Management
_Trigger:_ owner:report_alert

1. Telegram notification
2. Report thread opening
3. Status update
4. Private note addition

_Data touched:_ Report

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

- **User** _(retention: persistent)_ — Registered learner or owner profile
  - fields: telegram_id, display_name, role, email (optional), progress
- **Report** _(retention: persistent)_ — Submitted vulnerability/lab result
  - fields: type, description, severity, status, attachments
- **Lesson** _(retention: persistent)_ — Structured learning content
  - fields: title, content, exercises
- **Quiz Attempt** _(retention: persistent)_ — User quiz performance
  - fields: answers, score, timestamp

## Integrations

- **Telegram** (required) — Primary messaging and authentication
- **Email (optional)** (optional) — Critical alert fallback
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- View and manage report statuses
- Access aggregated learning metrics
- Configure notification channels
- Manage user roles

## Notifications

- New report alerts to owner channels
- Report status change confirmations
- Quiz completion progress updates

## Permissions & privacy

- Telegram account-linked authentication with optional email/PIN recovery
- Report attachments limited to images/text files only
- All user data encrypted at rest

## Edge cases

- Invalid quiz answers handling
- Large attachment file rejection
- Concurrent report status updates
- Unauthenticated user access attempts

## Required tests

- End-to-end learning session flow with quiz scoring
- Report submission-to-resolution workflow
- Owner notification and status update handling
- Data persistence across sessions

## Assumptions

- Quiz starts with multiple-choice/text answers only
- Email integration requires separate configuration
- Certificate generation uses predefined templates
