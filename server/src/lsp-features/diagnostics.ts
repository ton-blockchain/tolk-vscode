import * as lsp from 'vscode-languageserver';
import * as Parser from 'web-tree-sitter';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { connection } from '../connection';
import { asLspRange } from '../utils/position';
import { DepsIndex } from './deps-index';
import { SymbolIndex } from './symbol-index';
import { config } from '../server-config';
import * as qf from './quickfixes';
import { detectTolkLanguageCapabilities } from '../language-level';
import { TolkSdkMapping } from "../tolk-sdk-mapping";
import { TolkCompilerSDK, TolkCompilerVersion } from "../config-scheme";
import { extractNameFromNode, TolkDocumentSymbol } from './lsp-document-symbols'
import { findLocalVariables } from './find-locals'


class CollectedDiagnostics {
  private diagnostics: lsp.Diagnostic[] = []

  error(message: string, node: Parser.SyntaxNode, ...fixes: string[]) {
    this.diagnostics.push({ message, range: asLspRange(node), data: { fixes } })
  }

  errorAt(message: string, range: lsp.Range, ...fixes: string[]) {
    this.diagnostics.push({ message, range, data: { fixes } })
  }

  warning(message: string, node: Parser.SyntaxNode, ...fixes: string[]) {
    this.diagnostics.push({ message, range: asLspRange(node), severity: 2, data: { fixes } })
  }

  warningAt(message: string, range: lsp.Range, ...fixes: string[]) {
    this.diagnostics.push({ message, range, severity: 2, data: { fixes } })
  }

  info(message: string, node: Parser.SyntaxNode, ...fixes: string[]) {
    this.diagnostics.push({ message, range: asLspRange(node), severity: 3, data: { fixes } })
  }

  infoAt(message: string, range: lsp.Range, ...fixes: string[]) {
    this.diagnostics.push({ message, range, severity: 3, data: { fixes } })
  }

  hint(message: string, node: Parser.SyntaxNode, ...fixes: string[]) {
    this.diagnostics.push({ message, range: asLspRange(node), severity: 4, data: { fixes } })
  }

  hintAt(message: string, range: lsp.Range, ...fixes: string[]) {
    this.diagnostics.push({ message, range, severity: 4, data: { fixes } })
  }

  getCollectedDiagnostics(): lsp.Diagnostic[] {
    return this.diagnostics
  }
}

class TreeVisitor {
  private constructor(
    tolkCompilerVersion: TolkCompilerVersion,
    private readonly isExperimentalDiagnostics: boolean,
    private readonly rootNode: Parser.SyntaxNode,
    private readonly diagnostics: CollectedDiagnostics,
    private readonly globalSymbols: TolkDocumentSymbol[],
    private readonly lang = detectTolkLanguageCapabilities(tolkCompilerVersion),
  ) {
  }

  static visitTreeAndCollectDiagnostics(tolkSdk: TolkCompilerSDK, tree: Parser.Tree, globalSymbols: TolkDocumentSymbol[]): CollectedDiagnostics {
    let collected = new CollectedDiagnostics()
    let self = new TreeVisitor(tolkSdk.tolkCompilerVersion, config.experimentalDiagnostics, tree.rootNode, collected, globalSymbols)
    self.visitSubTree(self.rootNode)
    return collected
  }

  static isInsideBlockStatement(node: Parser.SyntaxNode): boolean {
    for (let p = node.parent; p; p = p.parent) {
      if (p.type === 'block_statement') {
        return true
      }
    }
    return false
  }

  static isInsideLoopStatement(node: Parser.SyntaxNode): boolean {
    for (let p = node.parent; p; p = p.parent) {
      if (p.type === 'repeat_statement' || p.type === 'do_while_statement' || p.type === 'while_statement') {
        return true
      }
    }
    return false
  }

  private visitSubTree(node: Parser.SyntaxNode) {
    if (node.isMissing()) {
      this.diagnostics.error('Missing ' + node.type, node)
    } else if (node.hasError() && node.children.every(a => !a.hasError())) {
      // when a user types new code and hasn't typed the closing semicolon yet,
      // all this node is detected an error (since it's invalid syntactically)
      // this leads to an effect that you always type "in the read zone"
      // here I try to heuristically detect "missing last comma" not to highlight a whole node
      if (node.nextSibling?.type === '}' && !node.text.endsWith(';')) {
        this.diagnostics.errorAt('Missing `;`', lsp.Range.create(node.endPosition.row, node.endPosition.column, node.endPosition.row, node.endPosition.column + 1))
      } else {
        this.diagnostics.error('Syntax error', node)
      }
    }

    if (this.isExperimentalDiagnostics && node.type === 'identifier' && TreeVisitor.isInsideBlockStatement(node)) {
      let name = extractNameFromNode(node)
      let found = !!this.globalSymbols.find(a => a.name === name)
      if (!found) {
        let locals = findLocalVariables(this.rootNode, node.endPosition)
        found = !!locals.find(a => a.name === name)
      }
      if (!found) {
        this.diagnostics.error(`Cannot find symbol '${name}'`, node)
      }
    }

    if (node.type === 'bool_type' && !this.lang.booleanTypeSupported) {
      this.diagnostics.error(`Bool type is not supported yet, use int; remember, that true is -1, not 1`, node)
    }

    if (node.type === 'break_statement' || node.type === 'continue_statement') {
      if (!TreeVisitor.isInsideLoopStatement(node)) {
        this.diagnostics.error(`break/continue not within a loop`, node)
      } else if (!this.lang.breakContinueSupported) {
        this.diagnostics.error(`break/continue from loops is not supported yet`, node)
      }
    }

    for (let child of node.children) {
      this.visitSubTree(child)
    }
  }
}

export class DiagnosticsProvider {
  constructor(
    private readonly _deps: DepsIndex,
    private readonly _symbols: SymbolIndex,
    private readonly _tolkSdkMapping: TolkSdkMapping
  ) {
    // note, that diagnostics are implemented via push model (connection.sendDiagnostics),
    // not via .register(lsp.DocumentDiagnosticRequest)
    // I tried the latter, but it worked strange
  }

  async provideDiagnostics(document: TextDocument, tree: Parser.Tree) {
    let tolkSdk = await this._tolkSdkMapping.getOrRequestTolkSdkForFile(document.uri)
    if (!tolkSdk) {
      // if tolkSdk was not detected for a file, no diagnostics are enabled
      // (for instance, if a non-workspace .tolk file is opened, it's just syntax highlighted)
      // note, that getOrRequestTolkSdkForFile() has sent a request for a client
      // if a client failed to detect tolkSdk, it showed an error for the user
      // (and if he fixes the problem, server cache will be cleared and tolkSdk re-requested)
      connection.sendDiagnostics({ diagnostics: [], uri: document.uri, version: document.version }).catch(console.error)
      return
    }

    let imports = await this._deps.getImports(document)
    let globalSymbols = await this._symbols.getGlobalSymbols([document.uri, ...imports])
    let diagnostics = TreeVisitor.visitTreeAndCollectDiagnostics(tolkSdk, tree, globalSymbols)

    let errors = await this._deps.getNotFoundImports(document)
    for (let error of errors) {
      diagnostics.error('Dependency not found: ' + error.path, error.node)
    }

    connection.sendDiagnostics({
      diagnostics: diagnostics.getCollectedDiagnostics(),
      uri: document.uri,
      version: document.version
    }).catch(console.error)
  }
}
