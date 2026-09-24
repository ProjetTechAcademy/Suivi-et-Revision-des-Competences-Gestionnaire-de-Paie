"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { ResourceRecommendation } from "@/lib/corpus";
import { copy, type Locale } from "@/lib/i18n";
import { piaImages, piaInterfaceState, type PiaVisualState } from "@/lib/pia";
import { ThemeToggle } from "./ThemeToggle";

type Answer = { title: string; summary: string; resources?: ResourceRecommendation[] };
type CatalogResource = Omit<ResourceRecommendation, "reason"> & { pulse: string };
type Favorite = { kind: "resource" | "answer"; code: string; title: string };
type SearchState = "idle" | "listening" | "searching" | "success" | "error";

const pulses = [
  ["Paie & Social", "Paie, déclaratif et protection sociale", "▦"],
  ["RH", "Talents, recrutement et parcours", "◇"],
  ["SIRH", "Outils, flux et interopérabilité", "⌘"],
  ["Droit social", "Relations de travail et réglementation", "§"],
  ["AMOA & Projet", "Cadrage, conduite et recette", "◎"],
  ["Management", "Organisation et pratiques collectives", "△"],
  ["Digital & IA", "IA, automatisation et usages", "✦"],
  ["Tech", "Développement, données et tests", "</>"],
] as const;

function Brand({ locale }: { locale: Locale }) {
  return (
    <span className="brand">
      <Image src="/brand/02_PAIA_Circulaire_Logo_Compact.png" width={56} height={56} alt="Logo PAÏA" priority />
      <span><strong>Corpus Campus PAÏA</strong><small>{copy[locale].brandTagline}</small></span>
    </span>
  );
}

function LanguageToggle({ locale, setLocale }: { locale: Locale; setLocale: (locale: Locale) => void }) {
  return (
    <div className="languageToggle" role="group" aria-label={copy[locale].languageLabel}>
      <button className={locale === "fr" ? "active" : ""} onClick={() => setLocale("fr")} aria-pressed={locale === "fr"}>FR</button>
      <button className={locale === "en" ? "active" : ""} onClick={() => setLocale("en")} aria-pressed={locale === "en"}>EN</button>
    </div>
  );
}

function Header({ locale, setLocale }: { locale: Locale; setLocale: (locale: Locale) => void }) {
  const [open, setOpen] = useState(false);
  const t = copy[locale];
  return (
    <header className="siteHeader">
      <div className="headerInner shell">
        <a href="#accueil" aria-label="Corpus Campus PAÏA"><Brand locale={locale} /></a>
        <button className="menuButton" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? t.closeMenu : t.openMenu}>☰</button>
        <nav className={`mainNav ${open ? "open" : ""}`} aria-label={t.navigation}>
          <a href="#accueil">{t.home}</a>
          <a href="#explorer">{t.explorer}</a>
          <a href="#recherche">{t.search}</a>
          <a href="#favoris">{t.favorites}</a>
          <a href="#apropos">{t.about}</a>
        </nav>
        <div className="headerTools"><LanguageToggle locale={locale} setLocale={setLocale} /><ThemeToggle /></div>
      </div>
    </header>
  );
}

function Hero({ locale }: { locale: Locale }) {
  const t = copy[locale];
  return (
    <section className="hero" id="accueil">
      <div className="heroInner shell">
        <div className="heroCopy">
          <span className="overline">{t.heroOverline}</span>
          <h1>{t.heroTitleA}<br /><em>{t.heroTitleB}</em></h1>
          <p>{t.heroText}</p>
          <div className="valueList"><span>{t.valueSearch}</span><span>{t.valueContext}</span><span>{t.valuePrivate}</span></div>
        </div>
        <div className="heroPia" aria-label="Logo officiel PAÏA">
          <span className="heroHalo" />
          <span className="heroOrbit heroOrbitOne" />
          <span className="heroOrbit heroOrbitTwo" />
          <div className="heroLogoDisc">
            <Image src="/brand/01_PAIA_Circulaire_Logo_Principal.png" width={1080} height={1080} alt="Logo officiel PAÏA" priority />
          </div>
          <small>SAVOIR · PRATIQUER · ÉVOLUER</small>
        </div>
      </div>
    </section>
  );
}

