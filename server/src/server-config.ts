import { defaultConfig, TolkPluginConfigScheme } from './config-scheme';

// initialize config variable to defaults; on server start, actual config will be passed from a client
export const config = defaultConfig

export function mutateConfig(next: TolkPluginConfigScheme) {
  Object.assign(config, next)
}
