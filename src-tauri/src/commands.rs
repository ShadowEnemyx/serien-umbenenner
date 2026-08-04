use std::{
    collections::HashSet,
    ffi::OsStr,
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};

use keyring::Entry;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;
use walkdir::WalkDir;

const APP_DATA_FILE_RULES: &str = "prefix-rules.json";
const APP_DATA_FILE_ALIASES: &str = "title-aliases.json";
const APP_DATA_FILE_HISTORY: &str = "rename-history.json";
const TMDB_SERVICE: &str = "io.github.serien-umbenenner";
const TMDB_ACCOUNT: &str = "tmdb-api-key";
const VIDEO_EXTENSIONS: &[&str] = &[
    "mkv", "mp4", "avi", "mov", "m4v", "wmv", "webm", "mpg", "mpeg",
];

#[derive(Default)]
pub struct AppState {
    selected_roots: Mutex<Vec<PathBuf>>,
    history: Mutex<Vec<BatchRecord>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoFile {
    id: String,
    path: String,
    name: String,
    stem: String,
    extension: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    root: String,
    files: Vec<VideoFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrefixRule {
    value: String,
    action: RuleAction,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TitleAlias {
    value: String,
    title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum RuleAction {
    Remove,
    Keep,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameItem {
    source_path: String,
    target_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameRecord {
    source_path: String,
    target_path: String,
    undone: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchRecord {
    id: String,
    created_at: String,
    items: Vec<RenameRecord>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameFailure {
    source_path: String,
    message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameBatchResult {
    batch: Option<BatchRecord>,
    failures: Vec<RenameFailure>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UndoResult {
    restored: usize,
    failures: Vec<RenameFailure>,
}

#[derive(Debug, Deserialize)]
struct TmdbResponse {
    results: Vec<TmdbRawResult>,
}

#[derive(Debug, Deserialize)]
struct TmdbRawResult {
    id: u64,
    media_type: Option<String>,
    title: Option<String>,
    name: Option<String>,
    original_title: Option<String>,
    original_name: Option<String>,
    release_date: Option<String>,
    first_air_date: Option<String>,
    overview: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TmdbCandidate {
    id: u64,
    title: String,
    original_title: String,
    kind: String,
    year: Option<String>,
    overview: Option<String>,
}

#[derive(Clone)]
struct PreparedRename {
    source: PathBuf,
    target: PathBuf,
}

#[derive(Clone)]
struct StagedRename {
    source: PathBuf,
    temporary: PathBuf,
    target: PathBuf,
}

fn app_data_file(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("App-Datenordner konnte nicht ermittelt werden: {error}"))?;
    fs::create_dir_all(&directory)
        .map_err(|error| format!("App-Datenordner konnte nicht erstellt werden: {error}"))?;
    Ok(directory.join(name))
}

fn read_json_or_default<T>(path: &Path) -> Result<T, String>
where
    T: DeserializeOwned + Default,
{
    if !path.exists() {
        return Ok(T::default());
    }
    let content = fs::read(path)
        .map_err(|error| format!("Lokale Daten konnten nicht gelesen werden: {error}"))?;
    serde_json::from_slice(&content).map_err(|error| format!("Lokale Daten sind ungültig: {error}"))
}

fn write_json<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let content = serde_json::to_vec_pretty(value)
        .map_err(|error| format!("Lokale Daten konnten nicht gespeichert werden: {error}"))?;
    let temporary = path.with_extension("tmp");
    fs::write(&temporary, content)
        .map_err(|error| format!("Lokale Daten konnten nicht geschrieben werden: {error}"))?;
    fs::rename(&temporary, path)
        .map_err(|error| format!("Lokale Daten konnten nicht ersetzt werden: {error}"))
}

// Explicit import keeps the generic bound readable above.
use serde::de::DeserializeOwned;

pub fn load_history_into_state(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let path = app_data_file(app, APP_DATA_FILE_HISTORY).map_err(std::io::Error::other)?;
    let history: Vec<BatchRecord> = read_json_or_default(&path).map_err(std::io::Error::other)?;
    let state = app.state::<AppState>();
    *state
        .history
        .lock()
        .map_err(|_| std::io::Error::other("Historie ist gesperrt"))? = history;
    Ok(())
}

fn save_history(app: &AppHandle, state: &AppState) -> Result<(), String> {
    let history = state
        .history
        .lock()
        .map_err(|_| "Historie ist gesperrt".to_string())?
        .clone();
    write_json(&app_data_file(app, APP_DATA_FILE_HISTORY)?, &history)
}

fn is_video(path: &Path) -> bool {
    path.extension()
        .and_then(OsStr::to_str)
        .is_some_and(|extension| {
            VIDEO_EXTENSIONS
                .iter()
                .any(|known| extension.eq_ignore_ascii_case(known))
        })
}

fn filename_is_safe(name: &str) -> bool {
    !name.trim().is_empty()
        && Path::new(name).file_name() == Some(OsStr::new(name))
        && !name.contains(['/', '\\', '<', '>', ':', '"', '|', '?', '*'])
        && !name.chars().any(char::is_control)
}

fn normalised_path_key(path: &Path) -> String {
    path.to_string_lossy().to_lowercase()
}

fn under_selected_root(state: &AppState, path: &Path) -> Result<(), String> {
    let roots = state
        .selected_roots
        .lock()
        .map_err(|_| "Ordnerliste ist gesperrt".to_string())?;
    if roots.iter().any(|root| path.starts_with(root)) {
        Ok(())
    } else {
        Err("Die Datei liegt nicht in einem Ordner, der in dieser Sitzung gescannt wurde.".into())
    }
}

#[tauri::command]
pub fn scan_folder(
    path: String,
    include_subfolders: bool,
    state: State<'_, AppState>,
) -> Result<ScanResult, String> {
    let root = PathBuf::from(path)
        .canonicalize()
        .map_err(|error| format!("Der ausgewählte Ordner ist nicht verfügbar: {error}"))?;
    if !root.is_dir() {
        return Err("Bitte wähle einen Ordner aus.".into());
    }

    {
        let mut roots = state
            .selected_roots
            .lock()
            .map_err(|_| "Ordnerliste ist gesperrt".to_string())?;
        if !roots.contains(&root) {
            roots.push(root.clone());
        }
    }

    let max_depth = if include_subfolders { usize::MAX } else { 1 };
    let mut files = WalkDir::new(&root)
        .follow_links(false)
        .min_depth(1)
        .max_depth(max_depth)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_file() && is_video(entry.path()))
        .filter_map(|entry| {
            let path = entry.path();
            let name = path.file_name()?.to_str()?.to_string();
            let stem = path.file_stem()?.to_str()?.to_string();
            let extension = path
                .extension()?
                .to_str()
                .map(|extension| format!(".{extension}"))?;
            Some(VideoFile {
                id: path.to_string_lossy().to_string(),
                path: path.to_string_lossy().to_string(),
                name,
                stem,
                extension,
            })
        })
        .collect::<Vec<_>>();
    files.sort_by(|left, right| left.path.cmp(&right.path));

    Ok(ScanResult {
        root: root.to_string_lossy().to_string(),
        files,
    })
}

#[tauri::command]
pub fn get_prefix_rules(app: AppHandle) -> Result<Vec<PrefixRule>, String> {
    read_json_or_default(&app_data_file(&app, APP_DATA_FILE_RULES)?)
}

#[tauri::command]
pub fn save_prefix_rules(app: AppHandle, rules: Vec<PrefixRule>) -> Result<(), String> {
    let mut seen = HashSet::new();
    for rule in &rules {
        let value = rule.value.trim();
        if value.is_empty() || !seen.insert(value.to_lowercase()) {
            return Err("Präfix-Regeln dürfen nicht leer oder doppelt sein.".into());
        }
    }
    write_json(&app_data_file(&app, APP_DATA_FILE_RULES)?, &rules)
}

#[tauri::command]
pub fn get_title_aliases(app: AppHandle) -> Result<Vec<TitleAlias>, String> {
    read_json_or_default(&app_data_file(&app, APP_DATA_FILE_ALIASES)?)
}

#[tauri::command]
pub fn save_title_aliases(app: AppHandle, aliases: Vec<TitleAlias>) -> Result<(), String> {
    let mut seen = HashSet::new();
    for alias in &aliases {
        let value = alias.value.trim();
        if value.is_empty() || alias.title.trim().is_empty() || !seen.insert(value.to_lowercase()) {
            return Err("Titel-Zuordnungen dürfen nicht leer oder doppelt sein.".into());
        }
    }
    write_json(&app_data_file(&app, APP_DATA_FILE_ALIASES)?, &aliases)
}

fn prepare_renames(
    state: &AppState,
    items: &[RenameItem],
) -> Vec<Result<PreparedRename, RenameFailure>> {
    let sources = items
        .iter()
        .map(|item| {
            PathBuf::from(&item.source_path)
                .canonicalize()
                .map(|path| normalised_path_key(&path))
        })
        .filter_map(Result::ok)
        .collect::<HashSet<_>>();
    let mut targets = HashSet::new();

    items
        .iter()
        .map(|item| {
            let source = PathBuf::from(&item.source_path)
                .canonicalize()
                .map_err(|error| RenameFailure {
                    source_path: item.source_path.clone(),
                    message: format!("Quelldatei ist nicht verfügbar: {error}"),
                })?;
            if let Err(message) = under_selected_root(state, &source) {
                return Err(RenameFailure {
                    source_path: item.source_path.clone(),
                    message,
                });
            }
            if !source.is_file() || !is_video(&source) {
                return Err(RenameFailure {
                    source_path: item.source_path.clone(),
                    message: "Die Quelldatei ist keine unterstützte Videodatei.".into(),
                });
            }
            if !filename_is_safe(&item.target_name) {
                return Err(RenameFailure {
                    source_path: item.source_path.clone(),
                    message: "Der neue Dateiname enthält ungültige Zeichen oder einen Pfad.".into(),
                });
            }
            let target = source
                .parent()
                .unwrap_or(Path::new(""))
                .join(&item.target_name);
            let target_key = normalised_path_key(&target);
            if !targets.insert(target_key.clone()) {
                return Err(RenameFailure {
                    source_path: item.source_path.clone(),
                    message: "Mehrere ausgewählte Dateien hätten denselben neuen Namen.".into(),
                });
            }
            if target.exists() && !sources.contains(&target_key) {
                return Err(RenameFailure {
                    source_path: item.source_path.clone(),
                    message: "Eine Datei mit diesem Namen existiert bereits.".into(),
                });
            }
            if source == target {
                return Err(RenameFailure {
                    source_path: item.source_path.clone(),
                    message: "Der neue Name ist identisch mit dem bisherigen Namen.".into(),
                });
            }
            Ok(PreparedRename { source, target })
        })
        .collect()
}

fn numbered_filename(name: &str, number: usize) -> String {
    let path = Path::new(name);
    let stem = path.file_stem().and_then(OsStr::to_str).unwrap_or(name);
    match path.extension().and_then(OsStr::to_str) {
        Some(extension) if !extension.is_empty() => format!("{stem} ({number}).{extension}"),
        _ => format!("{stem} ({number})"),
    }
}

/// Gives every selected conflict a safe, distinct fallback name. Existing files are never reused.
#[tauri::command]
pub fn make_conflict_names_unique(
    items: Vec<RenameItem>,
    conflict_source_paths: Vec<String>,
    state: State<'_, AppState>,
) -> Result<Vec<RenameItem>, String> {
    let conflict_sources = conflict_source_paths.into_iter().collect::<HashSet<_>>();
    let mut reserved_targets = HashSet::new();

    for item in &items {
        if conflict_sources.contains(&item.source_path) {
            continue;
        }
        let source = PathBuf::from(&item.source_path)
            .canonicalize()
            .map_err(|error| format!("Quelldatei ist nicht verfügbar: {error}"))?;
        reserved_targets.insert(normalised_path_key(
            &source.parent().unwrap_or(Path::new("")).join(&item.target_name),
        ));
    }

    items
        .into_iter()
        .map(|mut item| {
            if !conflict_sources.contains(&item.source_path) {
                return Ok(item);
            }
            if !filename_is_safe(&item.target_name) {
                return Err("Ungültige Dateinamen müssen einzeln korrigiert werden.".to_string());
            }

            let source = PathBuf::from(&item.source_path)
                .canonicalize()
                .map_err(|error| format!("Quelldatei ist nicht verfügbar: {error}"))?;
            under_selected_root(&state, &source)?;
            let parent = source.parent().unwrap_or(Path::new(""));

            for number in 2.. {
                let candidate = numbered_filename(&item.target_name, number);
                let target = parent.join(&candidate);
                let target_key = normalised_path_key(&target);
                if !target.exists() && reserved_targets.insert(target_key) {
                    item.target_name = candidate;
                    return Ok(item);
                }
            }
            unreachable!("the counter must eventually yield a free file name")
        })
        .collect()
}

#[tauri::command]
pub fn validate_rename_batch(
    items: Vec<RenameItem>,
    state: State<'_, AppState>,
) -> Result<Vec<RenameFailure>, String> {
    if items.is_empty() {
        return Err("Es wurden keine Dateien zum Umbenennen ausgewählt.".into());
    }
    Ok(prepare_renames(&state, &items)
        .into_iter()
        .filter_map(Result::err)
        .collect())
}

fn temporary_path(source: &Path, batch_id: &str, index: usize) -> PathBuf {
    source.with_file_name(format!(".serien-umbenenner-{batch_id}-{index}.tmp"))
}

fn stage_renames(
    prepared: Vec<PreparedRename>,
    batch_id: &str,
) -> Result<Vec<StagedRename>, RenameFailure> {
    let mut staged = Vec::with_capacity(prepared.len());
    for (index, item) in prepared.into_iter().enumerate() {
        let temporary = temporary_path(&item.source, batch_id, index);
        if temporary.exists() {
            restore_staged(&staged);
            return Err(RenameFailure {
                source_path: item.source.to_string_lossy().to_string(),
                message: "Temporärer Dateiname ist bereits belegt. Bitte erneut versuchen.".into(),
            });
        }
        if let Err(error) = fs::rename(&item.source, &temporary) {
            restore_staged(&staged);
            return Err(RenameFailure {
                source_path: item.source.to_string_lossy().to_string(),
                message: format!("Temporäres Umbenennen fehlgeschlagen: {error}"),
            });
        }
        staged.push(StagedRename {
            source: item.source,
            temporary,
            target: item.target,
        });
    }
    Ok(staged)
}

fn restore_staged(staged: &[StagedRename]) {
    for item in staged.iter().rev() {
        if item.temporary.exists() && !item.source.exists() {
            let _ = fs::rename(&item.temporary, &item.source);
        }
    }
}

fn finish_renames(staged: &[StagedRename]) -> Result<(), RenameFailure> {
    let mut completed: Vec<&StagedRename> = Vec::new();
    for item in staged {
        if let Err(error) = fs::rename(&item.temporary, &item.target) {
            for prior in completed.iter().rev() {
                if prior.target.exists() && !prior.source.exists() {
                    let _ = fs::rename(&prior.target, &prior.source);
                }
            }
            restore_staged(staged);
            return Err(RenameFailure {
                source_path: item.source.to_string_lossy().to_string(),
                message: format!("Umbenennen fehlgeschlagen und wurde zurückgesetzt: {error}"),
            });
        }
        completed.push(item);
    }
    Ok(())
}

#[tauri::command]
pub fn apply_rename_batch(
    app: AppHandle,
    items: Vec<RenameItem>,
    state: State<'_, AppState>,
) -> Result<RenameBatchResult, String> {
    let prepared_results = prepare_renames(&state, &items);
    let failures = prepared_results
        .iter()
        .filter_map(|result| result.as_ref().err().cloned())
        .collect::<Vec<_>>();
    if !failures.is_empty() {
        return Ok(RenameBatchResult {
            batch: None,
            failures,
        });
    }
    let prepared = prepared_results
        .into_iter()
        .filter_map(Result::ok)
        .collect::<Vec<_>>();
    let id = Uuid::new_v4().to_string();
    let staged = match stage_renames(prepared, &id) {
        Ok(value) => value,
        Err(failure) => {
            return Ok(RenameBatchResult {
                batch: None,
                failures: vec![failure],
            })
        }
    };
    if let Err(failure) = finish_renames(&staged) {
        return Ok(RenameBatchResult {
            batch: None,
            failures: vec![failure],
        });
    }

    let batch = BatchRecord {
        id,
        created_at: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
            .to_string(),
        items: staged
            .into_iter()
            .map(|item| RenameRecord {
                source_path: item.source.to_string_lossy().to_string(),
                target_path: item.target.to_string_lossy().to_string(),
                undone: false,
            })
            .collect(),
    };
    {
        let mut history = state
            .history
            .lock()
            .map_err(|_| "Historie ist gesperrt".to_string())?;
        history.insert(0, batch.clone());
        history.truncate(30);
    }
    save_history(&app, &state)?;
    Ok(RenameBatchResult {
        batch: Some(batch),
        failures: vec![],
    })
}

#[tauri::command]
pub fn get_history(state: State<'_, AppState>) -> Result<Vec<BatchRecord>, String> {
    Ok(state
        .history
        .lock()
        .map_err(|_| "Historie ist gesperrt".to_string())?
        .clone())
}

#[tauri::command]
pub fn undo_last_batch(app: AppHandle, state: State<'_, AppState>) -> Result<UndoResult, String> {
    let mut history = state
        .history
        .lock()
        .map_err(|_| "Historie ist gesperrt".to_string())?;
    let batch = history
        .iter_mut()
        .find(|batch| batch.items.iter().any(|item| !item.undone))
        .ok_or_else(|| "Es gibt keine Aktion zum Rückgängig-Machen.".to_string())?;

    let mut prepared = Vec::new();
    let mut failures = Vec::new();
    for (index, item) in batch.items.iter().enumerate() {
        if item.undone {
            continue;
        }
        let target = PathBuf::from(&item.target_path);
        let source = PathBuf::from(&item.source_path);
        if !target.exists() {
            failures.push(RenameFailure {
                source_path: item.source_path.clone(),
                message:
                    "Rückgängig nicht möglich: Die umbenannte Datei wurde verschoben oder gelöscht."
                        .into(),
            });
        } else if source.exists() {
            failures.push(RenameFailure {
                source_path: item.source_path.clone(),
                message: "Rückgängig nicht möglich: Der ursprüngliche Name ist bereits belegt."
                    .into(),
            });
        } else {
            prepared.push((
                index,
                PreparedRename {
                    source: target,
                    target: source,
                },
            ));
        }
    }
    let batch_id = format!("undo-{}", Uuid::new_v4());
    let staged = match stage_renames(
        prepared.iter().map(|(_, item)| item.clone()).collect(),
        &batch_id,
    ) {
        Ok(value) => value,
        Err(failure) => {
            return Ok(UndoResult {
                restored: 0,
                failures: vec![failure],
            })
        }
    };
    if let Err(failure) = finish_renames(&staged) {
        return Ok(UndoResult {
            restored: 0,
            failures: vec![failure],
        });
    }
    for (index, _) in prepared {
        batch.items[index].undone = true;
    }
    let restored = staged.len();
    drop(history);
    save_history(&app, &state)?;
    Ok(UndoResult { restored, failures })
}

fn tmdb_entry() -> Result<Entry, String> {
    Entry::new(TMDB_SERVICE, TMDB_ACCOUNT)
        .map_err(|error| format!("System-Schlüsselspeicher ist nicht verfügbar: {error}"))
}

#[tauri::command]
pub fn has_tmdb_key() -> Result<bool, String> {
    match tmdb_entry()?.get_password() {
        Ok(value) => Ok(!value.trim().is_empty()),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(error) => Err(format!(
            "TMDb-Schlüssel konnte nicht gelesen werden: {error}"
        )),
    }
}

#[tauri::command]
pub fn set_tmdb_key(key: String) -> Result<(), String> {
    if key.trim().is_empty() {
        return Err("Der TMDb-Schlüssel darf nicht leer sein.".into());
    }
    tmdb_entry()?
        .set_password(key.trim())
        .map_err(|error| format!("TMDb-Schlüssel konnte nicht gespeichert werden: {error}"))
}

#[tauri::command]
pub fn delete_tmdb_key() -> Result<(), String> {
    match tmdb_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!(
            "TMDb-Schlüssel konnte nicht entfernt werden: {error}"
        )),
    }
}

#[tauri::command]
pub async fn search_tmdb(query: String, language: String) -> Result<Vec<TmdbCandidate>, String> {
    let query = query.trim();
    if query.len() < 2 {
        return Ok(vec![]);
    }
    let key = tmdb_entry()?
        .get_password()
        .map_err(|_| "Bitte speichere zuerst einen TMDb API-Schlüssel.".to_string())?;
    let url = format!(
        "https://api.themoviedb.org/3/search/multi?api_key={}&query={}&language={}&include_adult=false",
        urlencoding::encode(&key),
        urlencoding::encode(query),
        urlencoding::encode(&language)
    );
    let response = Client::new()
        .get(url)
        .send()
        .await
        .map_err(|error| format!("TMDb konnte nicht erreicht werden: {error}"))?
        .error_for_status()
        .map_err(|error| format!("TMDb hat die Anfrage abgelehnt: {error}"))?
        .json::<TmdbResponse>()
        .await
        .map_err(|error| format!("TMDb-Antwort konnte nicht gelesen werden: {error}"))?;

    Ok(response
        .results
        .into_iter()
        .filter_map(|result| {
            let kind = result.media_type?;
            if kind != "movie" && kind != "tv" {
                return None;
            }
            let title = result.title.or(result.name)?;
            let original_title = result
                .original_title
                .or(result.original_name)
                .unwrap_or_else(|| title.clone());
            let year = result
                .release_date
                .or(result.first_air_date)
                .and_then(|date| date.get(0..4).map(str::to_owned));
            Some(TmdbCandidate {
                id: result.id,
                title,
                original_title,
                kind,
                year,
                overview: result.overview,
            })
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn temporary_staging_allows_two_files_to_swap_names() {
        let directory =
            std::env::temp_dir().join(format!("serien-umbenenner-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).expect("test directory");
        let first = directory.join("first.mkv");
        let second = directory.join("second.mkv");
        fs::write(&first, "first").expect("first fixture");
        fs::write(&second, "second").expect("second fixture");

        let staged = stage_renames(
            vec![
                PreparedRename {
                    source: first.clone(),
                    target: second.clone(),
                },
                PreparedRename {
                    source: second.clone(),
                    target: first.clone(),
                },
            ],
            "swap-test",
        )
        .expect("staging succeeds");
        finish_renames(&staged).expect("finishing succeeds");

        assert_eq!(fs::read_to_string(&first).expect("first moved"), "second");
        assert_eq!(fs::read_to_string(&second).expect("second moved"), "first");
        fs::remove_dir_all(directory).expect("remove test directory");
    }

    #[test]
    fn rejects_non_portable_target_names() {
        assert!(filename_is_safe("Danny Phantom S01E15.mkv"));
        assert!(!filename_is_safe("folder/episode.mkv"));
        assert!(!filename_is_safe("episode?.mkv"));
    }

    #[test]
    fn creates_a_numbered_filename_without_losing_the_extension() {
        assert_eq!(numbered_filename("Sons of Anarchy S01E01.mkv", 2), "Sons of Anarchy S01E01 (2).mkv");
        assert_eq!(numbered_filename("Episode", 3), "Episode (3)");
    }
}
