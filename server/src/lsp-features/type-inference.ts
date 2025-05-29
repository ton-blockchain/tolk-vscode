import * as Parser from 'web-tree-sitter';

type PrimitiveType = {
  kind: 'primitive',
  name: 'int' | 'bool' | 'cell' | 'slice' | 'builder' | 'continuation' | 'tuple' | 'coins' | 'address'
}

type VoidType = {
  kind: 'void'
}

type SelfType = {
  kind: 'self'
}

type NeverType = {
  kind: 'never'
}

type IdentifierType = {
  kind: 'type_identifier',
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

type NullableType = {
  kind: 'nullable',
  inner: TolkType
}

export type FunctionType = {
  kind: 'function',
  receiver: TolkType | null,
  parameters: {
    name?: string,
    type: TolkType
  }[],
  returns: TolkType,
  isGetMethod: boolean
}

export type UnionType = {
  kind: 'union',
  lhs: TolkType,
  rhs: TolkType
}

export type UnknownType = {
  kind: 'unknown'
}

export type TolkType = PrimitiveType | VoidType | SelfType | NeverType | IdentifierType | TensorType | TupleType | NullableType | FunctionType | UnionType | UnknownType;

function fallbackToUnknownType(): TolkType {
  return { kind: 'unknown' }
}

export function extractType(typeHint: Parser.SyntaxNode | null): TolkType {
  if (!typeHint) {
    return fallbackToUnknownType()
  }

  switch (typeHint.type) {
    case 'primitive_type':
      return {
        kind: 'primitive',
        name: typeHint.text as PrimitiveType['name']
      }
    case 'void_type':
      return {
        kind: 'void'
      }
    case 'self_type':
      return {
        kind: 'self'
      }
    case 'never_type':
      return {
        kind: 'never'
      }
    case 'type_identifier':
      return {
        kind: 'type_identifier',
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
    case 'nullable_type':
      return {
        kind: 'nullable',
        inner: extractType(typeHint.namedChild(0)!)
      }
    case 'union_type': {
      let lhs = typeHint.childForFieldName('lhs')
      let rhs = typeHint.childForFieldName('rhs')
      if (!lhs || !rhs) {
        break
      }
      return {
        kind: 'union',
        lhs: extractType(lhs),
        rhs: extractType(rhs),
      }
    }
    case 'fun_callable_type': {
      let lhs = typeHint.childForFieldName('param_types')
      let rhs = typeHint.childForFieldName('return_type')
      if (!lhs || !rhs) {
        break
      }
      return {
        kind: 'function',
        receiver: null,
        parameters: lhs.namedChildren.map(n => ({ type: extractType(n) })),
        returns: extractType(rhs),
        isGetMethod: false
      }
    }
  }

  return fallbackToUnknownType()
}

export function inferFunctionType(node: Parser.SyntaxNode): TolkType {
  if (node.type === 'function_declaration' || node.type === 'get_method_declaration') {
    let receiverNode = node.childForFieldName('receiver_type')
    return {
      kind: 'function',
      receiver: receiverNode ? extractType(receiverNode) : null,
      parameters: node.descendantsOfType('parameter_declaration').map(arg => ({
        name: arg.childForFieldName('name')?.text,
        type: extractType(arg.childForFieldName('type'))
      })),
      returns: extractType(node.childForFieldName('return_type')),
      isGetMethod: node.type === 'get_method_declaration'
    }
  }

  return fallbackToUnknownType()
}

export function stringifyType(type: TolkType): string {
  switch (type.kind) {
    case 'primitive':
      return type.name
    case 'void':
      return 'void'
    case 'self':
      return 'self'
    case 'never':
      return 'never'
    case 'type_identifier':
      return type.name
    case 'tensor':
      return '(' + type.items.map(stringifyType).join(', ') + ')'
    case 'tuple':
      return '[' + type.items.map(stringifyType).join(', ') + ']'
    case 'nullable':
      let embrace = type.inner.kind === 'function'
      return embrace ? '(' + stringifyType(type.inner) + ')?' : stringifyType(type.inner) + '?'
    case 'union':
      return stringifyType(type.lhs) + ' | ' + stringifyType(type.rhs)
    case 'function':
      return stringifyType(type.returns)
    default:
      return 'unknown'
  }
}
