import { piaMainDataUri } from "@/lib/pia-image";

const main = piaMainDataUri;

export const piaImages = {
  default: main,
  thinking: main,
  method: main,
  takeaway: main,
  checklist: main,
  keyPoint: main,
  focusDsn: main,
  answer: main,
  error: main,
  success: main,
  payroll: main,
  payslip: main,
  hr: main,
} as const;

export type PiaVisualState = keyof typeof piaImages;

export const piaInterfaceState = {
  idle: "default",
  listening: "answer",
  searching: "thinking",
  success: "success",
  error: "error",
} as const satisfies Record<string, PiaVisualState>;
