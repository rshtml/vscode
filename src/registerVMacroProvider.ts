import * as vscode from 'vscode';
import { getLanguageService } from 'vscode-html-languageservice';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { VMacroExtractor } from './vMacroExtractor';

export function registerVMacroProvider(context: vscode.ExtensionContext, parser: any) {

    const htmlService = getLanguageService();
    const extractor = new VMacroExtractor(parser);

    const completionProvider = vscode.languages.registerCompletionItemProvider(
        'rust',
        {
            async provideCompletionItems(document, position, _token, _context) {
                const offset = document.offsetAt(position);

                const data = extractor.getOrUpdate(document, offset);
                if (!data) return null;

                const htmlDoc = htmlService.parseHTMLDocument(data.doc);
                const htmlCompletions = htmlService.doComplete(data.doc, position, htmlDoc);

                // Convert LSP Types to VS Code Types
                return htmlCompletions.items.map(item => {
                    const newItem = new vscode.CompletionItem(item.label);

                    if (item.kind) {
                        newItem.kind = item.kind - 1;
                    }

                    if (item.documentation) {
                        const doc = typeof item.documentation === 'string'
                            ? item.documentation
                            : item.documentation.value;
                        newItem.documentation = new vscode.MarkdownString(doc);
                    }

                    newItem.detail = item.detail;

                    const edit = item.textEdit as any;

                    if (edit) {
                        const newText = edit.newText;

                        if (item.insertTextFormat === 2) {
                            newItem.insertText = new vscode.SnippetString(newText);
                        } else {
                            newItem.insertText = newText;
                        }

                        if (edit.range) {
                            newItem.range = new vscode.Range(
                                edit.range.start.line, edit.range.start.character,
                                edit.range.end.line, edit.range.end.character
                            );
                        } else if (edit.replace) {
                            newItem.range = new vscode.Range(
                                edit.replace.start.line, edit.replace.start.character,
                                edit.replace.end.line, edit.replace.end.character
                            );
                        }
                    } else {
                        if (item.insertTextFormat === 2 && typeof item.insertText === 'string') {
                            newItem.insertText = new vscode.SnippetString(item.insertText);
                        } else {
                            newItem.insertText = item.insertText;
                        }
                    }

                    return newItem;
                });
            }
        },
        '<', ' ', ':', '"', '=', '/' // Triggers
    );

    const hoverProvider = vscode.languages.registerHoverProvider('rust', {
        async provideHover(document, position, token) {
            const offset = document.offsetAt(position);

            const data = extractor.getOrUpdate(document, offset);
            if (!data) return null;

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

            return new vscode.Hover(markdownContent);
        }
    });

    const autoCloseListener = vscode.workspace.onDidChangeTextDocument(event => {
        if (event.document.languageId !== 'rust' || event.contentChanges.length === 0) return;

        const change = event.contentChanges[0];

        if (change.text.length !== 1) return;

        if (change.text !== '>' && change.text !== '/') return;

        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document !== event.document) return;

        const position = change.range.end.translate(0, 1);
        const offset = event.document.offsetAt(position);

        const data = extractor.getOrUpdate(event.document, offset);
        if (!data) return;

        const text = event.document.getText();
        const beforeCursor = text.substring(0, offset);

        if (change.text === '/') {
            if (text.charAt(offset) === '>') return;

            const lastOpenTag = beforeCursor.lastIndexOf('<');
            if (lastOpenTag > -1 && lastOpenTag > beforeCursor.lastIndexOf('>')) {
                editor.edit(editBuilder => {
                    editBuilder.insert(position, '>');
                });
                return;
            }
        }

        if (change.text === '>') {
            if (beforeCursor.endsWith('/>')) return;

            const tagMatch = beforeCursor.match(/<([a-zA-Z][a-zA-Z0-9:-]*)(?:\s+[^>]*)?>$/);
            if (!tagMatch) return;

            const tagName = tagMatch[1];
            const voidElements = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'];

            if (voidElements.includes(tagName.toLowerCase())) return;

            editor.edit(editBuilder => {
                editBuilder.insert(position, `</${tagName}>`);
            }).then(() => {
                editor.selection = new vscode.Selection(position, position);
            });
        }
    });

    /// FORMATTING

    const calculateHtmlEdits = (document: vscode.TextDocument, options: vscode.FormattingOptions): vscode.TextEdit[] => {
        const text = document.getText();
        const edits: vscode.TextEdit[] = [];
        const macroRegex = /v!\s*\{/g;
        let match;

        // Girinti birimi (Tab mı Space mi?)
        const indentUnit = options.insertSpaces ? ' '.repeat(options.tabSize) : '\t';

        while ((match = macroRegex.exec(text)) !== null) {
            // v! { kısmının bittiği yer
            const offsetInside = match.index + match[0].length;

            // --- 1. Sizin Fonksiyonunuzu Kullanıyoruz ---
            const result = extractor.extract(text, offsetInside);
            if (!result) continue;

            // Regex'i makronun sonuna taşı
            macroRegex.lastIndex = result.closeCharIndex;

            // --- 2. İçeriği Al (Ham Hali) ---
            // extractVMacroContent fonksiyonunuzun döndüğü 'virtualText' maskelenmiş (boşluklu) haldir.
            // Formatlayıcıya vermek için maskelenmemiş, orijinal HTML metnine ihtiyacımız var.
            // Neyse ki 'contentStart' ve 'closeCharIndex' koordinatlarını bize veriyor.
            const rawContent = text.substring(result.contentStart, result.closeCharIndex);

            // --- 3. Sanal Doküman ve Formatlama ---
            const virtualDoc = TextDocument.create('virtual://fmt.html', 'html', 1, rawContent);

            const htmlEdits = htmlService.format(virtualDoc, undefined, {
                tabSize: Math.max(2, Math.floor(options.tabSize / 2)), //options.tabSize,
                insertSpaces: options.insertSpaces,
                indentScripts: 'keep',
                indentInnerHtml: false, // Manuel girinti yapacağız
                preserveNewLines: true,
                wrapLineLength: 0
            });

            // --- 4. Formatlanmış HTML'i Oluştur ---
            // HTML servisinden gelen parça parça editleri, rawContent üzerine uygulayıp
            // elimizde "temiz, formatlanmış ama girintisiz" bir HTML metni elde ediyoruz.
            let formattedHtml = rawContent;
            // Editleri sondan başa uygula
            for (let i = htmlEdits.length - 1; i >= 0; i--) {
                const e = htmlEdits[i];
                const startOff = virtualDoc.offsetAt(e.range.start);
                const endOff = virtualDoc.offsetAt(e.range.end);
                formattedHtml = formattedHtml.substring(0, startOff) + e.newText + formattedHtml.substring(endOff);
            }

            formattedHtml = formattedHtml.trim(); // Kenar boşluklarını temizle

            // --- 5. Girintileme ve Yerleştirme (Indentation) ---

            // 'v!' makrosunun olduğu satırın başındaki boşluğu (base indent) bul
            const startPos = document.positionAt(match.index);
            const lineText = document.lineAt(startPos.line).text;
            const baseIndentMatch = lineText.match(/^\s*/);
            const baseIndent = baseIndentMatch ? baseIndentMatch[0] : '';

            // İçerik, baseIndent + 1 seviye içeride olmalı
            const targetIndent = baseIndent + indentUnit;

            const indentedHtml = formattedHtml.split('\n').map(line => {
                if (line.trim().length === 0) return '';
                return targetIndent + line;
            }).join('\n');

            // --- 6. Nihai Bloğu Yerleştir ---
            // \n
            // {GİRİNTİLİ_HTML}
            // \n
            // {BASE_INDENT}
            const finalBlock = `\n${indentedHtml}\n${baseIndent}`;

            // Tek bir edit ile tüm içeriği değiştir
            edits.push(new vscode.TextEdit(
                new vscode.Range(
                    document.positionAt(result.contentStart),
                    document.positionAt(result.closeCharIndex)
                ),
                finalBlock
            ));
        }
        return edits;
    };

    // 1. KOMUT (Sağ Tık ve Kısayol İçin)
    const formatCommand = vscode.commands.registerCommand('rshtml.format', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'rust') return;

        const options = editor.options as vscode.FormattingOptions;
        const edits = calculateHtmlEdits(editor.document, options);

        if (edits.length > 0) {
            await editor.edit(editBuilder => {
                // Tersten uygula
                for (let i = edits.length - 1; i >= 0; i--) {
                    const e = edits[i];
                    editBuilder.replace(e.range, e.newText);
                }
            });
        }

        // for rust analyzer
        await vscode.commands.executeCommand('editor.action.formatDocument');
    });

    // 2. KAYDETME OLAYI (Format On Save İçin)
    const saveListener = vscode.workspace.onWillSaveTextDocument(event => {
        const document = event.document;
        if (document.languageId !== 'rust') return;

        // Kullanıcı ayarlarına bak: "editor.formatOnSave" açık mı?
        const config = vscode.workspace.getConfiguration('editor', document.uri);
        if (!config.get('formatOnSave')) return;

        // Ayar açıksa, kaydetme işlemine bizim editleri ekle
        event.waitUntil(Promise.resolve(calculateHtmlEdits(document, {
            tabSize: 4, // Save anında editor options erişilemeyebilir, varsayılanlar
            insertSpaces: true
        } as vscode.FormattingOptions)));
    });
    /// END FORMATTING

    context.subscriptions.push(completionProvider, hoverProvider, /*autoCloseCommand,*/ autoCloseListener, formatCommand, saveListener);
}