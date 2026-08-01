"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Archive,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Reply,
  X
} from "lucide-react";

import Avatar from "@/components/Avatar";
import { formatFileSize, getFileExtension } from "@/lib/attachments";
import { getErrorMessage } from "@/lib/errors";
import {
  getReplyPreviewText,
  MESSAGE_REACTION_EMOJIS,
  type MessageReactionEmoji
} from "@/lib/messageFeatures";
import type { Message } from "@/lib/types";

interface MessageListProps {
  messages: Message[];
  loading: boolean;
  error: string;
  currentUserTgId: number;
  onReply: (message: Message) => void;
  onToggleReaction: (
    messageId: string,
    emoji: MessageReactionEmoji
  ) => Promise<void>;
  onMessagesVisible: (messageIds: string[]) => void | Promise<void>;
}

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  hour: "2-digit",
  minute: "2-digit"
});

const readDateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit"
});

function getGroupedReactions(message: Message, currentUserTgId: number) {
  const groups = new Map<
    string,
    { emoji: string; count: number; reactedByCurrentUser: boolean }
  >();

  for (const reaction of message.reactions) {
    const current = groups.get(reaction.emoji) ?? {
      emoji: reaction.emoji,
      count: 0,
      reactedByCurrentUser: false
    };
    current.count += 1;
    current.reactedByCurrentUser ||=
      reaction.reactor_tg_id === currentUserTgId;
    groups.set(reaction.emoji, current);
  }

  return Array.from(groups.values()).sort((left, right) => {
    const leftIndex = MESSAGE_REACTION_EMOJIS.indexOf(
      left.emoji as MessageReactionEmoji
    );
    const rightIndex = MESSAGE_REACTION_EMOJIS.indexOf(
      right.emoji as MessageReactionEmoji
    );
    return leftIndex - rightIndex;
  });
}

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
  currentUserTgId,
  onReply,
  onToggleReaction,
  onMessagesVisible
}: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messageElementsRef = useRef(new Map<string, HTMLDivElement>());
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const reduceMotion = useReducedMotion();
  const [reactionTargetId, setReactionTargetId] = useState<string | null>(
    null
  );
  const [pendingReaction, setPendingReaction] = useState("");
  const [interactionError, setInteractionError] = useState("");
  const [highlightedMessageId, setHighlightedMessageId] = useState<
    string | null
  >(null);
  const [readDetailsMessage, setReadDetailsMessage] =
    useState<Message | null>(null);
  const [openedImage, setOpenedImage] = useState<{
    url: string;
    name: string;
  } | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({
      block: "end",
      behavior: reduceMotion ? "auto" : "smooth"
    });
  }, [messages.length, reduceMotion]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || loading) {
      return;
    }

    const foreignMessageIds = new Set(
      messages
        .filter((message) => message.sender_tg_id !== currentUserTgId)
        .map((message) => message.id)
    );
    if (foreignMessageIds.size === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleIds = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => (entry.target as HTMLElement).dataset.messageId)
          .filter(
            (id): id is string =>
              typeof id === "string" && foreignMessageIds.has(id)
          );

        if (visibleIds.length > 0) {
          void onMessagesVisible(visibleIds);
        }
      },
      { root: container, threshold: 0.55 }
    );

    for (const id of foreignMessageIds) {
      const element = messageElementsRef.current.get(id);
      if (element) {
        observer.observe(element);
      }
    }

    return () => observer.disconnect();
  }, [currentUserTgId, loading, messages, onMessagesVisible]);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
      }
    };
  }, []);

  function startLongPress(messageId: string) {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
    longPressTimerRef.current = setTimeout(() => {
      setInteractionError("");
      setReactionTargetId(messageId);
      window.navigator.vibrate?.(20);
    }, 450);
  }

  function cancelLongPress() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  async function toggleReaction(
    messageId: string,
    emoji: MessageReactionEmoji
  ) {
    const pendingKey = `${messageId}:${emoji}`;
    setPendingReaction(pendingKey);
    setInteractionError("");
    try {
      await onToggleReaction(messageId, emoji);
      setReactionTargetId(null);
    } catch (caughtError) {
      setInteractionError(
        getErrorMessage(caughtError, "Не удалось изменить реакцию.")
      );
    } finally {
      setPendingReaction("");
    }
  }

  function replyTo(message: Message) {
    setReactionTargetId(null);
    onReply(message);
  }

  function scrollToMessage(messageId: string) {
    const element = messageElementsRef.current.get(messageId);
    if (!element) {
      return;
    }

    element.scrollIntoView({
      block: "center",
      behavior: reduceMotion ? "auto" : "smooth"
    });
    setHighlightedMessageId(messageId);
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
    }
    highlightTimerRef.current = setTimeout(
      () => setHighlightedMessageId(null),
      1600
    );
  }

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

  const detailedReadMessage = readDetailsMessage
    ? messages.find((message) => message.id === readDetailsMessage.id) ??
      readDetailsMessage
    : null;

  return (
    <>
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto bg-[var(--messenger-bg)] px-2.5 py-4 sm:px-4"
        aria-live="polite"
        aria-label="Сообщения"
      >
        {error && (
          <div className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}

        {interactionError && (
          <div className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {interactionError}
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
            const groupedReactions = getGroupedReactions(
              message,
              currentUserTgId
            );

            return (
              <div
                key={message.id}
                ref={(element) => {
                  if (element) {
                    messageElementsRef.current.set(message.id, element);
                  } else {
                    messageElementsRef.current.delete(message.id);
                  }
                }}
                data-message-id={message.id}
                className={`flex items-end gap-2 rounded-2xl transition-shadow ${
                  startsGroup && index > 0 ? "mt-3" : "mt-1"
                } ${isOwn ? "justify-end" : "justify-start"} ${
                  highlightedMessageId === message.id
                    ? "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--messenger-bg)]"
                    : ""
                }`}
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

                <div
                  className={`relative flex max-w-[86%] flex-col sm:max-w-[74%] ${
                    isOwn ? "items-end" : "items-start"
                  }`}
                >
                  <AnimatePresence>
                    {reactionTargetId === message.id && (
                      <motion.div
                        className={`absolute bottom-full z-40 mb-2 flex max-w-[min(94vw,430px)] items-center gap-0.5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-xl ${
                          isOwn ? "right-0" : "left-0"
                        }`}
                        initial={{ opacity: 0, y: 8, scale: 0.94 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 6, scale: 0.96 }}
                        transition={{ duration: 0.16, ease: "easeOut" }}
                      >
                        {MESSAGE_REACTION_EMOJIS.map((emoji) => (
                          <motion.button
                            key={emoji}
                            type="button"
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xl hover:bg-[var(--surface-muted)] disabled:opacity-45"
                            onClick={() => void toggleReaction(message.id, emoji)}
                            disabled={pendingReaction === `${message.id}:${emoji}`}
                            whileTap={{ scale: 0.82 }}
                            aria-label={`Реакция ${emoji}`}
                          >
                            {emoji}
                          </motion.button>
                        ))}
                        <span className="mx-1 h-7 w-px bg-[var(--border)]" />
                        <motion.button
                          type="button"
                          className="flex h-9 items-center gap-1 rounded-xl px-2 text-xs font-semibold text-[var(--accent)] hover:bg-[var(--surface-muted)]"
                          onClick={() => replyTo(message)}
                          whileTap={{ scale: 0.92 }}
                        >
                          <Reply size={16} />
                          Ответить
                        </motion.button>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <motion.article
                    initial={
                      reduceMotion
                        ? false
                        : { opacity: 0, y: 10, scale: 0.98 }
                    }
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    onTouchStart={() => startLongPress(message.id)}
                    onTouchEnd={cancelLongPress}
                    onTouchCancel={cancelLongPress}
                    onTouchMove={cancelLongPress}
                    onMouseDown={() => startLongPress(message.id)}
                    onMouseUp={cancelLongPress}
                    onMouseLeave={cancelLongPress}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      cancelLongPress();
                      setReactionTargetId(message.id);
                    }}
                    className={`w-full px-2.5 py-2 shadow-sm select-none ${
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

                    {message.reply_to_message_id && (
                      <button
                        type="button"
                        className={`mb-1.5 block w-full rounded-xl border-l-2 px-2.5 py-1.5 text-left ${
                          isOwn
                            ? "border-white/70 bg-white/10"
                            : "border-[var(--accent)] bg-[var(--surface-muted)]"
                        }`}
                        onClick={() =>
                          scrollToMessage(message.reply_to_message_id!)
                        }
                      >
                        <span
                          className={`block truncate text-[11px] font-bold ${
                            isOwn ? "text-white" : "text-[var(--accent)]"
                          }`}
                        >
                          {message.reply_to?.sender_name ?? "Ответ на сообщение"}
                        </span>
                        <span
                          className={`mt-0.5 block truncate text-xs ${
                            isOwn ? "text-white/75" : "muted-text"
                          }`}
                        >
                          {message.reply_to
                            ? getReplyPreviewText(message.reply_to.text)
                            : "Исходное сообщение не загружено"}
                        </span>
                      </button>
                    )}

                    <MessageAttachmentView
                      message={message}
                      isOwn={isOwn}
                      onOpenImage={(url, name) =>
                        setOpenedImage({ url, name })
                      }
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

                  {(groupedReactions.length > 0 || isOwn) && (
                    <div
                      className={`mt-1 flex flex-wrap items-center gap-1 px-1 ${
                        isOwn ? "justify-end" : "justify-start"
                      }`}
                    >
                      {groupedReactions.map((group) => (
                        <motion.button
                          key={group.emoji}
                          type="button"
                          className={`rounded-full border bg-[var(--surface)] px-2 py-0.5 text-xs font-semibold text-slate-700 shadow-sm dark:text-slate-100 ${
                            group.reactedByCurrentUser
                              ? "border-[var(--accent)] ring-1 ring-[var(--accent)]"
                              : "border-[var(--border)]"
                          }`}
                          onClick={() =>
                            void toggleReaction(
                              message.id,
                              group.emoji as MessageReactionEmoji
                            )
                          }
                          disabled={
                            pendingReaction ===
                            `${message.id}:${group.emoji}`
                          }
                          whileTap={{ scale: 0.92 }}
                        >
                          {group.emoji} {group.count}
                        </motion.button>
                      ))}

                      {isOwn && message.reads.length > 0 ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] muted-text hover:text-[var(--accent)]"
                          onClick={() => setReadDetailsMessage(message)}
                        >
                          <Eye size={12} />
                          Прочитано: {message.reads.length}
                        </button>
                      ) : isOwn ? (
                        <span className="px-1 text-[10px] muted-text">
                          Отправлено
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>
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

      <AnimatePresence>
        {detailedReadMessage && (
          <motion.div
            className="fixed inset-0 z-[80] flex items-end bg-black/45 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setReadDetailsMessage(null)}
          >
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-labelledby="message-reads-title"
              className="mx-auto max-h-[72vh] w-full max-w-lg overflow-hidden rounded-[1.6rem] bg-[var(--surface)] shadow-2xl"
              initial={{ y: 90, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 90, opacity: 0 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="border-b border-[var(--border)] px-4 pb-3 pt-2.5">
                <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-600" />
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3
                      id="message-reads-title"
                      className="font-semibold text-slate-900 dark:text-slate-50"
                    >
                      Кто прочитал
                    </h3>
                    <p className="mt-0.5 text-xs muted-text">
                      {detailedReadMessage.reads.length} участников
                    </p>
                  </div>
                  <motion.button
                    type="button"
                    className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-[var(--surface-muted)]"
                    onClick={() => setReadDetailsMessage(null)}
                    whileTap={{ scale: 0.92 }}
                    aria-label="Закрыть список прочтений"
                  >
                    <X size={20} />
                  </motion.button>
                </div>
              </div>

              <div className="max-h-[55vh] overflow-y-auto p-3">
                {detailedReadMessage.reads.map((read) => (
                  <div
                    key={read.id}
                    className="flex items-center justify-between gap-3 rounded-2xl px-3 py-2.5 odd:bg-[var(--surface-muted)]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {read.reader_name}
                      </p>
                      <p className="mt-0.5 text-[11px] muted-text">
                        Telegram ID: {read.reader_tg_id}
                      </p>
                    </div>
                    <time className="shrink-0 text-xs muted-text">
                      {readDateFormatter.format(new Date(read.read_at))}
                    </time>
                  </div>
                ))}
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
