"use client";

import {
  ChangeEvent,
  FormEvent,
  KeyboardEvent,
  memo,
  useEffect,
  useRef,
  useState
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
  Camera,
  FileText,
  Image as ImageIcon,
  Plus,
  Reply,
  Video,
  X
} from "lucide-react";

import PollComposer from "@/components/PollComposer";
import {
  CHAT_ATTACHMENTS_BUCKET,
  formatFileSize,
  getAttachmentRule
} from "@/lib/attachments";
import { apiFetch } from "@/lib/apiClient";
import { getErrorMessage } from "@/lib/errors";
import { getReplyPreviewText } from "@/lib/messageFeatures";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type {
  Message,
  MessageAttachment,
  MessageFileType,
  PollDraft
} from "@/lib/types";

interface OutgoingMessage {
  text: string;
  attachment?: MessageAttachment;
  replyToMessageId?: string;
}

interface MessageInputProps {
  channelId: string;
  replyTo: Message | null;
  onSend: (message: OutgoingMessage) => Promise<void>;
  onCancelReply: () => void;
  onCreatePoll: (draft: PollDraft) => Promise<void>;
}

interface AuthorizedUpload {
  signed_url: string;
  token: string;
  path: string;
  public_url: string;
  attachment_type: MessageFileType;
  content_type: string;
}

type UploadStage = "idle" | "authorizing" | "uploading" | "sending";

const stageLabels: Record<Exclude<UploadStage, "idle">, string> = {
  authorizing: "Проверяем доступ…",
  uploading: "Загружаем файл напрямую в Storage…",
  sending: "Отправляем сообщение…"
};

