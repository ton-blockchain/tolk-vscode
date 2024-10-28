import * as vscode from 'vscode';
import * as path from 'path';
import { Utils as vscode_uri } from 'vscode-uri';
import {
  LanguageClient,
  LanguageClientOptions,
  RevealOutputChannelOn,
  ServerOptions,
  TransportKind
} from 'vscode-languageclient/node';
import { TextEncoder } from 'util';
import { resetClientTolkSdkCache, getOrDetectTolkSdk, handleCommand_showTolkSdk } from "./tolk-sdk-detect";
import { consoleError, consoleLog, consoleWarn, createClientLog } from "./client-log";
import { CustomCommands, NotificationFromClient, RequestFromServer, NotificationFromServer } from "../../server/src/shared-msgtypes";
import { getClientConfiguration, resetClientConfigCache } from "./client-config";


let client: LanguageClient;


export function activate(context: vscode.ExtensionContext) {
  vscode.commands.registerCommand(CustomCommands.copyToClipboard, (str: string) => {
    vscode.env.clipboard.writeText(str);
    vscode.window.showInformationMessage(`Copied ${str} to clipboard`);
  })
  vscode.commands.registerCommand(CustomCommands.showTolkSdk, () => {
    handleCommand_showTolkSdk(getClientConfiguration()).catch(consoleError)
  })
  vscode.commands.registerCommand(CustomCommands.openExtensionSettings, () => {
    vscode.commands.executeCommand('workbench.action.openSettings', '@ext:ton.tolk-vscode')
  })
  vscode.commands.registerCommand(CustomCommands.detectTolkSdk, () => {
    resetClientTolkSdkCache()
    client.sendNotification(NotificationFromClient.clearTolkEnvCache)
    vscode.commands.executeCommand(CustomCommands.showTolkSdk)
  })

  startServer(context).catch(consoleError)
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}


