import { describe, expect, it } from "vitest";
import { parseCliSymlinkInstructions } from "./managed-runtime";

describe("parseCliSymlinkInstructions", () => {
  it("parses CLI symlink instructions from the desktop backend", () => {
    expect(
      parseCliSymlinkInstructions({
        title: "Add paseo to your shell",
        detail: "Create a symlink to the Paseo desktop executable.",
        commands: "sudo ln -sf /Applications/Paseo.app/Contents/MacOS/Paseo /usr/local/bin/paseo",
      })
    ).toEqual({
      title: "Add paseo to your shell",
      detail: "Create a symlink to the Paseo desktop executable.",
      commands: "sudo ln -sf /Applications/Paseo.app/Contents/MacOS/Paseo /usr/local/bin/paseo",
    });
  });

  it("rejects non-object payloads", () => {
    expect(() => parseCliSymlinkInstructions(null)).toThrow(
      "Unexpected CLI symlink instructions response."
    );
  });
});
