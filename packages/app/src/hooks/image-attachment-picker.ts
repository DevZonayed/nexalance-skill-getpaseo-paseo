import { getTauri } from "@/utils/tauri";

export type PickedImageSource =
  | { kind: "file_uri"; uri: string }
  | { kind: "blob"; blob: Blob };

export interface PickedImageAttachmentInput {
  source: PickedImageSource;
  mimeType?: string | null;
  fileName?: string | null;
}

export interface ExpoImagePickerAssetLike {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  file?: File | null;
}

const IMAGE_FILE_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "avif",
  "heic",
  "heif",
  "tiff",
  "bmp",
  "svg",
];

function isAbsoluteWindowsPath(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value);
}

function shouldTreatAsFileUri(uri: string): boolean {
  return uri.startsWith("file://") || uri.startsWith("/") || isAbsoluteWindowsPath(uri);
}

async function blobFromUri(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error(`Failed to read picked image from '${uri}'.`);
  }
  return await response.blob();
}

export async function normalizePickedImageAssets(
  assets: readonly ExpoImagePickerAssetLike[]
): Promise<PickedImageAttachmentInput[]> {
  return await Promise.all(
    assets.map(async (asset) => {
      if (asset.file instanceof Blob) {
        return {
          source: { kind: "blob", blob: asset.file },
          mimeType: asset.mimeType ?? asset.file.type ?? null,
          fileName: asset.fileName ?? asset.file.name ?? null,
        };
      }

      if (shouldTreatAsFileUri(asset.uri)) {
        return {
          source: { kind: "file_uri", uri: asset.uri },
          mimeType: asset.mimeType ?? null,
          fileName: asset.fileName ?? null,
        };
      }

      return {
        source: { kind: "blob", blob: await blobFromUri(asset.uri) },
        mimeType: asset.mimeType ?? null,
        fileName: asset.fileName ?? null,
      };
    })
  );
}

function normalizeTauriDialogSelection(selection: string | string[] | null): string[] {
  if (!selection) {
    return [];
  }
  return Array.isArray(selection) ? selection : [selection];
}

export async function openImagePathsWithTauriDialog(): Promise<string[]> {
  const tauri = getTauri();
  const options = {
    directory: false,
    multiple: true,
    filters: [{ name: "Images", extensions: IMAGE_FILE_EXTENSIONS }],
    title: "Attach images",
  };

  const dialogOpen = tauri?.dialog?.open;
  if (typeof dialogOpen === "function") {
    return normalizeTauriDialogSelection(await dialogOpen(options));
  }

  const invoke = tauri?.core?.invoke;
  if (typeof invoke !== "function") {
    throw new Error("Tauri dialog API is not available.");
  }

  const result = await invoke("plugin:dialog|open", { options });
  return normalizeTauriDialogSelection(
    Array.isArray(result) || typeof result === "string" || result === null ? result : null
  );
}
