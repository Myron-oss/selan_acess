import type { MessageFileType } from "@/lib/types";

export const CHAT_ATTACHMENTS_BUCKET = "chat-attachments";
export const MAX_AVATAR_BYTES = 4 * 1024 * 1024;

export const ATTACHMENT_LIMITS: Record<MessageFileType, number> = {
  image: 15 * 1024 * 1024,
  video: 50 * 1024 * 1024,
  document: 30 * 1024 * 1024
};

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif"
};

const VIDEO_MIME_BY_EXTENSION: Record<string, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm"
};

const DOCUMENT_MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  zip: "application/zip"
};

export interface AttachmentRule {
  category: MessageFileType;
  extension: string;
  mimeType: string;
  maxBytes: number;
}

export function getFileExtension(fileName: string): string {
  const trimmed = fileName.trim();
  const dotIndex = trimmed.lastIndexOf(".");

  if (dotIndex <= 0 || dotIndex === trimmed.length - 1) {
    return "";
  }

  return trimmed.slice(dotIndex + 1).toLowerCase();
}

export function getAttachmentRule(
  fileName: string,
  suppliedMimeType: string
): AttachmentRule | null {
  const extension = getFileExtension(fileName);
  const mimeType = suppliedMimeType.toLowerCase().split(";", 1)[0].trim();

  const imageMime = IMAGE_MIME_BY_EXTENSION[extension];
  if (imageMime && mimeType === imageMime) {
    return {
      category: "image",
      extension,
      mimeType: imageMime,
      maxBytes: ATTACHMENT_LIMITS.image
    };
  }

  const videoMime = VIDEO_MIME_BY_EXTENSION[extension];
  if (videoMime && mimeType === videoMime) {
    return {
      category: "video",
      extension,
      mimeType: videoMime,
      maxBytes: ATTACHMENT_LIMITS.video
    };
  }

  const documentMime = DOCUMENT_MIME_BY_EXTENSION[extension];
  if (
    documentMime &&
    (mimeType === documentMime ||
      (extension === "zip" && mimeType === "application/x-zip-compressed") ||
      mimeType === "application/octet-stream" ||
      mimeType === "")
  ) {
    return {
      category: "document",
      extension,
      mimeType: documentMime,
      maxBytes: ATTACHMENT_LIMITS.document
    };
  }

  return null;
}

export function isFileNameAllowedForCategory(
  fileName: string,
  category: MessageFileType
): boolean {
  const extension = getFileExtension(fileName);

  if (category === "image") {
    return Boolean(IMAGE_MIME_BY_EXTENSION[extension]);
  }
  if (category === "video") {
    return Boolean(VIDEO_MIME_BY_EXTENSION[extension]);
  }
  return Boolean(DOCUMENT_MIME_BY_EXTENSION[extension]);
}

export function formatFileSize(bytes: number | null): string {
  if (!bytes || bytes < 1) {
    return "";
  }

  if (bytes < 1024 * 1024) {
    return `${Math.ceil(bytes / 1024)} КБ`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} МБ`;
}
