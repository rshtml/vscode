import {
    workspace,
    ConfigurationTarget,
    window,
    ExtensionContext,
    WorkspaceConfiguration,
} from 'vscode';
import { createConnection, Socket } from 'net';
import {
    LanguageClient,
    TransportKind,
    ServerOptions,
    LanguageClientOptions,
    StreamInfo,
} from 'vscode-languageclient/node';
import which from 'which';
import { downloadGithubRelease, SERVER_NAME, BINARY_NAME } from "./downloadServer";

let client: LanguageClient | undefined;


export async function activate(context: ExtensionContext): Promise<void> {
    console.log('EXTENSION ACTIVE!');

    const filesConfig: WorkspaceConfiguration = workspace.getConfiguration('files');
    const associations: { [key: string]: string } = filesConfig.get('associations', {});

    const newAssociation = '*.rs.html';
    if (associations[newAssociation] !== 'html') {
        const newAssociations: { [key: string]: string } = { ...associations, [newAssociation]: 'html' };
        await filesConfig.update('associations', newAssociations, ConfigurationTarget.Workspace);
        console.log(`'files.associations' updated: '${newAssociation}' -> 'html'`);
    }

    const serverOptionsTCP = (): Promise<StreamInfo> => {
        return new Promise((resolve, reject) => {
            const host = '127.0.0.1';
            const port = 9257;

            console.log(`Connecting to TCP server: ${host}:${port}`);

            const socket: Socket = createConnection({ port, host });

            socket.on('connect', () => {
                console.log('TCP connection succeeded! LanguageClient starting.');
                resolve({
                    reader: socket,
                    writer: socket
                });
            });

            socket.on('error', (err: Error) => {
                console.error('Socket error:', err);
                window.showErrorMessage('Failed to connect to RsHtml server. Make sure the server is running.');
                reject(err);
            });
        });
    };

    let serverPath: string = BINARY_NAME;
    let path = await which(BINARY_NAME, { nothrow: true });
    console.log(`path: ${path}, binary: ${BINARY_NAME}`);
    if (path) {
        console.log("system binary found");
        serverPath = path;
    } else {
        console.log("binary not found");
        try {
            serverPath = await downloadGithubRelease(context);
        } catch (error: any) {
            window.showErrorMessage(`Failed to download ${SERVER_NAME}: ${error.message}`);
            return;
        }
    }

    const serverOptionsRPC: ServerOptions = {
        command: serverPath,
        transport: TransportKind.stdio
    };

    const clientOptions: LanguageClientOptions = {
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
        },
    };

    client = new LanguageClient(
        'rshtml-analyzer',
        'RsHtml Language Server',
        serverOptionsRPC,
        //serverOptionsTCP,
        clientOptions
    );

    //client.setTrace(Trace.Verbose)

    console.log('LanguageClient starting...');
    await client.start();
}

export function deactivate(): Thenable<void> | undefined {
    if (!client) {
        return undefined;
    }
    return client.stop();
}

/*
   2 async function findReleaseAsset(tagName: string): Promise<{ url: string, fileName: string } | null> {
    3     try {
    4         // API'den tüm release bilgilerini çekiyoruz
    5         const response = await axios.get<{ assets: { name: string, browser_download_url: string }[] }>(
    6             `https://api.github.com/repos/${REPO}/releases/tags/${tagName}`,
    7             { headers: { 'User-Agent': 'rshtml-vscode-client' } }
    8         );
    9
   10         const platformName = platform() === 'win32' ? 'windows' : (platform() === 'darwin' ? 'macos' :
      'linux');
   11         const archName = arch(); // 'x64', 'arm64' etc.
   12
   13         // Asset listesini döngüye alıp bizim platform ve mimarimize uyanı arıyoruz
   14         for (const asset of response.data.assets) {
   15             const lowerCaseName = asset.name.toLowerCase();
   16             if (lowerCaseName.includes(platformName) && lowerCaseName.includes(archName) && lowerCaseName.
      endsWith('.tar.gz')) {
   17                 console.log(`Found matching asset: ${asset.name}`);
   18                 return { url: asset.browser_download_url, fileName: asset.name };
   19             }
   20         }
   21
   22         console.error("No matching asset found for this platform and architecture.");
   23         return null;
   24     } catch (error) {
   25         console.error("Failed to fetch release assets:", error);
   26         return null;
   27     }
   28 }
*/