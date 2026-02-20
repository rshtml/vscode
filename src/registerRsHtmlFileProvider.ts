import * as vscode from 'vscode';
import { RsHtmlFileExtractor } from './rshtmlFileExtractor';

export function registerRsHtmlFileProvider(context: vscode.ExtensionContext, parser: any) {
    const extractor = new RsHtmlFileExtractor(parser);

    const completionProvider = vscode.languages.registerCompletionItemProvider(
        { scheme: 'file', language: 'html', pattern: '**/*.rs.html' },
        {
            async provideCompletionItems(document, position) {
                const result = extractor.getOrUpdate(document);

                console.error(result);

                //const fs = require('fs');
                //const path = require('path');
                //fs.writeFileSync(path.join(context.extensionPath, 'rshtml_virtual.rs'), result);

                // rust-analyzer'a yönlendir

                return null;
            }
        }
    );

    context.subscriptions.push(completionProvider);
}