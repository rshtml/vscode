import * as vscode from 'vscode';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { VMacroExtractor } from './vMacroExtractor';
import {
    getLanguageService,
    InsertTextFormat,
    CompletionItem as LSPCompletionItem,
    CompletionItemTag as LSPCompletionItemTag
} from 'vscode-html-languageservice';

const LSP_TO_VSCODE_KIND_OFFSET = 1;

export function registerVMacroProvider(context: vscode.ExtensionContext, parser: any) {

    const htmlService = getLanguageService();
    const extractor = new VMacroExtractor(parser);

    const completionProvider = vscode.languages.registerCompletionItemProvider(
        'rust',
        {
            async provideCompletionItems(document, position, token, _context) {
                try {
                    if (token.isCancellationRequested) return null;

                    const offset = document.offsetAt(position);

                    const data = extractor.getOrUpdate(document, offset);
                    if (!data || extractor.isInRustBlock(data, offset)) return null;

                    if (token.isCancellationRequested) return null;

                    const htmlDoc = htmlService.parseHTMLDocument(data.doc);
                    const completionList = htmlService.doComplete(data.doc, position, htmlDoc);

                    if (!completionList || !completionList.items) return null;

                    return completionList.items.map(lspItem => toVsCompletionItem(lspItem));

                } catch (error) {
                    console.error('[RsHtml] Completion error:', error);
                    return null;
                }
            }
        },
        '<', ' ', ':', '"', '=', '/'
    );

    const hoverProvider = vscode.languages.registerHoverProvider('rust', {
        async provideHover(document, position, token) {
            try {
                if (token.isCancellationRequested) return null;

                const offset = document.offsetAt(position);

                const data = extractor.getOrUpdate(document, offset);
                if (!data || extractor.isInRustBlock(data, offset)) return null;

                if (token.isCancellationRequested) return null;

                const htmlDoc = htmlService.parseHTMLDocument(data.doc);
                const hover = htmlService.doHover(data.doc, position, htmlDoc);

                if (!hover || !hover.contents) return null;

                // LSP format to Vs Code format
                let markdownContent: vscode.MarkdownString;

                if (typeof hover.contents === 'string') {
                    markdownContent = new vscode.MarkdownString(hover.contents);
                } else if (Array.isArray(hover.contents)) {
                    const text = hover.contents
                        .map(c => typeof c === 'string' ? c : c.value)
                        .join('\n\n');
                    markdownContent = new vscode.MarkdownString(text);
                } else {
                    markdownContent = new vscode.MarkdownString(hover.contents.value);
                }

                markdownContent.isTrusted = true;

                const range = hover.range ? new vscode.Range(
                    hover.range.start.line, hover.range.start.character,
                    hover.range.end.line, hover.range.end.character
                ) : undefined;

                return new vscode.Hover(markdownContent, range);
            } catch (error) {
                console.error('[RsHtml] Hover provider error:', error);
                return null;
            }
        }
    });

    registerAutoCloseTag(context, extractor);

    const formatCommand = vscode.commands.registerCommand('rshtml.format', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'rust') return;

        const options: vscode.FormattingOptions = editor.options as vscode.FormattingOptions || {
            tabSize: 2,
            insertSpaces: true
        };
        const edits = calculateHtmlEdits(editor.document, options, extractor, htmlService);

        if (edits.length > 0) {
            await editor.edit(editBuilder => {
                for (let i = edits.length - 1; i >= 0; i--) {
                    const e = edits[i];
                    editBuilder.replace(e.range, e.newText);
                }
            });
        }

        await vscode.commands.executeCommand('editor.action.formatDocument');
    });

    // For format on save
    const saveListener = vscode.workspace.onWillSaveTextDocument(event => {
        if (event.document.languageId !== 'rust') return;

        const config = vscode.workspace.getConfiguration('editor', event.document.uri);
        if (!config.get('formatOnSave')) return;

        const defaultOptions: vscode.FormattingOptions =
            vscode.window.activeTextEditor?.options as vscode.FormattingOptions || {
                tabSize: 2,
                insertSpaces: true
            };

        let edits = calculateHtmlEdits(event.document, defaultOptions, extractor, htmlService);

        event.waitUntil(Promise.resolve(edits));
    });

    context.subscriptions.push(completionProvider, hoverProvider, formatCommand, saveListener);
}

// Completion
function toVsCompletionItem(lspItem: LSPCompletionItem): vscode.CompletionItem {
    const vsItem = new vscode.CompletionItem(lspItem.label);

    if (lspItem.kind) {
        vsItem.kind = lspItem.kind - LSP_TO_VSCODE_KIND_OFFSET;
    }

    if (lspItem.documentation) {
        const docValue = typeof lspItem.documentation === 'string'
            ? lspItem.documentation
            : lspItem.documentation.value;
        vsItem.documentation = new vscode.MarkdownString(docValue);
    }

    vsItem.detail = lspItem.detail;
    vsItem.sortText = lspItem.sortText;
    vsItem.filterText = lspItem.filterText;
    vsItem.preselect = lspItem.preselect;

    if (lspItem.commitCharacters) {
        vsItem.commitCharacters = lspItem.commitCharacters;
    }

    if (lspItem.tags?.includes(LSPCompletionItemTag.Deprecated) || lspItem.deprecated) {
        vsItem.tags = [vscode.CompletionItemTag.Deprecated];
    }

    const edit = lspItem.textEdit;

    if (edit) {
        vsItem.insertText = toVsSnippet(edit.newText, lspItem.insertTextFormat);

        if ('range' in edit) {
            vsItem.range = toVsRange(edit.range);
        } else if ('insert' in edit && 'replace' in edit) {
            vsItem.range = toVsRange(edit.replace);
        }
    } else {
        vsItem.insertText = toVsSnippet(lspItem.insertText ?? lspItem.label, lspItem.insertTextFormat);
    }

    return vsItem;
}

