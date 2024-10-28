/*
    Currently, writing tests for most server-side parts is nearly impossible.
    It's because server-side implementation is strictly tied to interacting with a client
  (for instance, DocumentStore gets file contents by sending a request to a client).
    Only some (rare) parts that operate ready AST, can be tested.
 */

import * as lsp from 'vscode-languageserver';
import { createParser, initParser } from '../src/parser'
import { getDocumentSymbols } from '../src/lsp-features/lsp-document-symbols'
import { FunctionType } from '../src/lsp-features/type-inference'
import { findLocalVariables } from '../src/lsp-features/find-locals'

beforeAll(async () => {
  await initParser(__dirname + '/../../node_modules/web-tree-sitter/tree-sitter.wasm', __dirname + '/../tree-sitter-tolk.wasm');
})

describe('Some server tests', () => {
  it('should extract global symbols', () => {
    let tolkSource = `
const first = 1;
global \`second'\`: int;
fun third(a: slice): int { var local1 = 1; return local1; }
`
    let tree = createParser().parse(tolkSource)
    let symbols = getDocumentSymbols(tree)

    expect(symbols.length).toBe(3)

    expect(symbols[0].lspSymbol.kind).toBe(lsp.SymbolKind.Constant)
    expect(symbols[0].type.kind).toBe('auto')

    expect(symbols[1].lspSymbol.kind).toBe(lsp.SymbolKind.Variable)
    expect(symbols[1].type.kind).toBe('primitive')
    expect(symbols[1].name).toBe('second\'')

    expect(symbols[2].lspSymbol.kind).toBe(lsp.SymbolKind.Function)
    expect(symbols[2].type.kind).toBe('function')
    expect((symbols[2].type as FunctionType).parameters.length).toBe(1)
    expect((symbols[2].type as FunctionType).parameters[0].name).toBe('a')
    expect((symbols[2].type as FunctionType).parameters[0].type.kind).toBe('primitive')
  })

  it('should find local variables', () => {
    let tolkSource = `
fun main(cs: auto) {
  var \`c1\` = 0;
  if (c1) {
    var c2 = 0;
    // cursor1
  }
  // cursor2
}
`
    let tree = createParser().parse(tolkSource)

    let cursor1 = tree.rootNode.descendantsOfType('comment').find(c => c.text.includes('cursor1'))!
    let locals1 = findLocalVariables(tree.rootNode, cursor1.startPosition)
    expect(locals1.length).toBe(3)
    expect(locals1[0].name).toBe('c2')
    expect(locals1[1].name).toBe('c1')
    expect(locals1[2].name).toBe('cs')
    expect(locals1[2].type.kind).toBe('auto')

    let cursor2 = tree.rootNode.descendantsOfType('comment').find(c => c.text.includes('cursor2'))!
    let locals2 = findLocalVariables(tree.rootNode, cursor2.startPosition)
    expect(locals2.length).toBe(2)
    expect(locals2[0].name).toBe('c1')
    expect(locals2[1].name).toBe('cs')
  })
})
