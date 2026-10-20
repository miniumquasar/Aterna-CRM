/**
 * The assistant runs on this PC through Ollama (http://127.0.0.1:11434). Nothing
 * is sent anywhere else: the model, the questions and the answers stay here.
 *
 *   status     whether Ollama is running, which models are downloaded, and —
 *              when it isn't running — whether it is installed at all, with
 *              what to do next in plain steps for this computer
 *   download   a model can be downloaded from inside the app, with progress
 *   summarise  a short summary of data the app gives it
 *
 * Always 127.0.0.1, never "localhost": on Windows "localhost" can mean the IPv6
 * address, where Ollama doesn't listen, and the app would wrongly say it isn't
 * running.
 */
import { existsSync } from 'node:fs'
import { request } from 'node:http'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import type { Database } from 'better-sqlite3-multiple-ciphers'
import type { AiPullProgress, AiState, AiStatus } from '../../shared/types'

export const OLLAMA_MISSING =
  'The local AI isn’t running. Install Ollama from ollama.com, start it, and download a model (for example “ollama pull llama3.1:8b”), then try again.'

export const DEFAULT_MODEL = 'llama3.1:8b'

/** The most of the practice's data one question carries. */
export const MAX_CONTEXT = 20_000

/** A model name as Ollama writes them: "llama3.1:8b", "qwen2.5:7b-instruct", "library/mistral". */
export const MODEL_NAME = /^[a-z0-9][a-z0-9._\-/]{0,79}(:[a-z0-9][a-z0-9._-]{0,39})?$/i

/** The model chosen in Settings, or the default. */
export function chosenModel(db: Database): string {
  const v = (db.prepare("SELECT value FROM app_settings WHERE key = 'ai_model'").get() as { value: string } | undefined)?.value?.trim()
  return v && v !== 'custom' && MODEL_NAME.test(v) ? v : DEFAULT_MODEL
}

/** Where Ollama listens. Tests point it at a stand-in on another port. */
let address = { host: '127.0.0.1', port: 11434 }
export function setOllamaAddress(host: string, port: number): void {
  address = { host, port }
}
export const ollamaAddress = (): { host: string; port: number } => ({ ...address })

/** One request to Ollama; resolves with the status code and body, or rejects. */
function call(method: 'GET' | 'POST', path: string, body: unknown, timeoutMs: number): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body)
    const req = request(
      {
        hostname: address.host,
        port: address.port,
        path,
        method,
        timeout: timeoutMs,
        headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : undefined
      },
      (res) => {
        let text = ''
        res.setEncoding('utf8')
        res.on('data', (c: string) => (text += c))
        res.on('end', () => resolve({ status: res.statusCode ?? 0, text }))
        res.on('error', reject)
      }
    )
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', reject)
    req.end(payload)
  })
}

/** Whether a downloaded model is the one asked for ("llama3.1" means "llama3.1:latest"). */
export function hasModel(models: readonly string[], model: string): boolean {
  const want = model.trim().toLowerCase()
  const full = want.includes(':') ? want : `${want}:latest`
  return models.some((m) => {
    const name = m.toLowerCase()
    return name === want || name === full
  })
}

/** Where Ollama is usually installed on each kind of computer, and anywhere on the PATH. */
export function ollamaPlaces(platform: string, env: NodeJS.ProcessEnv, home: string): string[] {
  const exe = platform === 'win32' ? 'ollama.exe' : 'ollama'
  const known =
    platform === 'win32'
      ? [
          env.LOCALAPPDATA ? join(env.LOCALAPPDATA, 'Programs', 'Ollama', 'ollama.exe') : null,
          env.ProgramFiles ? join(env.ProgramFiles, 'Ollama', 'ollama.exe') : null
        ]
      : platform === 'darwin'
        ? ['/Applications/Ollama.app', join(home, 'Applications', 'Ollama.app'), '/usr/local/bin/ollama', '/opt/homebrew/bin/ollama']
        : ['/usr/local/bin/ollama', '/usr/bin/ollama', '/snap/bin/ollama', join(home, '.local', 'bin', 'ollama')]
  const onPath = (env.PATH ?? env.Path ?? '').split(delimiter).filter(Boolean).map((dir) => join(dir, exe))
  return [...new Set([...known.filter((p): p is string => !!p), ...onPath])]
}

