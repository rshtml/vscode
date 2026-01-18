import * as vscode from 'vscode';
import { TextDocument } from 'vscode-languageserver-textdocument';

export interface VMacroData {
    doc: TextDocument;
    info: {
        virtualText: string;
        contentStart: number;
        closeCharIndex: number;
        rustBlocks: { start: number, end: number }[];
    };
}

export class VMacroExtractor {
    private parser: any;

    private uri: string = '';
    private version: number = -1;
    private offset: number = -1;
    private result: any = null;

    constructor(parser: any) {
        this.parser = parser;
    }

    public getOrUpdate(document: vscode.TextDocument, offset: number): VMacroData | null {
        if (this.uri === document.uri.toString() &&
            this.version === document.version &&
            this.offset === offset) {

            if (!this.result) return null;

            const virtualDoc = TextDocument.create(
                document.uri.toString(),
                'html',
                1,
                this.result.virtualText
            );
            return { doc: virtualDoc, info: this.result };
        }

        const text = document.getText();
        const currentResult = this.extract(text, offset);

        this.uri = document.uri.toString();
        this.version = document.version;
        this.offset = offset;
        this.result = currentResult;

        if (!currentResult) return null;

        const virtualDoc = TextDocument.create(
            document.uri.toString(),
            'html',
            1,
            currentResult.virtualText,
        );

        return {
            doc: virtualDoc,
            info: currentResult
        };
    }

    public extract(text: string, offset: number) {
        const tree = this.parser.parse(text);

        // 1. Find the 'v' macro where the cursor is located.
        let currentNode = tree.rootNode.descendantForIndex(offset);
        let macroNode = null;

        while (currentNode) {
            if (currentNode.type === 'macro_invocation') {
                if (currentNode.childForFieldName('macro')?.text === 'v') {
                    macroNode = currentNode;
                    break;
                }
            }
            currentNode = currentNode.parent;
        }

        if (!macroNode) { tree.delete(); return null; }


        // 2. Find macro main body
        const mainTokenTree = macroNode.children.find((c: any) => c.type === 'token_tree');
        if (!mainTokenTree || offset <= mainTokenTree.startIndex || offset >= mainTokenTree.endIndex) {
            tree.delete(); return null;
        }

        const contentStart = mainTokenTree.startIndex + 1;
        const closeCharIndex = mainTokenTree.endIndex - 1;

        // 3. Masking
        const rawContent = text.substring(contentStart, closeCharIndex);
        let maskedChars = rawContent.split('');

        const rustBlocks: { start: number, end: number }[] = [];

        for (const child of mainTokenTree.children) {
            if (child.type === 'token_tree' && text[child.startIndex] === "{") {

                const localStart = child.startIndex - contentStart;
                const localEnd = child.endIndex - contentStart;

                if (localStart < 0 || localEnd > maskedChars.length) continue;

                rustBlocks.push({ start: localStart, end: localEnd });

                for (let i = localStart; i < localEnd; i++) {
                    if (maskedChars[i] !== '\n') {
                        maskedChars[i] = ' ';
                    }
                }
            }
        }

        const maskedContent = maskedChars.join('');
        tree.delete();

        // 4. Prefix
        const prefixRaw = text.substring(0, contentStart);
        let prefix = '';
        for (let i = 0; i < prefixRaw.length; i++) {
            prefix += (prefixRaw[i] === '\n') ? '\n' : ' ';
        }

        return { virtualText: prefix + maskedContent, contentStart, closeCharIndex, rustBlocks };
    }

    public isInRustBlock(data: VMacroData, offset: number): boolean {
        const offsetInMacro = offset - data.info.contentStart;
        return data.info.rustBlocks.some(block =>
            offsetInMacro >= block.start && offsetInMacro <= block.end
        );
    }

    public clear() {
        this.uri = '';
        this.result = null;
    }
}