import * as vscode from 'vscode';

export class RsHtmlFileExtractor {
    private parser: any;

    private uri: string = '';
    private version: number = -1;
    private result: any = null;

    constructor(parser: any) {
        this.parser = parser;
    }

    public getOrUpdate(document: vscode.TextDocument) {
        if (this.uri === document.uri.toString() &&
            this.version === document.version) {
            return this.result;
        }

        const text = document.getText();
        const result = this.extract(text);

        this.uri = document.uri.toString();
        this.version = document.version;
        this.result = result;

        return result;
    }

    public extract(text: string) {
        const tree = this.parser.parse(text);

        const chars:string[] = text.split('').map(c => c === '\n' ? '\n' : ' ');

        const rustRegions: { start: number, end: number }[] = [];

        const visit = (node: any) => {
            const type = node.type;

            if (type === 'rust_text' || type === 'open_brace' || type === 'close_brace') {
                const s = node.startIndex;
                const e = node.endIndex;
                rustRegions.push({ start: s, end: e });
                for (let i = s; i < e; i++) {
                    chars[i] = text[i];
                }
                return;
            }

            for (const child of node.children || []) {
                visit(child);
            }
        };

        visit(tree.rootNode);
        tree.delete();

        return {
            virtualText: chars.join(''),
            rustRegions
        };
    }
}