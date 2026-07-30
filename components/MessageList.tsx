"use client";

import { useEffect, useRef } from "react";

import type { Message } from "@/lib/types";

interface MessageListProps {
  messages: Message[];
  loading: boolean;
  error: string;
}

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  hour: "2-digit",
  minute: "2-digit"
});

export default function MessageList({
  messages,
  loading,
  error
}: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
        Загружаем сообщения…
      </div>
    );
  }

  return (
    <div
      className="flex-1 overflow-y-auto px-3 py-4"
      aria-live="polite"
      aria-label="Сообщения"
    >
      {error && (
        <div className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {!error && messages.length === 0 && (
        <div className="flex min-h-full items-center justify-center text-center text-sm text-slate-500">
          Здесь пока нет сообщений.
          <br />
          Начните обсуждение.
        </div>
      )}

      <div className="space-y-3">
        {messages.map((message) => (
          <article
            key={message.id}
            className="max-w-[92%] rounded-2xl rounded-tl-md border border-slate-200 bg-white px-3.5 py-2.5 shadow-sm"
          >
            <div className="flex items-baseline justify-between gap-3">
              <p className="truncate text-sm font-semibold text-brand-700">
                {message.sender_name}
              </p>
              <time
                className="shrink-0 text-[11px] text-slate-400"
                dateTime={message.created_at}
              >
                {dateFormatter.format(new Date(message.created_at))}
              </time>
            </div>
            <p className="mt-1 whitespace-pre-wrap break-words text-[15px] leading-5 text-slate-800">
              {message.text}
            </p>
          </article>
        ))}
      </div>
      <div ref={endRef} />
    </div>
  );
}
