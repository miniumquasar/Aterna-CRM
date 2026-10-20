/**
 * Reading a tool call out of a model's reply.
 *
 * The assistant asks for a tool with a JSON object: {"tool": "search_clients",
 * "args": {"query": "Smith"}}. Small local models wrap it in prose or a code
 * fence, put the arguments at the top level, or nest objects in the arguments,
 * so a pattern match isn't enough: the reply is scanned for an object that
 * starts with "tool" and read to its matching brace, minding strings.
 */

export interface ToolCall {
  tool: string
  args: Record<string, unknown>
  /** The JSON as it appeared in the reply, to take out of what the person sees. */
  raw: string
}

/** The index of the brace that closes the object opening at `start`, or -1. */
function closingBrace(text: string, start: number): number {
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (c === '\\') escaped = true
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') inString = true
    else if (c === '{') depth += 1
    else if (c === '}') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

/** The first tool call in a reply, or null when there is none. */
export function findToolCall(text: string): ToolCall | null {
  const opening = /\{\s*"tool"\s*:/g
  let m: RegExpExecArray | null
  while ((m = opening.exec(text))) {
    const end = closingBrace(text, m.index)
    if (end < 0) return null
    const raw = text.slice(m.index, end + 1)
    let value: unknown
    try {
      value = JSON.parse(raw)
    } catch {
      continue
    }
    const v = value as Record<string, unknown>
    if (typeof v.tool !== 'string' || !v.tool.trim()) continue
    const { tool, args, ...rest } = v
    const given = args && typeof args === 'object' && !Array.isArray(args) ? (args as Record<string, unknown>) : {}
    // Arguments written beside "tool" rather than inside "args" count too.
    return { tool: (tool as string).trim(), args: { ...rest, ...given }, raw }
  }
  return null
}

/** The reply without a tool call (and the code fence around it), for showing when the assistant stopped mid-way. */
export function withoutToolCall(text: string, call: ToolCall): string {
  return text
    .replace(call.raw, '')
    .replace(/```(?:json)?\s*```/g, '')
    .trim()
}
