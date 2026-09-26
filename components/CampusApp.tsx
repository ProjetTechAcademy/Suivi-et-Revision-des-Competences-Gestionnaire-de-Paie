"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject, type PointerEvent as ReactPointerEvent } from "react";
import type { ResourceRecommendation } from "@/lib/corpus";
import { copy, type Locale } from "@/lib/i18n";
import { piaImages } from "@/lib/pia";
import { ThemeToggle } from "./ThemeToggle";
import MindMapPanel, { type MindMapData } from "./MindMapPanel";
import ResourceQuestionModal from "./ResourceQuestionModal";

type Mode = "question" | "documents" | "revision" | "favorites" | "about";
type Answer = { title: string; summary: string; resources?: ResourceRecommendation[]; sourceTextAvailable?: boolean };
type Revision = { title: string; resourceCode: string; content: string };
type RevisionProgress = { stage: string; done: number; total: number; label: string };
type CatalogResource = Omit<ResourceRecommendation, "reason"> & {
  pulse: string;
  platformUrl?: string;
  hasPrivateDocument: boolean;
  hasSourceText: boolean;
};
type Favorite = { code: string; title: string; kind: "resource" | "answer" | "revision" };

const pulseNames = ["Paie & Social", "RH", "SIRH", "Droit social", "AMOA & Projet", "Management", "Digital & IA", "Tech"];

type PickerName = "parcours" | "block" | "module";
type PickerChoice = [string, string];

const naturalCollator = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });
const naturalSort = (a: string, b: string) => naturalCollator.compare(a, b);

function PickerSelect({
  name,
  label,
  value,
  options,
  placeholder,
  disabled,
  openName,
  setOpenName,
  onChange,
}: {
  name: PickerName;
  label: string;
  value: string;
  options: PickerChoice[];
  placeholder: string;
  disabled?: boolean;
  openName: PickerName | null;
  setOpenName: (name: PickerName | null) => void;
  onChange: (value: string) => void;
}) {
  const selected = options.find(([key]) => key === value);
  const open = openName === name;

  return <div className={`pickerField ${disabled ? "disabled" : ""}`}>
    <span className="pickerLabel">{label}</span>
    <button
      type="button"
      className="pickerButton"
      disabled={disabled}
      aria-expanded={open}
      onClick={() => setOpenName(open ? null : name)}
    >
      <span className={`pickerButtonText ${selected ? "" : "placeholder"}`}>{selected?.[1] || placeholder}</span>
      <span className="pickerChevron" aria-hidden="true">⌄</span>
    </button>
    {open && <div className="pickerMenu" role="listbox" aria-label={label}>
      {options.map(([key, optionLabel]) => <button
        type="button"
        key={key}
        className={key === value ? "active" : ""}
        onClick={() => { onChange(key); setOpenName(null); }}
      >
        <span>{optionLabel}</span>
      </button>)}
    </div>}
  </div>;
}

function Brand({ locale }: { locale: Locale }) {
  return <span className="brand"><Image src="/brand/02_PAIA_Circulaire_Logo_Compact.png" width={54} height={54} alt="Logo PAÏA" /><span><strong>Corpus Campus PAÏA</strong><small>{copy[locale].brandTagline}</small></span></span>;
}

function Header({ locale, setLocale, setMode }: { locale: Locale; setLocale: (locale: Locale) => void; setMode: (mode: Mode) => void }) {
  const t = copy[locale];
  return <header className="siteHeader"><div className="headerInner shell">
    <button className="brandButton" onClick={() => { setMode("question"); window.scrollTo({ top: 0, behavior: "smooth" }); }}><Brand locale={locale} /></button>
    <nav>
      <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>{t.home}</button>
      <button onClick={() => setMode("question")}>{t.tools}</button>
      <button onClick={() => setMode("favorites")}>{t.favorites}</button>
      <button onClick={() => setMode("about")}>{t.about}</button>
    </nav>
    <div className="headerTools">
      <div className="languageToggle"><button className={locale === "fr" ? "active" : ""} onClick={() => setLocale("fr")}>FR</button><button className={locale === "en" ? "active" : ""} onClick={() => setLocale("en")}>EN</button></div>
      <ThemeToggle />
    </div>
  </div></header>;
}

