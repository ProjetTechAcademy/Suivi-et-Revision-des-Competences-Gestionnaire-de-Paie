"use client";

import Image from "next/image";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import type { ResourceRecommendation } from "@/lib/corpus";
import { formations, pulses } from "@/lib/data";
import { ThemeToggle } from "./ThemeToggle";

type Answer = { title: string; summary: string; resources?: ResourceRecommendation[] };
type Formation = keyof typeof formations;

const pulseStyles = ["blue", "purple", "teal", "rose", "gold", "green", "indigo", "navy"];

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={compact ? "brand compact" : "brand"}>
      <Image src="/brand/02_PAIA_Circulaire_Logo_Compact.png" width={56} height={56} alt="Logo officiel PAÏA compact" priority />
      <span><strong>Campus PAÏA</strong><small>Savoir aujourd’hui. Agir demain.</small></span>
    </span>
  );
}

function Header() {
  const [open, setOpen] = useState(false);
  return (
    <header className="siteHeader">
      <div className="headerInner shell">
        <a href="#accueil" aria-label="Campus PAÏA — Accueil"><Brand /></a>
        <button className="menuButton" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}>☰</button>
        <nav className={open ? "mainNav open" : "mainNav"} aria-label="Navigation principale">
          <a className="active" href="#accueil">⌂ <span>Accueil</span></a>
          <a href="#explorer">◉ <span>Explorer</span></a>
          <a href="#enonces">▧ <span>Énoncés</span></a>
          <a href="#favoris">♡ <span>Mes favoris</span></a>
          <a href="#apropos">ⓘ <span>À propos</span></a>
        </nav>
        <div className="headerTools">
          <ThemeToggle />
          <button className="language" aria-label="Langue actuelle : français">◎ <span>FR</span>⌄</button>
          <button className="profile" aria-label="Profil de Mathilde"><span>M</span><b>Mathilde</b>⌄</button>
        </div>
      </div>
    </header>
  );
}

function PiaAssistant() {
  const [panel, setPanel] = useState(false);
  const speech = (action: "play" | "pause" | "resume" | "stop") => {
    if (!("speechSynthesis" in window)) return;
    if (action === "pause") return speechSynthesis.pause();
    if (action === "resume") return speechSynthesis.resume();
    if (action === "stop") return speechSynthesis.cancel();
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance("Bonjour ! Je suis Pia, votre compagne de recherche. Posez-moi une question ou explorez un Pulse !");
    utterance.lang = "fr-FR";
    speechSynthesis.speak(utterance);
  };
  return (
    <div className="piaDock">
      {panel && <div className="piaPanel"><strong>Comment puis-je vous aider ?</strong><a href="#explorer">Explorer une ressource</a><a href="#pulses">Choisir un Pulse</a><button onClick={() => speech("play")}>▷ Lire mon message</button><div><button onClick={() => speech("pause")}>Pause</button><button onClick={() => speech("resume")}>Reprendre</button><button onClick={() => speech("stop")}>Arrêter</button></div></div>}
      <button className="piaTrigger" onClick={() => setPanel(!panel)} aria-expanded={panel} aria-label={panel ? "Fermer l’assistance Pia" : "Ouvrir l’assistance Pia"}><span className="piaMini" aria-hidden="true" /><span><b>Pia</b><small>Compagne de recherche</small></span></button>
    </div>
  );
}

function Hero() {
  return (
    <section className="hero" id="accueil">
      <div className="heroGlow" />
      <div className="heroInner shell">
        <div className="heroCopy">
          <span className="overline">VOTRE CONNAISSANCE, ÉCLAIRÉE</span>
          <h1>Votre allié pour<br /><em>apprendre</em>, comprendre<br />et avancer.</h1>
          <p>Des connaissances fiables. Des explications claires.<br />Une veille toujours à jour. Et une bonne dose de motivation !</p>
          <div className="heroStats"><span><b>1 839</b>ressources indexées</span><span><b>8</b>domaines d’expertise</span><span><b>100 %</b>privé & sécurisé</span></div>
        </div>
        <div className="heroMedallion" aria-label="Logo officiel PAÏA">
          <i className="orbit orbitOne" /><i className="orbit orbitTwo" />
          <div className="logoDisc"><Image src="/brand/01_PAIA_Circulaire_Logo_Principal.png" width={1080} height={1080} alt="Logo officiel PAÏA" priority /></div>
          <span className="orbitLabel">SAVOIR · PRATIQUER · ÉVOLUER</span>
        </div>
      </div>
    </section>
  );
}

