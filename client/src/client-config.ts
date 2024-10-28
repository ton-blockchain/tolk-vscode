import { defaultConfig, TolkPluginConfigScheme } from "../../server/src/config-scheme";
import * as vscode from "vscode";

let cachedClientConfig: TolkPluginConfigScheme | undefined = undefined

export function getClientConfiguration(): TolkPluginConfigScheme {
  if (cachedClientConfig) {
    return cachedClientConfig
  }

  let obj = {} as { [k in string]: any }
  let w = vscode.workspace.getConfiguration('tolk')
  for (let key in defaultConfig) {
    let value = w.get(key)
    if (value !== undefined) {
      obj[key] = value
    }
  }

  cachedClientConfig = obj as TolkPluginConfigScheme
  return cachedClientConfig
}

export function resetClientConfigCache() {
  cachedClientConfig = undefined
}
