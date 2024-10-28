import * as lsp from 'vscode-languageserver';
import * as Parser from 'web-tree-sitter';
import { config } from '../server-config';
import { connection, ILspHandler } from '../connection';
import { DocumentStore } from '../document-store';
import { Trees } from '../trees';
import { asParserPoint } from '../utils/position';
import { DepsIndex } from './deps-index';
import { SymbolIndex } from './symbol-index';
import { stringifyType } from './type-inference';
import { RequestFromServer } from "../shared-msgtypes";
import { findLocalVariables } from './find-locals'

export class CompletionLspHandler implements ILspHandler {
  constructor(
    private readonly _documents: DocumentStore,
    private readonly _trees: Trees,
    private readonly _symbols: SymbolIndex,
    private readonly _deps: DepsIndex
  ) {
  }

  register(connection: lsp.Connection) {
    connection.onRequest(lsp.CompletionRequest.type, this.provideCompletionItems.bind(this));
  }

  async provideCompletionInImportDirective(params: lsp.CompletionParams, node: Parser.SyntaxNode): Promise<lsp.CompletionItem[]> {
    let matching: string[] = await connection.sendRequest(RequestFromServer.completionMatchingFiles, {
      pathPrefix: node.text.slice(1).slice(0, -1),
      uri: params.textDocument.uri
    })
    let result: lsp.CompletionItem[] = []
    for (let match of matching) {
      let item = lsp.CompletionItem.create(match)
      item.kind = lsp.CompletionItemKind.File
      result.push(item)
    }
    return result;
  }

  async provideCompletionItems(params: lsp.CompletionParams): Promise<lsp.CompletionItem[]> {
    const documentUri = params.textDocument.uri
    const document = await this._documents.retrieve(documentUri)
    if (!document) {
      return []
    }
    const tree = this._trees.getParseTree(document)
    if (!tree) {
      return []
    }

    let cursorPosition = asParserPoint(params.position)
    let cursorNode = tree.rootNode.descendantForPosition(cursorPosition)
    if (cursorNode.type === 'string_literal' && cursorNode.parent && cursorNode.parent.type === 'import_directive') {
      return this.provideCompletionInImportDirective(params, cursorNode)
    }

    let isFunctionApplication = params.context?.triggerCharacter === '.'
    let result: lsp.CompletionItem[] = []

    if (!isFunctionApplication) {
      let locals = findLocalVariables(tree.rootNode, cursorPosition)
      result.push(...locals.map(v => {
        let item = lsp.CompletionItem.create(v.name)
        item.kind = lsp.CompletionItemKind.Variable
        item.detail = stringifyType(v.type)
        return item
      }))
    }

    let imports = await this._deps.getImports(document);
    let globalSymbols = await this._symbols.getGlobalSymbols([documentUri, ...imports])

    for (let symbol of globalSymbols) {
      let name = symbol.name
      let kind = symbol.lspSymbol.kind
      let item = lsp.CompletionItem.create(name)

      if (kind === lsp.SymbolKind.Function) {
        item.kind = lsp.CompletionItemKind.Function
        if (config.autocompleteAddParentheses && symbol.type.kind === 'function') {
          let alreadyHasOpPar = cursorNode.type === '(' || cursorNode.nextSibling?.text?.startsWith('(') || cursorNode.nextSibling?.text === ')'
          if (!alreadyHasOpPar) {
            let fArgs = [...symbol.type.parameters]
            if (isFunctionApplication) {
              let firstArg = fArgs.shift()
              if (!firstArg) {
                continue;
              }
            }
            item.insertText = `${name}(${fArgs.map((a, i) => `$\{${i + 1}:${a.name}}`).join(', ')})`
            item.insertTextFormat = lsp.InsertTextFormat.Snippet
          }
        }
      } else if (kind === lsp.SymbolKind.Variable && !isFunctionApplication) {
        item.kind = lsp.CompletionItemKind.Variable
      } else if (kind === lsp.SymbolKind.Constant && !isFunctionApplication) {
        item.kind = lsp.CompletionItemKind.Constant
      } else {
        continue;
      }
      item.detail = stringifyType(symbol.type)
      // item.documentation = stringifyType(symbol.tolkType)
      result.push(item)
    }

    return result;
  }
}
