import * as fs from "fs";
import { createParser, initParser } from '../src/parser'

// this test suite runs only if a local ton repo is cloned near tolk-vscode
const TOLK_TESTS_DIR = __dirname + '/../../../ton/tolk-tester/tests'

beforeAll(async () => {
  await initParser(__dirname + '/../../node_modules/web-tree-sitter/tree-sitter.wasm', __dirname + '/../tree-sitter-tolk.wasm');
})

describe('Parse all positive Tolk tests from TON repo', () => {
  if (!fs.existsSync(TOLK_TESTS_DIR)) {
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