/** What to do next, for this state on this kind of computer. `canDownload`: the person may download a model from the app (partners and managers). */
export function nextSteps(state: AiState, platform: string, model: string, canDownload = true): string[] {
  const start =
    platform === 'win32'
      ? 'Start Ollama from the Start menu. It runs in the background, with an icon by the clock.'
      : platform === 'darwin'
        ? 'Open Ollama from Applications. It runs in the background, with an icon in the menu bar.'
        : 'Start Ollama: run “ollama serve” in a terminal, or “sudo systemctl start ollama” if it was installed as a service.'
  const download = canDownload
    ? `Download the model “${model}”: choose Download the model here, or run “ollama pull ${model}” in a terminal.`
    : `Ask a partner or manager to download the model “${model}” here, or run “ollama pull ${model}” in a terminal.`
  switch (state) {
    case 'ready':
      return []
    case 'no_model':
      return [download, 'Or choose a model this computer already has, in Settings under The assistant.']
    case 'not_running':
      return [start, 'Then choose Check again.']
    case 'not_installed':
      return [
        'Download Ollama from ollama.com/download and install it. It is free, and runs on this computer: nothing you ask it leaves the computer.',
        start,
        download
      ]
  }
}

/** Whether the assistant can run on this computer, and what to do if not. */
export async function ollamaStatus(
  model: string,
  opts: { platform?: string; env?: NodeJS.ProcessEnv; home?: string; exists?: (path: string) => boolean; timeoutMs?: number; canDownload?: boolean } = {}
): Promise<AiStatus> {
  const platform = opts.platform ?? process.platform
  const canDownload = opts.canDownload ?? true
  const base = { model, platform, checkedAt: new Date().toISOString() }
  let version: string | null = null
  try {
    const v = await call('GET', '/api/version', undefined, opts.timeoutMs ?? 2500)
    if (v.status === 200) version = (JSON.parse(v.text) as { version?: string }).version ?? 'unknown'
  } catch {
    version = null
  }
  if (version) {
    let models: string[] = []
    try {
      const t = await call('GET', '/api/tags', undefined, opts.timeoutMs ?? 5000)
      models = ((JSON.parse(t.text) as { models?: Array<{ name?: string }> }).models ?? []).flatMap((m) => (m.name ? [m.name] : [])).sort()
    } catch {
      models = []
    }
    const state: AiState = hasModel(models, model) ? 'ready' : 'no_model'
    return { ...base, state, models, version, installedAt: null, steps: nextSteps(state, platform, model, canDownload), pulling: null }
  }
  const exists = opts.exists ?? existsSync
  const installedAt = ollamaPlaces(platform, opts.env ?? process.env, opts.home ?? homedir()).find((p) => {
    try {
      return exists(p)
    } catch {
      return false
    }
  }) ?? null
  const state: AiState = installedAt ? 'not_running' : 'not_installed'
  return { ...base, state, models: [], version: null, installedAt, steps: nextSteps(state, platform, model, canDownload), pulling: null }
}

/**
 * Downloads a model, reporting progress as Ollama sends it. Resolves when the
 * download finishes, fails or is cancelled; `cancel` stops it.
 */
