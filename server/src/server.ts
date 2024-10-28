import { InitializeParams, TextDocumentSyncKind } from 'vscode-languageserver/node';
import { InitializeResult } from 'vscode-languageserver-protocol';
import { connection, ILspHandler } from './connection';
import { DepsIndex } from './lsp-features/deps-index';
import { DocumentStore } from './document-store';
import { CompletionLspHandler } from './lsp-features/lsp-completion';
import { DefinitionLspHandler } from './lsp-features/lsp-definitions';
import { DiagnosticsProvider } from './lsp-features/diagnostics';
import { DocumentSymbolsLspHandler } from './lsp-features/lsp-document-symbols';
import { FormattingLspHandler } from './lsp-features/lsp-formatting';
import { SymbolIndex } from './lsp-features/symbol-index';
import { initParser } from './parser';
import { Trees } from './trees';
import { RenameLspHandler } from './lsp-features/lsp-rename';
import { mutateConfig } from './server-config';
import { CodeAction } from 'vscode-languageserver';
import { findQuickFixByKind } from './lsp-features/quickfixes';
import { TolkSdkMapping } from "./tolk-sdk-mapping";
import { NotificationFromClient } from "./shared-msgtypes";
import { HoverLspHandler } from './lsp-features/lsp-hover'


const lspHandlers: ILspHandler[] = [];

connection.onInitialize(async (params: InitializeParams): Promise<InitializeResult> => {
  // while starting the server, client posted some initializationOptions; for instance, clientConfig
  await initParser(params.initializationOptions.treeSitterWasmUri, params.initializationOptions.langWasmUri);
  mutateConfig(params.initializationOptions.clientConfig || {})

  const documents = new DocumentStore(connection);
  const trees = new Trees(documents);

  const symbolIndex = new SymbolIndex(trees, documents);
  const tolkSdkMapping = new TolkSdkMapping(symbolIndex);
  const depsIndex = new DepsIndex(documents, trees, symbolIndex, tolkSdkMapping);
  const diagnosticsProvider = new DiagnosticsProvider(depsIndex, symbolIndex, tolkSdkMapping);

  lspHandlers.push(new DocumentSymbolsLspHandler(documents, trees));
  lspHandlers.push(new CompletionLspHandler(documents, trees, symbolIndex, depsIndex));
  lspHandlers.push(new DefinitionLspHandler(documents, trees, symbolIndex, depsIndex));
  lspHandlers.push(new HoverLspHandler(documents, trees, symbolIndex, depsIndex));
  lspHandlers.push(new FormattingLspHandler(documents, trees));
  lspHandlers.push(new RenameLspHandler(documents, trees));

  // manage configuration
  connection.onNotification(NotificationFromClient.onConfigurationChanged, (next) => {
    mutateConfig(next)
    tolkSdkMapping.resetCache() // in case settings around tolkSdk changed, re-request from a client
  });
  connection.onNotification(NotificationFromClient.forceUpdateDiagnostics, async (documentUri: string) => {
    documents.retrieve(documentUri).then(document => {
      let tree = document && trees.getParseTree(document)
      if (tree) {
        diagnosticsProvider.provideDiagnostics(document!, tree)
      }
    })
  })

  // manage symbol index. add/remove files as they are discovered and edited
  documents.all().forEach(doc => symbolIndex.addFile(doc.uri));
  documents.onDidOpen(event => symbolIndex.addFile(event.document.uri));
  documents.onDidChangeContent(event => symbolIndex.addFile(event.document.uri));
  connection.onNotification(NotificationFromClient.removeFileFromQueue, uri => symbolIndex.removeFile(uri));
  connection.onNotification(NotificationFromClient.addFileToQueue, uri => symbolIndex.addFile(uri));
  connection.onNotification(NotificationFromClient.initQueue, uris => symbolIndex.initFiles(uris));
  connection.onNotification(NotificationFromClient.clearTolkEnvCache, () => tolkSdkMapping.resetCache())

  connection.onCodeAction(params => {
    let document = documents.get(params.textDocument.uri)
    let tree = document ? trees.getParseTree(document) : undefined
    if (params.context.diagnostics.length === 0 || !document || !tree) {
      return []
    }

    let actions = [] as CodeAction[]
    for (let diagnostic of params.context.diagnostics) {
      // data.fixes contains an array of kind, see CollectedDiagnostics
      if (diagnostic.data && Array.isArray(diagnostic.data.fixes)) {
        for (let kind of diagnostic.data.fixes) {
          let qf = findQuickFixByKind(kind)
          if (qf) {
            actions.push(qf.convertToCodeAction(document.uri, tree, diagnostic))
          }
        }
      }
    }
    return actions
  })

  trees.onParseDone(event => {
    depsIndex.invalidateCache(event.document.uri)
    diagnosticsProvider.provideDiagnostics(event.document, event.tree).catch(console.error)
  })

  console.log('Tolk language server is READY');

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      codeActionProvider: true,
      documentSymbolProvider: true,
      definitionProvider: true,
      renameProvider: true,
      hoverProvider: true,
      documentFormattingProvider: true,
      completionProvider: {
        triggerCharacters: ['.']
      },
    }
  }
})

connection.onInitialized(() => {
  for (let handler of lspHandlers) {
    handler.register(connection);
  }
})

connection.listen();
