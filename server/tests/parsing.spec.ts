import * as Parser from 'web-tree-sitter'
import * as fs from 'fs'
import { createParser, initParser } from '../src/parser'

function parseTolkSource(source: string): Parser.SyntaxNode {
  let parser = createParser();
  return parser.parse(source).rootNode
}

beforeAll(async () => {
  await initParser(__dirname + '/../../node_modules/web-tree-sitter/tree-sitter.wasm', __dirname + '/../tree-sitter-tolk.wasm');
})

it('should parse just main()', () => {
  let rootNode = parseTolkSource(`
@pure
fun main(): int {
    return 0;
}
`);
  let f_main = rootNode.firstChild!
  expect(f_main.type).toBe('function_declaration')
  expect(f_main.childForFieldName("return_type")?.text).toBe('int')
  expect(f_main.childForFieldName("annotations")?.child(0)?.childForFieldName('name')?.text).toBe('pure')
  expect(f_main.childForFieldName('body')?.type).toBe('block_statement')
})

it('should parse stdlib.tolk', () => {
  let rootNode = parseTolkSource(fs.readFileSync(__dirname + '/../../tree-sitter-tolk/examples/stdlib.tolk', 'utf-8'))
  let functions = rootNode.children.filter(n => n.type === 'function_declaration')
  let builtin = functions.filter(n => n.childForFieldName('builtin_specifier') != null)
  let tuplePush = functions.find(n => n.childForFieldName('name')?.text === 'tuplePush')
  let skipBits = functions.find(n => n.childForFieldName('name')?.text === 'skipBits')
  expect(rootNode.hasError()).toBeFalsy()
  expect(functions.length).toBe(93 + 16)
  expect(builtin.length).toBe(16)
  expect(rootNode.firstChild!.type).toBe('comment')
  expect(tuplePush?.childForFieldName('genericsT')?.type).toBe('genericsT_list')
  expect(tuplePush?.childForFieldName('genericsT')?.text).toBe('<X>')
  expect(skipBits?.childForFieldName("return_type")?.type).toBe('self_type')
  expect(skipBits?.childForFieldName("return_type")?.text).toBe('self')
})

it('should parse nominator-code.tolk', () => {
  let rootNode = parseTolkSource(fs.readFileSync(__dirname + '/../../tree-sitter-tolk/examples/nominator-code.tolk', 'utf-8'))
  expect(rootNode.hasError()).toBeFalsy()
})

it('should parse uni-lockup-wallet.tolk', () => {
  let rootNode = parseTolkSource(fs.readFileSync(__dirname + '/../../tree-sitter-tolk/examples/uni-lockup-wallet.tolk', 'utf-8'))
  expect(rootNode.hasError()).toBeFalsy()
})

it('should parse comments', () => {
  let rootNode = parseTolkSource(`
/* they are /* not nested ***/
/**//****/
// line
/* // line and end */
    `)
  let comments = rootNode.children.filter(c => c.type === 'comment')
  expect(rootNode.childCount).toBe(comments.length)
})

it('should parse get methods', () => {
  let rootNode = parseTolkSource(`
fun f1(){}

get exported1(): int {}
@pure get fun exported2():auto {}
@method_id(123) @pure get exported3(a: int): (slice, ()) {}

fun main(): int { return f1(); } 
    `)
  expect(rootNode.hasError()).toBeFalsy()
  const getters = rootNode.children.filter(c => c.type === "get_method_declaration");

  const gettersParsed = getters.map((f: Parser.SyntaxNode) => {
    return {
      returnType: f.childForFieldName('return_type')!.text,
      name: f.childForFieldName("name")!.text,
      parameters: f.childForFieldName('parameters')!
        .children.filter((c) => c.type === "parameter_declaration")
        .map((c) => ({
          type: c.childForFieldName('type')!.text,
          name: c.childForFieldName('name')!.text,
        })),
    };
  });

  expect(gettersParsed).toEqual([
    { returnType: 'int', name: 'exported1', parameters: [] },
    { returnType: 'auto', name: 'exported2', parameters: [] },
    { returnType: '(slice, ())', name: 'exported3', parameters: [{ type: 'int', name: 'a' }] },
  ])
})

it('should parse imports', () => {
  let rootNode = parseTolkSource(`
tolk 0.6
import "asdf.tolk"
    `)
  expect(rootNode.firstChild!.type === 'tolk_required_version');
  expect(rootNode.lastChild!.type === 'import_statement');
})

it('should parse expression 1', () => {
  let rootNode = parseTolkSource(`
const bb: int = a == 0 & b == 1 & c == 2 & d == 3;    
    `)
  let const_decl = rootNode.firstNamedChild!
  expect(rootNode.hasError()).toBeFalsy()
  expect(const_decl.childForFieldName('name')!.text).toBe('bb')
  expect(const_decl.childForFieldName('type')!.text).toBe('int')
  expect(const_decl.childForFieldName('value')!.namedChildCount).toBe(8)
})

it('should parse without spaces 1', () => {
  let rootNode = parseTolkSource(`
fun f1(): int { var res$2=1+-2+f()-3<<4*---15; }
fun f2(): int { val res$2 = 1 + -2 + f() - 3 << 4 * - - - 15; }
`)
  expect(rootNode.hasError()).toBeFalsy()
  let f1_body = rootNode.firstChild!.childForFieldName('body')!
  let f2_body = rootNode.lastChild!.childForFieldName('body')!
  let f1_expr = f1_body.child(1)!.child(0)!.child(0)!
  let f2_expr = f2_body.child(1)!.child(0)!.child(0)!
  expect(f1_expr.children.map(c => c.text)).toEqual(f2_expr.children.map(c => c.text))
})

it('should parse identifiers in backticks', () => {
  let rootNode = parseTolkSource('global `some(var`: int; fun `main`() { var `ks+-pe` = null; return `some(var`; }');
  let g_decl = rootNode.firstChild!
  let f_body = rootNode.firstChild!.nextSibling!.childForFieldName('body')!
  expect(rootNode.hasError()).toBeFalsy()
  expect(g_decl.type).toBe('global_var_declaration')
  expect(g_decl.childForFieldName('type')!.type).toBe('primitive_type')
  expect(g_decl.childForFieldName('type')!.text).toBe('int')
  expect(f_body.firstNamedChild!.firstChild!.childForFieldName('assigned_val')!.firstChild!.type).toBe('null_literal')
})

it('should parse return', () => {
  let rootNode = parseTolkSource('fun main() { return 1; return; }');
  let f_body = rootNode.firstChild!.childForFieldName('body')!
  let return1 = f_body.firstNamedChild!.firstChild!
  let return2 = f_body.lastNamedChild!.firstChild!
  expect(rootNode.hasError()).toBeFalsy()
  expect(return1.type).toBe(return2.type)
  expect(return1.childForFieldName('body')?.type).toBe('expression')
  expect(return2.childForFieldName('body')?.type).toBeUndefined()
})
