/**
 * The assistant on this computer (system/local-ai.ts, system/tool-call.ts):
 * whether Ollama is installed, running and has the model — and what to do
 * when not — downloading a model with progress and cancelling it, answers and
 * their errors in plain words, and reading a tool call out of a small model's
 * reply. A stand-in Ollama on another port plays the real one.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { AiPullProgress } from '../../src/shared/types'
import {
  chosenModel,
  DEFAULT_MODEL,
  generate,
  hasModel,
  listModels,
  LocalAiError,
  MODEL_NAME,
  nextSteps,
  OLLAMA_MISSING,
  ollamaAddress,
  ollamaPlaces,
  ollamaStatus,
  pullModel,
  setOllamaAddress
} from '../../src/main/system/local-ai'
import { findToolCall, withoutToolCall } from '../../src/main/system/tool-call'
import { executeTool, firmIdentity } from '../../src/main/records/assistant-tools'
import { freshDb } from '../import/helpers'

const original = ollamaAddress()
let server: Server | null = null

/** A stand-in Ollama: `routes` answers each path. */
async function standIn(routes: Record<string, (req: IncomingMessage, res: ServerResponse, body: string) => void>): Promise<number> {
  if (server) {
    server.closeAllConnections()
    await new Promise<void>((r) => server!.close(() => r()))
  }
  server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      const route = routes[req.url ?? '']
      if (route) route(req, res, body)
      else {
        res.statusCode = 404
        res.end('{}')
      }
    })
  })
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', () => r()))
  const port = (server!.address() as AddressInfo).port
  setOllamaAddress('127.0.0.1', port)
  return port
}

/** A port nothing listens on. */
async function closedPort(): Promise<number> {
  const s = createServer()
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', () => r()))
  const port = (s.address() as AddressInfo).port
  await new Promise<void>((r) => s.close(() => r()))
  return port
}

afterEach(async () => {
  setOllamaAddress(original.host, original.port)
  if (server) {
    server.closeAllConnections()
    await new Promise<void>((r) => server!.close(() => r()))
  }
  server = null
})

describe('whether the assistant can run here', () => {
  it('is ready when Ollama answers and has the chosen model ("llama3.1" meaning "llama3.1:latest")', async () => {
    await standIn({
      '/api/version': (_q, res) => res.end(JSON.stringify({ version: '0.5.7' })),
      '/api/tags': (_q, res) => res.end(JSON.stringify({ models: [{ name: 'mistral:7b' }, { name: 'llama3.1:8b' }, { name: 'phi3:latest' }] }))
    })
    const s = await ollamaStatus('llama3.1:8b')
    expect(s).toMatchObject({ state: 'ready', version: '0.5.7', models: ['llama3.1:8b', 'mistral:7b', 'phi3:latest'], steps: [], installedAt: null, pulling: null })
    expect((await ollamaStatus('phi3')).state).toBe('ready')
    expect((await ollamaStatus('PHI3:LATEST')).state).toBe('ready')
  })

  it('says the model is missing, and how to get it, for whoever is asking', async () => {
    await standIn({
      '/api/version': (_q, res) => res.end(JSON.stringify({ version: '0.5.7' })),
      '/api/tags': (_q, res) => res.end(JSON.stringify({ models: [{ name: 'mistral:7b' }] }))
    })
    const manager = await ollamaStatus('llama3.1:8b', { platform: 'win32' })
    expect(manager.state).toBe('no_model')
    expect(manager.steps[0]).toBe('Download the model “llama3.1:8b”: choose Download the model here, or run “ollama pull llama3.1:8b” in a terminal.')
    const staff = await ollamaStatus('llama3.1:8b', { platform: 'win32', canDownload: false })
    expect(staff.steps[0]).toBe('Ask a partner or manager to download the model “llama3.1:8b” here, or run “ollama pull llama3.1:8b” in a terminal.')
  })

  it('tells "installed but not running" from "not installed", by where Ollama usually lives', async () => {
    setOllamaAddress('127.0.0.1', await closedPort())
    const env = { LOCALAPPDATA: 'C:\\Users\\sam\\AppData\\Local', ProgramFiles: 'C:\\Program Files', PATH: '' }
    const found = await ollamaStatus('llama3.1:8b', { platform: 'win32', env, home: 'C:\\Users\\sam', exists: (p) => p === join('C:\\Users\\sam\\AppData\\Local', 'Programs', 'Ollama', 'ollama.exe') })
    expect(found).toMatchObject({ state: 'not_running', installedAt: join('C:\\Users\\sam\\AppData\\Local', 'Programs', 'Ollama', 'ollama.exe'), version: null, models: [] })
    expect(found.steps).toEqual(['Start Ollama from the Start menu. It runs in the background, with an icon by the clock.', 'Then choose Check again.'])
    const missing = await ollamaStatus('llama3.1:8b', { platform: 'darwin', env: { PATH: '/usr/bin' }, home: '/Users/sam', exists: () => false })
    expect(missing.state).toBe('not_installed')
    expect(missing.steps).toHaveLength(3)
    expect(missing.steps[0]).toContain('ollama.com/download')
    // A check that can't even look at the disk still answers.
    const unreadable = await ollamaStatus('llama3.1:8b', { platform: 'linux', env: {}, home: '/home/sam', exists: () => { throw new Error('EACCES') } })
    expect(unreadable.state).toBe('not_installed')
  })

  it('knows where Ollama is installed on each kind of computer, and looks along the PATH', () => {
    expect(ollamaPlaces('darwin', { PATH: '/opt/bin:/usr/bin' }, '/Users/sam')).toEqual([
      '/Applications/Ollama.app', '/Users/sam/Applications/Ollama.app', '/usr/local/bin/ollama', '/opt/homebrew/bin/ollama', '/opt/bin/ollama', '/usr/bin/ollama'
    ])
    expect(ollamaPlaces('linux', {}, '/home/sam')).toEqual(['/usr/local/bin/ollama', '/usr/bin/ollama', '/snap/bin/ollama', '/home/sam/.local/bin/ollama'])
    expect(nextSteps('ready', 'linux', 'x')).toEqual([])
    expect(nextSteps('not_running', 'linux', 'x')[0]).toContain('ollama serve')
  })

  it('matches models by name and tag, and reads model names as Ollama writes them', () => {
    expect(hasModel(['llama3.1:8b'], 'llama3.1:8b')).toBe(true)
    expect(hasModel(['llama3.1:latest'], 'llama3.1')).toBe(true)
    expect(hasModel(['llama3.1:8b'], 'llama3.1')).toBe(false)
    expect(hasModel(['llama3.1:8b'], 'llama3.1:70b')).toBe(false)
    for (const ok of ['llama3.1:8b', 'qwen2.5:7b-instruct', 'library/mistral', 'phi3']) expect([ok, MODEL_NAME.test(ok)]).toEqual([ok, true])
    for (const bad of ['', ' llama', 'llama 3', 'a;rm -rf', 'x:'.padEnd(3, ':'), `${'a'.repeat(81)}`]) expect([bad, MODEL_NAME.test(bad)]).toEqual([bad, false])
  })

  it('uses the model chosen in Settings, or the default', () => {
    const db = freshDb()
    expect(chosenModel(db)).toBe(DEFAULT_MODEL)
    db.prepare("INSERT INTO app_settings (key, value) VALUES ('ai_model', ' mistral:7b ')").run()
    expect(chosenModel(db)).toBe('mistral:7b')
    db.prepare("UPDATE app_settings SET value = 'custom' WHERE key = 'ai_model'").run()
    expect(chosenModel(db)).toBe(DEFAULT_MODEL)
    db.prepare("UPDATE app_settings SET value = 'not a model!' WHERE key = 'ai_model'").run()
    expect(chosenModel(db)).toBe(DEFAULT_MODEL)
  })
})

