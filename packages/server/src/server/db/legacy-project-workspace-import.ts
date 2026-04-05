import path from "node:path";
import { promises as fs } from "node:fs";

import { count } from "drizzle-orm";
import type { Logger } from "pino";

import { z } from "zod";

import type { PaseoDatabaseHandle } from "./sqlite-database.js";
import { projects, workspaces } from "./schema.js";

// Legacy JSON schemas — these match the old pre-migration format
const LegacyProjectSchema = z.object({
  projectId: z.string(),
  rootPath: z.string(),
  kind: z.string(),
  displayName: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  archivedAt: z.string().nullable(),
});

const LegacyWorkspaceSchema = z.object({
  workspaceId: z.string(),
  projectId: z.string(),
  cwd: z.string(),
  kind: z.string(),
  displayName: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  archivedAt: z.string().nullable(),
});

export type LegacyProjectWorkspaceImportResult =
  | {
      status: "imported";
      importedProjects: number;
      importedWorkspaces: number;
    }
  | {
      status: "skipped";
      reason: "database-not-empty" | "no-legacy-files";
    };

export async function importLegacyProjectWorkspaceJson(options: {
  db: PaseoDatabaseHandle["db"];
  paseoHome: string;
  logger: Logger;
}): Promise<LegacyProjectWorkspaceImportResult> {
  const projectsPath = path.join(options.paseoHome, "projects", "projects.json");
  const workspacesPath = path.join(options.paseoHome, "projects", "workspaces.json");
  const databaseHasRows = await hasAnyProjectWorkspaceRows(options.db);

  if (databaseHasRows) {
    options.logger.info("Skipping legacy project/workspace JSON import because the DB is not empty");
    return {
      status: "skipped",
      reason: "database-not-empty",
    };
  }

  const [projectsExists, workspacesExists] = await Promise.all([
    pathExists(projectsPath),
    pathExists(workspacesPath),
  ]);
  if (!projectsExists && !workspacesExists) {
    options.logger.info("Skipping legacy project/workspace JSON import because no legacy files exist");
    return {
      status: "skipped",
      reason: "no-legacy-files",
    };
  }

  await backupLegacyProjectWorkspaceJson({
    projectsPath,
    workspacesPath,
    paseoHome: options.paseoHome,
    logger: options.logger,
  });

  const [projectRows, workspaceRows] = await Promise.all([
    readLegacyProjects(projectsPath),
    readLegacyWorkspaces(workspacesPath),
  ]);

  if (projectRows.length === 0 && workspaceRows.length === 0) {
    options.logger.info("Skipping legacy project/workspace JSON import because no legacy files exist");
    return {
      status: "skipped",
      reason: "no-legacy-files",
    };
  }

  const dedupedProjects = [...new Map(projectRows.map((project) => [project.rootPath, project])).values()];
  const dedupedWorkspaces = [...new Map(workspaceRows.map((workspace) => [workspace.cwd, workspace])).values()];

  options.logger.info(
    { projects: dedupedProjects.length, workspaces: dedupedWorkspaces.length },
    "Starting legacy project/workspace import",
  );

  options.db.transaction((tx) => {
    // Insert projects, mapping old format to new schema
    const projectDirectoryToId = new Map<string, number>();
    for (const legacy of dedupedProjects) {
      const row = tx
        .insert(projects)
        .values({
          directory: legacy.rootPath,
          displayName: legacy.displayName,
          kind: legacy.kind === "non_git" ? "directory" : legacy.kind,
          createdAt: legacy.createdAt,
          updatedAt: legacy.updatedAt,
          archivedAt: legacy.archivedAt,
        })
        .returning({ id: projects.id })
        .get();
      projectDirectoryToId.set(legacy.rootPath, row!.id);
    }

    // Build a map from legacy projectId -> new integer id
    const legacyProjectIdToNewId = new Map<string, number>();
    for (const legacy of projectRows) {
      const newId = projectDirectoryToId.get(legacy.rootPath);
      if (newId !== undefined) {
        legacyProjectIdToNewId.set(legacy.projectId, newId);
      }
    }

    // Insert workspaces, resolving project FK
    for (const legacy of dedupedWorkspaces) {
      const projectId = legacyProjectIdToNewId.get(legacy.projectId);
      if (projectId === undefined) {
        throw new Error(`Legacy workspace ${legacy.workspaceId} references unknown project ${legacy.projectId}`);
      }
      tx
        .insert(workspaces)
        .values({
          projectId,
          directory: legacy.cwd,
          displayName: legacy.displayName,
          kind:
            legacy.kind === "local_checkout" || legacy.kind === "directory"
              ? "checkout"
              : legacy.kind,
          createdAt: legacy.createdAt,
          updatedAt: legacy.updatedAt,
          archivedAt: legacy.archivedAt,
        })
        .run();
    }
  });

  options.logger.info(
    {
      importedProjects: dedupedProjects.length,
      importedWorkspaces: dedupedWorkspaces.length,
    },
    "Imported legacy project/workspace JSON into the database",
  );

  return {
    status: "imported",
    importedProjects: dedupedProjects.length,
    importedWorkspaces: dedupedWorkspaces.length,
  };
}

async function readLegacyProjects(filePath: string) {
  const raw = await readOptionalJsonFile(filePath);
  if (!raw) {
    return [];
  }
  try {
    return z.array(LegacyProjectSchema).parse(raw);
  } catch (error) {
    throw new Error(
      `Failed to parse ${filePath}. The file may be corrupted. ` +
        `Check the file and fix or remove invalid entries. ` +
        `Original error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function readLegacyWorkspaces(filePath: string) {
  const raw = await readOptionalJsonFile(filePath);
  if (!raw) {
    return [];
  }
  try {
    return z.array(LegacyWorkspaceSchema).parse(raw);
  } catch (error) {
    throw new Error(
      `Failed to parse ${filePath}. The file may be corrupted. ` +
        `Check the file and fix or remove invalid entries. ` +
        `Original error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function readOptionalJsonFile(filePath: string): Promise<unknown | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function hasAnyProjectWorkspaceRows(db: PaseoDatabaseHandle["db"]): Promise<boolean> {
  const [projectCountRows, workspaceCountRows] = await Promise.all([
    db.select({ count: count() }).from(projects),
    db.select({ count: count() }).from(workspaces),
  ]);
  const projectCount = projectCountRows[0]?.count ?? 0;
  const workspaceCount = workspaceCountRows[0]?.count ?? 0;
  return projectCount > 0 || workspaceCount > 0;
}

async function backupLegacyProjectWorkspaceJson(options: {
  projectsPath: string;
  workspacesPath: string;
  paseoHome: string;
  logger: Logger;
}): Promise<void> {
  const backupDir = path.join(options.paseoHome, "backup", "pre-migration");
  await fs.mkdir(backupDir, { recursive: true });

  if (await pathExists(options.projectsPath)) {
    await fs.copyFile(options.projectsPath, path.join(backupDir, "projects.json"));
  }
  if (await pathExists(options.workspacesPath)) {
    await fs.copyFile(options.workspacesPath, path.join(backupDir, "workspaces.json"));
  }

  options.logger.info({ backupPath: backupDir }, "Backed up legacy project/workspace JSON before migration");
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}
