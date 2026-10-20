/**
 * ai-chat.ts — the assistant, which runs on this computer through Ollama.
 *
 *   ai:status       whether it can run here: Ollama installed, running, and the
 *                   chosen model downloaded — and when not, what to do next
 *   ai:pull-model   partners and managers download the chosen model from inside
 *                   the app, with progress on 'ai:pull-progress'
 *   ai:chat         a conversation with the practice's tools (staff reach their
 *                   own clients only; changes refused while the app is read-only)
 *   ai:summarise    a short briefing on the forecast or one client's file, with
 *                   exactly what the assistant was given, to check it against
 *
 * Nothing leaves the computer: Ollama listens on 127.0.0.1 only.
 */
import { performance } from 'node:perf_hooks'
import { ipcMain } from 'electron'
import type { AiPullProgress, AiStatus, AiSummary } from '@shared/types'
import { writeAudit } from '../access/audit'
import { canManage, clientForActor, refArg, requireManager, UserFacingError, type Actor } from '../access/policy'
import { getDb } from '../db/schema'
import { writeRefusal } from '../licence'
import { CLIENT_INSTRUCTION, clientContext, FORECAST_INSTRUCTION, forecastContext } from '../records/ai-context'
import { executeTool, firmIdentity, type ToolName } from '../records/assistant-tools'
import { forecast } from '../records/forecast'
import { chosenModel, generate, listModels, LocalAiError, MAX_CONTEXT, MODEL_NAME, ollamaStatus, pullModel } from '../system/local-ai'
import { findToolCall, withoutToolCall } from '../system/tool-call'
import { sendToRenderer } from '../window-events'
import { actor, resultAsync } from './session'

// ─── What the assistant is told ──────────────────────────────────────────────

const TOOLS = `To look something up or make a change, reply with exactly one JSON object and nothing else:
{"tool": "<name>", "args": {<arguments>}}
You will then see the tool's result, and carry on with your answer.

Tools:
- search_clients(query) — find clients by name, reference or email
- get_client(ref) — one client's details
- get_tasks(client_ref?) — open tasks, for one client or all
- get_deadlines(days?) — open deadlines: the overdue ones, then those due within this many days (default 30)
- get_overdue_clients() — clients with overdue deadlines, most overdue first
- count_clients_by_category() — how many clients of each type
- get_wip_summary() — work in progress by status
- create_task(client_ref, description, priority, due_date) — add a task (priority: low, medium, high or urgent; date YYYY-MM-DD)
- update_client_note(client_ref, note) — replace a client's remarks
- get_template(template_key, client_ref?) — an email template
- save_template(template_key, client_ref, subject, body) — save a client's own version of a template
- get_firm_settings() — the practice's name, tone, email signature and disclaimer`

/** The opening of every prompt: who the assistant works for, how it speaks, and its tools. */
function preamble(db: ReturnType<typeof getDb>): string {
  const f = firmIdentity(db)
  const lines = [
    `You are the assistant inside AETERNA CRM, working for ${f.firm}, a UK accountancy practice. You run on this computer, and nothing you are told leaves it.`,
    `Answer in British English, briefly and specifically, in a ${f.voice.toLowerCase()} tone. Money is in ${f.currency}.`,
    'Use only facts from the tools and the conversation. If you don’t know, say so. Never invent figures, dates or references.'
  ]
  if (f.signature) lines.push(`End any email you write for the practice with this signature:\n${f.signature}`)
  if (f.disclaimer) lines.push(`Add this at the end of anything meant for a client:\n${f.disclaimer}`)
  return `${lines.join('\n')}\n\n${TOOLS}`
}

/** A tool's answer for the model: refusals and mistakes become an error the model can relay. */
function runTool(toolName: ToolName, args: Record<string, unknown>, me: Actor): unknown {
  try {
    return executeTool(toolName, args, me, getDb(), writeRefusal)
  } catch (err) {
    if (err instanceof UserFacingError) return { error: err.message }
    console.error('[ai] tool failed', toolName, err)
    return { error: 'That didn’t work. Nothing was changed.' }
  }
}

/** A tool's result as the model reads it: JSON, cut short when long. */
const resultText = (result: unknown): string => {
  const text = JSON.stringify(result ?? null, null, 2) ?? 'null'
  return text.length > 6000 ? `${text.slice(0, 6000)}\n… (cut short)` : text
}

const MAX_TOOL_CALLS = 3

interface ChatParams {
  sessionId: string
  message: string
  clientRef?: string
  history: Array<{ role: 'user' | 'assistant'; content: string }>
}

