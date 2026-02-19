import * as vscode from 'vscode';
import { RsHtmlFileExtractor } from './rshtmlFileExtractor';

export function registerRsHtmlFileProvider(context: vscode.ExtensionContext, parser: any) {
    const extractor = new RsHtmlFileExtractor(parser);

    const completionProvider = vscode.languages.registerCompletionItemProvider(
        { scheme: 'file', language: 'html', pattern: '**/*.rs.html' },
        {
            async provideCompletionItems(document, position) {
                const result = extractor.getOrUpdate(document);
                if (!result) return null;

                console.error(result.virtualText);

                const isInRust = result.rustRegions.some((r: { start: number, end: number }) =>
                    position.isAfterOrEqual(document.positionAt(r.start)) &&
                    position.isBeforeOrEqual(document.positionAt(r.end))
                );
                if (!isInRust) return null;

                // rust-analyzer'a yönlendir
            }
        }
    );

    context.subscriptions.push(completionProvider);
}