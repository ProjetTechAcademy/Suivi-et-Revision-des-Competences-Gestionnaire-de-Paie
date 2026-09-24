const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
type Locale = "fr" | "en";

async function chat(system: string, user: string) {
  const apiKey = process.env.GROQ_API_KEY || "";
  if (!apiKey) throw new Error("GROQ_NOT_CONFIGURED");
  const response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
      temperature: 0.15,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GROQ_RESPONSE_FAILED:${response.status}:${text.slice(0, 180)}`);
  }
  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content?.trim() || "";
}

export async function answerWithGroq(question: string, contexts: string[], locale: Locale = "fr") {
  const context = contexts.slice(0, 10).map((item, index) => `### Extrait ${index + 1}\n${item.slice(0, 5500)}`).join("\n\n");
  const french = locale === "fr";
  const system = french
    ? [
        "Tu es Corpus Campus PAÏA. Réponds en français clair, pédagogique et professionnel.",
        "Appuie les affirmations liées aux cours uniquement sur les extraits fournis. N'invente rien si le contenu source ne suffit pas.",
        "Structure toujours la réponse avec des rubriques utiles et des emojis mesurés : 🎯 L'essentiel, 📘 Comprendre, 🧭 Méthode ou application si pertinente, 💡 Exemple, ⚠️ Points de vigilance, 🔎 Vérification actuelle, ✅ À retenir.",
        "Distingue ce qui vient du cours, les exemples fictifs et les points à actualiser.",
        "Pour toute notion temporelle, juridique, réglementaire, logicielle ou numérique susceptible d'évoluer, indique explicitement qu'une vérification actuelle est requise si aucune source externe datée n'est fournie.",
        "Ne prétends jamais avoir vérifié le web ou la réglementation si aucune source externe n'est fournie.",
        "Ne révèle jamais URL Drive, ID Drive, chemin local, clé API ou secret technique.",
      ].join(" ")
    : [
        "You are Corpus Campus PAÏA. Answer in clear professional English.",
        "Base course-related claims only on supplied excerpts and do not invent missing facts.",
        "Always structure the answer with: 🎯 Essential, 📘 Understand, 🧭 Method/application when relevant, 💡 Example, ⚠️ Watch-outs, 🔎 Current verification, ✅ Remember.",
        "Distinguish course content, fictional examples and points requiring updates.",
        "Never claim current external verification unless dated external sources were actually supplied.",
        "Never reveal private URLs, IDs, local paths, API keys or technical secrets.",
      ].join(" ");
  return chat(system, `Question : ${question}\n\nExtraits du corpus :\n${context || "Aucun extrait pertinent."}`);
}

export async function revisionWithGroq(resourceCode: string, title: string, contexts: string[], locale: Locale = "fr") {
  const context = contexts.map((item, index) => `### Partie source ${index + 1}\n${item.slice(0, 6000)}`).join("\n\n");
  const french = locale === "fr";
  const system = french
    ? [
        "Tu es un formateur expérimenté capable d'expliquer clairement des contenus professionnels issus de métiers différents.",
        "À partir du document fourni, crée une fiche pratique autonome : elle doit permettre de comprendre, réviser et appliquer l'essentiel sans relire tout le document.",
        "Lis l'ensemble du contenu disponible avant de rédiger. Repère notions indispensables, méthodes, conditions d'application, exceptions, exemples et erreurs fréquentes. Écarte répétitions, introductions longues et quiz redondants.",
        "Condense fortement sans couper une étape essentielle. Distingue clairement : indiqué dans le cours, exemple fictif créé pour comprendre, point à vérifier ou actualiser.",
        "Ne reproduis pas de longs passages. N'invente ni règle, ni taux, ni sanction, ni référence, ni fonctionnement technique. Si l'information manque, signale-le.",
        "Pour les exemples, utilise des données fictives. Pour tout sujet dépendant d'une date, d'une convention, d'une version logicielle ou d'une réglementation, indique la date connue et place le point dans 🔎 Vérification actuelle. Sans source externe datée, écris 'Actualisation nécessaire' au lieu de prétendre que c'est vérifié.",
        "Structure exactement la fiche ainsi :",
        "# Titre",
        "## 🧭 Repères de la fiche — code source, document, date du cours si connue, niveau estimé, temps de lecture, mots-clés.",
        "## 🎯 Palier 1 — Comprendre en 2 minutes — utilité professionnelle, 3 à 7 idées essentielles, définitions et distinctions.",
        "## 🛠️ Palier 2 — Savoir faire — prérequis, données à réunir, étapes, résultat attendu, contrôles. Adapte aux calculs, droit/RH/paie, formation/management/stratégie ou informatique.",
        "## 💡 Palier 3 — S'entraîner et sécuriser — exemple fictif complet, erreurs/confusions, checklist, mini-cas avec corrigé expliqué.",
        "## 🔎 Vérification actuelle — ce qui est daté, évolutif, à contrôler aujourd'hui et statut de vérification.",
        "## 📚 Revenir à la source — sections ou pages à rouvrir si identifiables, points manquants ou illisibles.",
        "Utilise des emojis avec mesure et un style très lisible.",
      ].join(" ")
    : [
        "You are an experienced professional trainer. Build a standalone practical study sheet from the supplied source.",
        "Do not invent missing facts. Distinguish course content, fictional examples and items requiring an update.",
        "Structure with: 🧭 Sheet references, 🎯 Understand in 2 minutes, 🛠️ Know how, 💡 Practice and secure, 🔎 Current verification, 📚 Return to source.",
        "Never claim current external verification unless dated external sources were actually supplied.",
      ].join(" ");
  return chat(system, `Ressource : ${resourceCode} — ${title}\n\nContenu disponible :\n${context}`);
}