describe('downloading a model', () => {
  it('reports progress as Ollama sends it, and finishes once', async () => {
    await standIn({
      '/api/pull': (_q, res, body) => {
        expect(JSON.parse(body)).toMatchObject({ model: 'llama3.1:8b', stream: true })
        res.write(`${JSON.stringify({ status: 'pulling manifest' })}\n`)
        res.write(`${JSON.stringify({ status: 'pulling abc', total: 1000, completed: 250 })}\n{"status":"pulling abc",`)
        res.write(`"total":1000,"completed":1000}\n`)
        res.end(`${JSON.stringify({ status: 'success' })}\n`)
      }
    })
    const seen: AiPullProgress[] = []
    const job = pullModel('llama3.1:8b', (p) => seen.push(p))
    const final = await job.done
    expect(final).toEqual({ model: 'llama3.1:8b', status: 'Downloaded', completed: 1000, total: 1000, done: true, error: null })
    expect(seen.map((p) => [p.status, p.completed])).toEqual([
      ['pulling manifest', null],
      ['pulling abc', 250],
      ['pulling abc', 1000],
      ['Downloaded', 1000]
    ])
    expect(seen.filter((p) => p.done)).toHaveLength(1)
  })

  it('says plainly when the model doesn’t exist, when Ollama isn’t there, and when it was cancelled', async () => {
    await standIn({ '/api/pull': (_q, res) => res.end(`${JSON.stringify({ error: 'pull model manifest: file does not exist' })}\n`) })
    const nope = await pullModel('no-such-model', () => undefined).done
    expect(nope).toMatchObject({ done: true, status: 'Failed', error: 'There is no model called “no-such-model”. Check the name in Settings.' })

    setOllamaAddress('127.0.0.1', await closedPort())
    expect((await pullModel('llama3.1:8b', () => undefined).done).error).toBe(OLLAMA_MISSING)

    await standIn({
      '/api/pull': (_q, res) => {
        res.write(`${JSON.stringify({ status: 'pulling abc', total: 1000, completed: 10 })}\n`) // and never finishes
      }
    })
    const seen: AiPullProgress[] = []
    const job = pullModel('llama3.1:8b', (p) => seen.push(p))
    await new Promise((r) => setTimeout(r, 100))
    job.cancel()
    expect(await job.done).toMatchObject({ done: true, status: 'Cancelled', error: null })
    expect(seen.filter((p) => p.done)).toHaveLength(1)
  })
})

