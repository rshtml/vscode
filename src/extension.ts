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
import { registerVMacroProvider } from "./registerVMacroProvider";
import path from 'path';
const { Parser, Language } = require('web-tree-sitter');


let client: LanguageClient | undefined;
const outputChannel = window.createOutputChannel('RsHtml');

export async function activate(context: ExtensionContext): Promise<void> {
    try {
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
        let binary_path = await which(BINARY_NAME, { nothrow: true });
        console.log(`path: ${binary_path}, binary: ${BINARY_NAME}`);
        if (binary_path) {
            console.log("system binary found");
            serverPath = binary_path;
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

        outputChannel.appendLine('=== RsHtml Extension Activating ===');
        const parser = await initTreeSitter(context);
        outputChannel.appendLine('Parser initialized');
        registerVMacroProvider(context, parser);
        outputChannel.appendLine('Providers registered');

        console.log('LanguageClient starting...');
        await client.start();
    } catch (error) {
        window.showErrorMessage(`RsHtml ERROR: ${error}`);
    }
}

export function deactivate(): Thenable<void> | undefined {
    if (!client) {
        return undefined;
    }
    return client.stop();
}

async function initTreeSitter(context: ExtensionContext) {
    try {
        const wasmDir = path.join(context.extensionPath, 'out');

        await Parser.init({
            locateFile: (file: string) => path.join(wasmDir, file)
        });

        const parser = new Parser();
        const rustWasmPath = path.join(wasmDir, 'tree-sitter-rust.wasm');
        const Rust = await Language.load(rustWasmPath);

        parser.setLanguage(Rust);
        return parser;
    } catch (error) {
        outputChannel.appendLine(`ERROR: ${error}`);
        outputChannel.show();
        throw error;
    }
}