import type {ResourceUpdate} from '@usevenice/cdk-core'
import {
  extractId,
  makeId,
  zConnectOptions,
  zId,
  zPostConnectOptions,
  zRaw,
} from '@usevenice/cdk-core'
import {joinPath, makeUlid, z} from '@usevenice/util'

import {inngest} from '../events'
import {parseWebhookRequest} from '../parseWebhookRequest'
import {protectedProcedure, trpc} from './_base'

export {type inferProcedureInput} from '@trpc/server'

/** TODO: Modify this so that admin user can execute it... not just endUser */
export const endUserRouter = trpc.router({
  // MARK: - Connect
  preConnect: protectedProcedure
    .input(z.tuple([zId('int'), zConnectOptions, z.unknown()]))
    // Consider using sessionId, so preConnect corresponds 1:1 with postConnect
    .query(
      async ({
        input: [intId, {resourceExternalId, ...connCtxInput}, preConnInput],
        ctx,
      }) => {
        const int = await ctx.asOrgIfNeeded.getIntegrationOrFail(intId)
        if (!int.provider.preConnect) {
          return null
        }
        const reso = resourceExternalId
          ? await ctx.helpers.getResourceOrFail(
              makeId('reso', int.provider.name, resourceExternalId),
            )
          : undefined
        return int.provider.preConnect?.(
          int.config,
          {
            ...connCtxInput,
            extEndUserId: ctx.extEndUserId,
            resource: reso
              ? // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                {externalId: resourceExternalId!, settings: reso.settings}
              : undefined,
            webhookBaseUrl: joinPath(
              ctx.apiUrl,
              parseWebhookRequest.pathOf(int.id),
            ),
            redirectUrl: ctx.getRedirectUrl?.(int, {
              endUserId:
                ctx.viewer.role === 'end_user' ? ctx.viewer.endUserId : null,
            }),
          },
          preConnInput,
        )
      },
    ),
  // useConnectHook happens client side only
  // for cli usage, can just call `postConnect` directly. Consider making the
  // flow a bit smoother with a guided cli flow
  postConnect: protectedProcedure
    .input(z.tuple([z.unknown(), zId('int'), zPostConnectOptions]))
    // Questionable why `zConnectContextInput` should be there. Examine whether this is actually
    // needed
    // How do we verify that the userId here is the same as the userId from preConnectOption?

    .mutation(
      async ({
        input: [input, intId, {resourceExternalId, ...connCtxInput}],
        ctx,
      }) => {
        const int = await ctx.asOrgIfNeeded.getIntegrationOrFail(intId)
        console.log('didConnect start', int.provider.name, input, connCtxInput)

        const resoUpdate = await (async () => {
          if (
            !int.provider.postConnect &&
            int.provider.metadata?.nangoProvider
          ) {
            const {connectionId: resoId} = z
              .object({
                providerConfigKey: z.string(),
                connectionId: zId('reso'),
              })
              .parse(input)
            const result = await ctx.nango.get('/connection/{connectionId}', {
              path: {connectionId: resoId},
              query: {provider_config_key: intId, refresh_token: true},
            })

            return {
              resourceExternalId: extractId(resoId)[2],
              settings: {
                nango: result,
                accessToken: result.credentials.access_token,
                accessTokenExpiresAt: result.credentials.expires_at,
                refreshToken: result.credentials.raw.refresh_token,
                realmId: result.connection_config['realmId'],
              },
            } satisfies Omit<ResourceUpdate<any, any>, 'endUserId'>
          }

          if (!int.provider.postConnect || !int.provider.def.connectOutput) {
            return null
          }

          const reso = resourceExternalId
            ? await ctx.helpers.getResourceOrFail(
                makeId('reso', int.provider.name, resourceExternalId),
              )
            : undefined
          return await int.provider.postConnect(
            int.provider.def.connectOutput.parse(input),
            int.config,
            {
              ...connCtxInput,
              extEndUserId: ctx.extEndUserId,
              resource: reso
                ? // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                  {externalId: resourceExternalId!, settings: reso.settings}
                : undefined,
              webhookBaseUrl: joinPath(
                ctx.apiUrl,
                parseWebhookRequest.pathOf(int.id),
              ),
              redirectUrl: ctx.getRedirectUrl?.(int, {
                endUserId:
                  ctx.viewer.role === 'end_user' ? ctx.viewer.endUserId : null,
              }),
            },
          )
        })()

        if (!resoUpdate) {
          return 'Noop'
        }

        const syncInBackground =
          resoUpdate.triggerDefaultSync && !connCtxInput.syncInBand
        const resourceId = await ctx.asOrgIfNeeded._syncResourceUpdate(int, {
          ...resoUpdate,
          // No need for each integration to worry about this, unlike in the case of handleWebhook.
          endUserId:
            ctx.viewer.role === 'end_user' ? ctx.viewer.endUserId : null,
          triggerDefaultSync:
            !syncInBackground && resoUpdate.triggerDefaultSync,
        })

        await inngest.send('connect/resource-connected', {data: {resourceId}})

        if (syncInBackground) {
          await inngest.send('sync/resource-requested', {data: {resourceId}})
        }
        console.log('didConnect finish', int.provider.name, input)
        return 'Resource successfully connected'
      },
    ),
  createResource: protectedProcedure
    .input(zRaw.resource.pick({integrationId: true, settings: true}))
    // Questionable why `zConnectContextInput` should be there. Examine whether this is actually
    // needed
    // How do we verify that the userId here is the same as the userId from preConnectOption?

    .mutation(async ({input: {integrationId, settings}, ctx}) => {
      // Authorization
      await ctx.helpers.getIntegrationInfoOrFail(integrationId)

      // Escalate to now have enough pemission to sync
      const int = await ctx.asOrgIfNeeded.getIntegrationOrFail(integrationId)

      const _extId = makeUlid()
      const resoId = makeId('reso', int.provider.name, _extId)

      // Should throw if not working..
      const resoUpdate = {
        triggerDefaultSync: false,
        // TODO: Should no longer depend on external ID
        resourceExternalId: _extId,
        settings,
        ...(await int.provider.checkResource?.({
          config: int.config,
          settings,
          context: {webhookBaseUrl: ''},
          options: {},
        })),
        // TODO: Fix me up
        endUserId: ctx.viewer.role === 'end_user' ? ctx.viewer.endUserId : null,
      } satisfies ResourceUpdate
      await ctx.asOrgIfNeeded._syncResourceUpdate(int, resoUpdate)
      return resoId
    }),

  // TODO: Run server-side validation
  updateResource: protectedProcedure
    .input(zRaw.resource.pick({id: true, settings: true, displayName: true}))
    .mutation(async ({input: {id, ...input}, ctx}) =>
      // TODO: Run mapStandardResource after editing
      // Also we probably do not want deeply nested patch
      // shallow is sufficient more most situations
      ctx.helpers.patchReturning('resource', id, input),
    ),
  deleteResoruce: protectedProcedure
    .input(zRaw.resource.pick({id: true}))
    .mutation(async ({input: {id}, ctx}) =>
      ctx.helpers.metaService.tables.resource.delete(id),
    ),
})
