import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const [assetsDirectory, tag, repository] = process.argv.slice(2);

if (!assetsDirectory || !tag || !repository) {
  throw new Error("Usage: node scripts/create-updater-manifest.mjs <assets-directory> <tag> <owner/repository>");
}

function filesIn(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const filePath = join(directory, entry);
    return statSync(filePath).isDirectory() ? filesIn(filePath) : [filePath];
  });
}

function updateAsset(files, matches, label) {
  const candidates = files.filter((filePath) => matches(basename(filePath)));
  if (candidates.length !== 1) {
    throw new Error(`Expected exactly one ${label} update asset, found ${candidates.length}.`);
  }
  const filePath = candidates[0];
  const signaturePath = `${filePath}.sig`;
  if (!existsSync(signaturePath)) {
    throw new Error(`Missing signature for ${basename(filePath)}.`);
  }
  return {
    url: `https://github.com/${repository}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(basename(filePath))}`,
    signature: readFileSync(signaturePath, "utf8").trim(),
  };
}

const assets = filesIn(assetsDirectory);
const manifest = {
  version: tag.replace(/^v/, ""),
  notes: "Deutsch: Verbesserungen und Fehlerkorrekturen.\n\nEnglish: Improvements and bug fixes.",
  pub_date: new Date().toISOString(),
  platforms: {
    "darwin-universal": updateAsset(assets, (name) => name.endsWith(".app.tar.gz"), "macOS"),
    "windows-x86_64": updateAsset(assets, (name) => name.endsWith(".exe"), "Windows"),
    "linux-x86_64": updateAsset(assets, (name) => name.endsWith(".AppImage"), "Linux"),
  },
};

writeFileSync(join(assetsDirectory, "latest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
