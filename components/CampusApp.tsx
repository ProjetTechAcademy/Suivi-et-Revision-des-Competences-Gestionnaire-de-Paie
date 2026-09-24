"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { ResourceRecommendation } from "@/lib/corpus";
import { copy, type Locale } from "@/lib/i18n";
import { piaImages } from "@/lib/pia";
import { ThemeToggle } from "./ThemeToggle";

type Mode = "question" | "documents" | "revision" | "favorites" | "about";
type Answer = { title: string; summary: string; resources?: ResourceRecommendation[]; sourceTextAvailable?: boolean };
type Revision = { title: string; resourceCode: string; content: string };
type CatalogResource = Omit<ResourceRecommendation, "reason"> & {
  pulse: string;
  platformUrl?: string;
  hasPrivateDocument: boolean;
  hasSourceText: boolean;
};
type Favorite = { code: string; title: string; kind: "resource" | "answer" | "revision" };

const pulseNames = ["Paie & Social", "RH", "SIRH", "Droit social", "AMOA & Projet", "Management", "Digital & IA", "Tech"];

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
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => part.startsWith("**") && part.endsWith("**") ? <strong key={index}>{part.slice(2, -2)}</strong> : <span key={index}>{part}</span>);
}

function RichText({ text }: { text: string }) {
  return <div className="richText">{text.split(/\n/).map((raw, index) => {
    const line = raw.trim();
    if (!line) return <div className="richSpace" key={index} />;
    if (line.startsWith("### ")) return <h4 key={index}>{inline(line.slice(4))}</h4>;
    if (line.startsWith("## ")) return <h3 key={index}>{inline(line.slice(3))}</h3>;
    if (line.startsWith("# ")) return <h2 key={index}>{inline(line.slice(2))}</h2>;
    if (/^[-•]\s+/.test(line)) return <p className="richBullet" key={index}>{inline(line.replace(/^[-•]\s+/, ""))}</p>;
    if (/^\d+[.)]\s+/.test(line)) return <p className="richNumber" key={index}>{inline(line)}</p>;
    return <p key={index}>{inline(line)}</p>;
  })}</div>;
}

function CompactSources({ locale, resources, openDocument }: { locale: Locale; resources: ResourceRecommendation[]; openDocument: (resource: ResourceRecommendation) => void }) {
  const t = copy[locale];
  if (!resources.length) return null;
  return <section className="compactSources"><h3>📚 {t.resourcesUsed}</h3><ul>{resources.map((resource) => <li key={resource.resourceCode}><code>{resource.resourceCode}</code><span>{resource.title}</span><span className="sourceActions">{resource.hasPrivateDocument && <button onClick={() => openDocument(resource)}>{t.openDocument}</button>}{resource.platformUrl && <a href={resource.platformUrl} target="_blank" rel="noreferrer">{t.platform}</a>}</span></li>)}</ul></section>;
}

