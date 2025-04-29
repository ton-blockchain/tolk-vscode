import * as lsp from 'vscode-languageserver';
import * as Parser from 'web-tree-sitter'
import { DocumentStore } from '../document-store';
import { Trees } from '../trees';
import { asLspRange, asParserPoint } from '../utils/position';
import { DepsIndex } from './deps-index';
import { SymbolIndex } from './symbol-index';
import { ILspHandler } from '../connection'
import { findLocalVariables, TolkLocalVariable } from './find-locals'
import { stringifyType } from './type-inference'
import { extractNameFromNode, isNodeObjectField, TolkDocumentSymbol } from './lsp-document-symbols'

export class HoverLspHandler implements ILspHandler {
  constructor(
    private readonly _documents: DocumentStore,
    private readonly _trees: Trees,
    private readonly _symbols: SymbolIndex,
    private readonly _directives: DepsIndex
  ) {
  }

  register(connection: lsp.Connection) {
    connection.onRequest(lsp.HoverRequest.type, this.provideHover.bind(this))
  }

  async provideHover(params: lsp.HoverParams): Promise<lsp.Hover | null> {
    const documentUri = params.textDocument.uri
    const document = await this._documents.retrieve(documentUri)
    if (!document) {
      return null
    }
    const tree = this._trees.getParseTree(document)
    if (!tree) {
      return null
    }

    let cursorPosition = asParserPoint(params.position)
    let hoverNode = tree.rootNode.descendantForPosition(cursorPosition)
    if (hoverNode.type === 'identifier') {
      return this.provideHoverForIdentifier(documentUri, hoverNode, tree.rootNode, cursorPosition)
    }
    if (hoverNode.type === 'type_identifier') {
      return this.provideHoverForCustomType(documentUri, hoverNode, tree.rootNode, cursorPosition)
    }
    return null
  }

  private async provideHoverForIdentifier(documentUri: string, hoverNode: Parser.SyntaxNode, rootNode: Parser.SyntaxNode, cursorPosition: Parser.Point): Promise<lsp.Hover | null> {
    if (isNodeObjectField(hoverNode)) {
      return null   // don't show anything for fields now
    }

    const hoveredName = extractNameFromNode(hoverNode)

    // first, maybe the user is hovering a local variable / parameter
    const local = findLocalVariables(rootNode, cursorPosition).find(v => v.name === hoveredName)
    if (local) {
      return {
        range: asLspRange(hoverNode),
        contents: {
          kind: 'plaintext',
          value: this.stringifyLocalVariable(local)
        }
      }
    }

    // else, search for a global function / variable / constant
    const document = await this._documents.retrieve(documentUri)
    const imports = await this._directives.getImports(document!)
    const globalSymbols = await this._symbols.getGlobalSymbols([documentUri, ...imports])
    const symbols = globalSymbols.filter(s => s.name === hoveredName)
    if (!symbols.length) {
      return null;
    }

    return {
      range: asLspRange(hoverNode),
      contents: {
        kind: 'plaintext',
        value: symbols.length > 1 ? `${symbols.length} symbols` : this.stringifyGlobalSymbol(symbols[0])
      }
    }
  }

  private async provideHoverForCustomType(documentUri: string, hoverNode: Parser.SyntaxNode, rootNode: Parser.SyntaxNode, cursorPosition: Parser.Point): Promise<lsp.Hover | null> {
    const hoveredName = extractNameFromNode(hoverNode)

    const document = await this._documents.retrieve(documentUri)
    const imports = await this._directives.getImports(document!)
    const globalSymbols = await this._symbols.getGlobalSymbols([documentUri, ...imports])
    const symbols = globalSymbols.filter(s => s.name === hoveredName && (s.lspSymbol.kind === lsp.SymbolKind.Struct || s.lspSymbol.kind === lsp.SymbolKind.Interface))
    if (!symbols.length) {
      return null;
    }

    return {
      range: asLspRange(hoverNode),
      contents: {
        kind: 'plaintext',
        value: symbols.length > 1 ? `${symbols.length} symbols` : this.stringifyGlobalSymbol(symbols[0])
      }
    }
  }

  private stringifyLocalVariable(symbol: TolkLocalVariable): string {
    const strVal = symbol.kind === 'parameter' ? 'param ' : 'var '
    if (symbol.type.kind === 'unknown') {
      return strVal + symbol.name
    }
    return strVal + symbol.name + ': ' + stringifyType(symbol.type)
  }

  private stringifyGlobalSymbol(symbol: TolkDocumentSymbol): string {
    switch (symbol.lspSymbol.kind) {
      case lsp.SymbolKind.Constant:
        return 'const ' + symbol.name + ' = ' + symbol.lspSymbol.detail
      case lsp.SymbolKind.Variable:
        return 'global ' + symbol.name + ': ' + stringifyType(symbol.type)
      case lsp.SymbolKind.Function:
        let strFun = symbol.type.kind === 'function' && symbol.type.isGetMethod ? 'get ' : 'fun '
        let strRecv = symbol.type.kind === 'function' && symbol.type.receiver ? stringifyType(symbol.type.receiver) + "." : ""
        let strArgs = symbol.type.kind === 'function' && symbol.type.parameters.map(a => a.name).join(', ')
        return strFun + strRecv + symbol.name + '(' + strArgs + '): ' + stringifyType(symbol.type)
      case lsp.SymbolKind.Interface:
        return 'type ' + symbol.name
      case lsp.SymbolKind.Struct:
        return 'struct ' + symbol.name
      default:
        return symbol.name
    }
  }
}
