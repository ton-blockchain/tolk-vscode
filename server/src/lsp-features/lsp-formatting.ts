import * as lsp from 'vscode-languageserver';
import * as Parser from 'web-tree-sitter';
import { DocumentStore } from '../document-store';
import { Trees } from '../trees';
import { TextDocument } from 'vscode-languageserver-textdocument'
import { asLspRange } from '../utils/position'
import { ILspHandler } from '../connection'

type LspFormatting = (node: Parser.SyntaxNode, document: TextDocument, indent: number, options: lsp.FormattingOptions) => lsp.TextEdit[];

let formatters: {
  [key: string]: LspFormatting[]
} = {}

function rule(nodeType: string, formatter: LspFormatting) {
  formatters[nodeType] ||= []
  formatters[nodeType].push(formatter)
}

const indent: LspFormatting = (node, document, indent, options: lsp.FormattingOptions) => {
  let edits: lsp.TextEdit[] = [];

  let alignedIndent = options.insertSpaces ? options.tabSize * indent : indent;
  if (node.startPosition.column === alignedIndent) {
    return [];
  }

  // ignore if something is same line
  let prevText = document.getText({
    start: {
      line: node.startPosition.row,
      character: 0
    },
    end: asLspRange(node).start
  });
  if (prevText.trim().length > 0) {
    return [];
  }

  let spaceCharacter = options.insertSpaces ? ' ' : '\t';

  // check if there are correct space characters
  if ((options.insertSpaces && prevText.includes('\t')) || (!options.insertSpaces && prevText.includes(' '))) {
    edits.push(
      lsp.TextEdit.replace(
        lsp.Range.create(
          lsp.Position.create(node.startPosition.row, 0),
          lsp.Position.create(node.startPosition.row, node.startPosition.column)
        ),
        spaceCharacter.repeat(alignedIndent)
      )
    );
    return edits;
  }

  // check if the space characters are aligned well
  if (node.startPosition.column > alignedIndent) {
    edits.push(lsp.TextEdit.del(lsp.Range.create(
      lsp.Position.create(node.startPosition.row, alignedIndent),
      lsp.Position.create(node.startPosition.row, node.startPosition.column)
    )));
  } else {
    edits.push(lsp.TextEdit.insert(
      lsp.Position.create(node.startPosition.row, 0),
      spaceCharacter.repeat(alignedIndent - node.startPosition.column)
    ));
  }
  return edits;
}

const ifParentNot = (types: string[], formatter: LspFormatting) => (node: Parser.SyntaxNode, document: TextDocument, indent: number, options: lsp.FormattingOptions) => {
  if (types.includes(node.parent!.type)) {
    return [];
  }
  return formatter(node, document, indent, options);
}

rule('function_declaration', indent);
rule('get_method_declaration', indent);
rule('comment', indent);
rule('statement', indent);
rule('global_var_declaration', indent);
rule('constant_declaration', indent);
rule('expression', ifParentNot(['expression_statement'], indent));
rule(')', indent);
rule('(', indent);
rule('{', indent);
rule('}', indent);
rule('[', indent);
rule(']', indent);


export function formatNode(node: Parser.SyntaxNode, document: TextDocument, indent: number, options: lsp.FormattingOptions) {
  let formatter = formatters[node.type];
  if (!formatter) {
    return [];
  }
  let edits: lsp.TextEdit[] = [];
  for (let rule of formatter) {
    edits.push(...rule(node, document, indent, options));
  }
  return edits;
}

export class FormattingLspHandler implements ILspHandler {
  constructor(
    private readonly _documents: DocumentStore,
    private readonly _trees: Trees
  ) {
  }

  register(connection: lsp.Connection) {
    connection.onRequest(lsp.DocumentFormattingRequest.type, this.provideDocumentFormattingEdits.bind(this));
  }

  async provideDocumentFormattingEdits(params: lsp.DocumentFormattingParams): Promise<lsp.TextEdit[] | null> {
    console.log('Formatting document');

    const tree = await this._trees.getParseTree(params.textDocument.uri)
    const document = await this._documents.retrieve(params.textDocument.uri)
    let edits: lsp.TextEdit[] = [];

    let indent = 0;
    let cursor = tree!.rootNode.walk();
    let hasAny = cursor.gotoFirstChild();
    while (hasAny) {
      let node = cursor.currentNode();

      if (node.type === '}' || node.type === ')' || node.type === ']') {
        indent--;
      }
      if (node.type === '{' || node.type === '(' || node.type === '[') {
        indent++
      }

      edits.push(...formatNode(node, document!, indent, params.options));

      // walk
      if (cursor.gotoFirstChild()) {
        continue;
      }
      while (!cursor.gotoNextSibling()) {
        hasAny = cursor.gotoParent();
        if (!hasAny) {
          break;
        }
      }
    }

    // TODO: process final new line and trailing whitespaces
    return edits;
  }
}
