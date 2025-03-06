import * as Parser from 'web-tree-sitter';

type PrimitiveType = {
  kind: 'primitive',
  name: 'int' | 'bool' | 'cell' | 'slice' | 'builder' | 'continuation' | 'tuple'
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
  parameters: {
    name?: string,
    type: TolkType
  }[],
  returns: TolkType,
  isGetMethod: boolean
}

export type UnknownType = {
  kind: 'unknown'
}

export type TolkType = PrimitiveType | VoidType | SelfType | NeverType | IdentifierType | TensorType | TupleType | NullableType | FunctionType | UnknownType;

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
    case 'fun_callable_type': {
      let lhs = typeHint.childForFieldName('param_types')
      let rhs = typeHint.childForFieldName('return_type')
      if (!lhs || !rhs) {
        break
      }
      return {
        kind: 'function',
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
    case 'function':
      return stringifyType(type.returns)
    default:
      return 'unknown'
  }
}
