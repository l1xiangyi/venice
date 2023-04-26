import type {Id, WebhookInput} from '@usevenice/cdk-core'
import type {NonEmptyArray} from '@usevenice/util'

import type {AnySyncRouterInput} from './zdeprecated_makeSyncEngine'

const kWebhook = 'webhook' as const

/** Do we also need a parseWebhookResponse? To allow setting headers, redirects and others? */
export function parseWebhookRequest(
  req: WebhookInput & {pathSegments: NonEmptyArray<string>; method?: string},
) {
  const [procedure, intId] = req.pathSegments
  if (procedure !== kWebhook) {
    return {...req, procedure}
  }

  // Consider naming it integrationId? not sure.
  const input: AnySyncRouterInput['handleWebhook'] = [
    intId!,
    {query: req.query, headers: req.headers, body: req.body},
  ]
  return {
    ...req,
    procedure: 'handleWebhook',
    // Need to stringify because of getRawProcedureInputOrThrow
    ...(req.method?.toUpperCase() === 'GET'
      ? {query: {...req.query, input: JSON.stringify(input)}}
      : {body: input}),
  }
}
parseWebhookRequest.isWebhook = (pathSegments: NonEmptyArray<string>) =>
  pathSegments[0] === kWebhook

parseWebhookRequest.pathOf = (intId: Id['int']) => [kWebhook, intId].join('/')
