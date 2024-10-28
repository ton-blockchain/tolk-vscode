import * as vscode from "vscode";
import * as child_process from "child_process";
import * as path from "path";
import { TolkCompilerSDK, TolkPluginConfigScheme } from "../../server/src/config-scheme";
import { consoleError, consoleLog } from "./client-log";
import { CustomCommands } from "../../server/src/shared-msgtypes";

/*
  This module is responsible for auto-detecting Tolk SDK (compiler version and stdlib folder) in a project.
  Note, that detection is done here (on a client-side), since a client has access to the host file system.
  When a .tolk file is opened, a server needs to know its TolkCompilerSDK (tolkSdk)
to correctly provide diagnostics. For instance, it needs to locate stdlib to resolve existing symbols.
  Therefore, a server sends a request which is handled by a client.
  Theoretically, we might add support for multi-versioning (e.g. file1.tolk and file2.tolk
are written using different Tolk versions, therefore use different stdlib, etc.),
but currently it's not supported neither by blueprint nor by current lsp implementation.
Hence, tolkSdk is calculated (and cached) for a whole workspace (but still requested for every opened file).
  TolkCompilerSDK can either be detected automatically:
  * looking for tolk-js in node_modules
  * looking at default system paths
  or set by the user in settings manually.
  If a user opens a .tolk file outside any workspace, tolkSdk is not detected, server diagnostics are off.
 */

let clientCacheOfTolkSdk: Map<vscode.WorkspaceFolder, TolkCompilerSDK | null> = new Map()

async function isStdlibFolderValid(stdlibFolder: string): Promise<boolean> {
  try {
    let stdlibUri = vscode.Uri.file(stdlibFolder + '/common.tolk')
    let fsStat = await vscode.workspace.fs.stat(stdlibUri)
    return fsStat.type === vscode.FileType.File && fsStat.size < 1024 * 1024
  } catch {
    return false
  }
}

async function detectSdkFromManualSettings(tolkCompilerVersion: string, stdlibFolder: string): Promise<TolkCompilerSDK | null> {
  if (tolkCompilerVersion.trim() === '' || stdlibFolder.trim() === '') {
    return null
  }
  if (!await isStdlibFolderValid(stdlibFolder)) {
    return null
  }

  return {
    detectedMethod: 'manual-setting',
    tolkCompilerVersion: tolkCompilerVersion,
    stdlibFolder: stdlibFolder
  }
}

async function detectSdkFromNodeModules(workspaceFolder: vscode.WorkspaceFolder): Promise<TolkCompilerSDK | null> {
  try {
    let tolkJsFolder = workspaceFolder.uri.fsPath + '/node_modules/@ton/tolk-js'
    let packageJsonBinary = await vscode.workspace.fs.readFile(vscode.Uri.file(tolkJsFolder + '/package.json'))

    let packageJson = JSON.parse(packageJsonBinary.toString())
    if (!packageJson || typeof packageJson['version'] !== 'string')
      return null

    return {
      detectedMethod: 'node_modules',
      tolkCompilerVersion: packageJson['version'],
      stdlibFolder: tolkJsFolder + '/dist/tolk-stdlib'
    }
  } catch {
    return null
  }
}

async function detectSdkFromInstalledIntoSystem(): Promise<TolkCompilerSDK | null> {
  const KNOWN_PLATFORMS: { [platform in string]: [string, string][] } = {
    'linux': [
      ['/usr/bin/tolk', '../share/ton/smartcont/tolk-stdlib'],
    ],
    'darwin': [
      ['/opt/homebrew/bin/tolk', '../share/ton/ton/smartcont/tolk-stdlib'],
      ['/usr/local/bin/tolk', '../share/ton/ton/smartcont/tolk-stdlib'],
    ],
    'win32': [
      ['C:\\ProgramData\\chocolatey\\lib\\ton\\bin\\tolk.exe', 'smartcont/tolk-stdlib'],
    ],
  }

  for (const [compilerBinaryPath, relativeStdlibFolder] of KNOWN_PLATFORMS[process.platform] || []) {
    let stdlibFolder = path.join(path.dirname(compilerBinaryPath), relativeStdlibFolder)
    let result = child_process.spawnSync(compilerBinaryPath, ['-v'])
    let stdout = result.status === 0 && result.stdout.toString()
    let match = stdout.toString().match(/Tolk compiler v([\d.]+)/)
    if (match && match[1] && await isStdlibFolderValid(stdlibFolder)) {
      return {
        detectedMethod: 'system-path',
        tolkCompilerVersion: match[1],
        stdlibFolder: stdlibFolder
      }
    }
  }

  return null
}

