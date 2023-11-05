import type {
  AnyEntityPayload,
  Destination,
  Id,
  Link,
  MetaService,
  ResourceUpdate,
  Source,
} from '@usevenice/cdk-core'
import {logLink, makeId, sync} from '@usevenice/cdk-core'
import type {EntityPayloadWithExternal} from '@usevenice/cdk-ledger'
import {
  addRemainderByDateLink,
  mapAccountNameAndTypeLink,
  mapStandardEntityLink,
} from '@usevenice/cdk-ledger'
import type {z} from '@usevenice/util'
import {R, Rx, rxjs} from '@usevenice/util'

import type {makeMetaLinks} from './makeMetaLinks'
import type {_Integration, _PipelineExpanded, makeDBService} from './services'
import type {zSyncOptions} from './types'

export function makeSyncService({
  metaLinks,
  metaService,
  getPipelineExpandedOrFail,
}: {
  metaService: MetaService
  metaLinks: ReturnType<typeof makeMetaLinks>
  getPipelineExpandedOrFail: ReturnType<
    typeof makeDBService
  >['getPipelineExpandedOrFail']
}) {
  // NOTE: 1) avoid roundtrip to db 2) Bring back getDefaultPipeline (https://share.cleanshot.com/ly1Xwts5) somehow
  const getPipelinesForResource = (resoId: Id['reso']) =>
    metaService
      .findPipelines({resourceIds: [resoId]})
      .then((pipes) =>
        Promise.all(pipes.map((pipe) => getPipelineExpandedOrFail(pipe.id))),
      )

  // NOTE: Stop the hard-coding some point!
  // - Integration metadata should be able to specify the set of transformations desired
  // - Integration config should additionally be able to specify transformations!
  // Integrations shall include `config`.
  // In contrast, resource shall include `external`
  // We do need to figure out which secrets to tokenize and which one not to though
  // Perhaps the best way is to use `secret_` prefix? (think how we might work with vgs)
  const getLinksForPipeline = ({
    source,
    links,
    destination,
  }: _PipelineExpanded): Link[] => {
    // console.log('getLinksForPipeline', {source, links, destination})
    if (destination.integration.provider.name === 'beancount') {
      return [
        ...links,
        mapStandardEntityLink(source),
        addRemainderByDateLink as Link, // What about just the addRemainder plugin?
        // renameAccountLink({
        //   Ramp: 'Ramp/Posted',
        //   'Apple Card': 'Apple Card/Posted',
        // }),
        mapAccountNameAndTypeLink() as Link,
        logLink({prefix: 'preDest', verbose: true}),
      ]
    }
    if (destination.integration.provider.name === 'alka') {
      return [
        ...links,
        // logLink({prefix: 'preMap'}),
        mapStandardEntityLink(source),
        // prefixIdLink(src.provider.name),
        logLink({prefix: 'preDest'}),
      ]
    }
    if (source.integration.provider.name === 'postgres') {
      return [...links, logLink({prefix: 'preDest'})]
    }
    return [
      ...links,
      // logLink({prefix: 'preMapStandard', verbose: true}),
      mapStandardEntityLink(source),
      Rx.map((op) =>
        op.type === 'data' &&
        destination.integration.provider.name !== 'postgres'
          ? R.identity({
              ...op,
              data: {
                ...op.data,
                entity: {
                  standard: op.data.entity,
                  external: (op.data as EntityPayloadWithExternal).external,
                },
              },
            })
          : op,
      ),
      logLink({prefix: 'preDest'}),
    ]
  }
  const _syncPipeline = async (
    pipeline: _PipelineExpanded,
    opts: z.infer<typeof zSyncOptions> & {
      source$?: Source<AnyEntityPayload>
      /**
       * Trigger the default sourceSync after source$ exhausts
       * TODO: #inngestMe This is where we can fire off a request to syncPipeline so it happens async
       */
      source$ConcatDefault?: boolean
      destination$$?: Destination
    } = {},
  ) => {
    console.log('[syncPipeline]', pipeline)
    const {source: src, links, destination: dest, watch, ...pipe} = pipeline
    // TODO: Should we introduce endUserId onto the pipeline itself?
    const endUserId = src.endUserId ?? dest.endUserId
    const endUser = endUserId ? {id: endUserId} : null

    const defaultSource$ = () =>
      src.integration.provider.sourceSync?.({
        endUser,
        config: src.integration.config,
        settings: src.settings,
        // Maybe we should rename `options` to `state`?
        // Should also make the distinction between `config`, `settings` and `state` much more clear.
        // Undefined causes crash in Plaid provider due to destructuring, Think about how to fix it for reals
        state: opts.fullResync ? {} : pipe.sourceState,
      })

    const source$ = opts.source$
      ? opts.source$ConcatDefault
        ? rxjs.concat(opts.source$, defaultSource$() ?? rxjs.EMPTY)
        : opts.source$
      : defaultSource$()

    const destination$$ =
      opts.destination$$ ??
      dest.integration.provider.destinationSync?.({
        endUser,
        config: dest.integration.config,
        settings: dest.settings,
        // Undefined causes crash in Plaid provider due to destructuring, Think about how to fix it for reals
        state: opts.fullResync ? {} : pipe.destinationState,
      })

    if (!source$) {
      throw new Error(`${src.integration.provider.name} missing source`)
    }
    if (!destination$$) {
      throw new Error(`${dest.integration.provider.name} missing destination`)
    }
    await metaLinks
      .handlers({pipeline})
      .stateUpdate({type: 'stateUpdate', subtype: 'init'})
    await sync({
      // Raw Source, may come from fs, firestore or postgres
      source: source$.pipe(
        // logLink({prefix: 'postSource', verbose: true}),
        metaLinks.postSource({src}),
      ),
      links: getLinksForPipeline?.(pipeline), // ?? links,
      // WARNING: It is insanely unclear to me why moving `metaLinks.link`
      // to after provider.destinationSync makes all the difference.
      // When syncing from firebase with a large number of docs,
      // we always seem to stop after 1600 or so documents.
      // I already checked this is because metaLinks.link runs a async comment
      // even delay(100) introduces issues.
      // It's worth trying to reproduce this with say a simple counter source and see if
      // it happens...
      destination: rxjs.pipe(
        destination$$,
        metaLinks.postDestination({pipeline, dest}),
      ),
      watch,
    }).finally(() =>
      metaLinks
        .handlers({pipeline})
        .stateUpdate({type: 'stateUpdate', subtype: 'complete'}),
    )
  }

  const _syncResourceUpdate = async (
    int: _Integration,
    {
      endUserId: userId,
      settings,
      institution,
      ...resoUpdate
    }: ResourceUpdate<AnyEntityPayload, {}>,
  ) => {
    console.log('[_syncResourceUpdate]', int.id, {
      userId,
      settings,
      institution,
      ...resoUpdate,
    })
    const id = makeId('reso', int.provider.name, resoUpdate.resourceExternalId)
    await metaLinks
      .handlers({resource: {id, integrationId: int.id, endUserId: userId}})
      .resoUpdate({type: 'resoUpdate', id, settings, institution})

    // TODO: This should be happening async
    if (!resoUpdate.source$ && !resoUpdate.triggerDefaultSync) {
      console.log(
        '[_syncResourceUpdate] Returning early skip syncing pipelines',
      )
      return id
    }

    const pipelines = await getPipelinesForResource(id)

    console.log('_syncResourceUpdate existingPipes.len', pipelines.length)
    await Promise.all(
      pipelines.map(async (pipe) => {
        await _syncPipeline(pipe, {
          source$: resoUpdate.source$,
          source$ConcatDefault: resoUpdate.triggerDefaultSync,
        })
      }),
    )
    return id
  }

  return {_syncPipeline, _syncResourceUpdate}
}
