import { LRUMap } from './utils/lruMap';
import * as lsp from 'vscode-languageserver';
import * as Parser from 'web-tree-sitter';
import { Disposable } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DocumentStore } from './document-store';
import { createParser } from './parser';
import { asParserPoint } from './utils/position'

class Entry {
  constructor(
    public version: number,
    public tree: Parser.Tree,
    public edits: Parser.Edit[][]
  ) {
  }
}

type ParseDone = {
  tree: Parser.Tree,
  document: TextDocument
}

export class Trees {

  private readonly _cachedParserTrees = new LRUMap<string, Entry>({
    size: 200,
    dispose(entries) {
      for (let [, value] of entries) {
        value.tree.delete();
      }
    }
  });

  private readonly _listener: Disposable[] = [];
  private readonly _parser = createParser();
  private readonly _onParseDone = new lsp.Emitter<ParseDone>();
  readonly onParseDone = this._onParseDone.event;

  constructor(private readonly _documents: DocumentStore) {
    // build edits when document changes
    this._listener.push(_documents.onDidChangeContent2(event => {
      const info = this._cachedParserTrees.get(event.document.uri);
      if (info) {
        info.edits.push(event.changes.map(change => ({
          startPosition: asParserPoint(change.range.start),
          oldEndPosition: asParserPoint(change.range.end),
          newEndPosition: asParserPoint(event.document.positionAt(change.rangeOffset + change.text.length)),
          startIndex: change.rangeOffset,
          oldEndIndex: change.rangeOffset + change.rangeLength,
          newEndIndex: change.rangeOffset + change.text.length
        })));
      }
    }));
  }

  dispose(): void {
    for (let item of this._cachedParserTrees.values()) {
      item.tree.delete();
    }
    for (let item of this._listener) {
      item.dispose();
    }
  }

  // --- tree/parse

  getParseTree(documentOrUri: string): Promise<Parser.Tree | undefined>;
  getParseTree(documentOrUri: TextDocument): Parser.Tree | undefined;
  getParseTree(documentOrUri: TextDocument | string): Promise<Parser.Tree | undefined> | Parser.Tree | undefined {
    if (typeof documentOrUri === 'string') {
      return this._documents.retrieve(documentOrUri).then(doc => {
        return doc && this._parse(doc);
      });
    } else {
      return this._parse(documentOrUri);
    }
  }

  private _parse(document: TextDocument): Parser.Tree | undefined {
    let info = this._cachedParserTrees.get(document.uri);
    if (info?.version === document.version) {
      return info.tree;
    }

    try {
      const version = document.version;
      const text = document.getText();

      if (!info) {
        // never seen before, parse fresh
        const tree = this._parser.parse(text);
        info = new Entry(version, tree, []);
        this._cachedParserTrees.set(document.uri, info);

      } else {
        // existing entry, apply deltas and parse incremental
        const oldTree = info.tree;
        const deltas = info.edits.flat();
        deltas.forEach(delta => oldTree.edit(delta));
        info.edits.length = 0;

        info.tree = this._parser.parse(text, oldTree);
        info.version = version;
        oldTree.delete();
      }

      this._onParseDone.fire({
        document: document,
        tree: info.tree
      })

      return info.tree;

    } catch (e) {
      this._cachedParserTrees.delete(document.uri);
      return undefined;
    }
  }
}
