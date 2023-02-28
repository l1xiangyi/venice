import '@usevenice/app-config/register.node'

import {
  backendEnv,
  veniceBackendConfig,
  veniceRouter,
} from '@usevenice/app-config/backendConfig'
import {commonEnv} from '@usevenice/app-config/commonConfig'
import type {UserId} from '@usevenice/cdk-core'
import {zId, zUserId} from '@usevenice/cdk-core'
import {inngest} from '@usevenice/engine-backend/events'
import {makeSentryClient} from '../lib/makeSentryClient'
import {serverAnalytics} from '../lib/server-analytics'
import {ensureDefaultLedger, getPool, sql} from '../server'

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const sentry = makeSentryClient({dsn: commonEnv.NEXT_PUBLIC_SENTRY_DSN!})

export const scheduleSyncs = inngest.createFunction(
  {name: 'Schedule pipeline syncs'},
  // Disable scheduling during development, can be explicitly triggered from /api/inngest UI
  process.env.NODE_ENV === 'development'
    ? {event: 'debug/schedule-pipeline-syncs'}
    : {cron: '* * * * *'},
  () =>
    sentry.withCheckin(backendEnv.SENTRY_CRON_MONITOR_ID, async (checkinId) => {
      const pipelines = await veniceBackendConfig.metaService.findPipelines({
        secondsSinceLastSync: 1 * 60 * 60, // Every hour
      })
      console.log(`Found ${pipelines.length} pipelines needing to sync`)
      if (pipelines.length > 0) {
        await inngest.send(
          'pipeline/sync-requested',
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
  {event: 'pipeline/sync-requested'},
  async ({event}) => {
    const {pipelineId} = event.data
    console.log('Will sync pipeline', pipelineId)
    // TODO: Figure out what is the userId we ought to be using...
    // Otherwise connections could be overwritten with the wrong id...
    // This upsert stuff is dangerous...
    await veniceRouter
      .createCaller({isAdmin: true, userId: 'usr_TASK_NOOP' as UserId})
      .syncPipeline([{id: pipelineId}, {}])
    console.log('did sync pipeline', pipelineId)
    return pipelineId
  },
)

export const syncResource = inngest.createFunction(
  {name: 'Sync resource'},
  {event: 'resource/sync-requested'},
  async ({event}) => {
    try {
      const {resourceId} = event.data
      console.log('Will sync resource', resourceId)
      // TODO: Figure out what is the userId we ought to be using...

      const pool = await getPool()
      const creatorId = await pool.oneFirst<UserId>(
        sql`SELECT creator_id FROM resource WHERE id = ${resourceId}`,
      )
      console.log('creatorId', creatorId)
      const [ledgerId] = await ensureDefaultLedger(creatorId)
      await veniceRouter
        .createCaller({userId: creatorId})
        .syncResource([
          {id: resourceId as never},
          {connectWith: {destinationId: ledgerId}},
        ])

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
    } else if (data.path.startsWith('integration/')) {
      console.log('handle integration event', data.path)
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
        name: 'user/created',
        data: {},
      })
    } else if (c.type === 'DELETE') {
      serverAnalytics.track(zUserId.parse(c.old_record['id']), {
        name: 'user/deleted',
        data: {},
      })
    }
  } else if (c.schema === 'public' && c.table === 'resource') {
    if (c.type === 'INSERT') {
      serverAnalytics.track(zUserId.parse(c.record['creator_id']), {
        name: 'resource/created',
        data: {resourceId: zId('reso').parse(c.record['id'])},
      })
    } else if (c.type === 'DELETE') {
      serverAnalytics.track(zUserId.parse(c.old_record['creator_id']), {
        name: 'resource/deleted',
        data: {resourceId: zId('reso').parse(c.old_record['id'])},
      })
    }
  }
  await serverAnalytics.flush()
}
