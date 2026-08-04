import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { aliasKeyForStem, createProposals, findPrefixCandidates, normalisePrefix, titleForLookup } from "./lib/rename";
import type {
  BatchRecord,
  PrefixRule,
  RenameBatchResult,
  RenameFailure,
  RenameProposal,
  ScanResult,
  TitleAlias,
  TmdbCandidate,
  UndoResult,
  VideoFile,
} from "./lib/types";

type Locale = "de" | "en";

const copy = {
  de: {
    appName: "Serien-Umbenenner",
    tagline: "Dateinamen aufräumen, ohne etwas blind zu ändern.",
    chooseFolder: "Ordner auswählen",
    chooseFolderHint: "Wähle einen Videoordner. Es wird zunächst nur eine Vorschau erstellt.",
    subfolders: "Unterordner einbeziehen",
    scan: "Scannen",
    scanning: "Scanne …",
    rules: "Gefundene mögliche Präfixe",
    rulesHint: "Diese Vorschläge sind nicht automatisch richtig. Entscheide einmal pro Präfix.",
    remove: "Entfernen",
    keep: "Behalten",
    addPrefix: "Eigenes Präfix hinzufügen",
    add: "Hinzufügen",
    technical: "Technische Zusätze entfernen",
    technicalHint: "Entfernt z. B. 720p, WEB-DL, x264 und DTS aus dem vorgeschlagenen Namen.",
    titleAliases: "Titel-Abkürzungen",
    titleAliasesHint: "Einmal zuordnen – die App ersetzt die Abkürzung in allen passenden Dateien.",
    abbreviation: "Abkürzung, z. B. SOA",
    fullTitle: "Vollständiger Titel, z. B. Sons of Anarchy",
    applyAll: "Für alle anwenden",
    removeAlias: "Zuordnung löschen",
    preview: "Vorschau",
    selected: "ausgewählt",
    apply: "Ausgewählte Dateien umbenennen",
    applying: "Benenne um …",
    undo: "Letzte Aktion rückgängig",
    tmdb: "TMDb-Titel suchen",
    settings: "Optionale Online-Suche",
    settingsHint: "Der TMDb-Schlüssel bleibt im System-Schlüsselspeicher. Erst bei einer Suche wird ein bereinigter möglicher Titel übertragen.",
    apiKey: "TMDb API-Schlüssel",
    saveKey: "Schlüssel speichern",
    removeKey: "Schlüssel entfernen",
    searching: "Suche …",
    noResults: "Keine passenden Titel gefunden.",
    chooseTitle: "Titel übernehmen",
    empty: "Wähle einen Ordner und starte den Scan.",
    noVideos: "Keine unterstützten Videodateien gefunden.",
    original: "Original",
    newName: "Neuer Name",
    reason: "Regel",
    noPrefix: "—",
    conflicts: "Namenskonflikt lösen",
    conflictExplanation: "Der gewünschte Name kann nicht verwendet werden. Gib einen anderen Namen mit Dateiendung ein oder überspringe die Datei.",
    useName: "Namen verwenden",
    skip: "Überspringen",
    cancel: "Abbrechen",
    saved: "Gespeichert.",
    renamed: "Dateien erfolgreich umbenannt.",
    undone: "Letzte Aktion wurde rückgängig gemacht.",
    files: "Dateien",
  },
  en: {
    appName: "Series Renamer",
    tagline: "Clean up file names without changing anything blindly.",
    chooseFolder: "Choose folder",
    chooseFolderHint: "Select a video folder. The app creates a preview first.",
    subfolders: "Include subfolders",
    scan: "Scan",
    scanning: "Scanning …",
    rules: "Possible prefixes found",
    rulesHint: "Suggestions are never assumed to be correct. Decide once for each prefix.",
    remove: "Remove",
    keep: "Keep",
    addPrefix: "Add a custom prefix",
    add: "Add",
    technical: "Remove technical tags",
    technicalHint: "Removes tags such as 720p, WEB-DL, x264 and DTS from the proposed name.",
    titleAliases: "Title abbreviations",
    titleAliasesHint: "Map it once – the app replaces the abbreviation in every matching file.",
    abbreviation: "Abbreviation, e.g. SOA",
    fullTitle: "Full title, e.g. Sons of Anarchy",
    applyAll: "Apply to all",
    removeAlias: "Delete mapping",
    preview: "Preview",
    selected: "selected",
    apply: "Rename selected files",
    applying: "Renaming …",
    undo: "Undo last action",
    tmdb: "Find TMDb title",
    settings: "Optional online lookup",
    settingsHint: "Your TMDb key stays in the system credential store. A cleaned possible title is sent only when you search.",
    apiKey: "TMDb API key",
    saveKey: "Save key",
    removeKey: "Remove key",
    searching: "Searching …",
    noResults: "No matching titles found.",
    chooseTitle: "Use title",
    empty: "Choose a folder and start a scan.",
    noVideos: "No supported video files were found.",
    original: "Original",
    newName: "New name",
    reason: "Rule",
    noPrefix: "—",
    conflicts: "Resolve name conflict",
    conflictExplanation: "The requested name cannot be used. Enter a different file name including extension, or skip the file.",
    useName: "Use name",
    skip: "Skip",
    cancel: "Cancel",
    saved: "Saved.",
    renamed: "Files renamed successfully.",
    undone: "The last operation was undone.",
    files: "files",
  },
} as const;