function readChat(params: unknown): ChatParams {
  const p = (params && typeof params === 'object' ? params : {}) as Record<string, unknown>
  if (typeof p.sessionId !== 'string' || !p.sessionId || p.sessionId.length > 100) throw new UserFacingError('Start a new conversation and ask again.')
  if (typeof p.message !== 'string' || !p.message.trim()) throw new UserFacingError('Type a question first.')
  if (p.message.length > 8000) throw new UserFacingError('That question is too long: keep it under 8,000 characters.')
  const history = Array.isArray(p.history)
    ? p.history.flatMap((h): ChatParams['history'] => {
        const e = h as { role?: unknown; content?: unknown }
        return (e.role === 'user' || e.role === 'assistant') && typeof e.content === 'string' ? [{ role: e.role, content: e.content.slice(0, 8000) }] : []
      })
    : []
  const clientRef = p.clientRef === undefined || p.clientRef === null || p.clientRef === '' ? undefined : refArg(p.clientRef)
  return { sessionId: p.sessionId, message: p.message, clientRef, history }
}

// ─── Downloading a model ─────────────────────────────────────────────────────

let pulling: { model: string; last: AiPullProgress; cancel: () => void } | null = null

/** Stops a download started from the app (when the app closes). */
export function stopAiDownloads(): void {
  pulling?.cancel()
}

/** Starts downloading a model; progress goes to the window, a few times a second, and always the last. */
function startPull(model: string, me: Actor): { started: boolean; model: string } {
  if (pulling) {
    if (pulling.model === model) return { started: false, model }
    throw new UserFacingError(`“${pulling.model}” is downloading. Wait for it to finish, or cancel it first.`)
  }
  let sentAt = -Infinity
  let lastStatus = ''
  const job = pullModel(model, (p) => {
    if (pulling) pulling.last = p
    const now = performance.now()
    if (p.done || p.status !== lastStatus || now - sentAt >= 250) {
      sentAt = now
      lastStatus = p.status
      sendToRenderer('ai:pull-progress', p)
    }
  })
  pulling = { model, last: { model, status: 'Starting', completed: null, total: null, done: false, error: null }, cancel: job.cancel }
  void job.done.then((final) => {
    pulling = null
    if (!final.error && final.status === 'Downloaded') {
      try {
        writeAudit(getDb(), me, 'Downloaded a model for the assistant', 'app_settings', 'ai_model', undefined, { model })
      } catch (err) {
        console.error('[ai] the download couldn’t be recorded', err)
      }
    }
  })
  return { started: true, model }
}

// ─── IPC Handlers ────────────────────────────────────────────────────────────

