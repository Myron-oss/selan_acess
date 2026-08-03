"use client";

import { FormEvent, useState } from "react";
import { motion } from "framer-motion";
import { Plus, X } from "lucide-react";

import type { PollDraft } from "@/lib/types";

interface PollComposerProps {
  submitting: boolean;
  onClose: () => void;
  onSubmit: (draft: PollDraft) => Promise<void>;
}

export default function PollComposer({ submitting, onClose, onSubmit }: PollComposerProps) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [allowsMultipleAnswers, setAllowsMultipleAnswers] = useState(false);
  const validOptions = options.map((option) => option.trim()).filter(Boolean);
  const valid = question.trim().length > 0 && validOptions.length >= 2;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || submitting) return;
    await onSubmit({
      question: question.trim(),
      options: validOptions,
      is_anonymous: isAnonymous,
      allows_multiple_answers: allowsMultipleAnswers
    });
  }

  return (
    <motion.div className="fixed inset-0 z-[80] flex items-end bg-black/45 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center sm:justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.form role="dialog" aria-modal="true" aria-labelledby="poll-composer-title" className="w-full max-w-lg rounded-[1.6rem] bg-[var(--surface)] p-4 shadow-2xl" initial={{ y: 70, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 70, opacity: 0, scale: 0.98 }} transition={{ duration: 0.2 }} onClick={(event) => event.stopPropagation()} onSubmit={submit}>
        <div className="flex items-center justify-between gap-3">
          <div><h2 id="poll-composer-title" className="text-lg font-bold text-slate-900 dark:text-slate-50">Новый опрос</h2><p className="text-xs muted-text">От 2 до 10 вариантов ответа</p></div>
          <motion.button type="button" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-[var(--surface-muted)]" aria-label="Закрыть" onClick={onClose} disabled={submitting} whileTap={{ scale: 0.92 }}><X size={21} /></motion.button>
        </div>

        <label className="mt-4 block"><span className="mb-1 block text-xs font-medium muted-text">Вопрос</span><textarea className="field min-h-20 resize-none" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={300} placeholder="О чём спросить коллег?" disabled={submitting} /></label>

        <fieldset className="mt-3" disabled={submitting}>
          <legend className="mb-1 text-xs font-medium muted-text">Варианты</legend>
          <div className="space-y-2">
            {options.map((option, index) => (
              <div key={index} className="flex gap-2">
                <input className="field" value={option} onChange={(event) => setOptions((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} maxLength={150} placeholder={`Вариант ${index + 1}`} />
                {options.length > 2 && <motion.button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-[var(--surface-muted)]" aria-label={`Удалить вариант ${index + 1}`} onClick={() => setOptions((current) => current.filter((_, itemIndex) => itemIndex !== index))} whileTap={{ scale: 0.92 }}><X size={19} /></motion.button>}
              </div>
            ))}
          </div>
          {options.length < 10 && <motion.button type="button" className="mt-2 flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-[var(--accent)] hover:bg-[var(--surface-muted)]" onClick={() => setOptions((current) => [...current, ""])} whileTap={{ scale: 0.97 }}><Plus size={18} />Добавить вариант</motion.button>}
        </fieldset>

        <div className="mt-3 space-y-2">
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-[var(--surface-muted)] px-3 py-2.5 text-sm"><span>Анонимное голосование</span><input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={isAnonymous} onChange={(event) => setIsAnonymous(event.target.checked)} disabled={submitting} /></label>
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-[var(--surface-muted)] px-3 py-2.5 text-sm"><span>Несколько ответов</span><input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={allowsMultipleAnswers} onChange={(event) => setAllowsMultipleAnswers(event.target.checked)} disabled={submitting} /></label>
        </div>

        <motion.button type="submit" className="primary-button mt-4 w-full" disabled={!valid || submitting} whileTap={{ scale: 0.97 }}>{submitting ? "Публикуем…" : "Опубликовать опрос"}</motion.button>
      </motion.form>
    </motion.div>
  );
}