export default function App() {
  const [locale, setLocale] = useState<Locale>("de");
  const [folder, setFolder] = useState("");
  const [includeSubfolders, setIncludeSubfolders] = useState(true);
  const [files, setFiles] = useState<VideoFile[]>([]);
  const [rules, setRules] = useState<PrefixRule[]>([]);
  const [aliases, setAliases] = useState<TitleAlias[]>([]);
  const [removeTechnical, setRemoveTechnical] = useState(true);
  const [proposals, setProposals] = useState<RenameProposal[]>([]);
  const [manualPrefix, setManualPrefix] = useState("");
  const [manualAlias, setManualAlias] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [conflicts, setConflicts] = useState<RenameFailure[]>([]);
  const [conflictName, setConflictName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [lookupProposal, setLookupProposal] = useState<RenameProposal | null>(null);
  const [lookupResults, setLookupResults] = useState<TmdbCandidate[]>([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lastBatch, setLastBatch] = useState<BatchRecord | null>(null);

  const t = copy[locale];
  const candidates = useMemo(() => findPrefixCandidates(files, rules), [files, rules]);
  const selectedCount = useMemo(
    () => proposals.filter((proposal) => proposal.selected && proposal.sourceName !== proposal.targetName).length,
    [proposals],
  );
  const currentConflict = conflicts[0];

  const refreshPreview = useCallback((
    nextRules = rules,
    nextFiles = files,
    nextAliases = aliases,
    nextRemoveTechnical = removeTechnical,
  ) => {
    setProposals(createProposals(nextFiles, nextRules, nextAliases, { removeTechnical: nextRemoveTechnical }));
  }, [aliases, files, removeTechnical, rules]);

  const loadRules = useCallback(async () => {
    try {
      const [savedRules, savedAliases, savedHasApiKey, history] = await Promise.all([
        invoke<PrefixRule[]>("get_prefix_rules"),
        invoke<TitleAlias[]>("get_title_aliases"),
        invoke<boolean>("has_tmdb_key"),
        invoke<BatchRecord[]>("get_history"),
      ]);
      setRules(savedRules);
      setAliases(savedAliases);
      setHasApiKey(savedHasApiKey);
      setLastBatch(history.find((batch) => batch.items.some((item) => !item.undone)) ?? null);
    } catch (caught) {
      setError(String(caught));
    }
  }, []);

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  const chooseFolder = async () => {
    const selected = await open({ directory: true, multiple: false, title: t.chooseFolder });
    if (typeof selected === "string") {
      setFolder(selected);
      setFiles([]);
      setProposals([]);
      setMessage("");
      setError("");
    }
  };

  const scan = async () => {
    if (!folder) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await invoke<ScanResult>("scan_folder", { path: folder, includeSubfolders });
      setFolder(result.root);
      setFiles(result.files);
      refreshPreview(rules, result.files, aliases, removeTechnical);
    } catch (caught) {
      setError(String(caught));
    } finally {
      setBusy(false);
    }
  };

  const saveRules = async (nextRules: PrefixRule[]) => {
    setRules(nextRules);
    refreshPreview(nextRules, files, aliases, removeTechnical);
    try {
      await invoke("save_prefix_rules", { rules: nextRules });
      setMessage(t.saved);
    } catch (caught) {
      setError(String(caught));
    }
  };

  const saveAliases = async (nextAliases: TitleAlias[]) => {
    setAliases(nextAliases);
    refreshPreview(rules, files, nextAliases, removeTechnical);
    try {
      await invoke("save_title_aliases", { aliases: nextAliases });
      setMessage(t.saved);
    } catch (caught) {
      setError(String(caught));
    }
  };

  const addRule = (value: string, action: PrefixRule["action"]) => {
    const clean = value.trim();
    if (!clean || rules.some((rule) => normalisePrefix(rule.value) === normalisePrefix(clean))) return;
    void saveRules([...rules, { value: clean, action }]);
    setManualPrefix("");
  };

  const addAlias = () => {
    const value = manualAlias.trim();
    const title = manualTitle.trim();
    if (!value || !title) return;
    const nextAliases = [...aliases.filter((alias) => normalisePrefix(alias.value) !== normalisePrefix(value)), { value, title }];
    void saveAliases(nextAliases);
    setManualAlias("");
    setManualTitle("");
  };

  const changeTechnicalCleanup = (enabled: boolean) => {
    setRemoveTechnical(enabled);
    refreshPreview(rules, files, aliases, enabled);
  };

  const setProposal = (id: string, patch: Partial<RenameProposal>) => {
    setProposals((current) => current.map((proposal) => (proposal.id === id ? { ...proposal, ...patch } : proposal)));
  };

  const itemsForRename = () => proposals
    .filter((proposal) => proposal.selected && proposal.sourceName !== proposal.targetName)
    .map(({ sourcePath, targetName }) => ({ sourcePath, targetName }));

  const validateAndApply = async () => {
    const items = itemsForRename();
    if (items.length === 0) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const failures = await invoke<RenameFailure[]>("validate_rename_batch", { items });
      if (failures.length > 0) {
        setConflicts(failures);
        const proposal = proposals.find((item) => item.sourcePath === failures[0].sourcePath);
        setConflictName(proposal?.targetName ?? "");
        return;
      }
      const result = await invoke<RenameBatchResult>("apply_rename_batch", { items });
      if (result.failures.length > 0 || !result.batch) {
        setError(result.failures.map((failure) => failure.message).join("\n") || "Umbenennen fehlgeschlagen.");
        return;
      }
      setLastBatch(result.batch);
      setMessage(t.renamed);
      await scan();
    } catch (caught) {
      setError(String(caught));
    } finally {
      setBusy(false);
    }
  };

  const resolveConflict = (action: "rename" | "skip") => {
    if (!currentConflict) return;
    if (action === "skip") {
      setProposal(proposals.find((item) => item.sourcePath === currentConflict.sourcePath)?.id ?? "", { selected: false });
    } else if (conflictName.trim()) {
      setProposal(proposals.find((item) => item.sourcePath === currentConflict.sourcePath)?.id ?? "", {
        targetName: conflictName.trim(),
      });
    } else {
      return;
    }
    const remaining = conflicts.slice(1);
    setConflicts(remaining);
    const nextProposal = proposals.find((item) => item.sourcePath === remaining[0]?.sourcePath);
    setConflictName(nextProposal?.targetName ?? "");
  };

  const undo = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await invoke<UndoResult>("undo_last_batch");
      if (result.failures.length > 0) setError(result.failures.map((failure) => failure.message).join("\n"));
      if (result.restored > 0) setMessage(t.undone);
      await loadRules();
      await scan();
    } catch (caught) {
      setError(String(caught));
    } finally {
      setBusy(false);
    }
  };

  const saveKey = async () => {
    if (!apiKey.trim()) return;
    try {
      await invoke("set_tmdb_key", { key: apiKey.trim() });
      setApiKey("");
      setHasApiKey(true);
      setMessage(t.saved);
    } catch (caught) {
      setError(String(caught));
    }
  };

  const searchTmdb = async (proposal: RenameProposal) => {
    const file = files.find((item) => item.id === proposal.id);
    if (!file) return;
    setLookupProposal(proposal);
    setLookupResults([]);
    setLookupLoading(true);
    setError("");
    try {
      const query = titleForLookup(file.stem, rules, { removeTechnical });
      const results = await invoke<TmdbCandidate[]>("search_tmdb", { query, language: locale === "de" ? "de-DE" : "en-US" });
      setLookupResults(results);
    } catch (caught) {
      setError(String(caught));
      setLookupProposal(null);
    } finally {
      setLookupLoading(false);
    }
  };

  const useTmdbTitle = async (candidate: TmdbCandidate) => {
    if (!lookupProposal) return;
    const file = files.find((item) => item.id === lookupProposal.id);
    if (!file) return;
    const value = aliasKeyForStem(file.stem, rules, { removeTechnical });
    if (!value) return;
    const nextAliases = [...aliases.filter((alias) => normalisePrefix(alias.value) !== value), { value, title: candidate.title }];
    setLookupProposal(null);
    await saveAliases(nextAliases);
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">LOCAL • SAFE • BATCH</p>
          <h1>{t.appName}</h1>
          <p>{t.tagline}</p>
        </div>
        <div className="language-switch" aria-label="Language">
          <button className={locale === "de" ? "active" : ""} onClick={() => setLocale("de")}>DE</button>
          <button className={locale === "en" ? "active" : ""} onClick={() => setLocale("en")}>EN</button>
        </div>
      </header>

      <section className="card folder-card">
        <div>
          <h2>{t.chooseFolder}</h2>
          <p>{t.chooseFolderHint}</p>
        </div>
        <div className="folder-actions">
          <button className="secondary" onClick={() => void chooseFolder()}>{t.chooseFolder}</button>
          <span className="folder-path">{folder || "—"}</span>
        </div>
        <label className="check-row">
          <input type="checkbox" checked={includeSubfolders} onChange={(event) => setIncludeSubfolders(event.target.checked)} />
          {t.subfolders}
        </label>
        <button className="primary" disabled={!folder || busy} onClick={() => void scan()}>
          {busy ? t.scanning : t.scan}
        </button>
      </section>

      {(message || error) && <section className={`notice ${error ? "error" : "success"}`}>{error || message}</section>}

      {files.length > 0 && (
        <>
          <section className="card rules-card">
            <div>
              <h2>{t.rules}</h2>
              <p>{t.rulesHint}</p>
            </div>
            <div className="candidate-list">
              {candidates.length === 0 && <span className="muted">—</span>}
              {candidates.map((candidate) => (
                <article className="candidate" key={candidate.value}>
                  <div><strong>{candidate.value}</strong><span>{candidate.count} {t.files}</span></div>
                  <small>{candidate.examples.join(" · ")}</small>
                  <div className="candidate-actions">
                    <button onClick={() => addRule(candidate.value, "remove")}>{t.remove}</button>
                    <button className="text-button" onClick={() => addRule(candidate.value, "keep")}>{t.keep}</button>
                  </div>
                </article>
              ))}
            </div>
            <form className="manual-rule" onSubmit={(event) => { event.preventDefault(); addRule(manualPrefix, "remove"); }}>
              <input value={manualPrefix} onChange={(event) => setManualPrefix(event.target.value)} placeholder={t.addPrefix} />
              <button disabled={!manualPrefix.trim()}>{t.add}</button>
            </form>
            <label className="check-row technical-option">
              <input type="checkbox" checked={removeTechnical} onChange={(event) => changeTechnicalCleanup(event.target.checked)} />
              <span><strong>{t.technical}</strong><small>{t.technicalHint}</small></span>
            </label>
            <section className="title-aliases">
              <div><strong>{t.titleAliases}</strong><small>{t.titleAliasesHint}</small></div>
              <form onSubmit={(event) => { event.preventDefault(); addAlias(); }}>
                <input value={manualAlias} onChange={(event) => setManualAlias(event.target.value)} placeholder={t.abbreviation} />
                <input value={manualTitle} onChange={(event) => setManualTitle(event.target.value)} placeholder={t.fullTitle} />
                <button disabled={!manualAlias.trim() || !manualTitle.trim()}>{t.applyAll}</button>
              </form>
              {aliases.length > 0 && <div className="alias-list">
                {aliases.map((alias) => <div key={normalisePrefix(alias.value)}><span><strong>{alias.value}</strong> → {alias.title}</span><button className="text-button" onClick={() => void saveAliases(aliases.filter((item) => normalisePrefix(item.value) !== normalisePrefix(alias.value)))}>{t.removeAlias}</button></div>)}
              </div>}
            </section>
          </section>

          <details className="card settings-card">
            <summary>{t.settings}</summary>
            <p>{t.settingsHint}</p>
            <div className="settings-row">
              <input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={t.apiKey} autoComplete="off" />
              <button onClick={() => void saveKey()} disabled={!apiKey.trim()}>{t.saveKey}</button>
              {hasApiKey && <button className="text-button" onClick={() => void invoke("delete_tmdb_key").then(() => setHasApiKey(false))}>{t.removeKey}</button>}
            </div>
          </details>

          <section className="card preview-card">
            <div className="preview-header">
              <div><h2>{t.preview}</h2><p>{selectedCount} {t.selected}</p></div>
              <div className="preview-actions">
                {lastBatch && <button className="secondary" disabled={busy} onClick={() => void undo()}>{t.undo}</button>}
                <button className="primary" disabled={busy || selectedCount === 0} onClick={() => void validateAndApply()}>{busy ? t.applying : t.apply}</button>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th></th><th>{t.original}</th><th>{t.newName}</th><th>{t.reason}</th><th></th></tr></thead>
                <tbody>
                  {proposals.map((proposal) => (
                    <tr key={proposal.id} className={proposal.selected ? "" : "dim"}>
                      <td><input type="checkbox" checked={proposal.selected} disabled={proposal.sourceName === proposal.targetName} onChange={(event) => setProposal(proposal.id, { selected: event.target.checked })} /></td>
                      <td>{proposal.sourceName}</td>
                      <td><input className="filename-input" value={proposal.targetName} onChange={(event) => setProposal(proposal.id, { targetName: event.target.value, selected: true })} /></td>
                      <td>{proposal.appliedPrefix ?? t.noPrefix}</td>
                      <td>{hasApiKey && <button className="tiny-button" onClick={() => void searchTmdb(proposal)}>{t.tmdb}</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {!busy && folder && files.length === 0 && <section className="empty-state">{t.noVideos}</section>}
      {!folder && <section className="empty-state">{t.empty}</section>}

      {currentConflict && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="conflict-title">
            <h2 id="conflict-title">{t.conflicts}</h2>
            <p>{t.conflictExplanation}</p>
            <p className="conflict-file">{proposals.find((item) => item.sourcePath === currentConflict.sourcePath)?.sourceName}</p>
            <input value={conflictName} onChange={(event) => setConflictName(event.target.value)} />
            <small>{currentConflict.message}</small>
            <div className="modal-actions">
              <button className="text-button" onClick={() => setConflicts([])}>{t.cancel}</button>
              <button className="secondary" onClick={() => resolveConflict("skip")}>{t.skip}</button>
              <button className="primary" onClick={() => resolveConflict("rename")}>{t.useName}</button>
            </div>
          </section>
        </div>
      )}

      {lookupProposal && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal lookup-modal" role="dialog" aria-modal="true">
            <h2>{t.tmdb}</h2>
            {lookupLoading && <p>{t.searching}</p>}
            {!lookupLoading && lookupResults.length === 0 && <p>{t.noResults}</p>}
            {!lookupLoading && lookupResults.map((candidate) => (
              <article className="tmdb-result" key={`${candidate.kind}-${candidate.id}`}>
                <div><strong>{candidate.title}</strong>{candidate.year && <span>{candidate.year}</span>}<small>{candidate.kind.toUpperCase()} · {candidate.originalTitle}</small></div>
                <button onClick={() => void useTmdbTitle(candidate)}>{t.chooseTitle}</button>
              </article>
            ))}
            <button className="text-button" onClick={() => setLookupProposal(null)}>{t.cancel}</button>
          </section>
        </div>
      )}
    </main>
  );
}
