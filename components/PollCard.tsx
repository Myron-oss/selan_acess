"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Users } from "lucide-react";

import { apiFetch } from "@/lib/apiClient";
import { getErrorMessage } from "@/lib/errors";
import type { Poll } from "@/lib/types";

interface PollCardProps {
  poll: Poll;
  onUpdated: (poll: Poll) => void;
}

export default function PollCard({ poll, onUpdated }: PollCardProps) {
  const [busyOptionId, setBusyOptionId] = useState<string | null>(null);
  const [expandedOptionId, setExpandedOptionId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const hasVoted = poll.options.some((option) => option.selected_by_current_user);

  async function vote(optionId: string) {
    setBusyOptionId(optionId);
    setError("");
    try {
      const body = await apiFetch<{ poll: Poll }>(
        `/api/polls/${poll.id}/vote`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ option_id: optionId }) },
        "Не удалось сохранить голос."
      );
      onUpdated(body.poll);
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, "Не удалось сохранить голос."));
    } finally {
      setBusyOptionId(null);
    }
  }

  return (
    <div className="min-w-[240px] max-w-sm">
      <p className="px-1 text-[15px] font-bold leading-5">📊 {poll.question}</p>
      <p className="mb-2 mt-1 px-1 text-[11px] opacity-70">{poll.is_anonymous ? "Анонимный опрос" : "Открытый опрос"}{poll.allows_multiple_answers ? " · несколько ответов" : ""}</p>
      <div className="space-y-2">
        {poll.options.map((option) => {
          const expanded = expandedOptionId === option.id;
          return (
            <div key={option.id}>
              <motion.button type="button" className="relative w-full overflow-hidden rounded-xl border border-current/15 bg-white/10 px-3 py-2.5 text-left disabled:opacity-60 dark:bg-black/10" onClick={() => void vote(option.id)} disabled={busyOptionId !== null} whileTap={{ scale: 0.98 }}>
                <motion.span className="absolute inset-y-0 left-0 bg-current/10" animate={{ width: `${hasVoted ? option.percentage : 0}%` }} transition={{ duration: 0.25 }} />
                <span className="relative flex items-center gap-2">
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center ${poll.allows_multiple_answers ? "rounded-md" : "rounded-full"} border border-current/35 ${option.selected_by_current_user ? "bg-white/25" : ""}`}>{option.selected_by_current_user && <Check size={13} strokeWidth={3} />}</span>
                  <span className="min-w-0 flex-1 text-sm font-medium">{option.option_text}</span>
                  {hasVoted && <span className="text-xs font-bold">{option.percentage}%</span>}
                </span>
              </motion.button>
              {!poll.is_anonymous && hasVoted && option.vote_count > 0 && (
                <button type="button" className="mt-1 flex items-center gap-1 px-2 text-[11px] opacity-70 hover:opacity-100" onClick={() => setExpandedOptionId(expanded ? null : option.id)}><Users size={12} />{option.vote_count} {expanded ? "скрыть" : "показать"}</button>
              )}
              {!poll.is_anonymous && expanded && option.voters && <div className="mt-1 rounded-lg bg-black/5 px-2 py-1.5 text-[11px] dark:bg-white/10">{option.voters.map((voter) => voter.full_name).join(", ")}</div>}
            </div>
          );
        })}
      </div>
      <p className="mt-2 px-1 text-xs opacity-70">Голосов: {poll.total_votes}{busyOptionId ? " · сохраняем…" : ""}</p>
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-300">{error}</p>}
    </div>
  );
}
