import * as vscode from 'vscode';
import path from 'path';


export function registerRsHtmlProvider(context: vscode.ExtensionContext) {

    const wasmDir = path.join(context.extensionPath, 'out');
    let wasmPath = path.join(wasmDir, "pkg/tree_sitter_semantic_tokens.js");
    const wasm = require(wasmPath);

    const LEGEND = new vscode.SemanticTokensLegend(
        wasm.semantic_token_types(),
        wasm.semantic_token_modifiers()
    );


    const selector: vscode.DocumentSelector = {
        language: 'html',
        scheme: 'file',
        pattern: '**/*.rs.html',
    };

    const semanticTokensProvider = vscode.languages.registerDocumentSemanticTokensProvider(
        selector,
        {
            provideDocumentSemanticTokens(
                document: vscode.TextDocument,
                _token: vscode.CancellationToken
            ): vscode.SemanticTokens {
                const data: Uint32Array = wasm.semantic_tokens_full(
                    document.uri.toString(),
                    document.getText()
                );
                
                return new vscode.SemanticTokens(data, '1');
            },

            provideDocumentSemanticTokensEdits(
                document: vscode.TextDocument,
                _previousResultId: string,
                _token: vscode.CancellationToken
            ): vscode.SemanticTokensEdits {
                const delta = wasm.semantic_tokens_full_delta(
                    document.uri.toString(),
                    document.getText()
                );

                const edits: vscode.SemanticTokensEdit[] = (delta.edits || []).map(
                    (e: any) =>
                        new vscode.SemanticTokensEdit(
                            e.start,
                            e.deleteCount ?? e.delete_count,
                            e.data ? new Uint32Array(e.data) : undefined
                        )
                );

                return new vscode.SemanticTokensEdits(
                    edits,
                    delta.resultId ?? delta.result_id ?? '1'
                );
            },
        },
        LEGEND
    );

    const rangeSemanticTokensProvider = vscode.languages.registerDocumentRangeSemanticTokensProvider(
        selector,
        {
            provideDocumentRangeSemanticTokens(
                document: vscode.TextDocument,
                range: vscode.Range,
                _token: vscode.CancellationToken
            ): vscode.SemanticTokens {
                const lspRange = {
                    start: { line: range.start.line, character: range.start.character },
                    end: { line: range.end.line, character: range.end.character },
                };

                const data: Uint32Array = wasm.semantic_tokens_range(
                    document.getText(),
                    lspRange
                );

                return new vscode.SemanticTokens(data);
            },
        },
        LEGEND
    );

    const closeListener = vscode.workspace.onDidCloseTextDocument((document) => {
        if (document.fileName.endsWith('.rs.html')) {
            wasm.remove_document(document.uri.toString());
        }
    });

    context.subscriptions.push(
        semanticTokensProvider,
        rangeSemanticTokensProvider,
        closeListener
    );
}