function Hero({ locale }: { locale: Locale }) {
  const t = copy[locale];
  return <section className="hero"><div className="heroInner shell">
    <div className="heroCopy"><span className="overline">{t.heroOverline}</span><h1>{t.heroTitleA}<br /><em>{t.heroTitleB}</em></h1><p>{t.heroText}</p></div>
    <div className="heroPia" aria-label="Logo officiel PAÏA"><span className="heroHalo" /><span className="heroOrbit heroOrbitOne" /><span className="heroOrbit heroOrbitTwo" /><div className="heroLogoDisc"><Image src="/brand/01_PAIA_Circulaire_Logo_Principal.png" width={1080} height={1080} alt="Logo officiel PAÏA" priority /></div><small>SAVOIR · PRATIQUER · ÉVOLUER</small></div>
  </div></section>;
}

function WorkspaceChooser({ locale, mode, setMode }: { locale: Locale; mode: Mode; setMode: (mode: Mode) => void }) {
  const t = copy[locale];
  const options: Array<[Mode, string, string, string]> = [
    ["question", "?", t.ask, t.askText],
    ["documents", "↗", t.read, t.readText],
    ["revision", "✦", t.revise, t.reviseText],
  ];
  return <section className="workspaceChooser shell"><header><span className="eyebrow">CORPUS CAMPUS PAÏA</span><h2>{t.chooseAction}</h2><p>{t.chooseActionText}</p></header><div className="workspaceCards">{options.map(([value, icon, title, text]) => <button key={value} className={mode === value ? "active" : ""} onClick={() => setMode(value)}><span>{icon}</span><div><strong>{title}</strong><small>{text}</small></div></button>)}</div></section>;
}

function inline(text: string) {
  const tokenPattern = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\(https?:\/\/[^)]+\))/g;
  return text.split(tokenPattern).filter(Boolean).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*")) return <em key={index}>{part.slice(1, -1)}</em>;
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
    if (link) return <a key={index} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>;
    return <span key={index}>{part}</span>;
  });
}

function splitTableRow(line: string) {
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function RichText({ text }: { text: string }) {
  const lines = text.split(/\n/);
  const nodes: ReactNode[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    const next = lines[index + 1]?.trim() || "";

    if (
      line.includes("|") &&
      /^\|?\s*:?-{3,}/.test(next) &&
      next.includes("|")
    ) {
      const headers = splitTableRow(line);
      const rows: string[][] = [];
      index += 2;

      while (index < lines.length) {
        const row = lines[index].trim();
        if (!row || !row.includes("|")) {
          index -= 1;
          break;
        }
        rows.push(splitTableRow(row));
        index += 1;
      }

      nodes.push(
        <div className="richTableWrap" key={`table-${index}`}>
          <table className="richTable">
            <thead><tr>{headers.map((cell, cellIndex) => <th key={cellIndex}>{inline(cell)}</th>)}</tr></thead>
            <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{headers.map((_, cellIndex) => <td key={cellIndex}>{inline(row[cellIndex] || "")}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
      continue;
    }

    if (line === ":::update" || line === ":::current") {
      const kind = line === ":::update" ? "update" : "current";
      const endMarker = kind === "update" ? ":::endupdate" : ":::endcurrent";
      const blockLines: string[] = [];
      index += 1;
      while (index < lines.length && lines[index].trim() !== endMarker) {
        blockLines.push(lines[index].trim());
        index += 1;
      }
      nodes.push(
        <aside className={`richAlert ${kind}`} key={`alert-${index}`}>
          {blockLines.map((blockLine, blockIndex) => blockLine ? <p key={blockIndex}>{inline(blockLine)}</p> : <div className="richSpace" key={blockIndex} />)}
        </aside>
      );
      continue;
    }

    if (!line) { nodes.push(<div className="richSpace" key={index} />); continue; }
    if (line.startsWith("### ")) { nodes.push(<h4 key={index}>{inline(line.slice(4))}</h4>); continue; }
    if (line.startsWith("## ")) { nodes.push(<h3 key={index}>{inline(line.slice(3))}</h3>); continue; }
    if (line.startsWith("# ")) { nodes.push(<h2 key={index}>{inline(line.slice(2))}</h2>); continue; }
    if (/^[-•]\s+/.test(line)) { nodes.push(<p className="richBullet" key={index}>{inline(line.replace(/^[-•]\s+/, ""))}</p>); continue; }
    if (/^\d+[.)]\s+/.test(line)) { nodes.push(<p className="richNumber" key={index}>{inline(line)}</p>); continue; }
    nodes.push(<p key={index}>{inline(line)}</p>);
  }

  return <div className="richText">{nodes}</div>;
}

function CompactSources({ locale, resources }: { locale: Locale; resources: ResourceRecommendation[] }) {
  const t = copy[locale];
  if (!resources.length) return null;
  return <section className="compactSources"><h3>📚 {t.resourcesUsed}</h3><ul>{resources.map((resource) => <li key={resource.resourceCode}><code>{resource.resourceCode}</code><span>{resource.title}</span><span className="sourceActions">{resource.platformUrl && <a href={resource.platformUrl} target="_blank" rel="noreferrer">{locale === "fr" ? "Lien plateforme" : "Platform link"}</a>}</span></li>)}</ul></section>;
}

function QuestionPanel({ locale, saveFavorite }: { locale: Locale; saveFavorite: (favorite: Favorite) => void }) {
  const t = copy[locale];
  const [query, setQuery] = useState("");
  const [pulse, setPulse] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, pulse, locale }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erreur");
      setAnswer(data);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Erreur"); }
    finally { setLoading(false); }
  };

  return <section className="toolPanel">
    <form className="questionForm" onSubmit={submit}><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.searchPlaceholder} /><button disabled={loading}>{loading ? "…" : t.searchButton}</button></form>
    <div className="pulseChips"><small>{t.pulse}</small>{pulseNames.map((name) => <button key={name} className={pulse === name ? "active" : ""} onClick={() => setPulse(pulse === name ? "" : name)}>{name}</button>)}</div>
    {error && <p className="notice error">{error}</p>}
    {answer && <article className="resultSheet"><header><span className="eyebrow">{t.answer}</span><h2>{answer.title}</h2><div><button onClick={() => saveFavorite({ kind: "answer", code: answer.title, title: answer.title })}>♡ {t.favoriteAdd}</button><button onClick={() => window.print()}>▣ {t.print}</button></div></header><RichText text={answer.summary} /><CompactSources locale={locale} resources={answer.resources ?? []} /></article>}
  </section>;
}

