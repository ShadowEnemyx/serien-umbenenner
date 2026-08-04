import type { PrefixCandidate, PrefixRule, RenameProposal, TitleAlias, VideoFile } from "./types";

const EPISODE = /^s(\d{1,2})e(\d{1,3})$/i;
const ALT_EPISODE = /^(\d{1,2})x(\d{1,3})$/i;
const LOWERCASE_WORDS = new Set([
  "und",
  "and",
  "the",
  "of",
  "in",
  "on",
  "am",
  "an",
  "der",
  "die",
  "das",
  "den",
  "dem",
  "des",
  "von",
  "zu",
  "für",
  "mit",
  "im",
]);
const TECHNICAL_TOKENS = new Set([
  "480p", "576p", "720p", "1080p", "1440p", "2160p", "4320p", "4k", "8k",
  "web", "dl", "webrip", "webdl", "bluray", "brrip", "hdtv", "dvdrip", "bdrip",
  "x264", "x265", "h264", "h265", "hevc", "avc", "aac", "ac3", "eac3", "ddp",
  "dts", "atmos", "proper", "repack",
]);

export interface RenameOptions {
  removeTechnical: boolean;
}

export function normalisePrefix(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function tokensFor(stem: string): string[] {
  return stem
    .split(/[._\s-]+/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

function isTechnicalToken(token: string): boolean {
  return TECHNICAL_TOKENS.has(token.toLocaleLowerCase());
}

function titleTokensFor(tokens: string[], options: RenameOptions): string[] {
  const boundary = tokens.findIndex(
    (token) => isEpisodeToken(token) || (options.removeTechnical && isTechnicalToken(token)),
  );
  return boundary === -1 ? tokens : tokens.slice(0, boundary);
}

function isEpisodeToken(token: string): boolean {
  return EPISODE.test(token) || ALT_EPISODE.test(token);
}

function episodeLabel(token: string): string | undefined {
  const match = token.match(EPISODE) ?? token.match(ALT_EPISODE);
  if (!match) return undefined;
  return `S${match[1].padStart(2, "0")}E${match[2].padStart(2, "0")}`;
}

function titleCasePart(part: string, index: number, total: number): string {
  const episode = episodeLabel(part);
  if (episode) return episode;

  const lower = part.toLocaleLowerCase();
  if (index > 0 && index < total - 1 && LOWERCASE_WORDS.has(lower)) return lower;

  return lower.replace(/(^|[-'])\p{L}/gu, (letter) => letter.toLocaleUpperCase());
}

function safeFilePart(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function aliasKeyForStem(stem: string, rules: PrefixRule[], options: RenameOptions): string {
  const tokens = tokensFor(stem);
  if (tokens.length === 0) return "";

  const first = normalisePrefix(tokens[0]);
  const removal = rules.find((rule) => rule.action === "remove" && normalisePrefix(rule.value) === first);
  const visible = removal ? tokens.slice(1) : tokens;
  return titleTokensFor(visible, options)
    .map(normalisePrefix)
    .join(" ");
}

export function readableStem(
  stem: string,
  rules: PrefixRule[],
  aliases: TitleAlias[] = [],
  options: RenameOptions = { removeTechnical: true },
): { stem: string; appliedPrefix?: string; appliedAlias?: string } {
  const tokens = tokensFor(stem);
  if (tokens.length === 0) return { stem };

  const first = normalisePrefix(tokens[0]);
  const removal = rules.find((rule) => rule.action === "remove" && normalisePrefix(rule.value) === first);
  const visible = removal ? tokens.slice(1) : tokens;
  if (visible.length === 0) return { stem };

  const titleKey = aliasKeyForStem(stem, rules, options);
  const alias = aliases.find((item) => normalisePrefix(item.value) === titleKey);
  const titleTokenCount = titleTokensFor(visible, options).length;
  const suffix = visible.slice(titleTokenCount).filter((token) => !(options.removeTechnical && isTechnicalToken(token)));
  const formattedSuffix = suffix.map((part, index) => titleCasePart(part, index, suffix.length));
  const formattedTitle = alias
    ? alias.title
    : visible
        .slice(0, titleTokenCount)
        .map((part, index) => titleCasePart(part, index, titleTokenCount))
        .join(" ");
  const formatted = [formattedTitle, ...formattedSuffix].filter(Boolean);
  if (formatted.length === 0) return { stem };

  return {
    stem: safeFilePart(formatted.join(" ")) || stem,
    appliedPrefix: removal?.value,
    appliedAlias: alias?.title,
  };
}

export function createProposals(
  files: VideoFile[],
  rules: PrefixRule[],
  aliases: TitleAlias[] = [],
  options: RenameOptions = { removeTechnical: true },
): RenameProposal[] {
  return files.map((file) => {
    const formatted = readableStem(file.stem, rules, aliases, options);
    const targetName = `${formatted.stem}${file.extension}`;
    return {
      id: file.id,
      sourcePath: file.path,
      sourceName: file.name,
      targetName,
      selected: targetName !== file.name,
      appliedPrefix: formatted.appliedPrefix,
      appliedAlias: formatted.appliedAlias,
    };
  });
}

export function findPrefixCandidates(files: VideoFile[], rules: PrefixRule[]): PrefixCandidate[] {
  const known = new Set(rules.map((rule) => normalisePrefix(rule.value)));
  const candidates = new Map<string, PrefixCandidate>();

  for (const file of files) {
    const tokens = tokensFor(file.stem);
    const first = tokens[0];
    if (!first || tokens.length < 2 || isEpisodeToken(first)) continue;
    const key = normalisePrefix(first);
    if (known.has(key)) continue;
    const current = candidates.get(key) ?? { value: first, count: 0, examples: [] };
    current.count += 1;
    if (current.examples.length < 3) current.examples.push(file.name);
    candidates.set(key, current);
  }

  return [...candidates.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

export function titleForLookup(stem: string, rules: PrefixRule[], options: RenameOptions): string {
  return aliasKeyForStem(stem, rules, options);
}
