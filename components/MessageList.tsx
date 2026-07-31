"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Archive,
  Download,
  FileSpreadsheet,
  FileText,
  X
} from "lucide-react";

import Avatar from "@/components/Avatar";
import { formatFileSize, getFileExtension } from "@/lib/attachments";
import type { Message } from "@/lib/types";

interface MessageListProps {
  messages: Message[];
  loading: boolean;
  error: string;
  currentUserTgId: number;
}

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  hour: "2-digit",
  minute: "2-digit"
});

function DocumentIcon({ fileName }: { fileName: string }) {
  const extension = getFileExtension(fileName);
  if (extension === "xlsx") {
    return <FileSpreadsheet size={25} />;
  }
  if (extension === "zip") {
    return <Archive size={25} />;
  }
  return <FileText size={25} />;
}

function MessageAttachmentView({
  message,
  isOwn,
  onOpenImage
}: {
  message: Message;
  isOwn: boolean;
  onOpenImage: (url: string, name: string) => void;
}) {
  if (!message.file_url || !message.file_type || !message.file_name) {
    return null;
  }

  if (message.file_type === "image") {
    return (
      <motion.button
        type="button"
        className="block min-w-[180px] overflow-hidden rounded-xl bg-black/10"
        onClick={() => onOpenImage(message.file_url!, message.file_name!)}
        whileTap={{ scale: 0.98 }}
        aria-label={`Открыть изображение ${message.file_name}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={message.file_url}
          alt={message.file_name}
          loading="lazy"
          className="max-h-72 w-full object-cover"
        />
      </motion.button>
    );
  }

  if (message.file_type === "video") {
    return (
      <video
        src={message.file_url}
        controls
        playsInline
        preload="metadata"
        className="max-h-80 min-w-[210px] max-w-full rounded-xl bg-black"
      >
        Ваш браузер не поддерживает воспроизведение видео.
      </video>
    );
  }

  return (
    <motion.a
      href={message.file_url}
      target="_blank"
      rel="noopener noreferrer"
      download={message.file_name}
      className={`flex min-w-[210px] items-center gap-3 rounded-xl p-3 ${
        isOwn
          ? "bg-white/15 text-white"
          : "bg-[var(--surface-muted)] text-slate-800 dark:text-slate-100"
      }`}
      whileTap={{ scale: 0.98 }}
    >
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
          isOwn
            ? "bg-white/15"
            : "bg-[var(--accent-soft)] text-[var(--accent)] dark:bg-[var(--accent-dark-soft)]"
        }`}
      >
        <DocumentIcon fileName={message.file_name} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">
          {message.file_name}
        </span>
        <span
          className={`mt-0.5 block text-xs ${
            isOwn ? "text-white/70" : "muted-text"
          }`}
        >
          {formatFileSize(message.file_size)}
        </span>
      </span>
      <Download size={19} className="shrink-0 opacity-75" />
    </motion.a>
  );
}

export default function MessageList({
  messages,
  loading,
  error,
  currentUserTgId
}: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const [openedImage, setOpenedImage] = useState<{
    url: string;
    name: string;
  } | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({
      block: "end",
      behavior: reduceMotion ? "auto" : "smooth"
    });
  }, [messages, reduceMotion]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[var(--messenger-bg)] text-sm muted-text">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent)]" />
          Загружаем сообщения…
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className="flex-1 overflow-y-auto bg-[var(--messenger-bg)] px-2.5 py-4 sm:px-4"
        aria-live="polite"
        aria-label="Сообщения"
      >
        {error && (
          <div className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}

        {!error && messages.length === 0 && (
          <div className="flex min-h-full items-center justify-center text-center">
            <div>
              <div
                className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--surface)] text-2xl shadow-sm"
                aria-hidden="true"
              >
                👋
              </div>
              <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-200">
                Здесь пока тихо
              </p>
              <p className="mt-1 text-xs muted-text">
                Начните обсуждение первым.
              </p>
            </div>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((message, index) => {
            const previous = messages[index - 1];
            const next = messages[index + 1];
            const isOwn = message.sender_tg_id === currentUserTgId;
            const startsGroup =
              !previous || previous.sender_tg_id !== message.sender_tg_id;
            const endsGroup =
              !next || next.sender_tg_id !== message.sender_tg_id;

            return (
              <div
                key={message.id}
                className={`flex items-end gap-2 ${
                  startsGroup && index > 0 ? "mt-3" : "mt-1"
                } ${isOwn ? "justify-end" : "justify-start"}`}
              >
                {!isOwn && (
                  <div className="w-8 shrink-0">
                    {endsGroup && (
                      <Avatar
                        name={message.sender_name}
                        tgId={message.sender_tg_id}
                        url={message.sender_avatar_url}
                        size="sm"
                      />
                    )}
                  </div>
                )}

                <motion.article
                  initial={
                    reduceMotion ? false : { opacity: 0, y: 10, scale: 0.98 }
                  }
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.22, ease: "easeOut" }}
                  className={`max-w-[86%] px-2.5 py-2 shadow-sm sm:max-w-[74%] ${
                    isOwn
                      ? `bg-[var(--accent)] text-white ${
                          endsGroup
                            ? "rounded-2xl rounded-br-md"
                            : "rounded-2xl"
                        }`
                      : `border border-[var(--border)] bg-[var(--surface)] text-slate-800 dark:text-slate-100 ${
                          endsGroup
                            ? "rounded-2xl rounded-bl-md"
                            : "rounded-2xl"
                        }`
                  }`}
                >
                  {!isOwn && startsGroup && (
                    <p className="mb-1 truncate px-1 text-xs font-bold text-[var(--accent)]">
                      {message.sender_name}
                    </p>
                  )}

                  <MessageAttachmentView
                    message={message}
                    isOwn={isOwn}
                    onOpenImage={(url, name) => setOpenedImage({ url, name })}
                  />

                  {message.text && (
                    <p
                      className={`whitespace-pre-wrap break-words px-1 text-[15px] leading-[1.35rem] ${
                        message.file_url ? "mt-1.5" : ""
                      }`}
                    >
                      {message.text}
                    </p>
                  )}
                  <div
                    className={`mt-0.5 px-1 text-right text-[10px] ${
                      isOwn ? "text-white/70" : "muted-text"
                    }`}
                  >
                    {dateFormatter.format(new Date(message.created_at))}
                  </div>
                </motion.article>
              </div>
            );
          })}
        </AnimatePresence>
        <div ref={endRef} className="h-1" />
      </div>

      <AnimatePresence>
        {openedImage && (
          <motion.div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setOpenedImage(null)}
            role="dialog"
            aria-modal="true"
            aria-label={`Просмотр ${openedImage.name}`}
          >
            <motion.button
              type="button"
              className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white"
              onClick={() => setOpenedImage(null)}
              whileTap={{ scale: 0.92 }}
              aria-label="Закрыть изображение"
            >
              <X size={24} />
            </motion.button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <motion.img
              src={openedImage.url}
              alt={openedImage.name}
              className="max-h-full max-w-full rounded-xl object-contain"
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              onClick={(event) => event.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
