import * as vscode from 'vscode';

export class RsHtmlFileExtractor {
    private parser: any;

    private uri: string = '';
    private version: number = -1;
    private result: string = "";

    constructor(parser: any) {
        this.parser = parser;
    }

    public getOrUpdate(document: vscode.TextDocument): string {
        if (this.uri === document.uri.toString() &&
            this.version === document.version) {
            return this.result;
        }

        const text = document.getText();
        const result = this.extract(text, this.file_name(document.uri.toString()));

        this.uri = document.uri.toString();
        this.version = document.version;
        this.result = result;

        return result;
    }

    public extract(text: string, name: string): string {
        const tree = this.parser.parse(text);

        const chars: string[] = text.split('').map(c => c === '\n' ? '\n' : ' ');

        const newlineInserts: number[] = [];
        let templateParamsNode: any = null;


        const visit = (node: any) => {
            const type = node.type;

            if (type === 'template_params') {
                templateParamsNode = node;
                return;
            }

            if (type === 'rust_expr_paren') {
                for (const child of node.children) {
                    if (child.type === 'open_paren') {
                        chars[child.startIndex] = '&';
                    } else if (child.type === 'close_paren') {
                        chars[child.startIndex] = ';';
                    } else if (child.type === 'rust_text') {
                        for (let i = child.startIndex; i < child.endIndex; i++) {
                            chars[i] = text[i];
                        }
                    }
                }
                return;
            }

            if (type === 'rust_expr_simple') {
                for (const child of node.children) {
                    if (child.type === 'rust_text') {
                        for (let i = child.startIndex; i < child.endIndex; i++) {
                            chars[i] = text[i];
                        }
                        chars[child.startIndex - 1] = '&';
                        if (chars[child.endIndex] !== '\n') {
                            chars[child.endIndex] = ';';
                        } else {
                            newlineInserts.push(child.endIndex);
                        }
                    }
                }
                return;
            }

            if (type === 'child_content_directive') {
                for (let i = node.startIndex; i < node.endIndex; i++) {
                    chars[i - 1] = text[i];
                }
                chars[node.endIndex - 1] = ';';
                return;
            }

            if (type === 'rust_block') {
                for (const child of node.children) {
                    if (child.type === 'rust_text') {
                        for (let i = child.startIndex; i < child.endIndex; i++) {
                            chars[i] = text[i];
                        }
                    }
                }
                return;
            }

            if (type === 'rust_text' || type === 'open_brace' || type === 'close_brace') {
                const s = node.startIndex;
                const e = node.endIndex;
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

        newlineInserts.sort((a, b) => b - a);
        for (const pos of newlineInserts) {
            chars.splice(pos, 0, ';');
        }

        if (templateParamsNode) {
            const startSymbol = templateParamsNode.children.find((c: any) => c.type === 'start_symbol');
            const openParen = templateParamsNode.children.find((c: any) => c.type === 'open_paren');
            const closeParen = templateParamsNode.children.find((c: any) => c.type === 'close_paren');

            for (let i = openParen.endIndex; i < closeParen.startIndex; i++) {
                chars[i] = text[i];
            }

            chars.splice(closeParen.startIndex, 1, ')', ' ', '{');

            chars.splice(startSymbol.startIndex, 2, ...`fn ${name}(&self,child_content: impl ::rshtml::View, `.split(''));

            chars.push('}');
        }

        tree.delete();

        return chars.join('');
    }

    private file_name(uri: string): string {
        const fileName = uri.split('/').pop()?.replace('.rs.html', '') ?? 'template';
        return fileName.replace(/([A-Z])/g, (m, l, i) => (i > 0 ? '_' : '') + l.toLowerCase());
    }
}