function ResourcePicker({ locale, mode, saveFavorite }: { locale: Locale; mode: "documents" | "revision"; saveFavorite: (favorite: Favorite) => void }) {
  const t = copy[locale];
  const [resources, setResources] = useState<CatalogResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [parcours, setParcours] = useState("");
  const [block, setBlock] = useState("");
  const [module, setModule] = useState("");
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState<Revision | null>(null);
  const [generating, setGenerating] = useState("");
  const [revisionProgress, setRevisionProgress] = useState<RevisionProgress | null>(null);
  const [openPicker, setOpenPicker] = useState<PickerName | null>(null);
  const [mindMap, setMindMap] = useState<MindMapData | null>(null);
  const [mindMapLoading, setMindMapLoading] = useState("");
  const [questionResource, setQuestionResource] = useState<CatalogResource | null>(null);

  useEffect(() => {
    fetch("/api/catalog").then((r) => r.json()).then((data) => setResources(data.resources ?? [])).catch(() => setMessage("Catalogue indisponible.")).finally(() => setLoading(false));
  }, []);

  const parcoursList = useMemo(
    () => [...new Set(resources.map((r) => r.formation).filter(Boolean))].sort(naturalSort),
    [resources]
  );

  const blocks = useMemo<PickerChoice[]>(() => {
    const map = new Map<string, string>();
    resources
      .filter((r) => r.formation === parcours)
      .forEach((r) => {
        const key = r.blockCode || r.blockTitle;
        if (!key) return;
        map.set(key, `${r.blockCode}${r.blockCode && r.blockTitle ? " — " : ""}${r.blockTitle}`);
      });
    return [...map.entries()].sort((a, b) => naturalSort(a[0], b[0]) || naturalSort(a[1], b[1]));
  }, [resources, parcours]);

  const modules = useMemo<PickerChoice[]>(() => {
    const map = new Map<string, string>();
    resources
      .filter((r) => r.formation === parcours && (r.blockCode || r.blockTitle) === block)
      .forEach((r) => {
        const key = r.moduleCode || r.moduleTitle;
        if (!key) return;
        map.set(key, `${r.moduleCode}${r.moduleCode && r.moduleTitle ? " — " : ""}${r.moduleTitle}`);
      });
    return [...map.entries()].sort((a, b) => naturalSort(a[0], b[0]) || naturalSort(a[1], b[1]));
  }, [resources, parcours, block]);

  const visible = useMemo(
    () => resources
      .filter((r) =>
        r.formation === parcours &&
        (r.blockCode || r.blockTitle) === block &&
        (r.moduleCode || r.moduleTitle) === module
      )
      .sort((a, b) => naturalSort(a.resourceCode, b.resourceCode) || naturalSort(a.title, b.title)),
    [resources, parcours, block, module]
  );

  const generateRevision = async (resource: CatalogResource) => {
    setGenerating(resource.resourceCode);
    setMessage("");
    setRevision(null);
    setRevisionProgress({
      stage: "prepare",
      done: 0,
      total: 0,
      label: locale === "fr" ? "Préparation du document…" : "Preparing document…",
    });

    const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

    try {
      let ready = false;
      let loops = 0;

      while (!ready && loops < 100) {
        loops += 1;
        const prepareResponse = await fetch("/api/revision/prepare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resourceCode: resource.resourceCode, locale }),
        });
        const prepare = await prepareResponse.json();

        if (!prepareResponse.ok) {
          if (prepareResponse.status === 503) {
            setRevisionProgress({
              stage: prepare.stage || "prepare",
              done: 0,
              total: 0,
              label: locale === "fr"
                ? "Le moteur fait une courte pause avant de reprendre…"
                : "The engine is taking a short pause before resuming…",
            });
            await wait(Math.max(12000, Number(prepare.waitMs ?? 35000)));
            continue;
          }
          throw new Error(prepare.error || "Erreur");
        }

        const progress = prepare.progress ?? {};
        const done = Number(progress.done ?? 0);
        const total = Number(progress.total ?? 0);
        let label = locale === "fr" ? "Préparation…" : "Preparing…";

        if (prepare.stage === "slices") {
          label = locale === "fr"
            ? `🧠 Lecture structurée : ${done}/${total}`
            : `🧠 Structured reading: ${done}/${total}`;
        } else if (prepare.stage === "groups") {
          label = locale === "fr"
            ? `🧩 Consolidation : ${done}/${total}`
            : `🧩 Consolidation: ${done}/${total}`;
        } else if (prepare.stage === "parts") {
          label = locale === "fr"
            ? `✍️ Rédaction de la fiche : ${done}/${total}`
            : `✍️ Writing the sheet: ${done}/${total}`;
        } else if (prepare.stage === "ready") {
          label = locale === "fr" ? "✅ Préparation terminée" : "✅ Preparation complete";
        }

        setRevisionProgress({ stage: prepare.stage || "prepare", done, total, label });
        ready = Boolean(prepare.ready);

        const waitMs = Math.max(0, Number(prepare.waitMs ?? 0));
        if (waitMs > 0) await wait(waitMs);
      }

      if (!ready) {
        throw new Error(locale === "fr"
          ? "La préparation n’a pas pu se terminer automatiquement."
          : "Preparation could not complete automatically.");
      }

      setRevisionProgress({
        stage: "generation",
        done: 1,
        total: 1,
        label: locale === "fr" ? "✍️ Génération de la Fiche PAÏA…" : "✍️ Generating PAÏA Sheet…",
      });

      const response = await fetch("/api/revision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resourceCode: resource.resourceCode, locale }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erreur");

      setRevision(data);
      setRevisionProgress({
        stage: "done",
        done: 1,
        total: 1,
        label: locale === "fr" ? "✅ Fiche PAÏA prête" : "✅ PAÏA Sheet ready",
      });
      window.setTimeout(() => document.querySelector("#revision-result")?.scrollIntoView({ behavior: "smooth" }), 80);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Erreur");
      setRevisionProgress(null);
    } finally {
      setGenerating("");
    }
  };

  const generateMindMap = async (resource: CatalogResource) => {
    setMindMapLoading(resource.resourceCode);
    setMessage("");
    try {
      const response = await fetch("/api/mindmap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resourceCode: resource.resourceCode, locale }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erreur");
      setMindMap(data);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Erreur");
    } finally {
      setMindMapLoading("");
    }
  };

  return <section className="toolPanel">
    <header className="panelIntro"><span className="eyebrow">{mode === "documents" ? "BIBLIOTHÈQUE" : "FICHE PAÏA"}</span><h2>{t.explorerTitle}</h2><p>{t.explorerText}</p></header>
    {loading ? <p className="notice">{t.loading}</p> : <>
      <div className="pickerGrid">
        <PickerSelect
          name="parcours"
          label={t.parcours}
          value={parcours}
          options={parcoursList.map((item) => [item, item])}
          placeholder={t.chooseParcours}
          openName={openPicker}
          setOpenName={setOpenPicker}
          onChange={(value) => { setParcours(value); setBlock(""); setModule(""); }}
        />
        <PickerSelect
          name="block"
          label={t.block}
          value={block}
          options={blocks}
          placeholder={t.chooseBlock}
          disabled={!parcours}
          openName={openPicker}
          setOpenName={setOpenPicker}
          onChange={(value) => { setBlock(value); setModule(""); }}
        />
        <PickerSelect
          name="module"
          label={t.module}
          value={module}
          options={modules}
          placeholder={t.chooseModule}
          disabled={!block}
          openName={openPicker}
          setOpenName={setOpenPicker}
          onChange={setModule}
        />
      </div>
      {module && <div className="resourceList">{visible.length ? visible.map((resource) => <div className="resourceRow" key={resource.resourceCode}><span className="resourceType">{resource.resourceType}</span><code>{resource.resourceCode}</code><strong>{resource.title}</strong><span className="rowActions">
        <button className="ghost" onClick={() => saveFavorite({ kind: "resource", code: resource.resourceCode, title: resource.title })} title={locale === "fr" ? "Ajouter aux favoris" : "Add to favorites"}>♡</button>
        {resource.platformUrl && <a href={resource.platformUrl} target="_blank" rel="noreferrer" title={locale === "fr" ? "Ouvrir la source autorisée" : "Open source link"}>↗ {locale === "fr" ? "Source" : "Source"}</a>}
        <button className="primary" onClick={() => generateRevision(resource)} disabled={generating === resource.resourceCode}>{generating === resource.resourceCode ? "…" : (locale === "fr" ? "📄 Fiche PAÏA" : "📄 PAÏA Sheet")}</button>
        <button onClick={() => generateMindMap(resource)} disabled={mindMapLoading === resource.resourceCode}>{mindMapLoading === resource.resourceCode ? "…" : (locale === "fr" ? "🧠 Carte mentale" : "🧠 Mind map")}</button>
        <button className="questionAction" onClick={() => setQuestionResource(resource)} title={locale === "fr" ? "Poser une question sur ce sujet" : "Ask about this topic"}>?</button>
      </span></div>) : <p className="notice">{t.noResources}</p>}</div>}
    </>}
    {message && <p className="notice error">{message}</p>}
    {revisionProgress && <div className="revisionProgress" aria-live="polite">
      <div className="revisionProgressTop"><strong>{revisionProgress.label}</strong>{revisionProgress.total > 0 && <span>{revisionProgress.done}/{revisionProgress.total}</span>}</div>
      <div className="revisionProgressTrack"><span style={{ width: `${revisionProgress.total > 0 ? Math.max(6, Math.min(100, Math.round((revisionProgress.done / revisionProgress.total) * 100))) : 12}%` }} /></div>
      <small>{locale === "fr" ? "Le travail déjà effectué est conservé : vous ne repartez pas de zéro." : "Completed work is saved: progress is never restarted from zero."}</small>
    </div>}
    {revision && <article className="resultSheet revisionSheet" id="revision-result"><header><span className="eyebrow">FICHE PAÏA</span><h2>{revision.title}</h2><div><code>{revision.resourceCode}</code><button onClick={() => saveFavorite({ kind: "revision", code: revision.resourceCode, title: revision.title })}>♡ {t.favoriteAdd}</button><button onClick={() => window.print()}>▣ {t.print}</button></div></header><RichText text={revision.content} /></article>}
    {mindMap && <MindMapPanel data={mindMap} onClose={() => setMindMap(null)} />}
    {questionResource && <ResourceQuestionModal resourceCode={questionResource.resourceCode} title={questionResource.title} locale={locale} onClose={() => setQuestionResource(null)} />}
  </section>;
}