function Search({ answer, setAnswer, pulse, clearPulse }: { answer: Answer | null; setAnswer: (answer: Answer) => void; pulse: string; clearPulse: () => void }) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;
    setError(""); setLoading(true);
    try {
      const response = await fetch("/api/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, pulse }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "La recherche est momentanément indisponible.");
      setAnswer(data);
      window.setTimeout(() => document.querySelector("#fiche")?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "La recherche est momentanément indisponible."); }
    finally { setLoading(false); }
  };
  return (
    <section className="searchArea shell" aria-label="Recherche principale">
      <form className="searchForm" onSubmit={submit}><span aria-hidden="true">⌕</span><input value={query} onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)} placeholder="Posez votre question à Campus PAÏA…" aria-label="Posez votre question" /><button disabled={loading} aria-label="Rechercher">{loading ? "…" : "→"}</button></form>
      <div className="suggestions"><span>Exemples :</span>{["DSN", "Recrutement", "Recette fonctionnelle", "Formation professionnelle"].map((item) => <button key={item} onClick={() => setQuery(item)}>{item}</button>)}</div>
      {pulse && <div className="activeFilter">Pulse sélectionné : <b>{pulse}</b><button onClick={clearPulse}>×</button></div>}
      {error && <p className="searchError" role="alert">{error}</p>}
      {answer && <span className="srOnly">Une réponse est disponible dans la fiche Campus PAÏA.</span>}
    </section>
  );
}

function Pulses({ onSelect }: { onSelect: (pulse: string) => void }) {
  return (
    <section className="pulseSection shell" id="pulses">
      <div className="sectionTitle"><div><span className="pulseBolt">ϟ</span><h2>Les Pulse</h2><p>Explorez par domaine pour affiner votre recherche.</p></div><a href="#pulses">Voir tous les domaines →</a></div>
      <div className="pulseGrid">{pulses.map(([name, description, icon], index) => <button className={`pulseCard ${pulseStyles[index]}`} key={name} onClick={() => onSelect(name)}><span className="pulseIcon">{icon}</span><b>{name}</b><p>{description}</p><i>→</i></button>)}</div>
    </section>
  );
}

function Shortcuts() {
  const items = [["◈", "Explorer les formations", "Par projet, bloc, module et ressource", "#explorer", "Accéder à l’explorateur"], ["▤", "Découvrir les énoncés", "S’entraîner et structurer son raisonnement", "#fiche", "Accéder aux énoncés"], ["★", "Vos favoris", "Retrouvez vos fiches et réponses", "#favoris", "Voir mes favoris"]];
  return <section className="shortcuts shell" id="enonces">{items.map(([icon, title, description, href, label], index) => <article key={title}><span className={`shortcutIcon c${index}`}>{icon}</span><div><h3>{title}</h3><p>{description}</p><a href={href}>{label}　→</a></div></article>)}</section>;
}

