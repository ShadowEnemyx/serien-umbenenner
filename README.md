# Serien-Umbenenner / Series Renamer

[Deutsch](#deutsch) · [English](#english)

---

## Deutsch

Eine plattformübergreifende Desktop-App zum sicheren, lokalen Umbenennen vieler Video-Dateien. Sie zeigt jeden neuen Namen vorab, schlägt mögliche Präfixe wie `tvkids` oder `tvarchiv` vor und ändert nie etwas ohne Bestätigung.

### Downloads

Fertige Installationsdateien stehen bei jeder veröffentlichten Version unter [Releases](https://github.com/ShadowEnemyx/serien-umbenenner/releases) bereit: `.dmg` für macOS, `.exe` für Windows sowie `.AppImage` und `.deb` für Linux.

### Funktionen

- Scannt einen gewählten Ordner, optional samt Unterordnern, und ignoriert versteckte Dateien wie `._tvkids…` sowie versteckte Ordner.
- Unterstützt MKV, MP4, AVI, MOV, M4V, WMV, WebM, MPG und MPEG.
- Erkennt führende, bisher unbekannte Namensbestandteile als Vorschläge.
- Speichert bestätigte Regeln lokal und wendet nur bestätigte Entfernen-Regeln an.
- Formatiert Namen wie `tvkids.danny.phantom.s01e15.mkv` zu `Danny Phantom S01E15.mkv`.
- Verarbeitet auch Bindestriche wie `tvr-soa-s01e01-720p.mkv` und kann technische Zusätze wie `720p` oder `WEB-DL` entfernen.
- Zeigt eine editierbare Vorschau, schützt vor Überschreiben und löst Namenskonflikte einzeln oder für alle mit eindeutigen Nummern.
- Benennt über temporäre Namen um und kann die letzte Aktion rückgängig machen.
- Titel-Abkürzungen lassen sich ohne Online-Dienst einmalig zuordnen, etwa `soa` → `Sons of Anarchy`; die App speichert und nutzt sie für alle passenden Folgen.
- Optional: TMDb-Titelsuche mit eigenem API-Schlüssel aus dem System-Schlüsselspeicher.
- Prüft beim Start automatisch auf neue Versionen. Bei einem Treffer zeigt die App das Update an, lädt es nach Bestätigung signiert herunter und startet danach neu.

### Lokal starten

Benötigt werden Node.js 24+ und die aktuelle Rust-Toolchain. Auf Linux sind zusätzlich die von [Tauri genannten System-Abhängigkeiten](https://v2.tauri.app/start/prerequisites/) nötig.

```bash
npm install
npm run tauri dev
```

Tests und Web-Build:

```bash
npm run test
npm run build
```

### Datenschutz und TMDb

Die normale Umbenennung arbeitet komplett offline. Für die optionale Titelsuche hinterlegst du deinen eigenen TMDb-API-Schlüssel in der App. Der Schlüssel wird nicht in Projektdateien oder auf GitHub gespeichert. Erst bei einer Suche schickt die App den bereinigten möglichen Titel an TMDb, niemals den Ordnerpfad.

### Releases

Ein Git-Tag wie `v0.1.0` erzeugt über GitHub Actions Installer für Windows x64, macOS (Intel und Apple Silicon) sowie Linux x64 (AppImage und `.deb`). Zusätzlich entsteht ein signiertes Update-Verzeichnis für die integrierte Update-Funktion. Die Installationsdateien selbst sind noch nicht mit einem Apple- bzw. Windows-Entwicklerzertifikat signiert; deshalb kann das Betriebssystem beim ersten Start warnen.

---

## English

A cross-platform desktop app for safely renaming many video files locally. It previews every new name, suggests possible prefixes such as `tvkids` or `tvarchiv`, and never changes anything without confirmation.

### Downloads

Ready-to-use installers for every released version are available under [Releases](https://github.com/ShadowEnemyx/serien-umbenenner/releases): `.dmg` for macOS, `.exe` for Windows, plus `.AppImage` and `.deb` for Linux.

### Features

- Scans a selected folder, optionally including subfolders, and ignores hidden files such as `._tvkids…` as well as hidden folders.
- Supports MKV, MP4, AVI, MOV, M4V, WMV, WebM, MPG and MPEG.
- Detects unknown leading name parts as suggestions.
- Saves confirmed rules locally and applies only confirmed removal rules.
- Formats names such as `tvkids.danny.phantom.s01e15.mkv` as `Danny Phantom S01E15.mkv`.
- Handles dashes such as `tvr-soa-s01e01-720p.mkv` and can remove technical tags such as `720p` or `WEB-DL`.
- Shows an editable preview, prevents overwrites, and resolves name conflicts individually or for all files with unique numbered names.
- Uses temporary names for safe renaming and can undo the latest operation.
- Lets you map title abbreviations once without an online service, for example `soa` → `Sons of Anarchy`; the app saves and uses the mapping for every matching episode.
- Optional TMDb title lookup with your own API key stored in the system credential store.
- Automatically checks for new versions at startup. When one is found, the app displays it, securely downloads the signed update after confirmation, and then restarts.

### Run locally

Node.js 24+ and the current Rust toolchain are required. Linux also needs the [system dependencies listed by Tauri](https://v2.tauri.app/start/prerequisites/).

```bash
npm install
npm run tauri dev
```

Run tests and create a web build:

```bash
npm run test
npm run build
```

### Privacy and TMDb

Regular renaming works entirely offline. For optional title lookups, you enter your own TMDb API key in the app. The key is never saved in project files or on GitHub. Only a cleaned possible title is sent to TMDb when you search; folder paths are never sent.

### Releases

A Git tag such as `v0.1.0` triggers GitHub Actions and produces installers for Windows x64, macOS (Intel and Apple Silicon), and Linux x64 (AppImage and `.deb`). It also creates a signed update manifest for the built-in updater. The installers themselves are not yet signed with Apple or Windows developer certificates, so the operating system may still display a warning when they are first opened.

## License / Lizenz

[MIT](LICENSE)