function FavoritesPanel({ locale, favorites, remove }: { locale: Locale; favorites: Favorite[]; remove: (code: string) => void }) {
  const t = copy[locale];
  return <section className="toolPanel"><header className="panelIntro"><span className="eyebrow">FAVORIS</span><h2>{t.favoritesTitle}</h2></header>{favorites.length ? <div className="favoriteList">{favorites.map((item) => <div key={item.code}><span>{item.kind}</span><code>{item.code}</code><strong>{item.title}</strong><button onClick={() => remove(item.code)}>×</button></div>)}</div> : <p className="notice">{t.noFavorites}</p>}</section>;
}

function AboutPanel({ locale }: { locale: Locale }) {
  const t = copy[locale];
  return <section className="toolPanel aboutPanel"><img src={piaImages.default} alt="Païa, mascotte de Corpus Campus PAÏA" /><div><span className="eyebrow">À PROPOS</span><h2>{t.aboutTitle}</h2><p>{t.aboutText}</p></div></section>;
}

function PiaDock({ locale, inputRef }: { locale: Locale; inputRef: RefObject<HTMLInputElement | null> }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const drag = useRef({ active: false, moved: false, startX: 0, startY: 0, baseX: 0, baseY: 0 });
  const t = copy[locale];

  const pointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    drag.current = {
      active: true,
      moved: false,
      startX: event.clientX,
      startY: event.clientY,
      baseX: position.x,
      baseY: position.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const pointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag.current.active) return;
    const dx = event.clientX - drag.current.startX;
    const dy = event.clientY - drag.current.startY;
    if (Math.abs(dx) + Math.abs(dy) > 5) drag.current.moved = true;
    const minX = -(Math.max(window.innerWidth - 190, 0));
    const minY = -(Math.max(window.innerHeight - 130, 0));
    setPosition({
      x: Math.min(0, Math.max(minX, drag.current.baseX + dx)),
      y: Math.min(0, Math.max(minY, drag.current.baseY + dy)),
    });
  };

  const pointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    drag.current.active = false;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* no-op */ }
  };

  return <div className="piaDock" style={{ transform: `translate3d(${position.x}px,${position.y}px,0)` }}>
    {open && <div className="piaBubble"><strong>Païa</strong><p>{locale === "fr" ? "Je reste disponible pendant que vous travaillez. Vous pouvez aussi me déplacer pour libérer votre lecture." : "I stay available while you work. You can drag me out of the way."}</p><button onClick={() => { inputRef.current?.focus(); setOpen(false); }}>{locale === "fr" ? "Poser une question" : "Ask a question"}</button></div>}
    <button
      className="piaTrigger"
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onClick={() => { if (!drag.current.moved) setOpen(!open); drag.current.moved = false; }}
      title={locale === "fr" ? "Cliquer pour ouvrir • glisser pour déplacer" : "Click to open • drag to move"}
    >
      <img src={piaImages.default} alt="Païa" />
      <span><b>Païa</b><small>{t.piaRole}</small></span>
    </button>
  </div>;
}

