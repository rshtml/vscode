import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// VS Code'un anladığı standart token tipleri
const tokenTypes = [
    'class', 'function', 'variable', 'keyword', 'string', 'number',
    'operator', 'property', 'type', 'macro', 'comment', 'punctuation'
];
const tokenModifiers = ['declaration', 'documentation'];

// Legend'ı dışa aktarıyoruz çünkü register ederken VS Code bunu isteyecek
export const semanticLegend = new vscode.SemanticTokensLegend(tokenTypes, tokenModifiers);

// Tree-sitter'daki @keyword, @function gibi isimleri VS Code indexlerine çevir
function getTokenTypeIndex(captureName: string): number {
    if (captureName.startsWith('keyword')) return tokenTypes.indexOf('keyword');
    if (captureName.startsWith('function') || captureName.startsWith('method')) return tokenTypes.indexOf('function');
    if (captureName.startsWith('variable')) return tokenTypes.indexOf('variable');
    if (captureName.startsWith('string')) return tokenTypes.indexOf('string');
    if (captureName.startsWith('number')) return tokenTypes.indexOf('number');
    if (captureName.startsWith('operator')) return tokenTypes.indexOf('operator');
    if (captureName.startsWith('property')) return tokenTypes.indexOf('property');
    if (captureName.startsWith('type') || captureName.startsWith('primitive')) return tokenTypes.indexOf('type');
    if (captureName.startsWith('comment')) return tokenTypes.indexOf('comment');
    if (captureName.startsWith('punctuation')) return tokenTypes.indexOf('punctuation');
    return -1;
}

export class RsHtmlSemanticTokensProvider implements vscode.DocumentSemanticTokensProvider {
    private parser: any;
    private language: any;
    private query: any;

    constructor(context: vscode.ExtensionContext, parser: any, language: any) {
        this.parser = parser;
        this.language = language;

        console.log('LANGUAGE:', language);
        console.log('PARSER language:', parser.language);

        const scmPath = path.join(context.extensionPath, 'out', 'rshtml', 'highlights.scm');
        const scmString = fs.readFileSync(scmPath, 'utf8');

        const lang = parser.language;
        console.log('Using language for query:', lang);
        this.query = lang.query(scmString);
    }

    provideDocumentSemanticTokens(document: vscode.TextDocument): vscode.ProviderResult<vscode.SemanticTokens> {
        // Dökümanı parse et
        const tree = this.parser.parse(document.getText());

        // Query'yi çalıştır
        const captures = this.query.captures(tree.rootNode);

        // VS Code'a vereceğimiz token inşa edicisi
        const builder = new vscode.SemanticTokensBuilder(semanticLegend);

        for (const capture of captures) {
            const { name, node } = capture;
            const typeIdx = getTokenTypeIndex(name);

            if (typeIdx !== -1) {
                // Tree-sitter nodelarını VS Code satır/sütun formatına ekle
                builder.push(
                    node.startPosition.row,
                    node.startPosition.column,
                    node.endPosition.column - node.startPosition.column,
                    typeIdx,
                    0
                );
            }
        }

        return builder.build();
    }
}