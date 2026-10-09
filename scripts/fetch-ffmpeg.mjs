// Downloads the FFmpeg essentials build (gyan.dev) into bin/: ffmpeg.exe, ffprobe.exe and its license.
// The binaries are bundled with the installer (electron-builder.yml) and used in dev from bin/.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = '9.0.2';
const ZIP_URL = `https://github.com/GyanD/codexffmpeg/releases/download/${VERSION}/ffmpeg-${VERSION}-essentials_build.zip`;
const SHA256 = '60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba';
const FILES = { 'bin/ffmpeg.exe': 'ffmpeg.exe', 'bin/ffprobe.exe': 'ffprobe.exe', 'LICENSE': 'ffmpeg-LICENSE.txt' };

const binDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin');
const versionFile = path.join(binDir, 'ffmpeg-version.txt');

if (!process.argv.includes('--force')
    && fs.existsSync(versionFile) && fs.readFileSync(versionFile, 'utf8').trim() === VERSION
    && Object.values(FILES).every(name => fs.existsSync(path.join(binDir, name)))) {
    console.log(`FFmpeg ${VERSION} is already in bin/ (--force to download again)`);
    process.exit(0);
}

console.log(`Downloading ${ZIP_URL}`);
const response = await fetch(ZIP_URL);
if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);
const zip = Buffer.from(await response.arrayBuffer());

const hash = createHash('sha256').update(zip).digest('hex');
if (hash !== SHA256) throw new Error(`Checksum mismatch: expected ${SHA256}, got ${hash}`);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'filmster-ffmpeg-'));
try {
    const zipPath = path.join(tempDir, 'ffmpeg.zip');
    fs.writeFileSync(zipPath, zip);
    // Windows tar (bsdtar) extracts zip; a GNU tar earlier in PATH (Git Bash) can't
    const tar = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
    execFileSync(tar, ['-xf', zipPath, '-C', tempDir], { stdio: 'inherit' });

    const root = path.join(tempDir, `ffmpeg-${VERSION}-essentials_build`);
    fs.mkdirSync(binDir, { recursive: true });
    for (const [from, to] of Object.entries(FILES)) fs.copyFileSync(path.join(root, from), path.join(binDir, to));
    fs.writeFileSync(versionFile, VERSION);
    console.log(`FFmpeg ${VERSION} saved to bin/`);
} finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
}