export function registerAiChatHandlers(): void {
  // Whether the assistant can run here, and what to do if not. Never fails: a problem is a state.
  ipcMain.handle('ai:status', () =>
    resultAsync('ai', async (): Promise<AiStatus> => {
      const me = actor()
      const status = await ollamaStatus(chosenModel(getDb()), { canDownload: canManage(me) })
      return { ...status, pulling: pulling?.last ?? null }
    })
  )

  ipcMain.handle('ai:pull-model', (_e, model: unknown) =>
    resultAsync('ai', async () => {
      const me = actor()
      requireManager(me, 'download a model for the assistant')
      const name = typeof model === 'string' && model.trim() ? model.trim() : chosenModel(getDb())
      if (!MODEL_NAME.test(name)) throw new UserFacingError('That isn’t a model name. Names look like “llama3.1:8b”.')
      return startPull(name, me)
    })
  )

  ipcMain.handle('ai:cancel-pull', () =>
    resultAsync('ai', async () => {
      requireManager(actor(), 'cancel a download')
      const was = pulling?.model ?? null
      pulling?.cancel()
      return { cancelled: was }
    })
  )

  // Settings → The assistant: the models on this computer.
  ipcMain.handle('ai:list-models', () => listModels())

  ipcMain.handle('ai:summarise', (_e, request: unknown) =>
    resultAsync('ai', async (): Promise<AiSummary> => {
      const me = actor()
      const db = getDb()
      const r = (request && typeof request === 'object' ? request : {}) as Record<string, unknown>
      let context: string
      let instruction: string
      if (r.kind === 'forecast') {
        context = forecastContext(forecast(db, me, r.query))
        instruction = FORECAST_INSTRUCTION
      } else if (r.kind === 'client') {
        context = clientContext(db, me, r.clientRef)
        instruction = CLIENT_INSTRUCTION
      } else {
        throw new UserFacingError('Choose what to summarise.')
      }
      const model = chosenModel(db)
      const given = context.slice(0, MAX_CONTEXT)
      try {
        const text = await generate(model, `${instruction}\n\n${given}`, 120_000)
        if (!text) throw new UserFacingError('The assistant gave an empty answer. Try again.')
        return { text, model, context: given }
      } catch (err) {
        throw err instanceof LocalAiError ? new UserFacingError(err.message) : err
      }
    })
  )

  // Chat: a question, answered with the practice's tools (at most three per question).
  ipcMain.handle('ai:chat', async (_e, raw: unknown) => {
    const db = getDb()
    let me: Actor
    let params: ChatParams
    try {
      me = actor()
      params = readChat(raw)
      if (params.clientRef) clientForActor(db, params.clientRef, me) // staff: their own clients only
    } catch (err) {
      return { success: false, error: err instanceof UserFacingError ? err.message : 'Sign in first.' }
    }
    const model = chosenModel(db)

    const historyText = params.history
      .slice(-10)
      .map((h) => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`)
      .join('\n')

    let clientLine = ''
    if (params.clientRef) {
      const client = db.prepare('SELECT client_name, client_category, status FROM clients WHERE ref = ?').get(params.clientRef) as
        | { client_name: string; client_category: string | null; status: string | null }
        | undefined
      if (client) clientLine = `\nThe person is looking at ${client.client_name} (${params.clientRef}), ${client.client_category ?? 'type not recorded'}, status ${client.status ?? 'not recorded'}.\n`
    }

    let prompt = `${preamble(db)}\n${clientLine}\n${historyText ? `The conversation so far:\n${historyText}\n` : ''}User: ${params.message}\nAssistant:`
    const toolCalls: Array<{ tool: string; args: Record<string, unknown>; result: unknown }> = []

    let answer: string
    try {
      for (;;) {
        const reply = await generate(model, prompt, 90_000)
        const call = findToolCall(reply)
        if (!call) {
          answer = reply
          break
        }
        if (toolCalls.length >= MAX_TOOL_CALLS) {
          answer = withoutToolCall(reply, call) || 'I couldn’t finish that within three look-ups. Ask about one thing at a time, or name the client.'
          break
        }
        const result = runTool(call.tool as ToolName, call.args, me)
        toolCalls.push({ tool: call.tool, args: call.args, result })
        prompt = `${prompt} ${reply}\nTool result for ${call.tool}:\n${resultText(result)}\nAssistant:`
      }
    } catch (err) {
      if (!(err instanceof LocalAiError)) console.error('[ai] chat failed', err)
      return { success: false, error: err instanceof LocalAiError ? err.message : 'The assistant couldn’t answer. Try again.' }
    }

    try {
      const save = db.prepare('INSERT INTO ai_conversations (session_id, role, content, client_ref, metadata, user_id, user_name) VALUES (?, ?, ?, ?, ?, ?, ?)')
      db.transaction(() => {
        save.run(params.sessionId, 'user', params.message, params.clientRef ?? null, null, me.id, me.name)
        save.run(params.sessionId, 'assistant', answer, params.clientRef ?? null, toolCalls.length ? JSON.stringify(toolCalls) : null, me.id, me.name)
      })()
    } catch (err) {
      console.error('[ai] the conversation couldn’t be saved', err) // the answer still shows
    }
    return { success: true, response: answer, toolCalls }
  })

  // A conversation is its owner's; partners and managers can read every one.
  const mayRead = (sessionId: string, me: Actor): boolean => {
    if (canManage(me)) return true
    const other = getDb().prepare('SELECT 1 FROM ai_conversations WHERE session_id = ? AND (user_id IS NULL OR user_id <> ?) LIMIT 1').get(sessionId, me.id)
    return !other
  }

  // Get conversation history for a session
  ipcMain.handle('ai:get-history', (_e, sessionId: string) => {
    try {
      const me = actor()
      if (typeof sessionId !== 'string' || !mayRead(sessionId, me)) return []
      return getDb().prepare('SELECT * FROM ai_conversations WHERE session_id = ? ORDER BY created_at, id').all(sessionId)
    } catch {
      return []
    }
  })

  // The person's own conversations (partners and managers: everyone's), for the history browser
  ipcMain.handle('ai:list-sessions', () => {
    try {
      const me = actor()
      const own = canManage(me) ? '' : 'WHERE session_id NOT IN (SELECT session_id FROM ai_conversations WHERE user_id IS NULL OR user_id <> ?)'
      return getDb().prepare(`
        SELECT session_id,
          MIN(created_at) as started_at,
          COUNT(*) as message_count,
          MAX(client_ref) as client_ref,
          (SELECT content FROM ai_conversations a2
           WHERE a2.session_id = ai_conversations.session_id AND a2.role = 'user'
           ORDER BY a2.created_at LIMIT 1) as first_message
        FROM ai_conversations
        ${own}
        GROUP BY session_id
        ORDER BY started_at DESC
        LIMIT 50
      `).all(...(own ? [me.id] : []))
    } catch {
      return []
    }
  })

  // Delete a session: its owner, or a partner or manager
  ipcMain.handle('ai:delete-session', (_e, sessionId: string) => {
    try {
      const me = actor()
      if (typeof sessionId !== 'string' || !mayRead(sessionId, me)) return { success: false, error: 'That conversation isn’t yours to delete.' }
      getDb().prepare('DELETE FROM ai_conversations WHERE session_id = ?').run(sessionId)
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof UserFacingError ? err.message : 'The conversation couldn’t be deleted.' }
    }
  })
}
