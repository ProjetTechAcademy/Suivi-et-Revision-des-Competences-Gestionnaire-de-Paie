export type CorpusResource = {
  resourceCode: string;
  project: string;
  formation: string;
  blockCode: string;
  blockTitle: string;
  moduleCode: string;
  moduleTitle: string;
  resourceType: string;
  title: string;
  pulse: string;
  subdomain: string;
  keywords: string[];
  regulatory: boolean;
  updatedAt: string;
  extractedText: string;
  reserved: boolean;
  hasTranscript: boolean;
};

export type ResourceRecommendation = Pick<
  CorpusResource,
  "resourceCode" | "formation" | "blockCode" | "blockTitle" | "moduleCode" | "moduleTitle" | "resourceType" | "title"
> & { reason: string };

const PROJECT_15_BLOCK_TITLES: Record<string, string> = {
  B00: "Réussir ma formation Graduate Formateur professionnel d'adultes",
  B01: "Les fondamentaux de l'animation pédagogique",
  B02: "Concevoir et préparer la formation",
  B03: "Animer une formation et évaluer les acquis des apprenants",
  B04: "Accompagner les apprenants en formation",
  B05: "Formateur d'adultes — inscrire sa pratique professionnelle dans une démarche qualité et RSE",
};

const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";
const bool = (value: unknown) => value === true || value === "true" || value === "oui" || value === "1";

function splitLabel(value: string, kind: "block" | "module") {
  const expression = kind === "block"
    ? /^\s*(B\d{1,2})\s*(?:[-–—:]\s*)?(.+)?$/i
    : /^\s*(?:module\s*)?(\d{1,2})\s*(?:[-–—:]\s*)?(.+)?$/i;
  const match = value.match(expression);
  if (!match) return { code: value, title: "" };
  return {
    code: kind === "block" ? `B${match[1].slice(1).padStart(2, "0")}` : `Module ${match[1].padStart(2, "0")}`,
    title: clean(match[2]),
  };
}

export function normalizeCorpusResource(input: Record<string, unknown>): { resource: CorpusResource; warnings: string[] } {
  const rawBlock = clean(input.blockCode ?? input.bloc ?? input.block);
  const rawModule = clean(input.moduleCode ?? input.module);
  const parsedBlock = splitLabel(rawBlock, "block");
  const parsedModule = splitLabel(rawModule, "module");
  const project = clean(input.project ?? input.projet);
  const blockCode = clean(input.blockCode) || parsedBlock.code;
  const moduleCode = clean(input.moduleCode) || parsedModule.code;
  let blockTitle = clean(input.blockTitle ?? input.titreBloc) || parsedBlock.title;
  const moduleTitle = clean(input.moduleTitle ?? input.titreModule) || parsedModule.title;

  if (/^(projet\s*)?15$/i.test(project) && !blockTitle) blockTitle = PROJECT_15_BLOCK_TITLES[blockCode] ?? "";

  const keywordValue = input.keywords ?? input.motsCles;
  const keywords = Array.isArray(keywordValue)
    ? keywordValue.map(clean).filter(Boolean)
    : clean(keywordValue).split(/[,;|]/).map((item) => item.trim()).filter(Boolean);

  const resource: CorpusResource = {
    resourceCode: clean(input.resourceCode ?? input.code ?? input.codeRessource),
    project,
    formation: clean(input.formation),
    blockCode,
    blockTitle,
    moduleCode,
    moduleTitle,
    resourceType: clean(input.resourceType ?? input.type ?? input.typeRessource),
    title: clean(input.title ?? input.titre),
    pulse: clean(input.pulse ?? input.domain ?? input.domaine),
    subdomain: clean(input.subdomain ?? input.sousDomaine),
    keywords,
    regulatory: bool(input.regulatory ?? input.caractereReglementaire),
    updatedAt: clean(input.updatedAt ?? input.year ?? input.annee ?? input.dateMiseAJour),
    extractedText: clean(input.extractedText ?? input.texteExtrait ?? input.transcript ?? input.transcription),
    reserved: bool(input.reserved ?? input.reservee ?? input.positionReservee),
    hasTranscript: bool(input.hasTranscript) || Boolean(clean(input.transcript ?? input.transcription)),
  };

  const warnings: string[] = [];
  if (resource.blockCode && !resource.blockTitle) warnings.push("BLOCK_TITLE_MISSING");
  if (resource.moduleCode && !resource.moduleTitle) warnings.push("MODULE_TITLE_MISSING");
  if (!resource.resourceCode) warnings.push("RESOURCE_CODE_MISSING");
  if (!resource.title && !resource.reserved) warnings.push("RESOURCE_TITLE_MISSING");
  return { resource, warnings };
}

export function buildIndexDocument(resource: CorpusResource) {
  const metadata = [
    `Code ressource : ${resource.resourceCode}`,
    `Projet : ${resource.project}`,
    `Formation : ${resource.formation}`,
    `Bloc : ${resource.blockCode} — ${resource.blockTitle}`,
    `Module : ${resource.moduleCode} — ${resource.moduleTitle}`,
    `Type : ${resource.resourceType}`,
    `Titre : ${resource.title}`,
    `Pulse : ${resource.pulse}`,
    `Sous-domaine : ${resource.subdomain}`,
    `Mots-clés : ${resource.keywords.join(", ")}`,
    `Réglementaire : ${resource.regulatory ? "oui" : "non"}`,
    `Mise à jour : ${resource.updatedAt}`,
    `Position réservée : ${resource.reserved ? "oui" : "non"}`,
  ].join("\n");
  const content = resource.extractedText
    ? `${metadata}\n\nContenu indexable :\n${resource.extractedText}`
    : `${metadata}\n\nCette ressource ne dispose pas de contenu plein texte. Elle reste recommandable à partir de ses métadonnées.`;
  return content;
}

export function publicAttributes(resource: CorpusResource): Record<string, string | boolean> {
  return {
    resource_code: resource.resourceCode.slice(0, 256),
    project: resource.project.slice(0, 256),
    formation: resource.formation.slice(0, 256),
    block_code: resource.blockCode.slice(0, 256),
    block_title: resource.blockTitle.slice(0, 256),
    module_code: resource.moduleCode.slice(0, 256),
    module_title: resource.moduleTitle.slice(0, 256),
    resource_type: resource.resourceType.slice(0, 256),
    title: resource.title.slice(0, 256),
    pulse: resource.pulse.slice(0, 256),
    regulatory: resource.regulatory,
    reserved: resource.reserved,
  };
}
