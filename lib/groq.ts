const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

type Locale = "fr" | "en";

export async function answerWithGroq(question: string, contexts: string[], locale: Locale = "fr") {
  const apiKey = process.env.GROQ_API_KEY || "";
  if (!apiKey) throw new Error("GROQ_NOT_CONFIGURED");

  const context = contexts
    .slice(0, 8)
    .map((item, index) => `### Extrait ${index + 1}\n${item.slice(0, 5000)}`)
    .join("\n\n");

  const french = locale === "fr";

  const response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: [
            "Tu es Corpus Campus PAÏA, une base de connaissances privée.",
            french ? "Réponds en français, de façon pédagogique, structurée et concrète." : "Answer in English in a clear, structured and practical way.",
            "Utilise uniquement les extraits fournis pour les affirmations portant sur le corpus.",
            "Si les extraits ne suffisent pas, indique-le explicitement.",
            "Ne prétends jamais avoir effectué une vérification réglementaire externe si aucune source externe n'a été fournie.",
            "Ne révèle jamais URL Drive, ID Drive, chemin local, clé API ou secret technique.",
          ].join(" "),
        },
        {
          role: "user",
          content: `Question : ${question}\n\nExtraits du corpus :\n${context || "Aucun extrait pertinent n'a été trouvé."}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GROQ_RESPONSE_FAILED:${response.status}:${text.slice(0, 180)}`);
  }

  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content?.trim() || (french ? "Aucune réponse n’a pu être générée." : "No answer could be generated.");
}
