# Serien-Umbenenner

Eine plattformübergreifende Desktop-App zum sicheren, lokalen Umbenennen vieler Video-Dateien. Sie zeigt jeden neuen Namen vorab, schlägt mögliche Präfixe wie `tvkids` oder `tvarchiv` vor und ändert nie etwas ohne Bestätigung.

## Downloads

Fertige Installationsdateien stehen bei jeder veröffentlichten Version unter [Releases](https://github.com/ShadowEnemyx/serien-umbenenner/releases) bereit: `.dmg` für macOS, `.exe` für Windows sowie `.AppImage` und `.deb` für Linux.

## Funktionen

- Scannt einen gewählten Ordner, optional samt Unterordnern
- Unterstützt MKV, MP4, AVI, MOV, M4V, WMV, WebM, MPG und MPEG
- Erkennt führende, bisher unbekannte Namensbestandteile als Vorschläge
- Speichert bestätigte Regeln lokal und wendet nur bestätigte Entfernen-Regeln an
- Formatiert Namen wie `tvkids.danny.phantom.s01e15.mkv` zu `Danny Phantom S01E15.mkv`
- Verarbeitet auch Bindestriche wie `tvr-soa-s01e01-720p.mkv` und kann technische Zusätze wie `720p` oder `WEB-DL` entfernen
- Zeigt eine editierbare Vorschau, schützt vor Überschreiben und behandelt Konflikte einzeln oder für alle mit eindeutigen Nummern
- Benennt über temporäre Namen um und kann die letzte Aktion rückgängig machen
- Titel-Abkürzungen lassen sich ohne Online-Dienst einmalig zuordnen, etwa `soa` → `Sons of Anarchy`; die App speichert und nutzt sie für alle passenden Folgen
- Optional: TMDb-Titelsuche mit eigenem API-Schlüssel aus dem System-Schlüsselspeicher, um solche Zuordnungen bequem zu finden

## Lokal starten

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

## Datenschutz und TMDb

Die normale Umbenennung arbeitet komplett offline. Für die optionale Titelsuche hinterlegst du deinen eigenen TMDb-API-Schlüssel in der App. Der Schlüssel wird nicht in Projektdateien oder auf GitHub gespeichert. Erst bei einer Suche schickt die App den bereinigten möglichen Titel an TMDb, niemals den Ordnerpfad.

## Releases

Ein Git-Tag wie `v0.1.0` löst GitHub Actions aus und erzeugt unsignierte Installer für Windows x64, macOS (Intel und Apple Silicon) sowie Linux x64 (AppImage und `.deb`). Unsignierte macOS- und Windows-Downloads können beim ersten Start eine Betriebssystem-Warnung zeigen.

## Lizenz

[MIT](LICENSE)
