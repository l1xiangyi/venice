'use client'

import type {SupabaseClient} from '@supabase/auth-helpers-nextjs'
import {createBrowserSupabaseClient} from '@supabase/auth-helpers-nextjs'
import {QueryClientProvider} from '@tanstack/react-query'
import React from 'react'

import {zViewerFromUnverifiedJwtToken} from '@usevenice/cdk-core'
import {TRPCProvider} from '@usevenice/engine-frontend'

import {createQueryClient} from '../lib/query-client'
import type {Database} from '../supabase/supabase.gen'
import {SupabaseProvider, useSupabaseContext} from './supabase-context'
import {ViewerContext} from './viewer-context'

export function ClientRoot(props: {
  children: React.ReactNode
  /** Viewer will be inferred from this... */
  initialAccessToken: string | null | undefined
  supabase?: SupabaseClient<Database>
}) {
  console.log(
    '[ClientRoot] rendering initialToken?',
    props.initialAccessToken != null,
  )
  const {current: supabase} = React.useRef(
    props.supabase ?? createBrowserSupabaseClient<Database>({}),
  )
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
  ;(globalThis as any).supabase = supabase

  return (
    <SupabaseProvider supabase={supabase}>
      <ClientRootInner {...props} />
    </SupabaseProvider>
  )
}

/** Separate Inner component is needed in order to useSupabaseContext */
function ClientRootInner({
  children,
  initialAccessToken,
}: React.ComponentProps<typeof ClientRoot>) {
  const {session, status, error} = useSupabaseContext()
  const accessToken =
    status === 'initial' || status === 'loading'
      ? initialAccessToken
      : session?.access_token
  const viewer = React.useMemo(
    () => zViewerFromUnverifiedJwtToken.parse(accessToken),
    [accessToken],
  )

  // NOTE: Should change queryClient when authenticated identity changes to reset all trpc cache
  const {current: queryClient} = React.useRef(createQueryClient())
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
  ;(globalThis as any).accessToken = accessToken
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
  ;(globalThis as any).viewer = viewer
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
  ;(globalThis as any).queryClient = queryClient

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider queryClient={queryClient} accessToken={accessToken}>
        <ViewerContext.Provider
          value={React.useMemo(
            () => ({accessToken, error, status, viewer}),
            [accessToken, error, status, viewer],
          )}>
          {children}
        </ViewerContext.Provider>
      </TRPCProvider>
    </QueryClientProvider>
  )
}
