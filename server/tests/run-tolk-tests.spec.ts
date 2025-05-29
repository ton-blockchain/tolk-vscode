import * as fs from "fs";
import { createParser, initParser } from '../src/parser'

// this test suite runs only if a local ton repo is cloned near tolk-vscode
const TOLK_TESTS_DIR = __dirname + '/../../../ton/tolk-tester/tests'
const TOLK_STDLIB_DIR = __dirname + '/../../../ton/crypto/smartcont/tolk-stdlib'

beforeAll(async () => {
  await initParser(__dirname + '/../../node_modules/web-tree-sitter/tree-sitter.wasm', __dirname + '/../tree-sitter-tolk.wasm');
})

describe('Parse all Tolk stdlib', () => {
  if (!fs.existsSync(TOLK_STDLIB_DIR)) {
    it('TOLK_STDLIB_DIR not found', () => {
    })
    return
  }

  for (let fileName of fs.readdirSync(TOLK_STDLIB_DIR)) {
    it(fileName, () => {
      let absFileName = TOLK_STDLIB_DIR + '/' + fileName
      let src = fs.readFileSync(absFileName, 'utf-8')
      let rootNode = createParser().parse(src).rootNode
      expect(rootNode.hasError()).toBeFalsy()
    })
  }
})

describe('Parse all positive Tolk tests from TON repo', () => {
  // disable compiler positive tests parsing, tree-sitter doesn't understand arbitrary receivers
  if (!fs.existsSync(TOLK_TESTS_DIR) || 1) {
    it('TOLK_TESTS_DIR not found', () => {
    })
    return
  }

  let dirItems = fs.readdirSync(TOLK_TESTS_DIR, { withFileTypes: true })
  for (let dirItem of dirItems) {
    // don't run on negative tests, which are supposed to have errors
    if (!dirItem.isFile() || dirItem.name.startsWith('invalid')) {
      continue
    }

    it(dirItem.name, () => {
      let absFileName = TOLK_TESTS_DIR + '/' + dirItem.name
      let src = fs.readFileSync(absFileName, 'utf-8')
      let rootNode = createParser().parse(src).rootNode
      expect(rootNode.hasError()).toBeFalsy()
    })
  }
})

