import {
  createConnection,
  ProposedFeatures,
  Connection
} from 'vscode-languageserver/node';


export const connection = createConnection(ProposedFeatures.all);

export interface ILspHandler {
  register(connection: Connection): void
}