function QuestionPanel({ locale, ownerKey, setOwnerKey, saveFavorite }: { locale: Locale; ownerKey: string; setOwnerKey: (key: string) => void; saveFavorite: (favorite: Favorite) => void }) {
  const t = copy[locale];
  const [query, setQuery] = useState("");
  const [pulse, setPulse] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const openDocument = async (resource: ResourceRecommendation) => {
    let key = ownerKey;
    if (!key) {
      key = window.prompt(t.ownerPrompt) || "";
      if (key) setOwnerKey(key);
    }
    const response = await fetch("/api/resource-access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resourceCode: resource.resourceCode, ownerKey: key }) });
    const data = await response.json();
    if (response.ok && data.documentUrl) window.open(data.documentUrl, "_blank", "noopener,noreferrer");
    else setError(data.error || t.sourceRestricted);
  };

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
    {answer && <article className="resultSheet"><header><span className="eyebrow">{t.answer}</span><h2>{answer.title}</h2><div><button onClick={() => saveFavorite({ kind: "answer", code: answer.title, title: answer.title })}>♡ {t.favoriteAdd}</button><button onClick={() => window.print()}>▣ {t.print}</button></div></header><RichText text={answer.summary} /><CompactSources locale={locale} resources={answer.resources ?? []} openDocument={openDocument} /></article>}
  </section>;
}

function ResourcePicker({ locale, mode, ownerKey, setOwnerKey, saveFavorite }: { locale: Locale; mode: "documents" | "revision"; ownerKey: string; setOwnerKey: (key: string) => void; saveFavorite: (favorite: Favorite) => void }) {
  const t = copy[locale];
  const [resources, setResources] = useState<CatalogResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [parcours, setParcours] = useState("");
  const [block, setBlock] = useState("");
  const [module, setModule] = useState("");
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState<Revision | null>(null);
  const [generating, setGenerating] = useState("");

  useEffect(() => {
    fetch("/api/catalog").then((r) => r.json()).then((data) => setResources(data.resources ?? [])).catch(() => setMessage("Catalogue indisponible.")).finally(() => setLoading(false));
  }, []);

  const parcoursList = useMemo(() => [...new Set(resources.map((r) => r.formation).filter(Boolean))].sort(), [resources]);
  const byParcours = resources.filter((r) => r.formation === parcours);
  const blocks = [...new Map(byParcours.map((r) => [r.blockCode || r.blockTitle, `${r.blockCode}${r.blockCode && r.blockTitle ? " — " : ""}${r.blockTitle}`])).entries()];
  const byBlock = byParcours.filter((r) => (r.blockCode || r.blockTitle) === block);
  const modules = [...new Map(byBlock.map((r) => [r.moduleCode || r.moduleTitle, `${r.moduleCode}${r.moduleCode && r.moduleTitle ? " — " : ""}${r.moduleTitle}`])).entries()];
  const visible = byBlock.filter((r) => (r.moduleCode || r.moduleTitle) === module);

  const openDocument = async (resource: CatalogResource | ResourceRecommendation) => {
    let key = ownerKey;
    if (!key) {
      key = window.prompt(t.ownerPrompt) || "";
      if (key) setOwnerKey(key);
    }
    const response = await fetch("/api/resource-access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resourceCode: resource.resourceCode, ownerKey: key }) });
    const data = await response.json();
    if (response.ok && data.documentUrl) window.open(data.documentUrl, "_blank", "noopener,noreferrer");
    else setMessage(data.error || t.sourceRestricted);
  };

  const generateRevision = async (resource: CatalogResource) => {
    setGenerating(resource.resourceCode); setMessage(""); setRevision(null);
    try {
      const response = await fetch("/api/revision", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resourceCode: resource.resourceCode, locale }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erreur");
      setRevision(data);
      window.setTimeout(() => document.querySelector("#revision-result")?.scrollIntoView({ behavior: "smooth" }), 80);
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Erreur"); }
    finally { setGenerating(""); }
  };

  return <section className="toolPanel">
    <header className="panelIntro"><span className="eyebrow">{mode === "documents" ? "BIBLIOTHÈQUE" : "RÉVISION"}</span><h2>{t.explorerTitle}</h2><p>{t.explorerText}</p></header>
    {loading ? <p className="notice">{t.loading}</p> : <>
      <div className="pickerGrid">
        <label>{t.parcours}<select value={parcours} onChange={(e) => { setParcours(e.target.value); setBlock(""); setModule(""); }}><option value="">{t.chooseParcours}</option>{parcoursList.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className={!parcours ? "disabled" : ""}>{t.block}<select disabled={!parcours} value={block} onChange={(e) => { setBlock(e.target.value); setModule(""); }}><option value="">{t.chooseBlock}</option>{blocks.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className={!block ? "disabled" : ""}>{t.module}<select disabled={!block} value={module} onChange={(e) => setModule(e.target.value)}><option value="">{t.chooseModule}</option>{modules.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      </div>
      {module && <div className="resourceList">{visible.length ? visible.map((resource) => <div className="resourceRow" key={resource.resourceCode}><span className="resourceType">{resource.resourceType}</span><code>{resource.resourceCode}</code><strong>{resource.title}</strong><span className="rowActions">
        <button className="ghost" onClick={() => saveFavorite({ kind: "resource", code: resource.resourceCode, title: resource.title })}>♡</button>
        {mode === "documents" && resource.hasPrivateDocument && <button onClick={() => openDocument(resource)}>{t.openDocument}</button>}
        {mode === "documents" && resource.platformUrl && <a href={resource.platformUrl} target="_blank" rel="noreferrer">{t.platform}</a>}
        {mode === "documents" && !resource.hasPrivateDocument && !resource.platformUrl && <small>{t.sourceNotLinked}</small>}
        <button className="primary" onClick={() => generateRevision(resource)} disabled={generating === resource.resourceCode}>{generating === resource.resourceCode ? t.generatingRevision : t.generateRevision}</button>
      </span></div>) : <p className="notice">{t.noResources}</p>}</div>}
    </>}
    {message && <p className="notice error">{message}</p>}
    {revision && <article className="resultSheet revisionSheet" id="revision-result"><header><span className="eyebrow">FICHE PRATIQUE</span><h2>{revision.title}</h2><div><code>{revision.resourceCode}</code><button onClick={() => saveFavorite({ kind: "revision", code: revision.resourceCode, title: revision.title })}>♡ {t.favoriteAdd}</button><button onClick={() => window.print()}>▣ {t.print}</button></div></header><RichText text={revision.content} /></article>}
  </section>;
}

function FavoritesPanel({ locale, favorites, remove }: { locale: Locale; favorites: Favorite[]; remove: (code: string) => void }) {
  const t = copy[locale];
  return <section className="toolPanel"><header className="panelIntro"><span className="eyebrow">FAVORIS</span><h2>{t.favoritesTitle}</h2></header>{favorites.length ? <div className="favoriteList">{favorites.map((item) => <div key={item.code}><span>{item.kind}</span><code>{item.code}</code><strong>{item.title}</strong><button onClick={() => remove(item.code)}>×</button></div>)}</div> : <p className="notice">{t.noFavorites}</p>}</section>;
}

function AboutPanel({ locale }: { locale: Locale }) {
  const t = copy[locale];
  return <section className="toolPanel aboutPanel"><img src={piaImages.default} alt="Pia, mascotte de Corpus Campus PAÏA" /><div><span className="eyebrow">À PROPOS</span><h2>{t.aboutTitle}</h2><p>{t.aboutText}</p></div></section>;
}

function PiaDock({ locale, inputRef }: { locale: Locale; inputRef: RefObject<HTMLInputElement | null> }) {
  const [open, setOpen] = useState(false);
  const t = copy[locale];
  return <div className="piaDock">{open && <div className="piaBubble"><strong>Pia</strong><p>{locale === "fr" ? "Je reste disponible pendant que vous travaillez." : "I stay available while you work."}</p><button onClick={() => { inputRef.current?.focus(); setOpen(false); }}>{locale === "fr" ? "Poser une question" : "Ask a question"}</button></div>}<button className="piaTrigger" onClick={() => setOpen(!open)}><img src={piaImages.default} alt="Pia" /><span><b>Pia</b><small>{t.piaRole}</small></span></button></div>;
}

export default function CampusApp() {
  const [locale, setLocaleState] = useState<Locale>("fr");
  const [mode, setMode] = useState<Mode>("question");
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [ownerKey, setOwnerKeyState] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const savedLocale = localStorage.getItem("paia-locale");
    if (savedLocale === "fr" || savedLocale === "en") setLocaleState(savedLocale);
    const stored = localStorage.getItem("paia-favorites");
    if (stored) try { setFavorites(JSON.parse(stored)); } catch { /* ignore */ }
    setOwnerKeyState(sessionStorage.getItem("paia-owner-key") || "");
  }, []);

  useEffect(() => { document.documentElement.lang = locale; }, [locale]);

  const setLocale = (next: Locale) => { setLocaleState(next); localStorage.setItem("paia-locale", next); };
  const setOwnerKey = (key: string) => { setOwnerKeyState(key); if (key) sessionStorage.setItem("paia-owner-key", key); };
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
      <Hero locale={locale} />
      <WorkspaceChooser locale={locale} mode={mode} setMode={setMode} />
      <div className="workspace shell" id="workspace">
        {mode === "question" && <QuestionPanel locale={locale} ownerKey={ownerKey} setOwnerKey={setOwnerKey} saveFavorite={saveFavorite} />}
        {mode === "documents" && <ResourcePicker locale={locale} mode="documents" ownerKey={ownerKey} setOwnerKey={setOwnerKey} saveFavorite={saveFavorite} />}
        {mode === "revision" && <ResourcePicker locale={locale} mode="revision" ownerKey={ownerKey} setOwnerKey={setOwnerKey} saveFavorite={saveFavorite} />}
        {mode === "favorites" && <FavoritesPanel locale={locale} favorites={favorites} remove={removeFavorite} />}
        {mode === "about" && <AboutPanel locale={locale} />}
      </div>
    </main>
    <footer><div className="shell"><Brand locale={locale} /><p>Apprendre. Comprendre. Progresser.</p><Image src="/brand/03_MMPA_Circulaire_Logo.png" width={50} height={50} alt="MMPA" /></div></footer>
    <PiaDock locale={locale} inputRef={inputRef} />
  </>;
}
