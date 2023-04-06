import {getDefaultProxyAgent, HTTPError} from './http-utils'
import z from 'zod'
import * as R from 'remeda'
import {safeJSONParse} from '../json-utils'

const zHttpMethod = z.enum([
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'head',
  'options',
])

export declare type HTTPMethod = z.infer<typeof zHttpMethod>

export interface HttpRequestOptions {
  header?: Record<string, unknown>
  /** path substitution params */
  path?: Record<string, unknown>
  /** searchQuery params */
  query?: Record<string, unknown>
  /** Body json */
  body?: Record<string, unknown>
  cookies?: Record<string, unknown> // TODO: Impl. cookies
}

export type HttpClientOptions = RequestInit & {
  baseUrl: string
  bearerToken?: string
  fetch?: typeof fetch
  URL?: typeof URL
}

export function makeHttpClient(options: HttpClientOptions) {
  const {
    fetch = globalThis.fetch,
    URL = globalThis.URL,
    baseUrl,
    bearerToken,
    ...defaults
  } = options

  function request(
    method: Uppercase<HTTPMethod>,
    path: string,
    input: HttpRequestOptions,
  ): Promise<unknown> {
    const url = new URL(baseUrl)
    // Need a better function for this than += pathname...
    url.pathname += getPath(path, input.path ?? {})
    Object.entries(input.query ?? {}).forEach(([key, value]) =>
      url.searchParams.set(key, `${value}`),
    )
    const headers = {
      'Content-Type': 'application/json',
      ...(bearerToken && {Authorization: `Bearer ${bearerToken}`}),
      ...defaults.headers,
      ...input.header,
    } as Record<string, string>
    const body = input.body ? JSON.stringify(input.body) : defaults.body

    // NOTE: Implement proxyAgent as a middleware
    // This way we can transparently use reverse proxies also in addition to forward proxy
    // as well as just simple in-app logging.
    return fetch(url, {
      // @ts-expect-error Node fetch specific option... Noop on other platforms.
      agent: getDefaultProxyAgent(),
      ...defaults,
      method,
      headers,
      body,
    }).then(async (res) => {
      const text = await res.text()
      const json = safeJSONParse(text)
      if (res.status < 200 || res.status >= 300) {
        throw new HTTPError(
          {url: url.toString(), method, headers, data: body},
          {
            data: json,
            headers: Object.fromEntries(res.headers.entries()),
            status: res.status,
            statusText: res.statusText,
          },
          res.statusText,
        )
      }
      return json
    })
  }

  const methods = R.mapToObj(zHttpMethod.options, (method) => [
    method,
    (path: string, input: HttpRequestOptions) =>
      request(method.toUpperCase() as Uppercase<typeof method>, path, input),
  ])

  return {...methods, request}
}

function getPath(path: string, pathParams: Record<string, any>) {
  return path.replace(/\{([^}]+)\}/g, (_, key) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
    const value = encodeURIComponent(pathParams[key])
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete, @typescript-eslint/no-unsafe-member-access
    delete pathParams[key]
    return value
  })
}
