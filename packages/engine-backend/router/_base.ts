import {TRPCError, initTRPC} from '@trpc/server'
import type {RouterContext, Viewer, ViewerRole} from '../context'

/** TODO: Use OpenApiMeta from https://github.com/jlalmes/trpc-openapi */
interface OpenApiMeta {}

export const trpc = initTRPC
  .context<RouterContext>()
  .meta<OpenApiMeta>()
  .create()

export const publicProcedure = trpc.procedure

export const nonPublicProcedure = trpc.procedure.use(({next, ctx}) => {
  if (!hasRole(ctx.viewer, ['end_user', 'user', 'workspace', 'system'])) {
    throw new TRPCError({
      code: ctx.viewer.role === 'anon' ? 'UNAUTHORIZED' : 'FORBIDDEN',
    })
  }
  return next({ctx: {...ctx, viewer: ctx.viewer}}) // Get typing to work
})

export const endUserProcedure = trpc.procedure.use(({next, ctx, path}) => {
  if (!hasRole(ctx.viewer, ['end_user'])) {
    throw new TRPCError({
      code: ctx.viewer.role === 'anon' ? 'UNAUTHORIZED' : 'FORBIDDEN',
      message: `end_user role is required for ${path} procedure`,
    })
  }
  return next({ctx: {...ctx, viewer: ctx.viewer}}) // Get typing to work
})

export const adminProcedure = trpc.procedure.use(({next, ctx}) => {
  if (!hasRole(ctx.viewer, ['user', 'workspace', 'system'])) {
    throw new TRPCError({
      code: ctx.viewer.role === 'anon' ? 'UNAUTHORIZED' : 'FORBIDDEN',
    })
  }
  return next({ctx: {...ctx, viewer: ctx.viewer}}) // Get typing to work
})

export const systemProcedure = trpc.procedure.use(({next, ctx}) => {
  if (!hasRole(ctx.viewer, ['system'])) {
    throw new TRPCError({
      code: ctx.viewer.role === 'anon' ? 'UNAUTHORIZED' : 'FORBIDDEN',
    })
  }
  return next({ctx: {...ctx, viewer: ctx.viewer}}) // Get typing to work
})

function hasRole<R extends ViewerRole>(
  viewer: Viewer,
  roles: R[],
): viewer is Viewer<R> {
  return roles.includes(viewer.role as R)
}

// Not used atm
// const levelByRole = {
//   anon: 0,
//   end_user: 1,
//   user: 2,
//   workspace: 3,
//   system: 4,
// } satisfies Record<ViewerRole, number>
