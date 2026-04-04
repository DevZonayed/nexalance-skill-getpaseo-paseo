import { createCli } from "./cli.js";
import { openDesktopWithProject, shouldOpenProjectArg } from "./commands/open.js";

const program = createCli();
const knownCommands = new Set(program.commands.map((command) => command.name()));

const firstArg = process.argv[2];
if (firstArg && shouldOpenProjectArg({ arg: firstArg, knownCommands })) {
  await openDesktopWithProject(firstArg);
} else {
  if (process.argv.length <= 2) {
    process.argv.push("onboard");
  }
  program.parse(process.argv, { from: "node" });
}