// the main exported function: detect tolkSdk for a workspace
export async function getOrDetectTolkSdk(config: TolkPluginConfigScheme, workspaceFolder: vscode.WorkspaceFolder, showErrorOnFail: boolean): Promise<TolkCompilerSDK | null> {
  const cached = clientCacheOfTolkSdk.get(workspaceFolder)
  if (cached !== undefined) {
    return cached
  }

  let tolkSdk: TolkCompilerSDK | null

  if (!config.autoDetectSDK) {
    tolkSdk = await detectSdkFromManualSettings(config.manualSDKSettings.tolkCompilerVersion, config.manualSDKSettings.stdlibFolder)
    if (!tolkSdk && showErrorOnFail) {
      let choice = await vscode.window.showErrorMessage(`Manual settings for Tolk SDK are incorrect`, 'Open settings...')
      if (choice === 'Open settings...') {
        vscode.commands.executeCommand(CustomCommands.openExtensionSettings)
      }
    }

  } else {
    tolkSdk = await detectSdkFromNodeModules(workspaceFolder)
    if (!tolkSdk) {
      tolkSdk = await detectSdkFromInstalledIntoSystem()
    }
    if (!tolkSdk && showErrorOnFail) {
      let choice = await vscode.window.showErrorMessage(`Tolk auto-detection failed (looked at node_modules and default system paths). Diagnostics will be disabled`, 'Open settings...')
      if (choice === 'Open settings...') {
        vscode.commands.executeCommand(CustomCommands.openExtensionSettings)
      }
    }
  }

  if (tolkSdk) {
    consoleLog(`tolkSdk for ${workspaceFolder.name}: ${tolkSdk.tolkCompilerVersion} (via ${tolkSdk.detectedMethod})`)
  } else {
    consoleLog(`tolkSdk for ${workspaceFolder.name} can't be detected`)
  }

  clientCacheOfTolkSdk.set(workspaceFolder, tolkSdk)  // if tolkSdk == null, also cache it
  return tolkSdk
}

export function resetClientTolkSdkCache() {
  clientCacheOfTolkSdk = new Map()
}

export async function handleCommand_showTolkSdk(config: TolkPluginConfigScheme) {
  let workspaceFolders = vscode.workspace.workspaceFolders
  if (!workspaceFolders) {
    vscode.window.showWarningMessage(`No workspace is opened. Tolk SDK can be detected (and configured) inside workspaces.`)
    return
  }

  for (let workspaceFolder of workspaceFolders) {
    let tolkSdk = await getOrDetectTolkSdk(config, workspaceFolder, false)
    let messageText = tolkSdk
      ? `Tolk v${tolkSdk.tolkCompilerVersion} (via ${tolkSdk.detectedMethod}) for ${workspaceFolder.name}`
      : config.autoDetectSDK
        ? `Tolk SDK auto-detection failed (looked at node_modules and default system paths)`
        : `Tolk SDK auto-detection turned off, but manual settings are incorrect`
    let availableChoices = config.autoDetectSDK
      ? ['Re-detect automatically', 'Configure manually...']
      : ['Configure manually...']

    let choice = tolkSdk
      ? await vscode.window.showInformationMessage(messageText, ...availableChoices)
      : await vscode.window.showErrorMessage(messageText, ...availableChoices)
    if (choice === 'Re-detect automatically') {
      vscode.commands.executeCommand(CustomCommands.detectTolkSdk)
    }
    if (choice === 'Configure manually...') {
      vscode.commands.executeCommand(CustomCommands.openExtensionSettings)
    }
  }
}
