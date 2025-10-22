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
import path from 'path';
import os from 'os';

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

interface GithubReleaseInfo {
    tag_name: string,
    assets: {
        name: string,
        browser_download_url: string;
    }[];
}

async function latestGithubRelease(): Promise<GithubReleaseInfo | null> {
    try {
        const response = await axios.get<GithubReleaseInfo>(`https://api.github.com/repos/${REPO}/releases/latest`, {
            headers: { 'User-Agent': 'rshtml-vscode-client' }
        });

        return response.data;
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
    const releaseInfo = await latestGithubRelease();
    if (!releaseInfo) return lsPath;
    const latestVersion: string | undefined = releaseInfo.tag_name?.replace(/^v/, '');
    console.log(`latest version: ${latestVersion}`);
    if (!latestVersion) return lsPath;

    console.log(`Latest version: ${latestVersion}, Local version: ${localVersion ?? 'not installed'}`);

    await context.globalState.update('rshtml.lastUpdateCheck', currentTime);

    if (latestVersion.trim() === localVersion?.trim()) {
        console.log("rshtml-analyzer is up to date.");
        return lsPath;
    }

    return await window.withProgress({
        location: 15,
        title: `Installing rshtml-analyzer ${latestVersion}...`
    }, async (progress): Promise<string> => {
        progress.report({ message: "Downloading release..." });

        const platformName: string = platform() === 'win32' ? 'windows' : (platform() === 'darwin' ? 'macos' : 'linux');
        const archName = arch();
        const asset = releaseInfo.assets.find(asset => asset.name.toLowerCase().includes(platformName) && asset.name.toLowerCase().includes(archName));
        if (!asset) {
            window.showErrorMessage(`No compatible binary found for your system (${platformName}-${archName}).`);
            return lsPath;
        }

        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rshtml-analyzer-'));

        try {
            const response = await axios.get(asset.browser_download_url, { responseType: 'stream' });
            await pipeline(
                response.data,
                tar.x({
                    C: tempDir,
                })
            );

            const tempBinaryPath = path.join(tempDir, BINARY_NAME);
            await fs.mkdir(installDir, { recursive: true });
            await fs.copyFile(tempBinaryPath, lsPath);

            if (platform() !== 'win32') {
                await fs.chmod(lsPath, 0o755);
            }

            console.log(`Successfully installed version ${latestVersion}`);
            return lsPath;
        } catch (error: any) {
            window.showErrorMessage(`Failed to download or extract rshtml-analyzer: ${error.message}`);
            console.error(error);
            return lsPath;
        } finally {
            await fs.rm(tempDir, { recursive: true, force: true });
        }
    });
}