function MessageInputComponent({
  channelId,
  replyTo,
  onSend,
  onCancelReply,
  onCreatePoll
}: MessageInputProps) {
  const [text, setText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedType, setSelectedType] = useState<MessageFileType | null>(null);
  const [uploadedAttachment, setUploadedAttachment] =
    useState<MessageAttachment | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const [pollSubmitting, setPollSubmitting] = useState(false);
  const [stage, setStage] = useState<UploadStage>("idle");
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const sending = stage !== "idle";
  const hasContent = Boolean(text.trim() || selectedFile);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "44px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 112)}px`;
  }, [text]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  function clearAttachment() {
    setSelectedFile(null);
    setSelectedType(null);
    setUploadedAttachment(null);
    setPreviewUrl("");
    for (const input of [
      mediaInputRef.current,
      documentInputRef.current,
      cameraInputRef.current
    ]) {
      if (input) {
        input.value = "";
      }
    }
  }

  function selectFile(file: File | undefined) {
    setSheetOpen(false);
    setError("");

    if (!file) {
      return;
    }

    const rule = getAttachmentRule(file.name, file.type);
    if (!rule) {
      setError(
        "Поддерживаются изображения JPEG/PNG/WebP/GIF, видео MP4/MOV/WebM и документы PDF/DOC/DOCX/XLSX/ZIP."
      );
      return;
    }

    if (file.size <= 0 || file.size > rule.maxBytes) {
      setError(
        `Файл слишком большой. Лимит для этого типа — ${formatFileSize(rule.maxBytes)}.`
      );
      return;
    }

    clearAttachment();
    setSelectedFile(file);
    setSelectedType(rule.category);
    if (rule.category !== "document") {
      setPreviewUrl(URL.createObjectURL(file));
    }
  }

  async function uploadAttachment(): Promise<MessageAttachment | undefined> {
    if (!selectedFile || !selectedType) {
      return undefined;
    }
    if (uploadedAttachment) {
      return uploadedAttachment;
    }

    setStage("authorizing");
    const authorizeBody = await apiFetch<AuthorizedUpload>(
      "/api/upload/authorize",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel_id: channelId,
          file_name: selectedFile.name,
          file_type: selectedFile.type,
          file_size: selectedFile.size
        })
      },
      "Не удалось подготовить загрузку файла."
    );

    setStage("uploading");
    const { error: uploadError } = await getSupabaseClient()
      .storage.from(CHAT_ATTACHMENTS_BUCKET)
      .uploadToSignedUrl(
        authorizeBody.path,
        authorizeBody.token,
        selectedFile,
        {
          contentType: authorizeBody.content_type,
          upsert: false
        }
      );

    if (uploadError) {
      throw new Error(`Не удалось загрузить файл: ${uploadError.message}`);
    }

    const attachment: MessageAttachment = {
      file_url: authorizeBody.public_url,
      file_type: authorizeBody.attachment_type,
      file_name: selectedFile.name,
      file_size: selectedFile.size
    };
    setUploadedAttachment(attachment);
    return attachment;
  }

  async function submit() {
    const cleanText = text.trim();
    if ((!cleanText && !selectedFile) || sending) {
      return;
    }

    setError("");

    try {
      const attachment = await uploadAttachment();
      setStage("sending");
      await onSend({
        text: cleanText,
        attachment,
        replyToMessageId: replyTo?.id
      });
      setText("");
      clearAttachment();
      onCancelReply();
    } catch (caughtError) {
      setError(
        getErrorMessage(caughtError, "Не удалось отправить сообщение.")
      );
    } finally {
      setStage("idle");
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    selectFile(event.target.files?.[0]);
  }

  async function createPoll(draft: PollDraft) {
    setPollSubmitting(true);
    setError("");
    try {
      await onCreatePoll(draft);
      setPollOpen(false);
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, "Не удалось создать опрос."));
    } finally {
      setPollSubmitting(false);
    }
  }

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className="z-10 shrink-0 border-t border-[var(--border)] bg-[var(--surface)] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5"
      >
        {error && (
          <p className="mb-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        )}

        <AnimatePresence initial={false}>
          {replyTo && (
            <motion.div
              className="mb-2 flex items-center gap-2.5 rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.18 }}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)] dark:bg-[var(--accent-dark-soft)]">
                <Reply size={17} />
              </span>
              <span className="min-w-0 flex-1 border-l-2 border-[var(--accent)] pl-2.5">
                <span className="block truncate text-xs font-semibold text-[var(--accent)]">
                  Ответ для {replyTo.sender_name}
                </span>
                <span className="mt-0.5 block truncate text-xs muted-text">
                  {getReplyPreviewText(
                    replyTo.text,
                    replyTo.file_name ?? "Вложение"
                  )}
                </span>
              </span>
              <motion.button
                type="button"
                onClick={onCancelReply}
                disabled={sending}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-black/5 dark:hover:bg-white/10"
                whileTap={{ scale: 0.92 }}
                aria-label="Отменить ответ"
              >
                <X size={18} />
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {selectedFile && selectedType && (
          <div className="mb-2 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-2.5">
            <div className="flex items-center gap-3">
              {selectedType === "image" && previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt="Предпросмотр изображения"
                  className="h-16 w-16 rounded-xl object-cover"
                />
              ) : selectedType === "video" && previewUrl ? (
                <div className="relative h-16 w-16 overflow-hidden rounded-xl bg-black">
                  <video
                    src={previewUrl}
                    className="h-full w-full object-cover"
                    muted
                    playsInline
                  />
                  <Video
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white drop-shadow"
                    size={22}
                  />
                </div>
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] dark:bg-[var(--accent-dark-soft)]">
                  <FileText size={28} />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">
                  {selectedFile.name}
                </p>
                <p className="mt-0.5 text-xs muted-text">
                  {formatFileSize(selectedFile.size)}
                </p>
                {sending && (
                  <div className="mt-2">
                    <p className="mb-1 text-[11px] text-[var(--accent)]">
                      {stageLabels[stage]}
                    </p>
                    <div className="h-1 overflow-hidden rounded-full bg-[var(--border)]">
                      <motion.div
                        className="h-full w-1/3 rounded-full bg-[var(--accent)]"
                        animate={{ x: ["-100%", "300%"] }}
                        transition={{
                          duration: 1,
                          repeat: Infinity,
                          ease: "easeInOut"
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <motion.button
                type="button"
                onClick={clearAttachment}
                disabled={sending}
                aria-label="Убрать вложение"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-black/5 disabled:opacity-40 dark:hover:bg-white/10"
                whileTap={{ scale: 0.92 }}
              >
                <X size={19} />
              </motion.button>
            </div>
          </div>
        )}

        <div className="flex items-end gap-2">
          <motion.button
            type="button"
            onClick={() => setSheetOpen(true)}
            disabled={sending}
            aria-label="Добавить вложение"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--accent)] outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-45"
            whileTap={{ scale: 0.92 }}
          >
            <Plus size={24} strokeWidth={2.4} />
          </motion.button>

          <label className="sr-only" htmlFor="message-text">
            Сообщение
          </label>
          <textarea
            ref={textareaRef}
            id="message-text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={2000}
            rows={1}
            placeholder={selectedFile ? "Добавить подпись…" : "Сообщение…"}
            className="min-h-11 flex-1 resize-none rounded-[1.35rem] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-[0.65rem] text-[15px] leading-[1.35rem] text-slate-900 outline-none placeholder:text-slate-400 focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] dark:text-slate-50 dark:focus:ring-[var(--accent-dark-soft)]"
            disabled={sending}
          />
          <motion.button
            type="submit"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-lg text-white shadow-md outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-45"
            disabled={!hasContent || sending}
            aria-label="Отправить сообщение"
            animate={
              hasContent
                ? { scale: 1, rotate: 0 }
                : { scale: 0.9, rotate: -8 }
            }
            whileTap={{ scale: 0.9 }}
            transition={{ duration: 0.18 }}
          >
            {sending ? (
              <span className="animate-pulse">•••</span>
            ) : (
              <span className="translate-x-px" aria-hidden="true">
                ➤
              </span>
            )}
          </motion.button>
        </div>

        <input
          ref={mediaInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
          className="hidden"
          onChange={handleFileInput}
        />
        <input
          ref={documentInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.xlsx,.zip"
          className="hidden"
          onChange={handleFileInput}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileInput}
        />
      </form>

      <AnimatePresence>
        {sheetOpen && (
          <motion.div
            className="fixed inset-0 z-[70] flex items-end bg-black/40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setSheetOpen(false)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Выбор вложения"
              className="mx-auto w-full max-w-lg rounded-[1.6rem] bg-[var(--surface)] p-3 shadow-2xl"
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 80, opacity: 0 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-600" />
              <p className="px-2 pb-2 text-sm font-semibold text-slate-900 dark:text-slate-50">
                Добавить вложение
              </p>
              <AttachmentOption
                icon={<ImageIcon size={22} />}
                title="Фото и видео"
                subtitle="Фото до 15 МБ, видео до 50 МБ"
                onClick={() => mediaInputRef.current?.click()}
              />
              <AttachmentOption
                icon={<FileText size={22} />}
                title="Документ"
                subtitle="PDF, Word, Excel или ZIP до 30 МБ"
                onClick={() => documentInputRef.current?.click()}
              />
              <AttachmentOption
                icon={<Camera size={22} />}
                title="Камера"
                subtitle="Снять фото на телефон"
                onClick={() => cameraInputRef.current?.click()}
              />
              <AttachmentOption
                icon={<BarChart3 size={22} />}
                title="Опрос"
                subtitle="Вопрос с вариантами ответа"
                onClick={() => {
                  setSheetOpen(false);
                  setPollOpen(true);
                }}
              />
              <motion.button
                type="button"
                className="mt-1 w-full rounded-xl px-4 py-3 text-sm font-semibold text-[var(--accent)] hover:bg-[var(--surface-muted)]"
                onClick={() => setSheetOpen(false)}
                whileTap={{ scale: 0.98 }}
              >
                Отмена
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {pollOpen && (
          <PollComposer
            submitting={pollSubmitting}
            onClose={() => !pollSubmitting && setPollOpen(false)}
            onSubmit={createPoll}
          />
        )}
      </AnimatePresence>
    </>
  );
}

export default memo(MessageInputComponent);

function AttachmentOption({
  icon,
  title,
  subtitle,
  onClick
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left hover:bg-[var(--surface-muted)]"
      onClick={onClick}
      whileTap={{ scale: 0.98 }}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)] dark:bg-[var(--accent-dark-soft)]">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-900 dark:text-slate-50">
          {title}
        </span>
        <span className="mt-0.5 block text-xs muted-text">{subtitle}</span>
      </span>
    </motion.button>
  );
}
