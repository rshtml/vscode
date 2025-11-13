import type { Socket } from 'node:net';
import { createConnection } from 'node:net';

import type {
    ExtensionContext,
    WorkspaceConfiguration,
} from 'vscode';
import {
    ConfigurationTarget,
    window,
    workspace,
} from 'vscode';

import type {
    LanguageClientOptions,
    ServerOptions,
    StreamInfo,
} from 'vscode-languageclient/node';
import { LanguageClient, TransportKind } from 'vscode-languageclient/node';
   
import which from 'which';
import { BINARY_NAME, downloadGithubRelease, SERVER_NAME } from "./downloadServer";

let client: LanguageClient | undefined;
const IS_DEBUG = false;


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

    let serverOptions: ServerOptions | (() => Promise<StreamInfo>);

    if (IS_DEBUG) {
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
        serverOptions = serverOptionsTCP;
    } else {
        let serverPath: string = BINARY_NAME;
        const path = await which(BINARY_NAME, { nothrow: true });
        console.log(`path: ${path}, binary: ${BINARY_NAME}`);
        if (path) {
            console.log("system binary found");
            serverPath = path;
        } else {
            console.log("binary not found");
            try {
                serverPath = await downloadGithubRelease(context);
            } catch (error) {
                window.showErrorMessage(`Failed to download ${SERVER_NAME}: ${error.message}`);
                return;
            }
        }

        const serverOptionsRPC: ServerOptions = {
            command: serverPath,
            transport: TransportKind.stdio
        };
        serverOptions = serverOptionsRPC;
    }

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
        serverOptions,
        //serverOptionsRPC, //serverOptionsTCP,        
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