function Search({ locale, pulse, onAnswer, onState, inputRef }: { locale: Locale; pulse: string; onAnswer: (answer: Answer) => void; onState: (state: SearchState) => void; inputRef: React.RefObject<HTMLInputElement | null> }) {
  const t = copy[locale];
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    onState("searching");

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, pulse, locale }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t.searchUnavailable);
      onAnswer(data);
      onState("success");
      window.setTimeout(() => document.querySelector("#fiche")?.scrollIntoView({ behavior: "smooth" }), 80);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t.searchUnavailable);
      onState("error");
    } finally {
      setLoading(false);
    }
  };

  const examples = locale === "fr"
    ? ["Expliquer une notion de droit social", "Comparer deux méthodes de gestion de projet", "Comprendre les tests d’une API"]
    : ["Explain an employment-law concept", "Compare two project methods", "Understand API testing"];

  return (
    <section className="searchArea shell" id="recherche" aria-labelledby="search-title">
      <div className="searchHeading"><span className="eyebrow">{t.searchOverline}</span><h2 id="search-title">{t.searchTitle}</h2><p>{t.searchText}</p></div>
      <form className="searchForm" onSubmit={submit}>
        <span aria-hidden="true">⌕</span>
        <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.searchPlaceholder} aria-label={t.searchInputLabel} />
        <button disabled={loading} aria-label={t.searchButton}>{loading ? "…" : "→"}</button>
      </form>
      <div className="suggestions"><span>{t.suggestions}</span>{examples.map((item) => <button key={item} type="button" onClick={() => { setQuery(item); inputRef.current?.focus(); }}>{item}</button>)}</div>
      {pulse && <div className="activeFilter">Pulse : <b>{pulse}</b></div>}
      {loading && <div className="searchLoading" role="status"><i /><div><b>{t.searchingTitle}</b><span>{t.searchingText}</span></div></div>}
      {error && <p className="searchError" role="alert">{error}</p>}
    </section>
  );
}

function Pulses({ locale, onSelect }: { locale: Locale; onSelect: (name: string) => void }) {
  const t = copy[locale];
  return (
    <section className="pulseSection shell">
      <div className="sectionTitle"><span className="pulseBolt">ϟ</span><div><h2>{t.pulseTitle}</h2><p>{t.pulseText}</p></div></div>
      <div className="pulseGrid">{pulses.map(([name, description, icon]) => <button className="pulseCard" key={name} onClick={() => onSelect(name)}><span className="pulseIcon">{icon}</span><b>{name}</b><p>{description}</p><i>{t.choose} →</i></button>)}</div>
    </section>
  );
}

