export const piaImages = {
  default: "/brand/mascotte/PAIA_000_Mascotte_principale_V001.png",
  thinking: "/brand/mascotte/PAIA_001_Je_reflechis_V001.png",
  method: "/brand/mascotte/PAIA_004_Methodo_V001.png",
  takeaway: "/brand/mascotte/PAIA_005_A_retenir_V001.png",
  checklist: "/brand/mascotte/PAIA_006_Check_list_V001.png",
  keyPoint: "/brand/mascotte/PAIA_007_Point_cle_V001.png",
  focusDsn: "/brand/mascotte/PAIA_008_Focus_DSN_V001.png",
  answer: "/brand/mascotte/PAIA_009_Je_reponds_V001.png",
  error: "/brand/mascotte/PAIA_023_Triste_V001.png",
  success: "/brand/mascotte/PAIA_037_Compris_V001.png",
  payroll: "/brand/mascotte/PAIA_041_Paie_V001.png",
  payslip: "/brand/mascotte/PAIA_042_Bulletin_de_paie_V001.png",
  hr: "/brand/mascotte/PAIA_046_RH_V001.png",
} as const;

export type PiaVisualState = keyof typeof piaImages;

export const piaInterfaceState = {
  idle: "default",
  listening: "answer",
  searching: "thinking",
  success: "success",
  error: "error",
} as const satisfies Record<string, PiaVisualState>;
