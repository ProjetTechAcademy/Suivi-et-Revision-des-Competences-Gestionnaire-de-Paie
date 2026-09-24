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
  platformUrl: string;
  privateDocumentUrl: string;
  sourceUrl: string;
};

export type ResourceRecommendation = Pick<
  CorpusResource,
  "resourceCode" | "formation" | "blockCode" | "blockTitle" | "moduleCode" | "moduleTitle" | "resourceType" | "title"
> & {
  reason: string;
  hasPrivateDocument?: boolean;
};

const PROJECT_15_BLOCK_TITLES: Record<string, string> = {
  B00: "Introduction",
  B01: "Les fondamentaux de l'animation pédagogique",
  B02: "Concevoir et préparer la formation",
  B03: "Animer une formation et évaluer les acquis des apprenants",
  B04: "Accompagner les apprenants en formation",
  B05: "Formateur d'adultes — inscrire sa pratique professionnelle dans une démarche qualité et RSE",
};

const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";
const bool = (value: unknown) => value === true || value === "true" || value === "oui" || value === "1";

export function publicText(value: unknown) {
  return clean(value)
    .replace(/\b(?:studi|mba|bachelor|graduate)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([:;,])/g, "$1")
    .trim();
}

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
    resourceCode: clean(input.resourceCode ?? input.code ?? input.codeRessource ?? input["Code original"]),
    project,
    formation: clean(input.formation ?? input["Formation"]),
    blockCode,
    blockTitle,
    moduleCode,
    moduleTitle,
    resourceType: clean(input.resourceType ?? input.type ?? input.typeRessource ?? input["Type ressource"]),
    title: clean(input.title ?? input.titre ?? input["Titre ressource"]),
    pulse: clean(input.pulse ?? input.domain ?? input.domaine ?? input["Domaine PAÏA auto"]),
    subdomain: clean(input.subdomain ?? input.sousDomaine ?? input["Sous-domaine auto"]),
    keywords,
    regulatory: bool(input.regulatory ?? input.caractereReglementaire ?? input["Réglementaire / temporel ?"]),
    updatedAt: clean(input.updatedAt ?? input.year ?? input.annee ?? input.dateMiseAJour ?? input["Année MAJ"] ?? input["Dernière modification"]),
    extractedText: clean(input.extractedText ?? input.texteExtrait ?? input.transcript ?? input.transcription),
    reserved: bool(input.reserved ?? input.reservee ?? input.positionReservee),
    hasTranscript: bool(input.hasTranscript) || Boolean(clean(input.transcript ?? input.transcription)),
    platformUrl: clean(input.platformUrl ?? input.studiUrl ?? input.lienStudi ?? input["Lien Studi"]),
    privateDocumentUrl: clean(input.privateDocumentUrl ?? input.driveUrl ?? input.lienDrivePrincipal ?? input["Lien Drive principal"]),
    sourceUrl: clean(input.sourceUrl ?? input.lienSourcePdf ?? input["Lien source / PDF"]),
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
    `Corpus : ${publicText(resource.formation)}`,
    `Bloc : ${resource.blockCode} — ${publicText(resource.blockTitle)}`,
    `Module : ${resource.moduleCode} — ${publicText(resource.moduleTitle)}`,
    `Type : ${publicText(resource.resourceType)}`,
    `Titre : ${publicText(resource.title)}`,
    `Pulse : ${resource.pulse}`,
    `Sous-domaine : ${resource.subdomain}`,
    `Mots-clés : ${resource.keywords.join(", ")}`,
    `Réglementaire : ${resource.regulatory ? "oui" : "non"}`,
    `Mise à jour : ${resource.updatedAt}`,
    `Position réservée : ${resource.reserved ? "oui" : "non"}`,
  ].join("\n");
  const content = resource.extractedText
    ? `${metadata}\n\nContenu indexable :\n${resource.extractedText}`
    : `${metadata}\n\nCette ressource ne dispose pas encore de contenu plein texte indexé.`;
  return content;
}

export function publicAttributes(resource: CorpusResource): Record<string, string | boolean> {
  return {
    resource_code: resource.resourceCode.slice(0, 256),
    project: resource.project.slice(0, 256),
    formation: publicText(resource.formation).slice(0, 256),
    block_code: resource.blockCode.slice(0, 256),
    block_title: publicText(resource.blockTitle).slice(0, 256),
    module_code: resource.moduleCode.slice(0, 256),
    module_title: publicText(resource.moduleTitle).slice(0, 256),
    resource_type: publicText(resource.resourceType).slice(0, 256),
    title: publicText(resource.title).slice(0, 256),
    pulse: resource.pulse.slice(0, 256),
    regulatory: resource.regulatory,
    reserved: resource.reserved,
    has_source_text: Boolean(resource.extractedText),
    private_document_url: resource.privateDocumentUrl.slice(0, 2000),
  };
}
