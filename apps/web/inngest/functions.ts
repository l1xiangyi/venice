import '@usevenice/app-config/register.node'
import {backendEnv, contextFactory} from '@usevenice/app-config/backendConfig'
import {env} from '@usevenice/app-config/env'
import type {EndUserId} from '@usevenice/cdk'
import {zEndUserId, zId, zUserId} from '@usevenice/cdk'
import {flatRouter} from '@usevenice/engine-backend'
import {inngest} from '@usevenice/engine-backend/events'
import {getPool, sql} from '../lib-server'
import {serverAnalytics} from '../lib-server/analytics-server'
import {makeSentryClient} from '../lib-server/sentry-client'

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const sentry = makeSentryClient({dsn: env.NEXT_PUBLIC_SENTRY_DSN!})

export const scheduleSyncs = inngest.createFunction(
  {name: 'Schedule pipeline syncs'},
  // Disable scheduling during development, can be explicitly triggered from /api/inngest UI
  process.env.NODE_ENV === 'development'
    ? {event: 'sync/scheduler-debug'}
    : {cron: '0 * * * *'}, // Once an hour, https://crontab.guru/#0_*_*_*_*
  () =>
    sentry.withCheckin(backendEnv.SENTRY_CRON_MONITOR_ID, async (checkinId) => {
      await flatRouter
        .createCaller({
          ...contextFactory.fromViewer({role: 'system'}),
          remoteResourceId: null,
        })
        .ensureDefaultPipelines()

      const pipelines = await contextFactory.config
        .getMetaService({role: 'system'})
        // Every hour
        .findPipelines({secondsSinceLastSync: 1 * 60 * 60})
      console.log(`Found ${pipelines.length} pipelines needing to sync`)

      if (pipelines.length > 0) {
        await inngest.send(
          'sync/pipeline-requested',
          pipelines.map((pipe) => ({data: {pipelineId: pipe.id}})),
        )
        // https://discord.com/channels/842170679536517141/845000011040555018/1068696979284164638
        // We can use the built in de-dupe to ensure that we never schedule two pipeline syncs automatically within an hour...
        console.log(`Scheduled ${pipelines.length} pipeline syncs`)
      }
      return {
        scheduledCount: pipelines.length,
        // For debugging
        sentryCheckinId: checkinId,
        sentryMonitorId: backendEnv.SENTRY_CRON_MONITOR_ID,
      }
    }),
)

export const syncPipeline = inngest.createFunction(
  {name: 'Sync pipeline'},
  {event: 'sync/pipeline-requested'},
  async ({event}) => {
    const {pipelineId} = event.data
    console.log('Will sync pipeline', pipelineId)
    // TODO: Figure out what is the userId we ought to be using...
    // Otherwise connections could be overwritten with the wrong id...
    // This upsert stuff is dangerous...
    await flatRouter
      .createCaller({
        ...contextFactory.fromViewer({role: 'system'}),
        remoteResourceId: null,
      })
      .syncPipeline([pipelineId, {}])
    console.log('did sync pipeline', pipelineId)
    return pipelineId
  },
)

export const syncResource = inngest.createFunction(
  {name: 'Sync resource'},
  {event: 'sync/resource-requested'},
  async ({event}) => {
    try {
      const {resourceId} = event.data
      console.log('Will sync resource', resourceId)
      // TODO: Figure out what is the userId we ought to be using...

      const pool = await getPool()
      const endUserId = await pool.oneFirst<EndUserId>(
        sql`SELECT end_user_id FROM resource WHERE id = ${resourceId}`,
      )
      console.log('endUserId', endUserId)
      await flatRouter
        .createCaller({
          ...contextFactory.fromViewer({role: 'system'}),
          remoteResourceId: null,
        })
        .syncResource([resourceId, {}])

      console.log('did sync pipeline', resourceId)
      return resourceId
    } catch (err) {
      console.error('Error running syncResource', err)
      throw err
    }
  },
)

export const handleWebhook = inngest.createFunction(
  'Handle webhook',
  'webhook/received',
  async ({event: {data}}) => {
    if (data.path.startsWith('database')) {
      console.log('handle database event', data)
      await handleDatabaseWebhook(data.body as any)
    } else if (data.path.startsWith('connector/')) {
      // TODO: handle me right
      console.log('handle connector event', data.path)
    } else {
      console.warn('Unexpected webhook received', data)
    }
  },
)

interface InsertPayload {
  type: 'INSERT'
  table: string
  schema: string
  record: Record<string, unknown> // TableRecord<T>
  old_record: null
}
interface UpdatePayload {
  type: 'UPDATE'
  table: string
  schema: string
  record: Record<string, unknown> // TableRecord<T>
  old_record: Record<string, unknown> // TableRecord<T>
}
interface DeletePayload {
  type: 'DELETE'
  table: string
  schema: string
  record: null
  old_record: Record<string, unknown> // TableRecord<T>
}
type ChangePayload = InsertPayload | UpdatePayload | DeletePayload

async function handleDatabaseWebhook(c: ChangePayload) {
  // Consider using pattern matching for this, assuming does not impact ts perf too muach
  if (c.schema === 'auth' && c.table === 'users') {
    if (c.type === 'INSERT') {
      serverAnalytics.track(zUserId.parse(c.record['id']), {
        name: 'db/user-created',
        data: {},
      })
    } else if (c.type === 'DELETE') {
      serverAnalytics.track(zUserId.parse(c.old_record['id']), {
        name: 'db/user-deleted',
        data: {},
      })
    }
  } else if (c.schema === 'public' && c.table === 'resource') {
    // Ignore postgres events for now...
    if (c.type === 'INSERT' && c.record['provider_name'] !== 'postgres') {
      serverAnalytics.track(zEndUserId.parse(c.record['end_user_id']), {
        name: 'db/resource-created',
        data: {resourceId: zId('reso').parse(c.record['id'])},
      })
    } else if (c.type === 'DELETE') {
      serverAnalytics.track(zEndUserId.parse(c.old_record['end_user_id']), {
        name: 'db/resource-deleted',
        data: {resourceId: zId('reso').parse(c.old_record['id'])},
      })
    }
  }
  await serverAnalytics.flush()
}
