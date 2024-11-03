import * as Parser from 'web-tree-sitter';
import { extractType, TolkType } from './type-inference';
import { extractNameFromNode } from './lsp-document-symbols'

export interface TolkLocalVariable {
  kind: 'variable' | 'parameter',
  node: Parser.SyntaxNode,
  name: string
  type: TolkType,
  mutate: boolean, // if parameter has `mutate` keyword
}

export function findLocalVariables(rootNode: Parser.SyntaxNode, cursorPosition: Parser.Point): TolkLocalVariable[] {
  let descendant: Parser.SyntaxNode | null = rootNode.descendantForPosition(cursorPosition)
  let result: TolkLocalVariable[] = []

  // navigate through parents and find their variables declared higher than cursor
  while (descendant) {
    if (descendant.type === 'block_statement') {
      for (let child of descendant.children) {
        if (child.type === 'statement' && child.children[0]?.type === 'local_vars_declaration') {
          let declaredVarsNodes = child.child(0)!.descendantsOfType('var_declaration_lhs', undefined, cursorPosition) ?? []
          for (let potentialVarNode of declaredVarsNodes) {
            let nameNode = potentialVarNode.childForFieldName('name')
            if (nameNode)
              result.push({
                kind: 'variable',
                node: nameNode,
                name: extractNameFromNode(nameNode),
                type: extractType(potentialVarNode.childForFieldName('type')),
                mutate: false
              })
          }
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
            type: extractType(paramNode.childForFieldName('type')),
            mutate: paramNode.childForFieldName('modifiers') !== null
          })
        }
      }
    }

    descendant = descendant.parent
  }

  return result
}
