import * as Parser from 'web-tree-sitter';
import { extractType, TolkType } from './type-inference';
import { extractNameFromNode } from './lsp-document-symbols'

export interface TolkLocalVariable {
  kind: 'variable' | 'parameter',
  node: Parser.SyntaxNode,
  name: string
  type: TolkType,
}

export function findLocalVariables(rootNode: Parser.SyntaxNode, cursorPosition: Parser.Point): TolkLocalVariable[] {
  let descendant: Parser.SyntaxNode | null = rootNode.descendantForPosition(cursorPosition)
  let result: TolkLocalVariable[] = []

  // navigate through parents and find their variables declared higher than cursor
  while (descendant) {
    if (descendant.type === 'block_statement') {
      for (let child of descendant.children) {
        if (child.type === 'local_vars_declaration') {
          let declaredVarsNodes = child.descendantsOfType('var_declaration_lhs', undefined, cursorPosition) ?? []
          for (let potentialVarNode of declaredVarsNodes) {
            let nameNode = potentialVarNode.childForFieldName('name')
            if (nameNode)
              result.push({
                kind: 'variable',
                node: nameNode,
                name: extractNameFromNode(nameNode),
                type: extractType(potentialVarNode.childForFieldName('type'))
              })
          }
        }
      }
    }

    if (descendant.type === 'try_catch_statement') {
      for (let childFieldName of ['catch_var1', 'catch_var2']) {
        let catchVarNode = descendant.childForFieldName(childFieldName)
        if (catchVarNode) {
          result.push({
            kind: 'variable',
            node: catchVarNode,
            name: extractNameFromNode(catchVarNode),
            type: childFieldName === 'catch_var1' ? { kind: 'primitive', name: 'int' } : { kind: 'unknown' }
          })
        }
      }
    }

    if (descendant.type === 'function_declaration' || descendant.type === 'get_method_declaration') {
      let parameterNodes = descendant.childForFieldName('parameters')?.descendantsOfType('parameter_declaration') || []
      for (let paramNode of parameterNodes) {
        let nameNode = paramNode.childForFieldName('name')
        if (nameNode) {
          result.push({
            kind: 'parameter',
            node: nameNode,
            name: extractNameFromNode(nameNode),
            type: extractType(paramNode.childForFieldName('type'))
          })
        }
      }
    }

    descendant = descendant.parent
  }

  return result
}
