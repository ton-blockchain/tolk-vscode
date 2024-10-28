import * as lsp from 'vscode-languageserver';
import * as Parser from 'web-tree-sitter';
import { DocumentStore } from '../document-store';
import { Trees } from '../trees';
import { asLspRange, asParserPoint } from '../utils/position';
import { NotificationFromServer } from '../shared-msgtypes'
import { ILspHandler } from '../connection'
import { findLocalVariables } from './find-locals'

function findClosestBlockStatement(node: Parser.SyntaxNode): Parser.SyntaxNode | null {
  let parent = node.parent
  while (parent && parent.type !== 'block_statement' && parent.type !== 'function_declaration' && parent.type !== 'get_method_declaration') {
    parent = parent.parent
  }
  return parent
}

function compare(point1: Parser.Point, point2: Parser.Point) {
  if (point1.row < point2.row) {
    return -1;
  }
  if (point1.row > point2.row) {
    return 1;
  }
  if (point1.column < point2.column) {
    return -1;
  }
  if (point1.column > point2.column) {
    return 1;
  }
  return 0;
}

function findChildrenWithType(node: Parser.SyntaxNode, type: string, startPosition: Parser.Point, endPosition: Parser.Point) {
  function visit(node: Parser.SyntaxNode) {
    if (
      node.type === type &&
      compare(startPosition, node.startPosition) <= 0 &&
      compare(endPosition, node.endPosition) >= 0
    ) {
      result.push(node)
    }
    for (let child of node.children) {
      visit(child)
    }
  }

  let result: Parser.SyntaxNode[] = []
  visit(node)
  return result
}

export class RenameLspHandler implements ILspHandler {
  constructor(
    private readonly _documents: DocumentStore,
    private readonly _trees: Trees
  ) {
  }

  register(connection: lsp.Connection) {
    connection.onRequest(lsp.RenameRequest.type, (params) => this.performRename(params).catch(reason => {
      connection.sendNotification(NotificationFromServer.showErrorMessage, `Can not rename: ${reason}`).catch(console.error)
      return {}
    }))
  }

  async performRename(params: lsp.RenameParams): Promise<lsp.WorkspaceEdit | null> {
    let tree = await this._trees.getParseTree(params.textDocument.uri);
    let cursorNode = tree!.rootNode.descendantForPosition(asParserPoint(params.position));
    if (cursorNode?.type !== 'identifier' && cursorNode?.type !== 'function_name') {
      return Promise.reject("not an identifier")
    }
    let oldName = cursorNode.text
    let newName = params.newName
    console.log(`rename symbol ${oldName} to ${newName}`)

    // try to find declaration
    let locals = findLocalVariables(tree!.rootNode, cursorNode.endPosition)
    let localDeclaration = locals.find(a => a.name === oldName)
    if (!localDeclaration) {
      // todo support renaming global variables, constants, functions
      return Promise.reject("not a local variable")
    }

    // rename to the end of block
    let parentBlock = findClosestBlockStatement(localDeclaration.node)
    if (!parentBlock) {
      return Promise.reject("can not find declaration")
    }

    let identifiers = findChildrenWithType(parentBlock, 'identifier', localDeclaration.node.startPosition, parentBlock.endPosition)
    let nodesToRename = identifiers.filter(a => a.text === oldName)
    return {
      changes: {
        [params.textDocument.uri]: nodesToRename.map(a => ({
          range: asLspRange(a),
          newText: newName
        }))
      }
    }
  }
}
