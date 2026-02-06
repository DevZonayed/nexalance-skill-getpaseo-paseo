import { stat } from "node:fs/promises";

export async function validateWorkingDirectoryExists(
  cwd: string
): Promise<void> {
  try {
    const cwdStats = await stat(cwd);
    if (!cwdStats.isDirectory()) {
      throw new Error(`Working directory is not a directory: ${cwd}`);
    }
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Working directory does not exist: ${cwd}`);
    }
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Failed to access working directory: ${cwd}`);
  }
}
