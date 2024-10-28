import * as Parser from 'web-tree-sitter';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DocumentStore } from '../document-store';
import { Utils, URI } from 'vscode-uri';
import { TolkSdkMapping } from "../tolk-sdk-mapping";
import { TolkCompilerSDK } from "../config-scheme";
import { Trees } from '../trees'
import { SymbolIndex } from './symbol-index'

function resolveImport(documentUri: string, path: string, tolkSdk: TolkCompilerSDK | null): string | null {
  if (path.startsWith('@stdlib/')) {
    let stdlibFileName = path.substring(7)
    if (!stdlibFileName.endsWith('.tolk')) {	// @stdlib/tvm-dicts == @stdlib/tvm-dicts.tolk
      stdlibFileName += '.tolk'
    }
    return tolkSdk ? URI.file(tolkSdk.stdlibFolder + stdlibFileName).toString() : null
  }

  return Utils.resolvePath(Utils.dirname(URI.parse(documentUri)), path).toString()
}

type DocumentImports = {
  importedUris: string[],
  notFoundImports: { node: Parser.SyntaxNode, path: string }[]
}

export class DepsIndex {
  private _cachedImports = new Map<string, DocumentImports>();

  constructor(
    private readonly _documents: DocumentStore,
    private readonly _trees: Trees,
    private readonly _symbolIndex: SymbolIndex,
    private readonly _tolkSdkMapping: TolkSdkMapping
  ) {
  }

  invalidateCache(documentUri: string) {
    this._cachedImports.delete(documentUri)
  }

  private async calculateImportsAndSaveCache(document: TextDocument, tree: Parser.Tree) {
    // knowing tolkSdk is mandatory to resolve @stdlib imports
    let tolkSdk = await this._tolkSdkMapping.getOrRequestTolkSdkForFile(document.uri)
    let importedUris: { [uri in string]: true } = {}
    let notFoundImports: DocumentImports['notFoundImports'] = []

    // implicitly add common.tolk to every analyzed file (so that all std methods are known)
    if (tolkSdk) {
      const stdlibFileName = resolveImport(document.uri, '@stdlib/common.tolk', tolkSdk)!
      importedUris[stdlibFileName] = true	// object is used to avoid duplicates
    }

    // loop over `import "path"`
    for (let node of tree.rootNode.children.filter(n => n.type === 'import_directive')) {
      const pathNode = node.childForFieldName('path')
      if (pathNode == null || pathNode.text.length < 2) {
        continue		// broken syntax
      }
      const pathNodeText = pathNode.text.substring(1, pathNode.text.length - 1)

      let importUri = resolveImport(document.uri, pathNodeText, tolkSdk)
      let entry = importUri ? await this._documents.retrieve(importUri) : null
      if (entry) {
        importedUris[importUri!] = true
        this._symbolIndex.addFile(importUri!)
      } else {
        notFoundImports.push({ node: pathNode, path: pathNodeText })
      }
    }

    this._cachedImports.set(document.uri, { importedUris: Object.keys(importedUris), notFoundImports });
  }

  async resolveImport(documentUri: string, pathNodeText: string): Promise<string | null> {
    let tolkSdk = await this._tolkSdkMapping.getOrRequestTolkSdkForFile(documentUri)
    let importUri = resolveImport(documentUri, pathNodeText, tolkSdk)
    let entry = importUri ? await this._documents.retrieve(importUri) : null

    return entry ? importUri : null
  }

  async getImports(document: TextDocument): Promise<DocumentImports['importedUris']> {
    if (!this._cachedImports.has(document.uri)) {
      const tree = this._trees.getParseTree(document)
      if (!tree) {
        return []
      }
      await this.calculateImportsAndSaveCache(document, tree)
    }
    return this._cachedImports.get(document.uri)!.importedUris
  }

  async getNotFoundImports(document: TextDocument): Promise<DocumentImports['notFoundImports']> {
    if (!this._cachedImports.has(document.uri)) {
      const tree = this._trees.getParseTree(document)
      if (!tree) {
        return []
      }
      await this.calculateImportsAndSaveCache(document, tree)
    }
    return this._cachedImports.get(document.uri)!.notFoundImports
  }
}
