"use client";

import { FormEvent, useState } from "react";
import type { Locale } from "@/lib/i18n";

function formatInline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={index}>{part.slice(2, -2)}</strong>
      : <span key={index}>{part}</span>
  );
}

function AnswerText({ text }: { text: string }) {
  return <div className="contextAnswer">{text.split(/\n/).map((raw, index) => {
    const line = raw.trim();
    if (!line) return <div className="richSpace" key={index} />;
    if (line.startsWith("## ")) return <h3 key={index}>{formatInline(line.slice(3))}</h3>;
    if (line.startsWith("### ")) return <h4 key={index}>{formatInline(line.slice(4))}</h4>;
    if (/^[-•]\s+/.test(line)) return <p className="richBullet" key={index}>{formatInline(line.replace(/^[-•]\s+/, ""))}</p>;
    return <p key={index}>{formatInline(line)}</p>;
  })}</div>;
}

export default function ResourceQuestionModal({
  resourceCode,
  title,
  locale,
  onClose,
}: {
  resourceCode: string;
  title: string;
  locale: Locale;
  onClose: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!question.trim()) return;
    setLoading(true);
    setError("");
    setAnswer("");
    try {
      const response = await fetch("/api/resource-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resourceCode, question, locale }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erreur");
      setAnswer(data.answer || "");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Erreur");
    } finally {
      setLoading(false);
    }
  };

  return <div className="overlayShell" role="dialog" aria-modal="true" aria-label="Poser une question">
    <section className="premiumModal questionModal">
      <header className="premiumModalHeader">
        <div>
          <span className="eyebrow">QUESTION CONTEXTUELLE</span>
          <h2>{locale === "fr" ? "Posez votre question sur ce sujet" : "Ask about this topic"}</h2>
          <p>{title}</p>
        </div>
        <button className="modalClose" onClick={onClose} type="button" aria-label="Fermer">×</button>
      </header>
      <form className="contextQuestionForm" onSubmit={submit}>
        <textarea
          autoFocus
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={locale === "fr" ? "Ex. Pourquoi applique-t-on ce plafond ? Comment traiter ce cas en paie aujourd’hui ?" : "Ask a precise question about this topic…"}
          rows={4}
        />
        <button className="primary" disabled={loading || !question.trim()}>{loading ? "Païa réfléchit…" : (locale === "fr" ? "Obtenir une réponse structurée" : "Get a structured answer")}</button>
      </form>
      {error && <p className="notice error">{error}</p>}
      {answer && <div className="contextAnswerCard"><AnswerText text={answer} /></div>}
    </section>
  </div>;
}