async function startServer(context: vscode.ExtensionContext): Promise<vscode.Disposable> {
  const disposables: vscode.Disposable[] = [];

  const clientOptions: LanguageClientOptions = {
    outputChannel: createClientLog(),
    revealOutputChannelOn: RevealOutputChannelOn.Never,
    documentSelector: [{ scheme: 'file', language: 'tolk' }],
    initializationOptions: {
      clientConfig: getClientConfiguration(),
      treeSitterWasmUri: vscode_uri.joinPath(context.extensionUri, './dist/tree-sitter.wasm').fsPath,
      langWasmUri: vscode_uri.joinPath(context.extensionUri, './dist/tree-sitter-tolk.wasm').fsPath,
    }
  };

  const serverModule = context.asAbsolutePath(
    path.join('dist', 'server.js')
  );

  const serverOptions: ServerOptions = {
    run: {
      module: serverModule,
      transport: TransportKind.ipc
    },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ['--nolazy', '--inspect=6009'] }	// same port as in .vscode/launch.json
    }
  };
  client = new LanguageClient(
    'tolkServer',
    'Tolk Language Server',
    serverOptions,
    clientOptions
  );

  await client.start();

  client.onRequest(RequestFromServer.fileReadContents, async raw => {
    const uri = vscode.Uri.parse(raw);

    if (uri.scheme === 'vscode-notebook-cell') {
      // we are dealing with a notebook
      try {
        const doc = await vscode.workspace.openTextDocument(uri);
        return new TextEncoder().encode(doc.getText());
      } catch (err) {
        consoleWarn(err);
        return { type: 'not-found' };
      }
    }

    if (vscode.workspace.fs.isWritableFileSystem(uri.scheme) === undefined) {
      // undefined means we don't know anything about these uris
      return { type: 'not-found' };
    }

    let data: Uint8Array;
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.size > 1024 ** 2) {
        consoleWarn(`IGNORING "${uri.toString()}" because it is too large (${stat.size}bytes)`);
        data = Buffer.from(new Uint8Array());
      } else {
        data = await vscode.workspace.fs.readFile(uri);
      }
      return data;
    } catch (err) {
      if (err instanceof vscode.FileSystemError) {
        return { type: 'not-found' };
      }
      // graceful
      consoleWarn(err);
      return { type: 'not-found' };
    }
  });

  client.onRequest(RequestFromServer.completionMatchingFiles, async (raw: { pathPrefix: string, uri: string }) => {
    const uri = vscode.Uri.parse(raw.uri);
    let searchDirName = vscode_uri.joinPath(uri, '..', raw.pathPrefix, (raw.pathPrefix.trim().length === 0 || raw.pathPrefix.endsWith(path.sep)) ? '' : '..');
    let toSearch = raw.pathPrefix.split(path.sep).pop() ?? '';

    try {
      let files = await vscode.workspace.fs.readDirectory(searchDirName);
      return files
        .filter(([path, type]) => {
          if (path === toSearch) return false;

          return path.startsWith(toSearch) && (type !== vscode.FileType.File || path.endsWith('.tolk'));
        })
        .map(([segment, type]) => {
          if (type === vscode.FileType.Directory) {
            return segment + path.sep;
          }
          return segment;
        });
    } catch {
      return [];
    }
  });

  client.onRequest(RequestFromServer.detectSdkForFile, (documentUri: string) => {
    let uri = vscode.Uri.parse(documentUri)
    let workspaceFolder = vscode.workspace.getWorkspaceFolder(uri)
    if (!workspaceFolder) {
      consoleLog(`${documentUri} opened outside workspace, don't detect env`)
      return null
    }
    return getOrDetectTolkSdk(getClientConfiguration(), workspaceFolder, true)
  })

  client.onNotification(NotificationFromServer.showErrorMessage, (errTxt: string) => {
    vscode.window.showErrorMessage(errTxt)
  })

  // notify at configuration change
  vscode.workspace.onDidChangeConfiguration((change) => {
    if (change.affectsConfiguration('tolk')) {
      resetClientConfigCache()
      resetClientTolkSdkCache()
      client.sendNotification(NotificationFromClient.onConfigurationChanged, getClientConfiguration())
      // force diagnostics from server, since changed settings might affect diagnostics calculation
      for (const document of vscode.workspace.textDocuments) {
        if (document.uri.fsPath.endsWith('.tolk')) {
          client.sendNotification(NotificationFromClient.forceUpdateDiagnostics, document.uri.toString())
        }
      }
    }
  })

  const langPattern = `**/*.tolk`;
  const watcher = vscode.workspace.createFileSystemWatcher(langPattern);
  disposables.push(watcher);

  // file discover and watching. in addition to text documents we annouce and provide
  // all matching files

  // workaround for https://github.com/microsoft/vscode/issues/48674
  const exclude = `{${[
    ...Object.keys(vscode.workspace.getConfiguration('search', null).get('exclude') ?? {}),
    ...Object.keys(vscode.workspace.getConfiguration('files', null).get('exclude') ?? {}),
    "**/node_modules"
  ].join(',')}}`;

  const init = async () => {
    let all = await vscode.workspace.findFiles(langPattern, exclude);

    const uris = all.slice(0, 500);
    consoleLog(`USING ${uris.length} of ${all.length} files for ${langPattern}`);

    await client.sendNotification(NotificationFromClient.initQueue, uris.map(String));
  };

  const initCancel = new Promise<void>(resolve => disposables.push(new vscode.Disposable(resolve)));
  vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: '[Tolk] Building Index...' }, () => Promise.race([init(), initCancel]));

  disposables.push(watcher.onDidCreate(uri => {
    client.sendNotification(NotificationFromClient.addFileToQueue, uri.toString());
  }));
  disposables.push(watcher.onDidDelete(uri => {
    client.sendNotification(NotificationFromClient.removeFileFromQueue, uri.toString());
    client.sendNotification(NotificationFromClient.removeFileFromFileCache, uri.toString());
  }));
  disposables.push(watcher.onDidChange(uri => {
    client.sendNotification(NotificationFromClient.addFileToQueue, uri.toString());
    client.sendNotification(NotificationFromClient.removeFileFromFileCache, uri.toString());
  }));

  return new vscode.Disposable(() => disposables.forEach(d => d.dispose()));
}
