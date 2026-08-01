"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import MessageInput from "@/components/MessageInput";
import MessageList from "@/components/MessageList";
import { apiFetch } from "@/lib/apiClient";
import {
  mapMessage,
  mapMessageReaction,
  mapMessageRead
} from "@/lib/entityMappers";
import { getErrorMessage } from "@/lib/errors";
import {
  getMessageChannelTopic,
  MESSAGE_REACTION_EVENT,
  MESSAGE_READS_EVENT,
  type MessageReactionEmoji
} from "@/lib/messageFeatures";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type {
  Channel,
  Message,
  MessageAttachment,
  MessageReaction,
  MessageRead
} from "@/lib/types";

interface ChannelViewProps {
  channel: Channel;
  currentUser: {
    tg_id: number;
    avatar_url: string | null;
  };
}

interface MessagePageResponse {
  messages: Message[];
  has_more: boolean;
  next_cursor: { before_at: string } | null;
}

interface CachedMessagePage {
  messages: Message[];
  hasMore: boolean;
  nextCursor: string | null;
}

const messagePageCache = new Map<string, CachedMessagePage>();

function insertMessageChronologically(
  messages: Message[],
  newMessage: Message
): Message[] {
  if (messages.some((message) => message.id === newMessage.id)) {
    return messages;
  }

  const lastMessage = messages.at(-1);
  if (!lastMessage || lastMessage.created_at <= newMessage.created_at) {
    return [...messages, newMessage];
  }

  let low = 0;
  let high = messages.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (messages[middle].created_at <= newMessage.created_at) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return [...messages.slice(0, low), newMessage, ...messages.slice(low)];
}

