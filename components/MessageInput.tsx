"use client";

import { FormEvent, KeyboardEvent, useState } from "react";

interface MessageInputProps {
  onSend: (text: string) => Promise<void>;
}

export default function MessageInput({ onSend }: MessageInputProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    const cleanText = text.trim();
    if (!cleanText || sending) {
      return;
    }

    setSending(true);
    setError("");

    try {
      await onSend(cleanText);
      setText("");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Не удалось отправить сообщение."
      );
    } finally {
      setSending(false);
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

  return (
    <form
      onSubmit={handleSubmit}
      className="shrink-0 border-t border-slate-200 bg-white px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3"
    >
      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
      <div className="flex items-end gap-2">
        <label className="sr-only" htmlFor="message-text">
          Сообщение
        </label>
        <textarea
          id="message-text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={2000}
          rows={1}
          placeholder="Написать сообщение…"
          className="field max-h-28 min-h-11 resize-none"
          disabled={sending}
        />
        <button
          type="submit"
          className="primary-button h-11 w-11 shrink-0 px-0 text-lg"
          disabled={!text.trim() || sending}
          aria-label="Отправить сообщение"
        >
          {sending ? "…" : "➤"}
        </button>
      </div>
    </form>
  );
}
