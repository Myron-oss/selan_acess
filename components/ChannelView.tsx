"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import MessageInput from "@/components/MessageInput";
import MessageList from "@/components/MessageList";
import { apiFetch } from "@/lib/apiClient";
import { getErrorMessage } from "@/lib/errors";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { Channel, Message, MessageAttachment } from "@/lib/types";

interface ChannelViewProps {
  channel: Channel;
  currentUser: {
    tg_id: number;
    avatar_url: string | null;
  };
}

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
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const avatarBySenderRef = useRef(new Map<number, string | null>());

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

    setMessages((currentMessages) =>
      insertMessageChronologically(currentMessages, enrichedMessage)
    );
  }, [currentUser.avatar_url, currentUser.tg_id]);

  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabaseClient();

    async function loadMessages() {
      setLoading(true);
      setError("");

      try {
        const body = await apiFetch<{ messages: Message[] }>(
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
      .channel(`messages:${channel.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `channel_id=eq.${channel.id}`
        },
        (payload) => {
          const rawMessage = payload.new as Omit<
            Message,
            "sender_avatar_url"
          >;
          addMessage({ ...rawMessage, sender_avatar_url: null });
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(realtimeChannel);
    };
  }, [addMessage, channel.id]);

  async function sendMessage({
    text,
    attachment
  }: {
    text: string;
    attachment?: MessageAttachment;
  }) {
    const body = await apiFetch<{ message: Message }>(
      "/api/messages",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel_id: channel.id,
          text,
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
        error={error}
        currentUserTgId={currentUser.tg_id}
      />
      <MessageInput channelId={channel.id} onSend={sendMessage} />
    </section>
  );
}