export default function ChannelView({
  channel,
  currentUser
}: ChannelViewProps) {
  const cachedPageRef = useRef(messagePageCache.get(channel.id));
  const [messages, setMessages] = useState<Message[]>(
    () => cachedPageRef.current?.messages ?? []
  );
  const [hasMore, setHasMore] = useState(
    () => cachedPageRef.current?.hasMore ?? false
  );
  const [nextCursor, setNextCursor] = useState<string | null>(
    () => cachedPageRef.current?.nextCursor ?? null
  );
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [loading, setLoading] = useState(() => !cachedPageRef.current);
  const [error, setError] = useState("");
  const avatarBySenderRef = useRef(new Map<number, string | null>());
  const markedReadIdsRef = useRef(new Set<string>());

  const addMessage = useCallback((newMessage: Message) => {
    const knownAvatar =
      newMessage.sender_tg_id === currentUser.tg_id
        ? currentUser.avatar_url
        : avatarBySenderRef.current.get(newMessage.sender_tg_id) ?? null;
    const enrichedMessage = {
      ...newMessage,
      sender_avatar_url: newMessage.sender_avatar_url ?? knownAvatar
    };

    if (enrichedMessage.sender_avatar_url) {
      avatarBySenderRef.current.set(
        enrichedMessage.sender_tg_id,
        enrichedMessage.sender_avatar_url
      );
    }

    setMessages((currentMessages) => {
      const originalMessage = enrichedMessage.reply_to_message_id
        ? currentMessages.find(
            (message) => message.id === enrichedMessage.reply_to_message_id
          )
        : null;
      const messageWithReply =
        !enrichedMessage.reply_to && originalMessage
          ? {
              ...enrichedMessage,
              reply_to: {
                id: originalMessage.id,
                sender_name: originalMessage.sender_name,
                text: originalMessage.text
              }
            }
          : enrichedMessage;

      return insertMessageChronologically(
        currentMessages,
        messageWithReply
      );
    });
  }, [currentUser.avatar_url, currentUser.tg_id]);

  const upsertReaction = useCallback((reaction: MessageReaction) => {
    setMessages((currentMessages) =>
      currentMessages.map((message) => {
        if (message.id !== reaction.message_id) {
          return message;
        }

        return {
          ...message,
          reactions: [
            ...message.reactions.filter((item) => item.id !== reaction.id),
            reaction
          ]
        };
      })
    );
  }, []);

  const removeReaction = useCallback((reactionId: string) => {
    setMessages((currentMessages) =>
      currentMessages.map((message) => {
        const reactions = message.reactions.filter(
          (reaction) => reaction.id !== reactionId
        );
        return reactions.length === message.reactions.length
          ? message
          : { ...message, reactions };
      })
    );
  }, []);

  const upsertRead = useCallback((read: MessageRead) => {
    setMessages((currentMessages) =>
      currentMessages.map((message) =>
        message.id === read.message_id
          ? {
              ...message,
              reads: [
                ...message.reads.filter((item) => item.id !== read.id),
                read
              ].sort((left, right) =>
                left.read_at.localeCompare(right.read_at)
              )
            }
          : message
      )
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabaseClient();

    async function loadMessages() {
      setLoading(!cachedPageRef.current);
      setError("");
      markedReadIdsRef.current.clear();
      setReplyingTo(null);

      try {
        const body = await apiFetch<MessagePageResponse>(
          `/api/messages?channel_id=${encodeURIComponent(channel.id)}`,
          { cache: "no-store" },
          "Не удалось загрузить сообщения."
        );

        if (!cancelled) {
          avatarBySenderRef.current.clear();
          for (const message of body.messages) {
            if (message.sender_avatar_url) {
              avatarBySenderRef.current.set(
                message.sender_tg_id,
                message.sender_avatar_url
              );
            }
          }
          setMessages(body.messages);
          setHasMore(body.has_more);
          setNextCursor(body.next_cursor?.before_at ?? null);
        }
      } catch (caughtError) {
        if (!cancelled) {
          setError(
            getErrorMessage(caughtError, "Не удалось загрузить сообщения.")
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadMessages();

    const realtimeChannel = supabase
      .channel(getMessageChannelTopic(channel.id))
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `channel_id=eq.${channel.id}`
        },
        (payload) => {
          addMessage(
            mapMessage(payload.new as Record<string, unknown>, null)
          );
        }
      )
      .on(
        "broadcast",
        { event: MESSAGE_REACTION_EVENT },
        ({ payload }) => {
          if (payload.action === "delete") {
            const removedId = String(payload.reaction_id ?? "");
            if (removedId) {
              removeReaction(removedId);
            }
            return;
          }

          if (payload.reaction && typeof payload.reaction === "object") {
            upsertReaction(
              mapMessageReaction(
                payload.reaction as Record<string, unknown>
              )
            );
          }
        }
      )
      .on(
        "broadcast",
        { event: MESSAGE_READS_EVENT },
        ({ payload }) => {
          if (!Array.isArray(payload.reads)) {
            return;
          }

          for (const read of payload.reads) {
            if (read && typeof read === "object") {
              upsertRead(
                mapMessageRead(read as Record<string, unknown>)
              );
            }
          }
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(realtimeChannel);
    };
  }, [
    addMessage,
    channel.id,
    removeReaction,
    upsertReaction,
    upsertRead
  ]);

  useEffect(() => {
    messagePageCache.set(channel.id, {
      messages,
      hasMore,
      nextCursor
    });
  }, [channel.id, hasMore, messages, nextCursor]);

  const loadOlderMessages = useCallback(async () => {
    if (!hasMore || !nextCursor || loadingOlder) {
      return;
    }

    setLoadingOlder(true);
    try {
      const params = new URLSearchParams({
        channel_id: channel.id,
        before_at: nextCursor
      });
      const body = await apiFetch<MessagePageResponse>(
        `/api/messages?${params.toString()}`,
        { cache: "no-store" },
        "Не удалось загрузить более ранние сообщения."
      );

      setMessages((currentMessages) => {
        const currentIds = new Set(
          currentMessages.map((message) => message.id)
        );
        const olderMessages = body.messages.filter(
          (message) => !currentIds.has(message.id)
        );
        return [...olderMessages, ...currentMessages];
      });
      setHasMore(body.has_more);
      setNextCursor(body.next_cursor?.before_at ?? null);
    } catch (caughtError) {
      setError(
        getErrorMessage(
          caughtError,
          "Не удалось загрузить более ранние сообщения."
        )
      );
    } finally {
      setLoadingOlder(false);
    }
  }, [channel.id, hasMore, loadingOlder, nextCursor]);

  const markMessagesRead = useCallback(
    async (messageIds: string[]) => {
      const newIds = messageIds.filter(
        (id) => !markedReadIdsRef.current.has(id)
      );
      if (newIds.length === 0) {
        return;
      }

      newIds.forEach((id) => markedReadIdsRef.current.add(id));
      try {
        await apiFetch<{ marked: number }>(
          "/api/messages/mark-read",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              channel_id: channel.id,
              message_ids: newIds
            })
          },
          "Не удалось отметить сообщения как прочитанные."
        );
      } catch {
        newIds.forEach((id) => markedReadIdsRef.current.delete(id));
      }
    },
    [channel.id]
  );

  const toggleReaction = useCallback(
    async (messageId: string, emoji: MessageReactionEmoji) => {
      const body = await apiFetch<{
        active: boolean;
        reaction: MessageReaction | null;
        removed_reaction_id: string | null;
      }>(
        `/api/messages/${messageId}/react`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emoji })
        },
        "Не удалось изменить реакцию."
      );

      if (body.active && body.reaction) {
        upsertReaction(body.reaction);
      } else if (body.removed_reaction_id) {
        removeReaction(body.removed_reaction_id);
      }
    },
    [removeReaction, upsertReaction]
  );

  async function sendMessage({
    text,
    attachment,
    replyToMessageId
  }: {
    text: string;
    attachment?: MessageAttachment;
    replyToMessageId?: string;
  }) {
    const body = await apiFetch<{ message: Message }>(
      "/api/messages",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel_id: channel.id,
          text,
          reply_to_message_id: replyToMessageId,
          ...(attachment ?? {})
        })
      },
      "Не удалось отправить сообщение."
    );

    addMessage(body.message);
  }

  return (
    <section className="flex h-full min-h-0 flex-col" aria-label={channel.name}>
      <div className="z-10 flex shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3 shadow-sm">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent-soft)] text-xl dark:bg-[var(--accent-dark-soft)]">
          {channel.emoji ?? "💬"}
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-[16px] font-bold text-slate-900 dark:text-slate-50">
            {channel.name}
          </h2>
          <p className="text-xs muted-text">
            {channel.participant_count}{" "}
            {channel.participant_count === 1 ? "участник" : "участников"}
          </p>
        </div>
      </div>
      <MessageList
        messages={messages}
        loading={loading}
        hasMore={hasMore}
        loadingOlder={loadingOlder}
        error={error}
        currentUserTgId={currentUser.tg_id}
        onReply={setReplyingTo}
        onToggleReaction={toggleReaction}
        onMessagesVisible={markMessagesRead}
        onLoadOlder={loadOlderMessages}
      />
      <MessageInput
        channelId={channel.id}
        replyTo={replyingTo}
        onSend={sendMessage}
        onCancelReply={() => setReplyingTo(null)}
      />
    </section>
  );
}
