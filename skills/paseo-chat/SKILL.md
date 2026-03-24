---
name: paseo-chat
description: Use chat rooms through a chat helper. Use when the user says "chat room", "room", "coordinate through chat", "shared mailbox", or wants agents to communicate asynchronously.
user-invocable: true
---

# Paseo Chat Skill

This skill teaches how to use chat.

Use `skills/paseo-chat/bin/chat.sh`.

**User's arguments:** $ARGUMENTS

---

## Prerequisites

Load the **Paseo skill** first if you need CLI guidance for launching or messaging agents.

## Rules

When using chat:
- create a room with `chat.sh room create` if you need a new room
- inspect available rooms with `chat.sh room list` and `chat.sh room show`
- post with `chat.sh post`
- read with `chat.sh read`
- keep reads bounded, usually `--limit 10` or `--limit 20`
- check chat often while working

Do not read or write the backing files directly. Use `chat.sh`.

Mentions and replies are active:
- if you post `@agent-id` in a message, chat will notify that agent immediately
- if you post `@everyone`, chat will notify every agent that has already participated in that room, as if you had tagged each of them directly
- if you use `--reply-to`, chat will notify the author of the replied-to message immediately
- notifications are sent with `paseo send --no-wait`

## Command Surface

### Create a room

```bash
skills/paseo-chat/bin/chat.sh room create \
  --room issue-456 \
  --title "Issue 456 coordination" \
  --purpose "Coordinate implementation and review"
```

### List rooms

```bash
skills/paseo-chat/bin/chat.sh room list
```

### Show room details

```bash
skills/paseo-chat/bin/chat.sh room show --room issue-456
```

### Post a message

```bash
skills/paseo-chat/bin/chat.sh post \
  --room issue-456 \
  --body "I traced the failure to relay auth. Investigating config loading now."
```

Author defaults:
- `--agent-id` if provided
- otherwise `$PASEO_AGENT_ID`
- otherwise `manual`

Optional reply:

```bash
skills/paseo-chat/bin/chat.sh post \
  --room issue-456 \
  --reply-to msg-001 \
  --body "I can take that next."
```

Direct mention:

```bash
skills/paseo-chat/bin/chat.sh post \
  --room issue-456 \
  --body "@agent-beta can you verify the relay path next?"
```

Notify the whole room:

```bash
skills/paseo-chat/bin/chat.sh post \
  --room issue-456 \
  --body "@everyone I need each of you to weigh in on whether we should cut scope or keep the full fix."
```

### Read recent messages

```bash
skills/paseo-chat/bin/chat.sh read --room issue-456 --limit 10
```

### Filter reads

```bash
skills/paseo-chat/bin/chat.sh read --room issue-456 --agent-id 123abc
skills/paseo-chat/bin/chat.sh read --room issue-456 --since 2026-03-24T10:00:00Z
```

## Defaults

When creating a room:
- choose a short explicit room id
- prefer slugs like `issue-456`, `pr-143-review`, `feature/relay-cleanup`
- give the room a clear title and purpose

When using a room:
- read only a bounded window before acting
- post updates when they would help another agent or your future self
- use `--reply-to` when responding to a specific message
- use `@agent-id` when you want to get a specific agent's attention
- use `@everyone` sparingly when you want all prior participants in the room to respond or re-check the thread
- prefer `@agent-id` most of the time so you only interrupt the agents who actually need the message
- check chat frequently enough that shared coordination actually works

Typical things to post:
- status updates
- blockers
- handoffs
- review findings
- important context and memories another agent may need later

Good use of `@everyone`:
- you need opinions or explicit responses from the whole team
- the room has shared context and each participant should re-check it now

Avoid `@everyone` when:
- only one or two agents need to act
- different agents are doing different jobs and you do not want to interrupt all of them
- a normal post is enough because no immediate response is needed

## Your Job

1. Understand whether you should use an existing room or create a new one
2. Choose a room id and title
3. Create the room with `chat.sh room create` if needed
4. Read the room with bounded history
5. Post clearly
6. Use `--reply-to` when replying to a specific message
7. Use `@agent-id` when you want to notify someone directly
8. Use `@everyone` only when you intentionally want to notify the full room and prompt a broad response
