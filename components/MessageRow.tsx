"use client";

import { memo } from "react";
import { motion } from "framer-motion";
import {
  Archive,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Pin
} from "lucide-react";

import Avatar from "@/components/Avatar";
import PollCard from "@/components/PollCard";
import { formatFileSize, getFileExtension } from "@/lib/attachments";
import {
  getReplyPreviewText,
  MESSAGE_REACTION_EMOJIS,
  type MessageReactionEmoji
} from "@/lib/messageFeatures";
import type { Message, Poll } from "@/lib/types";

interface MessageRowProps {
  message: Message;
  index: number;
  currentUserTgId: number;
  startsGroup: boolean;
  endsGroup: boolean;
  pendingReactionEmoji: MessageReactionEmoji | null;
  highlighted: boolean;
  reduceMotion: boolean;
  setElement: (messageId: string, element: HTMLDivElement | null) => void;
  onStartLongPress: (messageId: string) => void;
  onCancelLongPress: () => void;
  onOpenContextMenu: (messageId: string) => void;
  onToggleReaction: (
    messageId: string,
    emoji: MessageReactionEmoji
  ) => void;
  onScrollToMessage: (messageId: string) => void;
  onOpenImage: (url: string, name: string) => void;
  onReadDetails: (message: Message) => void;
  onPollUpdated: (poll: Poll) => void;
}

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
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

function MessageRowComponent({
  message,
  index,
  currentUserTgId,
  startsGroup,
  endsGroup,
  pendingReactionEmoji,
  highlighted,
  reduceMotion,
  setElement,
  onStartLongPress,
  onCancelLongPress,
  onOpenContextMenu,
  onToggleReaction,
  onScrollToMessage,
  onOpenImage,
  onReadDetails,
  onPollUpdated
}: MessageRowProps) {
  const isOwn = message.sender_tg_id === currentUserTgId;
  const groupedReactions = getGroupedReactions(message, currentUserTgId);

  return (
    <div
      ref={(element) => setElement(message.id, element)}
      data-message-id={message.id}
      className={`flex items-end gap-2 rounded-2xl transition-shadow ${
        startsGroup && index > 0 ? "mt-3" : "mt-1"
      } ${isOwn ? "justify-end" : "justify-start"} ${
        highlighted
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
        <motion.article
          initial={
            reduceMotion ? false : { opacity: 0, y: 10, scale: 0.98 }
          }
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          onTouchStart={() => onStartLongPress(message.id)}
          onTouchEnd={onCancelLongPress}
          onTouchCancel={onCancelLongPress}
          onTouchMove={onCancelLongPress}
          onMouseDown={() => onStartLongPress(message.id)}
          onMouseUp={onCancelLongPress}
          onMouseLeave={onCancelLongPress}
          onContextMenu={(event) => {
            event.preventDefault();
            onCancelLongPress();
            onOpenContextMenu(message.id);
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
                onScrollToMessage(message.reply_to_message_id!)
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
            onOpenImage={onOpenImage}
          />

          {message.poll && (
            <PollCard poll={message.poll} onUpdated={onPollUpdated} />
          )}

          {message.text && !message.poll && (
            <p
              className={`whitespace-pre-wrap break-words px-1 text-[15px] leading-[1.35rem] ${
                message.file_url ? "mt-1.5" : ""
              }`}
            >
              {message.text}
            </p>
          )}
          <div
            className={`mt-0.5 flex items-center justify-end gap-1 px-1 text-right text-[10px] ${
              isOwn ? "text-white/70" : "muted-text"
            }`}
          >
            {message.is_pinned && <Pin size={10} aria-label="Закреплено" />}
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
                  onToggleReaction(
                    message.id,
                    group.emoji as MessageReactionEmoji
                  )
                }
                disabled={pendingReactionEmoji === group.emoji}
                whileTap={{ scale: 0.92 }}
              >
                {group.emoji} {group.count}
              </motion.button>
            ))}

            {isOwn && message.reads.length > 0 ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] muted-text hover:text-[var(--accent)]"
                onClick={() => onReadDetails(message)}
              >
                <Eye size={12} />
                Прочитано: {message.reads.length}
              </button>
            ) : isOwn ? (
              <span className="px-1 text-[10px] muted-text">Отправлено</span>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

const MessageRow = memo(MessageRowComponent);

export default MessageRow;
