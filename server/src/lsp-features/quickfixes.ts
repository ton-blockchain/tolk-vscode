import * as Parser from 'web-tree-sitter';
import { CodeAction, Diagnostic, TextEdit } from 'vscode-languageserver';
import { asParserPoint } from '../utils/position';

// QuickFix is a fix for diagnostic, available via "Alt+Enter" in VS Code
export interface QuickFix {
  convertToCodeAction(documentUri: string, tree: Parser.Tree, diagnostic: Diagnostic): CodeAction
}

abstract class DefaultQuickFix implements QuickFix {
  abstract getTitle(): string

  abstract applyQuickFix(node: Parser.SyntaxNode): TextEdit[]

  convertToCodeAction(documentUri: string, tree: Parser.Tree, diagnostic: Diagnostic): CodeAction {
    return {
      title: this.getTitle(),
      kind: 'quickfix',
      diagnostics: [diagnostic],
      isPreferred: true,
      edit: {
        changes: { [documentUri]: this.applyQuickFix(tree.rootNode.descendantForPosition(asParserPoint(diagnostic.range.start))) },
      },
    }
  }
}


const allExistingQuickFixes: { [kind in string]: QuickFix } = {}

export function findQuickFixByKind(kind: string): QuickFix | undefined {
  return allExistingQuickFixes[kind]
}