export function pullModel(model: string, onProgress: (p: AiPullProgress) => void): { done: Promise<AiPullProgress>; cancel: () => void } {
  let cancelled = false
  let req: ReturnType<typeof request> | null = null
  const done = new Promise<AiPullProgress>((resolve) => {
    let last: AiPullProgress = { model, status: 'Starting', completed: null, total: null, done: false, error: null }
    let settled = false
    // Once only, however the request ends (finished, failed, cancelled, cut off).
    const finish = (p: Partial<AiPullProgress>): void => {
      if (settled) return
      settled = true
      last = { ...last, ...p, done: true }
      onProgress(last)
      resolve(last)
    }
    const payload = JSON.stringify({ model, name: model, stream: true })
    req = request(
      { hostname: address.host, port: address.port, path: '/api/pull', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } },
      (res) => {
        res.setEncoding('utf8')
        let buffer = ''
        let ended = false
        res.on('data', (chunk: string) => {
          buffer += chunk
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.trim()) continue
            let msg: { status?: string; error?: string; total?: number; completed?: number }
            try {
              msg = JSON.parse(line)
            } catch {
              continue
            }
            if (msg.error) {
              ended = true
              finish({ status: 'Failed', error: /not found|file does not exist|pull model manifest/i.test(msg.error) ? `There is no model called “${model}”. Check the name in Settings.` : msg.error })
              res.destroy()
              return
            }
            if (msg.status === 'success') {
              ended = true
              finish({ status: 'Downloaded', error: null })
              return
            }
            last = {
              ...last,
              status: msg.status ?? last.status,
              completed: typeof msg.completed === 'number' ? msg.completed : last.completed,
              total: typeof msg.total === 'number' ? msg.total : last.total
            }
            onProgress(last)
          }
        })
        res.on('end', () => {
          if (!ended) finish(cancelled ? { status: 'Cancelled', error: null } : { status: 'Stopped', error: 'The download stopped before it finished. Try again.' })
        })
        res.on('error', () => {
          if (!ended) finish(cancelled ? { status: 'Cancelled', error: null } : { status: 'Stopped', error: 'The download stopped before it finished. Try again.' })
          ended = true
        })
      }
    )
    req.on('error', () => finish(cancelled ? { status: 'Cancelled', error: null } : { status: 'Failed', error: OLLAMA_MISSING }))
    req.end(payload)
  })
  return {
    done,
    cancel: () => {
      cancelled = true
      req?.destroy()
    }
  }
}

/** The models downloaded to this computer, for the model choice in Settings. */
export async function listModels(timeoutMs = 5000): Promise<{ success: boolean; models?: string[]; error?: string }> {
  try {
    const t = await call('GET', '/api/tags', undefined, timeoutMs)
    const models = ((JSON.parse(t.text) as { models?: Array<{ name?: string }> }).models ?? []).flatMap((m) => (m.name ? [m.name] : [])).sort()
    return { success: true, models }
  } catch (err) {
    if (err instanceof SyntaxError) return { success: false, error: 'Ollama gave an unreadable list of models.' }
    return { success: false, error: (err as Error).message === 'timeout' ? `Ollama didn’t answer within ${Math.round(timeoutMs / 1000)} seconds.` : OLLAMA_MISSING }
  }
}

/** Why the assistant couldn't answer, in words for the screen. */
export class LocalAiError extends Error {}

/** One answer from the model. Rejects with a LocalAiError whose message can be shown as it is. */
export async function generate(model: string, prompt: string, timeoutMs = 90_000): Promise<string> {
  let reply: { status: number; text: string }
  try {
    reply = await call('POST', '/api/generate', { model, prompt, stream: false }, timeoutMs)
  } catch (err) {
    throw new LocalAiError((err as Error).message === 'timeout' ? 'The assistant took too long to answer. Try a shorter question, or a smaller model in Settings.' : OLLAMA_MISSING)
  }
  let parsed: { response?: string; error?: string }
  try {
    parsed = JSON.parse(reply.text) as { response?: string; error?: string }
  } catch {
    throw new LocalAiError('The assistant gave an unreadable answer.')
  }
  if (parsed.error) {
    throw new LocalAiError(/not found|no such model|pull/i.test(parsed.error) ? `The model “${model}” isn’t downloaded. Download it in The assistant, or run “ollama pull ${model}”.` : `The assistant couldn’t answer: ${parsed.error}`)
  }
  return (parsed.response ?? '').trim()
}

export function analyzeLocally(model: string, dataContext: string, timeoutMs = 60_000, instruction?: string): Promise<{ success: boolean; result?: string; error?: string }> {
  const prompt =
    (instruction ??
      'You are assisting a UK accountancy practice. Summarise the data below in plain English for a partner: what stands out, what needs action, and by when. Be brief and specific; do not invent figures.') +
    '\n\n' +
    String(dataContext ?? '').slice(0, MAX_CONTEXT)
  return generate(model, prompt, timeoutMs).then(
    (result) => ({ success: true, result }),
    (err: Error) => ({ success: false, error: err.message })
  )
}
