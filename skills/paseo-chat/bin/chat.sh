#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  chat.sh room create --room ROOM [--title TITLE] [--purpose PURPOSE]
  chat.sh room list
  chat.sh room show --room ROOM
  chat.sh post --room ROOM (--body TEXT | --body-file PATH) [--agent-id ID] [--agent-name NAME] [--reply-to MESSAGE_ID]
  chat.sh read --room ROOM [--limit N] [--since MESSAGE_ID|ISO_TIMESTAMP] [--agent-id ID]
  chat.sh wait --room ROOM [--since MESSAGE_ID] [--timeout SECONDS]

Options:
  --root PATH   Override chat root (default: ~/.paseo/chat)
EOF
  exit 1
}

yaml_quote() {
  local value="${1//\'/\'\'}"
  printf "'%s'" "$value"
}

require_command() {
  local name="$1"
  command -v "$name" >/dev/null 2>&1 || {
    echo "Error: required command not found: $name" >&2
    exit 1
  }
}

sanitize_room_path() {
  local room="$1"
  if [[ -z "$room" || "$room" == /* || "$room" == *".."* ]]; then
    echo "Error: invalid room id: $room" >&2
    exit 1
  fi
}

load_body() {
  local inline_value="$1"
  local file_value="$2"

  if [[ -n "$inline_value" && -n "$file_value" ]]; then
    echo "Error: use either --body or --body-file, not both" >&2
    exit 1
  fi

  if [[ -n "$file_value" ]]; then
    [[ -f "$file_value" ]] || { echo "Error: --body-file not found: $file_value" >&2; exit 1; }
    cat "$file_value"
    return
  fi

  if [[ -n "$inline_value" ]]; then
    printf '%s' "$inline_value"
    return
  fi

  echo "Error: one of --body or --body-file is required" >&2
  exit 1
}

frontmatter_value() {
  local key="$1"
  local file="$2"
  awk -F': ' -v search_key="$key" '
    BEGIN { in_frontmatter = 0 }
    /^---$/ {
      if (in_frontmatter == 0) {
        in_frontmatter = 1
        next
      }
      exit
    }
    in_frontmatter == 1 && $1 == search_key {
      value = substr($0, length(search_key) + 3)
      gsub(/^'\''|'\''$/, "", value)
      print value
      exit
    }
  ' "$file"
}

message_body() {
  local file="$1"
  awk '
    BEGIN { delim_count = 0 }
    /^---$/ {
      delim_count += 1
      next
    }
    delim_count >= 2 {
      print
    }
  ' "$file"
}

message_preview() {
  local file="$1"
  local max_length="${2:-100}"
  local preview

  preview="$(
    message_body "$file" |
      awk 'NF { print; exit }' |
      tr -s '[:space:]' ' ' |
      sed 's/^ //; s/ $//'
  )"

  if [[ ${#preview} -gt "$max_length" ]]; then
    preview="${preview:0:$((max_length - 3))}..."
  fi

  printf '%s' "$preview"
}

format_timestamp() {
  local ts="$1"
  local time_part="${ts#*T}"
  time_part="${time_part%Z}"
  local date_part="${ts%%T*}"
  printf '%s %s' "$date_part" "$time_part"
}

print_message() {
  local file="$1"
  local created_at agent_id agent_name reply_to message_id
  created_at="$(frontmatter_value "created_at" "$file")"
  agent_id="$(frontmatter_value "agent_id" "$file")"
  agent_name="$(frontmatter_value "agent_name" "$file")"
  reply_to="$(frontmatter_value "reply_to" "$file")"
  message_id="$(frontmatter_value "message_id" "$file")"

  local display_time
  display_time="$(format_timestamp "$created_at")"

  local author
  if [[ -n "$agent_name" ]]; then
    author="$agent_name ($agent_id)"
  else
    author="$agent_id"
  fi

  printf '┌─ %s ── %s ── [%s]' "$author" "$display_time" "$message_id"
  if [[ -n "$reply_to" ]]; then
    printf ' ↩ %s' "$reply_to"
  fi
  printf '\n'
  printf '│\n'

  message_body "$file" | sed '/./,$!d' | while IFS= read -r line; do
    printf '│  %s\n' "$line"
  done

  printf '│\n'
  printf '└─\n'
}

require_room() {
  local room="$1"
  local room_dir="$rooms_root/$room"
  [[ -d "$room_dir" ]] || { echo "Error: room not found: $room" >&2; exit 1; }
}

find_message_file_by_id() {
  local room="$1"
  local message_id="$2"
  find "$rooms_root/$room/messages" -name '*.md' -type f -print0 |
    while IFS= read -r -d '' file; do
      if [[ "$(frontmatter_value "message_id" "$file")" == "$message_id" ]]; then
        printf '%s\n' "$file"
        return 0
      fi
    done
}

message_files_sorted() {
  local room="$1"
  find "$rooms_root/$room/messages" -name '*.md' -type f | sort
}

print_message_files() {
  local files=("$@")

  if [[ ${#files[@]} -eq 0 ]]; then
    return
  fi

  local index
  for ((index = 0; index < ${#files[@]}; index += 1)); do
    print_message "${files[$index]}"
    if [[ $index -lt $((${#files[@]} - 1)) ]]; then
      printf '\n'
    fi
  done
}

extract_mentions() {
  local body="$1"
  printf '%s\n' "$body" | grep -oE '@[A-Za-z0-9._:-]+' | sed 's/^@//' | awk '!seen[$0]++'
}

room_participant_ids() {
  local room="$1"
  find "$rooms_root/$room/messages" -name '*.md' -type f | sort |
    while IFS= read -r file; do
      frontmatter_value "agent_id" "$file"
    done |
    awk 'NF && $0 != "manual" && !seen[$0]++'
}

agent_is_archived() {
  local target_agent_id="$1"
  local archived_at

  archived_at="$("$paseo_bin" inspect "$target_agent_id" --json 2>/dev/null | jq -r '.ArchivedAt // empty' 2>/dev/null)" || archived_at=""
  [[ -n "$archived_at" ]]
}

notify_agent() {
  local target_agent_id="$1"
  local room="$2"
  local sender_agent_id="$3"
  local sender_agent_name="$4"
  local message_id="$5"
  local reason="$6"
  local message_file="$7"

  if [[ -z "$target_agent_id" || "$target_agent_id" == "manual" || "$target_agent_id" == "$sender_agent_id" ]]; then
    return
  fi

  if agent_is_archived "$target_agent_id"; then
    return
  fi

  local sender_label
  if [[ -n "$sender_agent_name" ]]; then
    sender_label="$sender_agent_name ($sender_agent_id)"
  else
    sender_label="$sender_agent_id"
  fi

  local notification full_message
  notification="You have a new chat message.

Room: $room
From: $sender_label
Message ID: $message_id
Reason: $reason"

  full_message="$(message_body "$message_file")"
  if [[ -n "$full_message" ]]; then
    notification="${notification}

---

$full_message"
  fi

  notification="${notification}

-----"

  "$paseo_bin" send --no-wait "$target_agent_id" "$notification" >/dev/null 2>&1 || true
}

require_command uuidgen

chat_root="${HOME}/.paseo/chat"
paseo_bin="${PASEO_CHAT_PASEO_BIN:-paseo}"

if [[ $# -lt 1 ]]; then
  usage
fi

if [[ "$1" == "--root" ]]; then
  [[ $# -ge 3 ]] || usage
  chat_root="$2"
  shift 2
fi

rooms_root="${chat_root}/rooms"
mkdir -p "$rooms_root"

command_name="$1"
shift

case "$command_name" in
  room)
    [[ $# -ge 1 ]] || usage
    room_subcommand="$1"
    shift

    case "$room_subcommand" in
      create)
        room=""
        title=""
        purpose=""

        while [[ $# -gt 0 ]]; do
          case "$1" in
            --room) room="$2"; shift 2 ;;
            --title) title="$2"; shift 2 ;;
            --purpose) purpose="$2"; shift 2 ;;
            *) echo "Unknown option: $1" >&2; usage ;;
          esac
        done

        [[ -n "$room" ]] || { echo "Error: --room is required" >&2; exit 1; }
        sanitize_room_path "$room"

        room_dir="$rooms_root/$room"
        messages_dir="$room_dir/messages"
        mkdir -p "$messages_dir"

        if [[ -z "$title" ]]; then
          title="$room"
        fi

        created_at="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
        room_file="$room_dir/room.md"
        if [[ ! -f "$room_file" ]]; then
          printf '%s\n' \
            "---" \
            "room: $(yaml_quote "$room")" \
            "title: $(yaml_quote "$title")" \
            "purpose: $(yaml_quote "$purpose")" \
            "created_at: $(yaml_quote "$created_at")" \
            "---" \
            "" \
            "# $(printf '%s' "$title")" \
            "" \
            "$(printf '%s' "$purpose")" > "$room_file"
        fi

        printf 'created room %s\n' "$room"
        ;;

      list)
        while IFS= read -r room_file; do
          room_id="${room_file#"$rooms_root"/}"
          room_id="${room_id%/room.md}"
          printf '%s\n' "$room_id"
        done < <(find "$rooms_root" -name room.md -type f | sort)
        ;;

      show)
        room=""
        while [[ $# -gt 0 ]]; do
          case "$1" in
            --room) room="$2"; shift 2 ;;
            *) echo "Unknown option: $1" >&2; usage ;;
          esac
        done

        [[ -n "$room" ]] || { echo "Error: --room is required" >&2; exit 1; }
        sanitize_room_path "$room"
        require_room "$room"

        room_file="$rooms_root/$room/room.md"
        title="$(frontmatter_value "title" "$room_file")"
        purpose="$(frontmatter_value "purpose" "$room_file")"
        created_at="$(frontmatter_value "created_at" "$room_file")"
        message_count="$(find "$rooms_root/$room/messages" -name '*.md' -type f | wc -l | tr -d ' ')"

        printf 'room: %s\n' "$room"
        printf 'title: %s\n' "$title"
        printf 'purpose: %s\n' "$purpose"
        printf 'created_at: %s\n' "$created_at"
        printf 'messages: %s\n' "$message_count"
        ;;

      *)
        usage
        ;;
    esac
    ;;

  post)
    room=""
    body_input=""
    body_file=""
    agent_id="${PASEO_AGENT_ID:-manual}"
    agent_name=""
    reply_to=""
    auto_resolve_name=true

    while [[ $# -gt 0 ]]; do
      case "$1" in
        --room) room="$2"; shift 2 ;;
        --body) body_input="$2"; shift 2 ;;
        --body-file) body_file="$2"; shift 2 ;;
        --agent-id) agent_id="$2"; shift 2 ;;
        --agent-name) agent_name="$2"; auto_resolve_name=false; shift 2 ;;
        --reply-to) reply_to="$2"; shift 2 ;;
        *) echo "Unknown option: $1" >&2; usage ;;
      esac
    done

    [[ -n "$room" ]] || { echo "Error: --room is required" >&2; exit 1; }
    sanitize_room_path "$room"
    require_room "$room"

    if [[ "$auto_resolve_name" == true && -z "$agent_name" && "$agent_id" != "manual" ]]; then
      agent_name="$("$paseo_bin" inspect "$agent_id" --json 2>/dev/null | jq -r '.Name // empty' 2>/dev/null)" || agent_name=""
    fi

    body="$(load_body "$body_input" "$body_file")"

    created_at="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
    created_at_file="$(date -u +'%Y-%m-%dT%H-%M-%SZ')"
    message_id="msg-$(uuidgen | tr '[:upper:]' '[:lower:]' | tr -d '-' | cut -c1-8)"
    agent_slug="$(printf '%s' "$agent_id" | tr '/ :@' '_' | tr -cd '[:alnum:]_.-')"
    [[ -n "$agent_slug" ]] || agent_slug="manual"
    message_file="$rooms_root/$room/messages/${created_at_file}__${agent_slug}__${message_id}.md"

    printf '%s\n' \
      "---" \
      "room: $(yaml_quote "$room")" \
      "message_id: $(yaml_quote "$message_id")" \
      "agent_id: $(yaml_quote "$agent_id")" \
      "agent_name: $(yaml_quote "$agent_name")" \
      "created_at: $(yaml_quote "$created_at")" \
      "reply_to: $(yaml_quote "$reply_to")" \
      "---" \
      "" \
      "$body" > "$message_file"

    notified_agents=()
    if [[ -n "$reply_to" ]]; then
      reply_file="$(find_message_file_by_id "$room" "$reply_to" || true)"
      if [[ -n "$reply_file" ]]; then
        reply_target_agent_id="$(frontmatter_value "agent_id" "$reply_file")"
        notify_agent "$reply_target_agent_id" "$room" "$agent_id" "$agent_name" "$message_id" "reply to $reply_to" "$message_file"
        notified_agents+=("$reply_target_agent_id")
      fi
    fi

    while IFS= read -r mentioned_agent_id; do
      [[ -n "$mentioned_agent_id" ]] || continue
      if [[ "$mentioned_agent_id" == "everyone" ]]; then
        while IFS= read -r participant_agent_id; do
          [[ -n "$participant_agent_id" ]] || continue
          already_notified=false
          for existing_id in "${notified_agents[@]}"; do
            if [[ "$existing_id" == "$participant_agent_id" ]]; then
              already_notified=true
              break
            fi
          done
          if [[ "$already_notified" == false ]]; then
            notify_agent "$participant_agent_id" "$room" "$agent_id" "$agent_name" "$message_id" "@everyone mention" "$message_file"
            notified_agents+=("$participant_agent_id")
          fi
        done < <(room_participant_ids "$room")
        continue
      fi

      already_notified=false
      for existing_id in "${notified_agents[@]}"; do
        if [[ "$existing_id" == "$mentioned_agent_id" ]]; then
          already_notified=true
          break
        fi
      done
      if [[ "$already_notified" == false ]]; then
        notify_agent "$mentioned_agent_id" "$room" "$agent_id" "$agent_name" "$message_id" "direct mention" "$message_file"
        notified_agents+=("$mentioned_agent_id")
      fi
    done < <(extract_mentions "$body")

    printf '%s\n' "$message_id"
    ;;

  read)
    room=""
    limit="20"
    since=""
    agent_id_filter=""

    while [[ $# -gt 0 ]]; do
      case "$1" in
        --room) room="$2"; shift 2 ;;
        --limit) limit="$2"; shift 2 ;;
        --since) since="$2"; shift 2 ;;
        --agent-id) agent_id_filter="$2"; shift 2 ;;
        *) echo "Unknown option: $1" >&2; usage ;;
      esac
    done

    [[ -n "$room" ]] || { echo "Error: --room is required" >&2; exit 1; }
    sanitize_room_path "$room"
    require_room "$room"

    mapfile -t all_files < <(message_files_sorted "$room")

    since_file=""
    if [[ -n "$since" ]]; then
      if [[ "$since" == msg-* ]]; then
        since_file="$(find_message_file_by_id "$room" "$since" || true)"
        [[ -n "$since_file" ]] || { echo "Error: message not found: $since" >&2; exit 1; }
      fi
    fi

    filtered_files=()
    past_since=false
    if [[ -z "$since" ]]; then
      past_since=true
    fi

    for file in "${all_files[@]}"; do
      if [[ -n "$since_file" ]]; then
        if [[ "$file" == "$since_file" ]]; then
          past_since=true
          continue
        fi
        if [[ "$past_since" != true ]]; then
          continue
        fi
      elif [[ -n "$since" ]]; then
        created_at="$(frontmatter_value "created_at" "$file")"
        if [[ "$created_at" < "$since" ]]; then
          continue
        fi
      fi

      file_agent_id="$(frontmatter_value "agent_id" "$file")"
      if [[ -n "$agent_id_filter" && "$file_agent_id" != "$agent_id_filter" ]]; then
        continue
      fi

      filtered_files+=("$file")
    done

    start_index=0
    if [[ "$limit" != "all" ]]; then
      if ! [[ "$limit" =~ ^[0-9]+$ ]]; then
        echo "Error: --limit must be a number or 'all'" >&2
        exit 1
      fi
      if [[ "${#filtered_files[@]}" -gt "$limit" ]]; then
        start_index=$((${#filtered_files[@]} - limit))
      fi
    fi

    print_message_files "${filtered_files[@]:$start_index}"
    ;;

  wait)
    room=""
    since_message_id=""
    timeout_seconds=""
    poll_interval_seconds="1"

    while [[ $# -gt 0 ]]; do
      case "$1" in
        --room) room="$2"; shift 2 ;;
        --since) since_message_id="$2"; shift 2 ;;
        --timeout) timeout_seconds="$2"; shift 2 ;;
        *) echo "Unknown option: $1" >&2; usage ;;
      esac
    done

    [[ -n "$room" ]] || { echo "Error: --room is required" >&2; exit 1; }
    sanitize_room_path "$room"
    require_room "$room"

    if [[ -n "$timeout_seconds" ]] && ! [[ "$timeout_seconds" =~ ^[0-9]+$ ]]; then
      echo "Error: --timeout must be a number" >&2
      exit 1
    fi

    baseline_file=""
    if [[ -n "$since_message_id" ]]; then
      baseline_file="$(find_message_file_by_id "$room" "$since_message_id" || true)"
      [[ -n "$baseline_file" ]] || { echo "Error: message not found: $since_message_id" >&2; exit 1; }
    else
      while IFS= read -r file; do
        baseline_file="$file"
      done < <(message_files_sorted "$room")
    fi

    started_at="$(date +%s)"
    trap 'exit 130' INT TERM

    while true; do
      mapfile -t all_files < <(message_files_sorted "$room")
      new_files=()
      after_baseline=false

      if [[ -z "$baseline_file" ]]; then
        after_baseline=true
      fi

      for file in "${all_files[@]}"; do
        if [[ "$after_baseline" == true ]]; then
          new_files+=("$file")
          continue
        fi

        if [[ "$file" == "$baseline_file" ]]; then
          after_baseline=true
        fi
      done

      if [[ ${#new_files[@]} -gt 0 ]]; then
        print_message_files "${new_files[@]}"
        exit 0
      fi

      if [[ -n "$timeout_seconds" ]]; then
        now="$(date +%s)"
        if (( now - started_at >= timeout_seconds )); then
          exit 124
        fi
      fi

      sleep "$poll_interval_seconds"
    done
    ;;

  *)
    usage
    ;;
esac