function toVsRange(range: { start: { line: number, character: number }, end: { line: number, character: number } }): vscode.Range {
    return new vscode.Range(
        range.start.line, range.start.character,
        range.end.line, range.end.character
    );
}

function toVsSnippet(text: string, format?: number): string | vscode.SnippetString {
    if (format === InsertTextFormat.Snippet) {
        return new vscode.SnippetString(text);
    }
    return text;
}
// End Completion

// Auto Close
export function registerAutoCloseTag(
    context: vscode.ExtensionContext,
    extractor: VMacroExtractor
) {
    let isBusy = false;

    const voidElements = new Set([
        'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
        'link', 'meta', 'param', 'source', 'track', 'wbr'
    ]);

    const listener = vscode.workspace.onDidChangeTextDocument(async event => {
        if (isBusy || event.document.languageId !== 'rust' || event.contentChanges.length === 0) return;

        const change = event.contentChanges[0];
        if (change.text.length !== 1) return;
        if (change.text !== '>' && change.text !== '/') return;

        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document !== event.document) return;

        const position = change.range.end.translate(0, 1);
        const offset = event.document.offsetAt(position);

        const data = extractor.getOrUpdate(event.document, offset);
        if (!data || extractor.isInRustBlock(data, offset)) return;

        const startPos = event.document.positionAt(Math.max(data.info.contentStart, offset - 1000));
        const rangeBefore = new vscode.Range(startPos, position);
        const textBefore = event.document.getText(rangeBefore);

        if (change.text === '/') {
            const nextCharRange = new vscode.Range(position, position.translate(0, 1));
            const nextChar = event.document.getText(nextCharRange);
            if (nextChar === '>') return;

            const contentToCheck = textBefore.slice(0, -1);
            if (/<[^>]+$/.test(contentToCheck)) {
                await performEdit(editor, position, '>', false);
            }
        }

        else if (change.text === '>') {
            if (textBefore.endsWith('/>')) return;

            const contentToCheck = textBefore.slice(0, -1);
            const match = contentToCheck.match(/<([a-zA-Z][a-zA-Z0-9:-]*)(?:\s+[^<]*)?$/);

            if (match) {
                const tagName = match[1];
                if (!voidElements.has(tagName.toLowerCase())) {
                    await performEdit(editor, position, `</${tagName}>`, true);
                }
            }
        }
    });

    async function performEdit(editor: vscode.TextEditor, position: vscode.Position, text: string, moveCursor: boolean) {
        if (isBusy) return;
        isBusy = true;

        try {
            const success = await editor.edit(editBuilder => {
                editBuilder.insert(position, text);
            }, { undoStopBefore: false, undoStopAfter: true });

            if (success && moveCursor) {
                editor.selection = new vscode.Selection(position, position);
            }
        } catch (err) {
            console.error(err);
        } finally {
            isBusy = false;
        }
    }

    context.subscriptions.push(listener);
}
// End Auto Close

// Format
function calculateHtmlEdits(
    document: vscode.TextDocument,
    options: vscode.FormattingOptions,
    extractor: VMacroExtractor,
    htmlService: any
): vscode.TextEdit[] {
    const text = document.getText();
    const edits: vscode.TextEdit[] = [];

    const htmlIndentUnit = options.insertSpaces
        ? ' '.repeat(Math.max(2, Math.floor(options.tabSize / 2)))
        : '\t';

    const macros = extractor.extractAll(text);

    for (let i = macros.length - 1; i >= 0; i--) {
        const macro = macros[i];
        const { virtualText, contentStart, closeCharIndex } = macro.info;

        const content = virtualText.substring(contentStart);

        const virtualDoc = TextDocument.create(
            'virtual://fmt.html',
            'html',
            1,
            content
        );

        const htmlEdits = htmlService.format(virtualDoc, undefined, {
            tabSize: Math.max(2, Math.floor(options.tabSize / 2)),  
            insertSpaces: options.insertSpaces,                     
            wrapLineLength: 0,                                     
            wrapAttributes: 'auto',                                 
            preserveNewLines: true,                                
            indentScripts: 'keep',                                 
            indentInnerHtml: false                                  
        });

        let formatted = content;
        for (let j = htmlEdits.length - 1; j >= 0; j--) {
            const e = htmlEdits[j];
            const start = virtualDoc.offsetAt(e.range.start);
            const end = virtualDoc.offsetAt(e.range.end);
            formatted = formatted.substring(0, start) + e.newText + formatted.substring(end);
        }

        const trimmedContent = formatted.trimEnd();

        const startPos = document.positionAt(contentStart - 1);     
        const lineText = document.lineAt(startPos.line).text;       
        const baseIndent = (lineText.match(/^\s*/) || [''])[0];     

        const macroIndent = baseIndent + htmlIndentUnit;

        const indentedHtml = trimmedContent
            .split('\n')
            .map(line => line.trim() ? macroIndent + line : '')
            .join('\n');

        const finalBlock = `\n${indentedHtml}\n${baseIndent}`;

        const originalContent = text.substring(contentStart, closeCharIndex);

        if (finalBlock !== '\n' + originalContent) {
            edits.push(
                vscode.TextEdit.replace(
                    new vscode.Range(
                        document.positionAt(contentStart),
                        document.positionAt(closeCharIndex)
                    ),
                    finalBlock
                )
            );
        }
    }

    return edits;
}
// End Format