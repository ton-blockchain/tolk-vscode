import * as Parser from 'web-tree-sitter';

type PrimitiveType = {
  kind: 'primitive',
  name: 'int' | 'cell' | 'slice' | 'builder' | 'cont' | 'tuple'
}

type AutoType = {
  kind: 'auto'
}

type VoidType = {
  kind: 'void'
}

type SelfType = {
  kind: 'self'
}

type BoolType = {
  kind: 'bool'
}

type GenericType = {
  kind: 'genericT',
  name: string
}

type TensorType = {
  kind: 'tensor',
  items: TolkType[]
}

type TupleType = {
  kind: 'tuple',
  items: TolkType[]
}

export type FunctionType = {
  kind: 'function',
  parameters: {
    name?: string,
    type: TolkType
  }[],
  returns: TolkType,
  isGetMethod: boolean
}

export type AtomicType = PrimitiveType | AutoType | VoidType | SelfType | BoolType | GenericType | TensorType | TupleType;

export type TolkType = AtomicType | FunctionType;

function fallbackToAutoType(): TolkType {
  return { kind: 'auto' }
}

export function extractType(typeHint: Parser.SyntaxNode | null): TolkType {
  if (!typeHint) {
    return fallbackToAutoType()
  }

  switch (typeHint.type) {
    case 'primitive_type':
      return {
        kind: 'primitive',
        name: typeHint.text as PrimitiveType['name']
      }
    case 'auto_type':
      return {
        kind: 'auto'
      }
    case 'void_type':
      return {
        kind: 'void'
      }
    case 'self_type':
      return {
        kind: 'self'
      }
    case 'bool_type':
      return {
        kind: 'bool'
      }
    case 'genericT_item':
      return {
        kind: 'genericT',
        name: typeHint.text
      }
    case 'tensor_type': {
      let nested = typeHint.children.filter(n => n.type !== '(' && n.type !== ')' && n.type !== ',' && n.type !== 'comment')
      return {
        kind: 'tensor',
        items: nested.map(extractType)
      }
    }
    case 'tuple_type': {
      let nested = typeHint.children.filter(n => n.type !== '[' && n.type !== ']' && n.type !== ',' && n.type !== 'comment')
      return {
        kind: 'tuple',
        items: nested.map(extractType)
      }
    }
    case 'parenthesized_type':
      if (typeHint.childCount !== 3) {
        break
      }
      return extractType(typeHint.child(1)!)
    case 'function_type': {
      let lhs = typeHint.childForFieldName('lhs')
      let rhs = typeHint.childForFieldName('rhs')
      if (!lhs || !rhs) {
        break
      }
      return {
        kind: 'function',
        parameters: lhs.children.map(n => ({ type: extractType(n) })),
        returns: extractType(rhs),
        isGetMethod: false
      }
    }
  }

  return fallbackToAutoType()
}

export function inferFunctionType(node: Parser.SyntaxNode): TolkType {
  if (node.type === 'function_declaration' || node.type === 'get_method_declaration') {
    return {
      kind: 'function',
      parameters: node.descendantsOfType('parameter_declaration').map(arg => ({
        name: arg.childForFieldName('name')?.text,
        type: extractType(arg.childForFieldName('type'))
      })),
      returns: extractType(node.childForFieldName('return_type')),
      isGetMethod: node.type === 'get_method_declaration'
    }
  }

  return fallbackToAutoType()
}

export function stringifyType(type: TolkType): string {
  switch (type.kind) {
    case 'primitive':
      return type.name
    case 'auto':
      return 'auto'
    case 'void':
      return 'void'
    case 'self':
      return 'self'
    case 'bool':
      return 'bool'
    case 'genericT':
      return type.name
    case 'tensor':
      return '(' + type.items.map(stringifyType).join(', ') + ')'
    case 'tuple':
      return '[' + type.items.map(stringifyType).join(', ') + ']'
    case 'function':
      return stringifyType(type.returns)
    default:
      return 'auto'
  }
}