export default function CampusApp() {
  const [locale, setLocaleState] = useState<Locale>("fr");
  const [mode, setMode] = useState<Mode>("question");
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const savedLocale = localStorage.getItem("paia-locale");
    if (savedLocale === "fr" || savedLocale === "en") setLocaleState(savedLocale);
    const stored = localStorage.getItem("paia-favorites");
    if (stored) try { setFavorites(JSON.parse(stored)); } catch { /* ignore */ }
  }, []);

  useEffect(() => { document.documentElement.lang = locale; }, [locale]);

  const setLocale = (next: Locale) => { setLocaleState(next); localStorage.setItem("paia-locale", next); };
  const saveFavorite = (favorite: Favorite) => setFavorites((current) => {
    const next = current.some((item) => item.code === favorite.code) ? current : [favorite, ...current];
    localStorage.setItem("paia-favorites", JSON.stringify(next));
    return next;
  });
  const removeFavorite = (code: string) => setFavorites((current) => {
    const next = current.filter((item) => item.code !== code);
    localStorage.setItem("paia-favorites", JSON.stringify(next));
    return next;
  });

  return <>
    <Header locale={locale} setLocale={setLocale} setMode={setMode} />
    <main>
      {mode === "question" && <Hero locale={locale} />}
      <WorkspaceChooser locale={locale} mode={mode} setMode={setMode} />
      <div className="workspace shell" id="workspace">
        {mode === "question" && <QuestionPanel locale={locale} saveFavorite={saveFavorite} />}
        {mode === "documents" && <ResourcePicker locale={locale} mode="documents" saveFavorite={saveFavorite} />}
        {mode === "revision" && <ResourcePicker locale={locale} mode="revision" saveFavorite={saveFavorite} />}
        {mode === "favorites" && <FavoritesPanel locale={locale} favorites={favorites} remove={removeFavorite} />}
        {mode === "about" && <AboutPanel locale={locale} />}
      </div>
    </main>
    <footer><div className="shell"><Brand locale={locale} /><p>Apprendre. Comprendre. Progresser.</p><Image src="/brand/03_MMPA_Circulaire_Logo.png" width={50} height={50} alt="MMPA" /></div></footer>
    <PiaDock locale={locale} inputRef={inputRef} />
  </>;
}
