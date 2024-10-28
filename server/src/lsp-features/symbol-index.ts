import * as lsp from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DocumentStore } from '../document-store';
import { Trees } from '../trees';
import { batchExecute } from '../utils/batchExecute';
import { getDocumentSymbols, TolkDocumentSymbol } from './lsp-document-symbols';

class Index {
  private symbolsPerDocument = new Map<lsp.DocumentUri, TolkDocumentSymbol[]>();

  getSymbolsInDocument(documentUri: string): TolkDocumentSymbol[] | undefined {
    return this.symbolsPerDocument.get(documentUri)
  }

  [Symbol.iterator](): IterableIterator<[string, TolkDocumentSymbol[]]> {
    return this.symbolsPerDocument[Symbol.iterator]()
  }

  update(documentUri: lsp.DocumentUri, symbolsInDocument: TolkDocumentSymbol[]) {
    this.symbolsPerDocument.set(documentUri, symbolsInDocument)
  }

  delete(documentUri: lsp.DocumentUri) {
    this.symbolsPerDocument.delete(documentUri)
  }
}

export class SymbolIndex {
  readonly index = new Index();

  private readonly waitQueue = new Set<lsp.DocumentUri>()

  constructor(
    private readonly _trees: Trees,
    private readonly _documents: DocumentStore
  ) {
  }

  addFile(documentUri: string): void {
    this.waitQueue.add(documentUri)
  }

  removeFile(documentUri: string): void {
    this.waitQueue.delete(documentUri)
    this.index.delete(documentUri)
  }

  private _currentUpdate: Promise<void> | undefined

  private async _update(): Promise<void> {
    await this._currentUpdate
    const queuedDocumentUris = Array.from(this.waitQueue.values())
    this.waitQueue.clear()
    this._currentUpdate = this._doUpdate(queuedDocumentUris)
    return this._currentUpdate
  }

  private async _doUpdate(documentUris: string[]): Promise<void> {
    if (documentUris.length !== 0) {
      // schedule a new task to update the cache for changed uris
      const tasks = documentUris.map(documentUri => this._createIndexTask(documentUri))
      await batchExecute(tasks, 50)
    }
  }

  private _createIndexTask(documentUri: string): () => Promise<void> {
    return async () => {
      try {
        const document = await this._documents.retrieve(documentUri)
        if (document) {
          this._doIndex(document)
        } else {
          this.index.delete(documentUri)
        }
      } catch (e) {
        console.log(`FAILED to index ${documentUri}`, e)
      }
    }
  }

  private _doIndex(document: TextDocument) {
    // console.log(`index ${document.uri}`)

    const tree = this._trees.getParseTree(document)
    const documentSymbols = tree ? getDocumentSymbols(tree) : []

    this.index.update(document.uri, documentSymbols)
  }

  async initFiles(uris: string[]) {
    for (let documentUri of uris) {
      this.addFile(documentUri)
    }
    await this._update()
  }

  async getGlobalSymbols(lookupInDocumentsUris: string[]): Promise<TolkDocumentSymbol[]> {
    await this._update()

    let result: TolkDocumentSymbol[] = []
    for (let documentUri of lookupInDocumentsUris) {
      let symbols = this.index.getSymbolsInDocument(documentUri)
      if (symbols) {		// document doesn't exist in index, or there was an error indexing it
        result.push(...symbols)
      }
    }
    return result
  }

  async getDefinitions(identifier: string, lookupInDocumentsUris: string[]): Promise<lsp.SymbolInformation[]> {
    await this._update()

    let result: lsp.SymbolInformation[] = [];
    for (let documentUri of lookupInDocumentsUris) {
      let symbols = this.index.getSymbolsInDocument(documentUri)
      if (!symbols) {		// document doesn't exist in index, or there was an error indexing it
        continue
      }

      for (let symbol of symbols) {
        if (symbol.name === identifier) {
          result.push(lsp.SymbolInformation.create(identifier, symbol.lspSymbol.kind, symbol.lspSymbol.selectionRange, documentUri))
        }
      }
    }

    return result;
  }
}
