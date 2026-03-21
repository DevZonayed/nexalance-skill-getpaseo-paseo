import { Command } from "commander";
import { runModeCommand } from "./mode.js";
import { runArchiveCommand } from "./archive.js";
import { runDeleteCommand } from "./delete.js";
import { runLsCommand } from "./ls.js";
import { runRunCommand } from "./run.js";
import { runLogsCommand } from "./logs.js";
import { runStopCommand } from "./stop.js";
import { runSendCommand } from "./send.js";
import { runInspectCommand } from "./inspect.js";
import { runWaitCommand } from "./wait.js";
import { runAttachCommand } from "./attach.js";
import { runUpdateCommand } from "./update.js";
import { withOutput } from "../../output/index.js";
import {
  addDaemonHostOption,
  addJsonAndDaemonHostOptions,
  collectMultiple,
} from "../../utils/command-options.js";

export function createAgentCommand(): Command {
  const agent = new Command("agent").description("Manage agents (advanced operations)");

  // Primary agent commands (same as top-level)
  addJsonAndDaemonHostOptions(
    agent
      .command("ls")
      .description("List agents. By default excludes archived agents.")
      .option("-a, --all", "Include archived agents")
      .option("-g, --global", "Legacy no-op (kept for compatibility)")
      .option(
        "--label <key=value>",
        "Filter by label (can be used multiple times)",
        collectMultiple,
        [],
      )
      .option("--thinking <id>", "Filter by thinking option ID"),
  ).action(withOutput(runLsCommand));

  addJsonAndDaemonHostOptions(
    agent
      .command("run")
      .description("Create and start an agent with a task")
      .argument("<prompt>", "The task/prompt for the agent")
      .option("-d, --detach", "Run in background (detached)")
      .option("--name <name>", "Assign a name/title to the agent")
      .option(
        "--provider <provider>",
        "Agent provider, or provider/model (e.g. codex or codex/gpt-5.4)",
        "claude",
      )
      .option(
        "--model <model>",
        "Model to use (e.g., claude-sonnet-4-20250514, claude-3-5-haiku-20241022)",
      )
      .option("--thinking <id>", "Thinking option ID to use for this run")
      .option("--mode <mode>", "Provider-specific mode (e.g., plan, default, bypass)")
      .option("--cwd <path>", "Working directory (default: current)")
      .option(
        "--label <key=value>",
        "Add label(s) to the agent (can be used multiple times)",
        collectMultiple,
        [],
      )
      .option(
        "--wait-timeout <duration>",
        "Maximum time to wait for agent to finish (e.g., 30s, 5m, 1h). Default: no limit",
      )
      .option(
        "--output-schema <schema>",
        "Output JSON matching the provided schema file path or inline JSON schema",
      ),
  ).action(withOutput(runRunCommand));

  addDaemonHostOption(
    agent
      .command("attach")
      .description("Attach to a running agent's output stream")
      .argument("<id>", "Agent ID (or prefix)"),
  ).action(runAttachCommand);

  addDaemonHostOption(
    agent
      .command("logs")
      .description("View agent activity/timeline")
      .argument("<id>", "Agent ID (or prefix)")
      .option("-f, --follow", "Follow log output (streaming)")
      .option("--tail <n>", "Show last n entries")
      .option("--filter <type>", "Filter by event type (tools, text, errors, permissions)"),
  ).action(runLogsCommand);

  addJsonAndDaemonHostOptions(
    agent
      .command("stop")
      .description("Interrupt an agent if it is running (no-op for idle agents)")
      .argument("[id]", "Agent ID (or prefix) - optional if --all or --cwd specified")
      .option("--all", "Stop all agents")
      .option("--cwd <path>", "Stop all agents in directory"),
  ).action(withOutput(runStopCommand));

  addJsonAndDaemonHostOptions(
    agent
      .command("delete")
      .description("Delete an agent (interrupt if running, then hard-delete)")
      .argument("[id]", "Agent ID (or prefix) - optional if --all or --cwd specified")
      .option("--all", "Delete all agents")
      .option("--cwd <path>", "Delete all agents in directory"),
  ).action(withOutput(runDeleteCommand));

  addJsonAndDaemonHostOptions(
    agent
      .command("send")
      .description("Send a message/task to an existing agent")
      .argument("<id>", "Agent ID (or prefix)")
      .argument("[prompt]", "The message to send")
      .option("--prompt <text>", "Provide the message inline as a flag")
      .option("--prompt-file <path>", "Read the message from a UTF-8 text file")
      .option("--no-wait", "Return immediately without waiting for completion"),
  ).action(withOutput(runSendCommand));

  addJsonAndDaemonHostOptions(
    agent
      .command("inspect")
      .description("Show detailed information about an agent")
      .argument("<id>", "Agent ID (or prefix)"),
  ).action(withOutput(runInspectCommand));

  addJsonAndDaemonHostOptions(
    agent
      .command("wait")
      .description("Wait for an agent to become idle")
      .argument("<id>", "Agent ID (or prefix)")
      .option("--timeout <seconds>", "Maximum wait time (default: no limit)"),
  ).action(withOutput(runWaitCommand));

  // Advanced agent commands (less common operations)
  addJsonAndDaemonHostOptions(
    agent
      .command("mode")
      .description("Change an agent's operational mode")
      .argument("<id>", "Agent ID (or prefix)")
      .argument("[mode]", "Mode to set (required unless --list)")
      .option("--list", "List available modes for this agent"),
  ).action(withOutput(runModeCommand));

  addJsonAndDaemonHostOptions(
    agent
      .command("archive")
      .description("Archive an agent (soft-delete)")
      .argument("<id>", "Agent ID, prefix, or name")
      .option("--force", "Force archive running agent (interrupts active run first)"),
  ).action(withOutput(runArchiveCommand));

  addJsonAndDaemonHostOptions(
    agent
      .command("update")
      .description("Update an agent's metadata")
      .argument("<id>", "Agent ID (or prefix)")
      .option("--name <name>", "Update the agent's display name")
      .option(
        "--label <label>",
        "Add/set label(s) on the agent (can be used multiple times or comma-separated)",
        collectMultiple,
        [],
      ),
  ).action(withOutput(runUpdateCommand));

  return agent;
}
