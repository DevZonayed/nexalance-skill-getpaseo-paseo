const fs = require("fs");
const path = require("path");

const EXECUTABLE_NAME = "Paseo";
const WRAPPER_MODE = 0o755;
const WRAPPER_SCRIPT = `#!/bin/bash
exec "$(dirname "$(readlink -f "$0")")/${EXECUTABLE_NAME}.bin" --no-sandbox "$@"
`;

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "linux") return;

  const chromeSandbox = path.join(context.appOutDir, "chrome-sandbox");
  if (fs.existsSync(chromeSandbox)) {
    fs.unlinkSync(chromeSandbox);
    console.log("Removed chrome-sandbox from Linux build");
  }

  const executablePath = path.join(context.appOutDir, EXECUTABLE_NAME);
  const wrappedBinaryPath = path.join(context.appOutDir, `${EXECUTABLE_NAME}.bin`);

  if (!fs.existsSync(wrappedBinaryPath)) {
    if (!fs.existsSync(executablePath)) {
      throw new Error(`Expected Linux executable at ${executablePath}`);
    }

    fs.renameSync(executablePath, wrappedBinaryPath);
    console.log(`Renamed ${EXECUTABLE_NAME} to ${EXECUTABLE_NAME}.bin for Linux wrapper`);
  }

  fs.writeFileSync(executablePath, WRAPPER_SCRIPT, { mode: WRAPPER_MODE });
  fs.chmodSync(executablePath, WRAPPER_MODE);
  console.log(`Created Linux wrapper for ${EXECUTABLE_NAME} with --no-sandbox`);
};