describe('answers', () => {
  it('returns the answer, and each failure in words a person can act on', async () => {
    await standIn({
      '/api/generate': (_q, res, body) => {
        const { model } = JSON.parse(body) as { model: string }
        if (model === 'missing') res.end(JSON.stringify({ error: 'model "missing" not found, try pulling it first' }))
        else if (model === 'garbled') res.end('not json')
        else if (model === 'slow') setTimeout(() => res.end('{}'), 500)
        else res.end(JSON.stringify({ response: '  Three VAT returns are due.  ' }))
      },
      '/api/tags': (_q, res) => res.end(JSON.stringify({ models: [{ name: 'b' }, { name: 'a' }] }))
    })
    expect(await generate('llama3.1:8b', 'hi')).toBe('Three VAT returns are due.')
    await expect(generate('missing', 'hi')).rejects.toThrow('The model “missing” isn’t downloaded. Download it in The assistant, or run “ollama pull missing”.')
    await expect(generate('garbled', 'hi')).rejects.toBeInstanceOf(LocalAiError)
    await expect(generate('slow', 'hi', 100)).rejects.toThrow(/took too long/)
    expect(await listModels()).toEqual({ success: true, models: ['a', 'b'] })
    setOllamaAddress('127.0.0.1', await closedPort())
    await expect(generate('llama3.1:8b', 'hi')).rejects.toThrow(OLLAMA_MISSING)
    expect(await listModels()).toEqual({ success: false, error: OLLAMA_MISSING })
  })
})

describe('tool calls in a reply', () => {
  it('finds a tool call wrapped in prose or a code fence, with nested arguments', () => {
    expect(findToolCall('{"tool": "get_firm_settings", "args": {"scope": "global"}}')).toMatchObject({ tool: 'get_firm_settings', args: { scope: 'global' } })
    const fenced = 'Let me look.\n```json\n{"tool": "search_clients", "args": {"query": "Smith {Ltd}"}}\n```'
    const call = findToolCall(fenced)
    expect(call).toMatchObject({ tool: 'search_clients', args: { query: 'Smith {Ltd}' } })
    expect(withoutToolCall(fenced, call!)).toBe('Let me look.')
    expect(findToolCall('{"tool":"create_task","args":{"client_ref":"C1","description":"Say \\"hi\\" }"}}')?.args).toEqual({ client_ref: 'C1', description: 'Say "hi" }' })
  })

  it('takes arguments written beside "tool", and ignores what isn’t a tool call', () => {
    expect(findToolCall('{"tool": "get_client", "ref": "C1"}')).toMatchObject({ tool: 'get_client', args: { ref: 'C1' } })
    expect(findToolCall('No tools needed: the answer is {"a": 1}.')).toBeNull()
    expect(findToolCall('{"tool": 5}')).toBeNull()
    expect(findToolCall('{"tool": "x", "args": {')).toBeNull()
    expect(findToolCall('{"tool": oops} then {"tool": "get_wip_summary"}')).toMatchObject({ tool: 'get_wip_summary', args: {} })
  })
})

describe('the practice the assistant speaks for', () => {
  it('takes the firm’s name, tone, signature and disclaimer from Settings, leaving out what was never written', () => {
    const db = freshDb()
    expect(firmIdentity(db)).toEqual({ firm: 'the practice', voice: 'Corporate', signature: null, disclaimer: null, currency: 'GBP' })
    db.prepare("INSERT INTO firm_data (name) VALUES ('Made Up Accountants Ltd')").run()
    const set = db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)')
    set.run('email_signature', '--\\nSystem Generated') // the placeholder Settings shows: never used
    set.run('legal_disclaimer_active', 'false')
    set.run('disclaimer_text', 'Confidential.')
    expect(firmIdentity(db)).toMatchObject({ firm: 'Made Up Accountants Ltd', signature: null, disclaimer: null })
    set.run('email_signature', 'Kind regards,\\nThe team')
    set.run('legal_disclaimer_active', 'true')
    set.run('brand_voice', 'Friendly')
    expect(firmIdentity(db)).toMatchObject({ voice: 'Friendly', signature: 'Kind regards,\nThe team', disclaimer: 'Confidential.' })
    expect(executeTool('get_firm_settings', {}, { id: 1, name: 'P', role: 'partner' }, db, () => null)).toMatchObject({ firm_name: 'Made Up Accountants Ltd', legal_disclaimer_active: true })
    expect(executeTool('no_such_tool' as never, {}, { id: 1, name: 'P', role: 'partner' }, db, () => null)).toEqual({ error: 'There is no tool called “no_such_tool”.' })
  })
})
