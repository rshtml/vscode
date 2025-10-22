import { workspace, ConfigurationTarget, window } from 'vscode';
import { createConnection } from 'net';
import { LanguageClient, TransportKind } from 'vscode-languageclient/node.js';
import { platform, arch } from 'os';
import axios from 'axios';
import * as tar from 'tar';
import * as fs from 'fs/promises';
import { pipeline } from 'stream/promises';
import { exec } from 'child_process';
import { promisify } from 'util';

let client;

const execPromise = promisify(exec);

const REPO = "rshtml/rshtml-analyzer";
const SERVER_NAME = 'rshtml-analyzer';
const BINARY_NAME= platform() === 'win32' ? `${SERVER_NAME}.exe` : SERVER_NAME;

export async function activate(context) {
    console.log('EXTENSION ACTIVE!');

    const filesConfig = workspace.getConfiguration('files');
    const associations = filesConfig.get('associations', {});

    const newAssociation = '*.rs.html';
    if (associations[newAssociation] !== 'html') {
        const newAssociations = { ...associations, [newAssociation]: 'html' };
        await filesConfig.update('associations', newAssociations, ConfigurationTarget.Global);
        console.log(`'files.associations' updated: '${newAssociation}' -> 'html'`);
    }

    const serverOptionsTCP = () => {
        return new Promise((resolve, reject) => {
            const host = '127.0.0.1';
            const port = 9257;

            console.log(`Connecting to TCP server: ${host}:${port}`);

            const socket = createConnection({ port, host });

            socket.on('connect', () => {
                console.log('TCP connection successed! LanguageClient starting.');
                resolve({
                    reader: socket,
                    writer: socket
                });
            });

            socket.on('error', (err) => {
                console.error('Socket error:', err);
                window.showErrorMessage('Failed to connect to RsHtml server. Make sure the server is running.');
                reject(err);
            });
        });
    };

    
    let serverPath = BINARY_NAME;
     
    if(!await commandExists(BINARY_NAME)) {
       serverPath = await downloadGithubRelease(context);
    }    

    const serverOptionsRPC = {
        command: serverPath, //context.asAbsolutePath(serverPath),
        //args: [context.asAbsolutePath(path.join('server', 'main.js'))],
        transport: TransportKind.stdio
    };

    const clientOptions = {
        documentSelector: [
            { scheme: 'file', language: 'html', pattern: '**/*.rs.html' }
        ],
        outputChannelName: 'RsHtml Language Server',
        traceOutputChannel: window.createOutputChannel('RsHtml LSP Trace'),
        initializationOptions: {
            workspaceFolders: workspace.workspaceFolders?.map(folder => folder.uri.toString()) || null,
        },
        synchronize: {
            fileEvents: workspace.createFileSystemWatcher('**/Cargo.toml')
        }
    };

    client = new LanguageClient(
        'rshtml-analyzer',
        'RsHtml Language Server',
        serverOptionsRPC, //serverOptionsTCP
        clientOptions
    );

    console.log('LanguageClient starting...');
    await client.start();
}

export async function deactivate() {
    if (!client) {
        return undefined;
    }
    return await client.stop();
}

function commandExists(command) {
  const isWindows = process.platform === 'win32';
  const checkCommand = isWindows ? `where /q ${command}` : `command -v ${command}`;

  return execPromise(checkCommand)
    .then(() => {
      return true;
    })
    .catch(() => {
      return false;
    });
}

async function getLocalVersion(path) {
    const { stdout, stderr } = await execPromise(`"${path}" --version`).catch(() => ({ stdout: '', stderr: 'Command failed to execute' }));
    return stderr ? null : stdout;
}

async function latestGithubRelease() {
    const url = `https://api.github.com/repos/${REPO}/releases/latest`;
    const response = await axios.get(url, { headers: { 'User-Agent': 'rshtml vscode client' } });
    return response.data?.tag_name ?? Promise.reject(new Error('"tag_name" not found'));
}

async function downloadGithubRelease(context) {
    const installDir = context.globalStorageUri.fsPath;
    const binaryName = platform() === 'win32' ? `${SERVER_NAME}.exe` : SERVER_NAME; 
    const lsPath = Uri.joinPath(context.globalStorageUri, binaryName).fsPath;

    const latestTag = await latestGithubRelease();
    const latestVersion = latestTag.replace(/^v/, '');
    const localVersion = await getLocalVersion(lsPath);

    console.log(`Latest version: ${latestVersion}, Local version: ${localVersion ?? 'not installed'}`);

    if (latestVersion === localVersion) {
        console.log("rshtml-analyzer is up to date.");
        return lsPath;
    }

    return await window.withProgress({
        location: 15,
        title: `Installing rshtml-analyzer ${latestVersion}...`
    }, async (progress) => {
        progress.report({ message: "Downloading release..." });

        const platformName = platform() === 'win32' ? 'windows' : (platform() === 'darwin' ? 'macos' : 'linux');
        const assetFileName = `${SERVER_NAME}-${platformName}-${arch()}.tar.gz`;
        const downloadUrl = `https://github.com/${REPO}/releases/download/${latestTag}/${assetFileName}`;

        const response = await axios.get(downloadUrl, { responseType: 'stream' });
        await pipeline(
            response.data,
            tar.x({
                C: installDir,
                strip: 1,
            })
        );

        if (platform() !== 'win32') {
            await fs.chmod(lsPath, 0o755);
        }

        console.log(`Successfully installed version ${latestVersion}`);
        return lsPath;
    });
}
