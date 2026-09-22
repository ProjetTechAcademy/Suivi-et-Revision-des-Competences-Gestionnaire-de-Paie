export const pulses = [
  ["Paie & Social", "Bulletin de paie, cotisations, DSN, déclaratif", "▦"],
  ["RH", "Processus RH, recrutement, mobilité", "◇"],
  ["SIRH", "Architecture, flux, interopérabilité", "⌘"],
  ["Droit social", "Relations de travail, réglementation, jurisprudence", "§"],
  ["AMOA & Projet", "Cadrage, expression de besoin, recette", "◎"],
  ["Management", "Leadership, organisation, performance", "△"],
  ["Digital & IA", "IA, automatisation, transformation numérique", "✦"],
  ["Tech", "API, bases de données, Git, tests", "</>"],
] as const;

export const formations = {
  "Gestionnaire de paie": {
    "Bloc 1 — La paie": {
      "Produire les bulletins de paie": ["Le bulletin de paie", "Les cotisations sociales", "La DSN mensuelle"],
      "Gérer les événements": ["L’arrêt de travail", "Les congés payés"],
    },
    "Bloc 2 — Administration": {
      "Gérer le dossier salarié": ["L’embauche", "La sortie du salarié"],
    },
  },
  "Chef de projet SIRH": {
    "Bloc 1 — Cadrage": {
      "Piloter un projet": ["Expression de besoin", "Recette fonctionnelle"],
    },
  },
} as const;