function Explorer({ locale, onOpen, onFavorite }: { locale: Locale; onOpen: (resource: CatalogResource) => void; onFavorite: (favorite: Favorite) => void }) {
  const t = copy[locale];
  const [resources, setResources] = useState<CatalogResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(true);
  const [parcours, setParcours] = useState("");
  const [block, setBlock] = useState("");
  const [module, setModule] = useState("");

  useEffect(() => {
    fetch("/api/catalog")
      .then(async (response) => {
        const data = await response.json();
        setResources(data.resources ?? []);
        setConnected(Boolean(data.connected));
      })
      .catch(() => setConnected(false))
      .finally(() => setLoading(false));
  }, []);

  const parcoursList = useMemo(() => [...new Set(resources.map((r) => r.formation).filter(Boolean))].sort(), [resources]);
  const byParcours = resources.filter((r) => r.formation === parcours);
  const blocks = [...new Map(byParcours.map((r) => [r.blockCode || r.blockTitle, `${r.blockCode}${r.blockCode && r.blockTitle ? " — " : ""}${r.blockTitle}`])).entries()];
  const byBlock = byParcours.filter((r) => (r.blockCode || r.blockTitle) === block);
  const modules = [...new Map(byBlock.map((r) => [r.moduleCode || r.moduleTitle, `${r.moduleCode}${r.moduleCode && r.moduleTitle ? " — " : ""}${r.moduleTitle}`])).entries()];
  const visible = byBlock.filter((r) => (r.moduleCode || r.moduleTitle) === module);

  return (
    <section className="explorer shell" id="explorer">
      <header><span className="overline">{t.libraryOverline}</span><h2>{t.explorerTitle}</h2><p>{t.explorerText}</p></header>
      <div className="steps" aria-label={t.progress}>
        <span className="ready"><b>1</b>{t.parcours}</span>
        <span className={parcours ? "ready" : ""}><b>2</b>{t.block}</span>
        <span className={block ? "ready" : ""}><b>3</b>{t.module}</span>
        <span className={module ? "ready" : ""}><b>4</b>{t.resource}</span>
      </div>

      <div className="explorerCard">
        {loading ? <div className="catalogState"><i /><h3>{t.catalogLoading}</h3></div> : !connected ? <div className="catalogState"><h3>{t.catalogDisconnected}</h3><p>{t.catalogDisconnectedText}</p></div> : !resources.length ? <div className="catalogState"><h3>{t.catalogEmpty}</h3></div> : <>
          <label>{t.parcours}<select value={parcours} onChange={(e) => { setParcours(e.target.value); setBlock(""); setModule(""); }}><option value="">{t.chooseParcours}</option>{parcoursList.map((item) => <option key={item}>{item}</option>)}</select></label>
          {parcours && <label>{t.block}<select value={block} onChange={(e) => { setBlock(e.target.value); setModule(""); }}><option value="">{t.chooseBlock}</option>{blocks.map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>}
          {block && <label>{t.module}<select value={module} onChange={(e) => setModule(e.target.value)}><option value="">{t.chooseModule}</option>{modules.map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>}
          {module && <div className="resourceGrid">{visible.map((resource) => <article key={resource.resourceCode}><span>{resource.resourceType}</span><h3>{resource.title}</h3><p>{resource.resourceCode}{resource.pulse ? ` · ${resource.pulse}` : ""}</p><div><button onClick={() => onOpen(resource)}>{t.viewSheet}</button><button aria-label={t.addFavorite} onClick={() => onFavorite({ kind: "resource", code: resource.resourceCode, title: resource.title })}>♡</button></div></article>)}</div>}
        </>}
      </div>
    </section>
  );
}

function KnowledgeSheet({ locale, answer, selected, onFavorite }: { locale: Locale; answer: Answer | null; selected: CatalogResource | null; onFavorite: (favorite: Favorite) => void }) {
  if (!answer && !selected) return null;

  const t = copy[locale];
  const title = answer?.title || selected?.title || "";
  const summary = answer?.summary || t.resourceSelected;
  const resources = answer?.resources ?? (selected ? [{ ...selected, reason: t.selectedReason }] : []);

  return (
    <section className="sheetSection" id="fiche">
      <div className="sheetShell shell">
        <article className="knowledgeCard">
          <header className="printHeader">
            <div><span className="eyebrow">{t.knowledgeSheet}</span><h1>{title}</h1><p>{selected ? `${selected.formation} · ${selected.blockTitle} · ${selected.moduleTitle}` : t.generatedFromCorpus}</p></div>
            <Image src={selected?.pulse === "Paie & Social" ? piaImages.payroll : piaImages.answer} width={140} height={140} alt="Pia" />
          </header>
          <div className="sheetActions"><button onClick={() => onFavorite({ kind: answer ? "answer" : "resource", code: selected?.resourceCode || title, title })}>♡ {t.addFavorite}</button><button onClick={() => window.print()}>▣ {t.print}</button></div>
          <section className="synthesis"><span>{t.essential}</span><p className="answerText">{summary}</p></section>
          <section>
            <div className="sectionIntro"><span>{t.documentsUsed}</span><h2>{t.sourcesTitle}</h2><p>{t.sourcesText}</p></div>
            <div className="sourceGrid">{resources.map((resource) => <article key={resource.resourceCode}><div className="sourceTop"><span>{resource.resourceType || t.resource}</span><code>{resource.resourceCode}</code></div><h3>{resource.title}</h3><dl><div><dt>{t.parcours}</dt><dd>{resource.formation}</dd></div><div><dt>{t.block}</dt><dd>{resource.blockCode} {resource.blockTitle}</dd></div><div><dt>{t.module}</dt><dd>{resource.moduleCode} {resource.moduleTitle}</dd></div></dl><p>{resource.reason}</p></article>)}</div>
          </section>
          <section className="watch"><span>{t.watchStatus}</span><h2>{t.watchTitle}</h2><p>{t.watchText}</p></section>
        </article>
      </div>
    </section>
  );
}

function Favorites({ locale, favorites, remove }: { locale: Locale; favorites: Favorite[]; remove: (code: string) => void }) {
  const t = copy[locale];
  return (
    <section className="favorites shell" id="favoris">
      <div className="sectionTitle"><div><h2>{t.favoritesTitle}</h2><p>{t.favoritesText}</p></div></div>
      {favorites.length ? <div className="favoriteGrid">{favorites.map((favorite) => <article key={`${favorite.kind}-${favorite.code}`}><small>{favorite.kind === "answer" ? t.answer : t.resource}</small><button aria-label={t.removeFavorite} onClick={() => remove(favorite.code)}>×</button><h3>{favorite.title}</h3><code>{favorite.code}</code></article>)}</div> : <div className="emptyState"><span>♡</span><h3>{t.noFavorites}</h3><p>{t.noFavoritesText}</p></div>}
    </section>
  );
}

function About({ locale }: { locale: Locale }) {
  const t = copy[locale];
  return <section className="about shell" id="apropos"><Image src={piaImages.hr} width={150} height={150} alt="Pia" /><div><span className="eyebrow">{t.aboutOverline}</span><h2>{t.aboutTitle}</h2><p>{t.aboutText}</p></div></section>;
}

function PiaAssistant({ locale, state, inputRef }: { locale: Locale; state: SearchState; inputRef: React.RefObject<HTMLInputElement | null> }) {
  const t = copy[locale];
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const visual = piaInterfaceState[state] as PiaVisualState;

  return (
    <div className="piaDock">
      {open && <div className="piaPanel"><strong>{t.piaHelp}</strong><p>{t.piaText}</p><button onClick={() => { inputRef.current?.focus(); setOpen(false); }}>{t.askQuestion}</button><a href="#explorer">{t.exploreResource}</a></div>}
      <button className="piaTrigger" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="piaMini">{failed ? <b>P</b> : <Image src={piaImages[visual]} width={64} height={64} alt="Pia" onError={() => setFailed(true)} />}</span>
        <span><b>Pia</b><small>{t.piaRole}</small></span>
      </button>
    </div>
  );
}

export default function CampusApp() {
  const [locale, setLocaleState] = useState<Locale>("fr");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [selected, setSelected] = useState<CatalogResource | null>(null);
  const [pulse, setPulse] = useState("");
  const [state, setState] = useState<SearchState>("idle");
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("paia-locale") as Locale | null;
    if (saved === "fr" || saved === "en") setLocaleState(saved);
    const storedFavorites = localStorage.getItem("paia-favorites");
    if (storedFavorites) {
      try { setFavorites(JSON.parse(storedFavorites)); } catch { /* ignore invalid local data */ }
    }
  }, []);

  useEffect(() => { document.documentElement.lang = locale; }, [locale]);

  const setLocale = (next: Locale) => {
    setLocaleState(next);
    localStorage.setItem("paia-locale", next);
  };

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

  const openResource = (resource: CatalogResource) => {
    setSelected(resource);
    setAnswer(null);
    setState("success");
    setTimeout(() => document.querySelector("#fiche")?.scrollIntoView({ behavior: "smooth" }), 80);
  };

  const selectPulse = (name: string) => {
    setPulse(name);
    document.querySelector("#recherche")?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => inputRef.current?.focus(), 300);
  };

  return (
    <>
      <Header locale={locale} setLocale={setLocale} />
      <main>
        <Hero locale={locale} />
        <Search locale={locale} pulse={pulse} onAnswer={(value) => { setAnswer(value); setSelected(null); }} onState={setState} inputRef={inputRef} />
        <Pulses locale={locale} onSelect={selectPulse} />
        <Explorer locale={locale} onOpen={openResource} onFavorite={saveFavorite} />
        <KnowledgeSheet locale={locale} answer={answer} selected={selected} onFavorite={saveFavorite} />
        <Favorites locale={locale} favorites={favorites} remove={removeFavorite} />
        <About locale={locale} />
      </main>
      <footer><div className="shell"><Brand locale={locale} /><p>{copy[locale].footer}</p><Image src="/brand/03_MMPA_Circulaire_Logo.png" width={56} height={56} alt="MMPA" /></div></footer>
      <PiaAssistant locale={locale} state={state} inputRef={inputRef} />
    </>
  );
}