function Explorer() {
  const [formation, setFormation] = useState<Formation | "">("");
  const [bloc, setBloc] = useState(""); const [module, setModule] = useState(""); const [resource, setResource] = useState("");
  const tree = formation ? formations[formation] as Record<string, Record<string, readonly string[]>> : null;
  const blocks = tree ? Object.keys(tree) : [];
  const modules = tree && bloc ? Object.keys(tree[bloc] ?? {}) : [];
  const resources = useMemo(() => tree && bloc && module ? tree[bloc]?.[module] ?? [] : [], [tree, bloc, module]);
  const Choice = ({ title, items, onPick, back }: { title: string; items: readonly string[]; onPick: (item: string) => void; back?: () => void }) => <div className="choicePanel">{back && <button className="backButton" onClick={back}>← Étape précédente</button>}<h3>{title}</h3><div>{items.map((item) => <button key={item} onClick={() => onPick(item)}><span>▣</span>{item}<b>→</b></button>)}</div></div>;
  return (
    <section className="explorer shell" id="explorer">
      <header><span className="overline">VOTRE BIBLIOTHÈQUE PRIVÉE</span><h2>Explorer les ressources</h2><p>Progressez pas à pas, de la formation jusqu’à la ressource.</p></header>
      <div className="steps">{["Formation", "Bloc", "Module", "Ressource"].map((name, index) => <span className={(index === 0 || index === 1 && formation || index === 2 && bloc || index === 3 && module) ? "ready" : ""} key={name}><b>{index + 1}</b>{name}</span>)}</div>
      <div className="explorerCard">
        {!formation && <Choice title="Choisissez une formation" items={Object.keys(formations)} onPick={(item) => setFormation(item as Formation)} />}
        {formation && !bloc && <Choice title="Choisissez un bloc" items={blocks} onPick={setBloc} back={() => setFormation("")} />}
        {formation && bloc && !module && <Choice title="Choisissez un module" items={modules} onPick={setModule} back={() => setBloc("")} />}
        {formation && bloc && module && !resource && <Choice title="Choisissez une ressource" items={resources} onPick={setResource} back={() => setModule("")} />}
        {resource && <div className="resourceResult"><button className="backButton" onClick={() => setResource("")}>← Retour aux ressources</button><p>{formation}　/　{bloc}　/　{module}</p><h3>{resource}</h3><small>Référence interne · CPA-{String(resource.length).padStart(3, "0")}</small><div><button>Résumer cette ressource</button><button>Points à maîtriser</button></div></div>}
      </div>
    </section>
  );
}

