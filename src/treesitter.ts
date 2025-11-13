import * as vscode from 'vscode';
import {Parser, Language} from 'web-tree-sitter';

const tokenTypes = ['namespace', 'class', 'enum', 'interface', 'struct', 'typeParameter', 'type', 'parameter', 'variable', 'property', 'enumMember',
    'event', 'function', 'method', 'macro', 'label', 'comment', 'string', 'keyword', 'number', 'regexp', 'operator'];
const tokenModifiers = ['declaration', 'definition', 'readonly', 'static', 'deprecated', 'abstract', 'async', 'modification', 'documentation', 'defaultLibrary'];

export const LEGEND = new vscode.SemanticTokensLegend(tokenTypes, tokenModifiers);
const RSHTML_TS_PATH = '../tree-sitter-rshtml.wasm';

export class SemanticTokensProvider implements vscode.DocumentSemanticTokensProvider {

    private readonly parser: Parser;

    private constructor(parser:Parser){
        this.parser = parser;
    }

    public static async create(context: vscode.ExtensionContext): Promise<SemanticTokensProvider> {
        await Parser.init();
        const parser = new Parser();

        const wasmPath = vscode.Uri.joinPath(context.extensionUri, RSHTML_TS_PATH).fsPath;
        const RsHtml = await Language.load(wasmPath);
        parser.setLanguage(RsHtml);
        
        return new SemanticTokensProvider(parser);
    }

    onDidChangeSemanticTokens?: vscode.Event<void> | undefined;

    provideDocumentSemanticTokens(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult<vscode.SemanticTokens> {
        const tree = this.parser.parse(document.getText());
        const builder = new vscode.SemanticTokensBuilder(LEGEND);

        return builder.build();
    }

    provideDocumentSemanticTokensEdits?(document: vscode.TextDocument, previousResultId: string, token: vscode.CancellationToken):
        vscode.ProviderResult<vscode.SemanticTokens | vscode.SemanticTokensEdits> {
        throw new Error('Method not implemented.');
    }

}