const fs = require("fs");
const path = require("path");

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "linux") return;

  const chromeSandbox = path.join(context.appOutDir, "chrome-sandbox");
  if (fs.existsSync(chromeSandbox)) {
    fs.unlinkSync(chromeSandbox);
    console.log("Removed chrome-sandbox from Linux build");
  }
};