function KnowledgeSheet({ answer }: { answer: Answer | null }) {
  const [favorite, setFavorite] = useState(false);
  useEffect(() => setFavorite(localStorage.getItem("favorite-dsn") === "1"), []);
  const text = answer?.summary || "La DSN est un flux déclaratif mensuel transmis par les employeurs à partir des données de paie. Elle permet de communiquer aux organismes sociaux les informations nécessaires à la gestion des droits et au calcul des cotisations.";
  const toggleFavorite = () => { const next = !favorite; setFavorite(next); localStorage.setItem("favorite-dsn", next ? "1" : "0"); };
  const listen = () => { speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(text); utterance.lang = "fr-FR"; speechSynthesis.speak(utterance); };
  const contents = ["En 30 secondes", "Comprendre vraiment", "Ce que dit la formation", "Mise à jour & veille", "Cas pratique", "Le réflexe pro", "Glossaire", "Sources", "À retenir"];
  return (
    <section className="sheetSection" id="fiche">
      <div className="shell"><h2>Aperçu d’une fiche Campus PAÏA</h2><div className="sheetLayout">
        <aside className="sheetToc"><b>Sommaire</b>{contents.map((item, index) => <a className={index === 0 ? "active" : ""} href={`#part-${index}`} key={item}><span>{index === 0 ? "⊞" : "◉"}</span>{item}</a>)}<button onClick={() => window.print()}>▣　Imprimer</button></aside>
        <article className="knowledgeCard"><div className="domainRail">PAIE & SOCIAL</div><div className="knowledgeBody">
          <header><div><h1>{answer?.title || "DSN — Comprendre la déclaration sociale nominative"}</h1><p>De la logique déclarative au contrôle des données sociales</p></div><Image src="/brand/02_PAIA_Circulaire_Logo_Compact.png" width={124} height={124} alt="Logo officiel PAÏA" /></header>
          <div className="sheetMeta"><span>◆　Pulse Paie & Social</span><span>◷　Lecture : 7 min</span><span>▣　Vérifié le 21/09/2026</span><button onClick={toggleFavorite}>{favorite ? "★ Favori" : "☆ Ajouter"}</button></div>
          <div className="reference"><b>▤　Référence pédagogique</b><p>Gestionnaire de Paie · Administration de la paie<br />Module 4 — Les déclarations sociales<br />Accès Studi : retrouvez cette ressource dans votre médiathèque avec votre code interne.</p></div>
          <section className="thirty" id="part-0"><h3>🎯　En 30 secondes</h3><p>{text}</p><small>Source recommandée : documentation officielle en vigueur.</small></section>
          {answer?.resources && answer.resources.length > 0 && <section className="helpfulResources" aria-labelledby="helpful-resources-title"><h3 id="helpful-resources-title">Ressources qui peuvent vous aider</h3><div>{answer.resources.map((resource) => <article key={resource.resourceCode}><header><span>{resource.resourceType || "Ressource"}</span><b>{resource.title}</b></header><p><strong>{resource.formation}</strong><br />{resource.blockCode} — {resource.blockTitle}<br />{resource.moduleCode} — {resource.moduleTitle}</p><small>{resource.reason}</small></article>)}</div></section>}
          <section id="part-1"><h3>Comprendre vraiment</h3><p>Chaque événement individuel devient une donnée structurée. La fiabilité de la déclaration dépend donc directement de la qualité des informations et des contrôles de paie.</p></section>
          <section className="watch" id="part-3"><h3>Mise à jour & veille</h3><p>Le cours pose le cadre pédagogique. Les dates, règles et paramètres opérationnels doivent toujours être confirmés auprès d’une source officielle actuelle.</p></section>
          <section id="part-4"><h3>Cas pratique</h3><p>Une absence saisie après la clôture peut produire une donnée incohérente. Contrôlez l’événement, sa période de rattachement et son impact avant l’envoi.</p></section>
        </div></article>
        <aside className="readingTools"><b>Outils de lecture</b><button onClick={listen}>🔊　Écouter la fiche</button><ThemeToggle /><button>🇫🇷　Français　⌄</button><button>🇬🇧　Traduire en anglais</button><button onClick={() => window.print()}>▣　Imprimer (PDF)</button><div className="tip"><strong>Le conseil de Pia 🌱</strong><p>« Une règle comprise aujourd’hui, c’est une hésitation de moins demain. »</p></div></aside>
      </div></div>
    </section>
  );
}

function WhyPaia() {
  return <section className="why shell" id="apropos"><h2><Image src="/brand/04_PAIA_Circulaire_Icone.png" width={48} height={48} alt="" />Pourquoi Campus PAÏA ?</h2><div><p><b>✓　Des réponses issues de vos cours</b><span>Croisées avec les sources officielles.</span></p><p><b>◎　Une veille actualisée</b><span>Réglementaire, sociale, numérique…</span></p><p><b>♧　Des explications concrètes</b><span>Avec exemples et cas pratiques.</span></p><p><b>♡　Une touche positive</b><span>Parce qu’apprendre peut être motivant !</span></p></div></section>;
}

export default function CampusApp() {
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [pulse, setPulse] = useState("");
  const selectPulse = (name: string) => { setPulse(name); document.querySelector(".searchArea")?.scrollIntoView({ behavior: "smooth", block: "center" }); };
  return <><Header /><main><Hero /><Search answer={answer} setAnswer={setAnswer} pulse={pulse} clearPulse={() => setPulse("")} /><Pulses onSelect={selectPulse} /><Shortcuts /><WhyPaia /><Explorer /><KnowledgeSheet answer={answer} /><div id="favoris" /></main><footer><div className="shell"><Brand compact /><p>🌱 Apprendre. Comprendre. Progresser. Ensemble.</p><span>Campus PAÏA · Septembre 2026</span><Image src="/brand/03_MMPA_Circulaire_Logo.png" width={56} height={56} alt="Logo officiel MMPA" /></div></footer><PiaAssistant /></>;
}
