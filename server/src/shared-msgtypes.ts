// this file is shared between a client and a server, don't import anything
// it contains constants for sendNotification(), sendRequest() and other types
// (to provide 'find usages' instead of plain text search for names)

export enum NotificationFromClient {
  initQueue = 'queue/init',
  addFileToQueue = 'queue/add',
  removeFileFromQueue = 'queue/remove',
  removeFileFromFileCache = 'file-cache/remove',
  clearTolkEnvCache = 'tolk/clearEnvCache',
  onConfigurationChanged = 'configuration/change',
  forceUpdateDiagnostics = 'tolk/updateDiagnostics'
}

export enum NotificationFromServer {
  showErrorMessage = 'tolk/showErrorMessage'
}

export enum RequestFromServer {
  detectSdkForFile = 'tolk/detectSdkForFile',
  completionMatchingFiles = 'completion/matching-files',
  fileReadContents = 'file/read',
}

export enum CustomCommands {
  copyToClipboard = 'tolk.copyToClipboard',
  showTolkSdk = 'tolk.showTolkSdk',
  detectTolkSdk = 'tolk.detectTolkSdk',
  openExtensionSettings = 'tolk.openSettings',
}
