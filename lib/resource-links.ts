import linksJson from "@/data/resource-links.json";

export type ResourceLinks = {
  file?: string;
  drive?: string;
  platform?: string;
  source?: string;
};

const links = linksJson as Record<string, ResourceLinks>;

export function getResourceLinks(resourceCode: string): ResourceLinks {
  return links[resourceCode] ?? {};
}
