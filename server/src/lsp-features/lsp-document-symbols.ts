import * as lsp from 'vscode-languageserver';
import * as Parser from 'web-tree-sitter';
import { DocumentStore } from '../document-store';
import { Trees } from '../trees';
import { asLspRange } from '../utils/position';
import { TolkType, inferFunctionType, extractType } from './type-inference';
import { ILspHandler } from '../connection'

export class DocumentSymbolsLspHandler implements ILspHandler {
  constructor(
    private readonly _documents: DocumentStore,
    private readonly _trees: Trees
  ) {
  }

  register(connection: lsp.Connection) {
    connection.onRequest(lsp.DocumentSymbolRequest.type, this.provideDocumentSymbols.bind(this))
  }

  async provideDocumentSymbols(params: lsp.DocumentSymbolParams): Promise<lsp.DocumentSymbol[]> {
    const document = await this._documents.retrieve(params.textDocument.uri)
    if (!document) {
      return []
    }
    const tree = this._trees.getParseTree(document)
    if (!tree) {
      return []
    }
    return getDocumentSymbols(tree).map(s => s.lspSymbol)
  }
}


export function extractNameFromNode(nameNode: Parser.SyntaxNode): string {
  let name = nameNode.text
  return name[0] === '`' ? name.substring(1, name.length - 1) : name
}

export function isNodeObjectField(node: Parser.SyntaxNode): boolean {
  return node.type === 'identifier' && node.parent!.type === 'dot_access' &&
         node.id === node.parent!.childForFieldName('field')?.id &&
         node.parent!.parent!.type !== 'function_call'
}

export type TolkDocumentSymbol = {
  name: string
  type: TolkType
  lspSymbol: lsp.DocumentSymbol
}

export function getDocumentSymbols(tree: Parser.Tree): TolkDocumentSymbol[] {
  const result: TolkDocumentSymbol[] = []

  for (let node of tree.rootNode.children) {
    // all the top-level declarations have a field 'name' in grammar.js
    let nameNode = node.childForFieldName('name')
    if (!nameNode) {
      continue
    }
    let name = extractNameFromNode(nameNode)

    switch (node.type) {
      case 'global_var_declaration': {
        let typeHint = node.childForFieldName('type')
        result.push({
          name: name,
          type: extractType(typeHint),
          lspSymbol: lsp.DocumentSymbol.create(name, typeHint?.text, lsp.SymbolKind.Variable, asLspRange(node), asLspRange(nameNode))
        })
        break
      }
      case 'constant_declaration': {
        let typeHint = node.childForFieldName('type')
        let defVal = node.childForFieldName('value')
        result.push({
          name: name,
          type: extractType(typeHint),
          lspSymbol: lsp.DocumentSymbol.create(name, defVal?.text, lsp.SymbolKind.Constant, asLspRange(node), asLspRange(nameNode))
        })
        break
      }
      case 'function_declaration':
      case 'get_method_declaration': {
        let typeHint = node.childForFieldName('return_type')
        let lspChildren = node.childForFieldName('body')?.descendantsOfType('var_declaration_lhs')?.filter(n => n.childForFieldName('name'))?.map(varNode => {
          let nName = varNode.childForFieldName('name')!
          let typeHint = varNode.childForFieldName('type')
          return lsp.DocumentSymbol.create(nName.text, typeHint?.text, lsp.SymbolKind.Variable, asLspRange(varNode), asLspRange(nName))
        })
        result.push({
          name: name,
          type: inferFunctionType(node),
          lspSymbol: lsp.DocumentSymbol.create(name, typeHint?.text, lsp.SymbolKind.Function, asLspRange(node), asLspRange(nameNode), lspChildren ?? [])
        })
        break
      }
      case 'type_alias_declaration': {
        result.push({
          name: name,
          type: { kind: 'type_identifier', name },
          lspSymbol: lsp.DocumentSymbol.create(name, "type", lsp.SymbolKind.Interface, asLspRange(node), asLspRange(nameNode))
        })
        break
      }
      case 'struct_declaration': {
        result.push({
          name: name,
          type: { kind: 'type_identifier', name },
          lspSymbol: lsp.DocumentSymbol.create(name, "struct", lsp.SymbolKind.Struct, asLspRange(node), asLspRange(nameNode))
        })
        break
      }
      default:
      // import directives and other top-level are not declarations, they don't provide symbols
    }
  }
  return result
}
