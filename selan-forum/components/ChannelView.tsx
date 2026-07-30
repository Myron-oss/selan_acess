"use client";

import { useCallback, useEffect, useState } from "react";

import MessageInput from "@/components/MessageInput";
import MessageList from "@/components/MessageList";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { Channel, Message } from "@/lib/types";

interface ChannelViewProps {
  channel: Channel;
}

export default function ChannelView({ channel }: ChannelViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const addMessage = useCallback((newMessage: Message) => {
    setMessages((currentMessages) => {
      if (currentMessages.some((message) => message.id === newMessage.id)) {
        return currentMessages;
      }

      return [...currentMessages, newMessage].sort((left, right) =>
        left.created_at.localeCompare(right.created_at)
      );
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabaseClient();

    async function loadMessages() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          `/api/messages?channel_id=${encodeURIComponent(channel.id)}`,
          { cache: "no-store" }
        );
        const body = (await response.json()) as
          | { messages: Message[] }
          | { error?: string };

        if (!response.ok || !("messages" in body)) {
          throw new Error(
            "error" in body && body.error
              ? body.error
              : "Не удалось загрузить сообщения."
          );
        }

        if (!cancelled) {
          setMessages(body.messages);
        }
      } catch (caughtError) {
        if (!cancelled) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Не удалось загрузить сообщения."
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
          addMessage(payload.new as Message);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(realtimeChannel);
    };
  }, [addMessage, channel.id]);

  async function sendMessage(text: string) {
    const response = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel_id: channel.id, text })
    });
    const body = (await response.json()) as
      | { message: Message }
      | { error?: string };

    if (!response.ok || !("message" in body)) {
      throw new Error(
        "error" in body && body.error
          ? body.error
          : "Не удалось отправить сообщение."
      );
    }

    addMessage(body.message);
  }

  return (
    <section className="flex h-full min-h-0 flex-col" aria-label={channel.name}>
      <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-4 py-2">
        <p className="text-xs text-slate-500">
          {channel.emoji ?? "💬"} Ветка «{channel.name}»
        </p>
      </div>
      <MessageList messages={messages} loading={loading} error={error} />
      <MessageInput onSend={sendMessage} />
    </section>
  );
}
