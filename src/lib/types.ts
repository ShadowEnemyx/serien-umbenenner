export type RuleAction = "remove" | "keep";

export interface PrefixRule {
  value: string;
  action: RuleAction;
}

export interface TitleAlias {
  value: string;
  title: string;
}

export interface VideoFile {
  id: string;
  path: string;
  name: string;
  stem: string;
  extension: string;
}

export interface ScanResult {
  root: string;
  files: VideoFile[];
}

export interface PrefixCandidate {
  value: string;
  count: number;
  examples: string[];
}

export interface RenameProposal {
  id: string;
  sourcePath: string;
  sourceName: string;
  targetName: string;
  selected: boolean;
  appliedPrefix?: string;
  appliedAlias?: string;
  conflict?: string;
}

export interface RenameItem {
  sourcePath: string;
  targetName: string;
}

export interface RenameRecord {
  sourcePath: string;
  targetPath: string;
  undone: boolean;
}

export interface BatchRecord {
  id: string;
  createdAt: string;
  items: RenameRecord[];
}

export interface RenameFailure {
  sourcePath: string;
  message: string;
}

export interface RenameBatchResult {
  batch: BatchRecord | null;
  failures: RenameFailure[];
}

export interface UndoResult {
  restored: number;
  failures: RenameFailure[];
}

export interface TmdbCandidate {
  id: number;
  title: string;
  originalTitle: string;
  kind: "movie" | "tv";
  year?: string;
  overview?: string;
}
