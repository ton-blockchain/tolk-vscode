import * as lsp from 'vscode-languageserver';
import * as Parser from 'web-tree-sitter'
import { DocumentStore } from '../document-store';
import { Trees } from '../trees';
import { asLspRange, asParserPoint } from '../utils/position';
import { DepsIndex } from './deps-index';
import { SymbolIndex } from './symbol-index';
import { ILspHandler } from '../connection'
import { findLocalVariables } from './find-locals'
import { extractNameFromNode } from './lsp-document-symbols'

export class DefinitionLspHandler implements ILspHandler {
  constructor(
    private readonly _documents: DocumentStore,
    private readonly _trees: Trees,
    private readonly _symbols: SymbolIndex,
    private readonly _directives: DepsIndex
  ) {
  }

  register(connection: lsp.Connection) {
    connection.onRequest(lsp.DefinitionRequest.type, this.provideDefinitions.bind(this))
  }

  async provideDefinitions(params: lsp.DefinitionParams): Promise<lsp.Location[] | lsp.LocationLink[]> {
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
    let hoverNode = tree.rootNode.descendantForPosition(cursorPosition)
    if (hoverNode.type === 'string_literal' && hoverNode.parent?.type === 'import_directive') {
      return this.provideDefinitionForImportDirective(documentUri, hoverNode)
    }
    if (hoverNode.type === 'identifier') {
      return this.provideDefinitionForIdentifier(documentUri, hoverNode, tree.rootNode, cursorPosition)
    }
    if (hoverNode.type === 'function_name') {
      // currently, nothing to do when hovering a function declaration
      // (searching for references is not implemented)
    }
    return []
  }

  private async provideDefinitionForImportDirective(documentUri: string, pathNode: Parser.SyntaxNode): Promise<lsp.LocationLink[]> {
    let pathNodeText = pathNode.text.slice(1, -1)	// trim quotes
    let resolvedUri = await this._directives.resolveImport(documentUri, pathNodeText)
    if (!resolvedUri) {		// not found file (it's also highlighted via diagnostics)
      return []
    }

    let emptyRange: lsp.Range = { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }
    return [{
      originSelectionRange: asLspRange(pathNode),
      targetUri: resolvedUri,
      targetRange: emptyRange,
      targetSelectionRange: emptyRange
    }]
  }

  private async provideDefinitionForIdentifier(documentUri: string, hoverNode: Parser.SyntaxNode, rootNode: Parser.SyntaxNode, cursorPosition: Parser.Point): Promise<lsp.Location[]> {
    const hoveredName = extractNameFromNode(hoverNode)

    // first, maybe the user is pointing to a usage of a local variable / parameter
    const local = findLocalVariables(rootNode, cursorPosition).find(v => v.name === hoveredName)
    if (local && local.node.id === hoverNode.id) {
      // the cursor is over this variable declaration
      // don't return anything, since searching for references is not implemented
      return []
    }
    if (local) {
      return [{
        uri: documentUri,
        range: asLspRange(local.node)
      }]
    }

    // else, search for a global function / variable / constant
    const document = await this._documents.retrieve(documentUri)
    const imports = await this._directives.getImports(document!)
    const globalSymbols = await this._symbols.getDefinitions(hoveredName, [documentUri, ...imports])
    return globalSymbols.map(s => s.location)
  }
}
