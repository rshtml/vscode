import {
    window,
    ExtensionContext,
    Uri,
} from 'vscode';

import { platform, arch } from 'os';
import axios from 'axios';
import * as tar from 'tar';
import * as fs from 'fs/promises';
import { pipeline } from 'stream/promises';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

const REPO = "rshtml/rshtml-analyzer";
export const SERVER_NAME = 'rshtml-analyzer';
export const BINARY_NAME: string = platform() === 'win32' ? `${SERVER_NAME}.exe` : SERVER_NAME;

//const UPDATE_CHECK_INTERVAL_MS = 3 * 60 * 60 * 1000; // 3 hours
const UPDATE_CHECK_INTERVAL_MS = 1 * 1 * 60 * 1000; // 1 minute

async function getLocalVersion(path: string): Promise<string | null> {
    const { stdout, stderr } = await execPromise(`"${path}" --version`).catch(() => ({ stdout: '', stderr: 'Command failed to execute' }));
    if (stderr) return null;

    const versionMatch = stdout.match(/(\d+\.\d+\.\d+)/);
    return versionMatch ? versionMatch[0] : null;
}

async function latestGithubRelease(): Promise<string | null> {
    try {
        const response = await axios.get<{ tag_name: string }>(`https://api.github.com/repos/${REPO}/releases/latest`, {
            headers: { 'User-Agent': 'rshtml-vscode-client' }
        });

        return response.data?.tag_name ?? null;
    } catch {
        return null
    }
}

export async function downloadGithubRelease(context: ExtensionContext): Promise<string> {
    const installDir: string = context.globalStorageUri.fsPath;
    const lsPath: string = Uri.joinPath(context.globalStorageUri, BINARY_NAME).fsPath;

    console.log("getting local release");
    const localVersion: string | null = await getLocalVersion(lsPath);
    console.log(`latest local version: ${localVersion}`);

    const lastCheckTimestamp = context.globalState.get<number>('rshtml.lastUpdateCheck');
    const currentTime = Date.now();

    if (localVersion && lastCheckTimestamp && (currentTime - lastCheckTimestamp < UPDATE_CHECK_INTERVAL_MS)) {
        console.log("Update check skipped, not enough time has passed since the last check.");
        return lsPath;
    }

    console.log("getting latest release");
    const latestTag: string | null = await latestGithubRelease();
    const latestVersion: string | undefined = latestTag?.replace(/^v/, '');
    console.log(`latest version: ${latestVersion}`);
    if (!latestVersion) return lsPath;

    console.log(`Latest version: ${latestVersion}, Local version: ${localVersion ?? 'not installed'}`);

    await context.globalState.update('rshtml.lastUpdateCheck', currentTime);

    if (latestVersion.trim() === localVersion?.trim()) {
        console.log("rshtml-analyzer is up to date.");
        return lsPath;
    }

    await fs.mkdir(installDir, { recursive: true });

    return await window.withProgress({
        location: 15,
        title: `Installing rshtml-analyzer ${latestVersion}...`
    }, async (progress): Promise<string> => {
        progress.report({ message: "Downloading release..." });

        const platformName: string = platform() === 'win32' ? 'windows' : (platform() === 'darwin' ? 'macos' : 'linux');
        const assetFileName: string = `${SERVER_NAME}-${platformName}-${arch()}.tar.gz`;
        const downloadUrl: string = `https://github.com/${REPO}/releases/download/${latestTag}/${assetFileName}`;

        const response = await axios.get(downloadUrl, { responseType: 'stream' });
        await pipeline(
            response.data,
            tar.x({
                C: installDir,
            })
        );

        if (platform() !== 'win32') {
            await fs.chmod(lsPath, 0o755);
        }

        console.log(`Successfully installed version ${latestVersion}`);
        return lsPath;
    });
}
