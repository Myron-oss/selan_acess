"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";

import MessageRow from "@/components/MessageRow";
import { getErrorMessage } from "@/lib/errors";
import type { MessageReactionEmoji } from "@/lib/messageFeatures";
import type { Message } from "@/lib/types";

interface MessageListProps {
  messages: Message[];
  loading: boolean;
  hasMore: boolean;
  loadingOlder: boolean;
  error: string;
  currentUserTgId: number;
  onReply: (message: Message) => void;
  onToggleReaction: (
    messageId: string,
    emoji: MessageReactionEmoji
  ) => Promise<void>;
  onMessagesVisible: (messageIds: string[]) => void | Promise<void>;
  onLoadOlder: () => void | Promise<void>;
}

const readDateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit"
});

export default function MessageList({
  messages,
  loading,
  hasMore,
  loadingOlder,
  error,
  currentUserTgId,
  onReply,
  onToggleReaction,
  onMessagesVisible,
  onLoadOlder
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
  const foreignMessageKey = useMemo(
    () =>
      messages
        .filter((message) => message.sender_tg_id !== currentUserTgId)
        .map((message) => message.id)
        .join(","),
    [currentUserTgId, messages]
  );

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
      foreignMessageKey ? foreignMessageKey.split(",") : []
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
  }, [foreignMessageKey, loading, onMessagesVisible]);

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

  const startLongPress = useCallback((messageId: string) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
    longPressTimerRef.current = setTimeout(() => {
      setInteractionError("");
      setReactionTargetId(messageId);
      window.navigator.vibrate?.(20);
    }, 450);
  }, []);

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const toggleReaction = useCallback(
    async (messageId: string, emoji: MessageReactionEmoji) => {
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
    },
    [onToggleReaction]
  );

  const replyTo = useCallback((message: Message) => {
    setReactionTargetId(null);
    onReply(message);
  }, [onReply]);

  const scrollToMessage = useCallback((messageId: string) => {
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
  }, [reduceMotion]);

  const setMessageElement = useCallback(
    (messageId: string, element: HTMLDivElement | null) => {
      if (element) {
        messageElementsRef.current.set(messageId, element);
      } else {
        messageElementsRef.current.delete(messageId);
      }
    },
    []
  );

  const openReactionPanel = useCallback((messageId: string) => {
    setInteractionError("");
    setReactionTargetId(messageId);
  }, []);

  const openImage = useCallback((url: string, name: string) => {
    setOpenedImage({ url, name });
  }, []);

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

        {hasMore && (
          <div className="mb-3 flex justify-center">
            <button
              type="button"
              className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-xs font-semibold text-[var(--accent)] shadow-sm disabled:opacity-50"
              onClick={() => void onLoadOlder()}
              disabled={loadingOlder}
            >
              {loadingOlder
                ? "Загружаем ранние сообщения…"
                : "Загрузить ранние сообщения"}
            </button>
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
            const pendingPrefix = `${message.id}:`;

            return (
              <MessageRow
                key={message.id}
                message={message}
                index={index}
                currentUserTgId={currentUserTgId}
                startsGroup={
                  !previous ||
                  previous.sender_tg_id !== message.sender_tg_id
                }
                endsGroup={
                  !next || next.sender_tg_id !== message.sender_tg_id
                }
                reactionPanelOpen={reactionTargetId === message.id}
                pendingReactionEmoji={
                  pendingReaction.startsWith(pendingPrefix)
                    ? (pendingReaction.slice(
                        pendingPrefix.length
                      ) as MessageReactionEmoji)
                    : null
                }
                highlighted={highlightedMessageId === message.id}
                reduceMotion={Boolean(reduceMotion)}
                setElement={setMessageElement}
                onStartLongPress={startLongPress}
                onCancelLongPress={cancelLongPress}
                onOpenReactionPanel={openReactionPanel}
                onToggleReaction={toggleReaction}
                onReply={replyTo}
                onScrollToMessage={scrollToMessage}
                onOpenImage={openImage}
                onReadDetails={setReadDetailsMessage}
              />
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
