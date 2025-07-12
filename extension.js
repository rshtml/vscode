import { workspace, ConfigurationTarget, window } from 'vscode';
import { createConnection } from 'net';
import path from 'path';
import { LanguageClient, TransportKind } from 'vscode-languageclient/node.js';

let client;

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

    const serverOptionsRPC = {
        command: context.asAbsolutePath("rshtml_analyzer.exe"),
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
        'rshtmlLanguageServer',
        'RSHtml Language Server',
        serverOptionsTCP,
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
