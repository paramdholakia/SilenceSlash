/**
 * Packaging script for SilenceSlash Release Artifacts
 * Creates a clean installable distribution package in dist/
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

console.log(`Packaging SilenceSlash v${pkg.version}...`);

const zipFileName = `SilenceSlash-v${pkg.version}.zip`;
const zipOutputPath = path.join(distDir, zipFileName);
const tempPackDir = path.join(distDir, 'SilenceSlash');

if (fs.existsSync(zipOutputPath)) {
  fs.unlinkSync(zipOutputPath);
}

if (fs.existsSync(tempPackDir)) {
  fs.rmSync(tempPackDir, { recursive: true, force: true });
}

fs.mkdirSync(tempPackDir, { recursive: true });

// Copy cep folder contents into tempPackDir
fs.cpSync(path.join(rootDir, 'cep'), tempPackDir, { recursive: true });

// Copy engine folder into tempPackDir/engine
fs.cpSync(path.join(rootDir, 'engine'), path.join(tempPackDir, 'engine'), { recursive: true });

// Copy README, LICENSE
fs.copyFileSync(path.join(rootDir, 'README.md'), path.join(tempPackDir, 'README.md'));
fs.copyFileSync(path.join(rootDir, 'LICENSE'), path.join(tempPackDir, 'LICENSE'));

// Compress
if (process.platform === 'win32') {
  cp.execSync(`powershell -Command "Compress-Archive -Path '${tempPackDir}\\*' -DestinationPath '${zipOutputPath}' -Force"`);
  fs.rmSync(tempPackDir, { recursive: true, force: true });
  console.log(`Created release artifact: ${zipOutputPath}`);
} else {
  try {
    cp.execSync(`cd "${distDir}" && zip -r "${zipFileName}" SilenceSlash`);
    fs.rmSync(tempPackDir, { recursive: true, force: true });
    console.log(`Created release artifact: ${zipOutputPath}`);
  } catch (err) {
    console.log(`Staged release folder at: ${tempPackDir}`);
  }
}
