/**
 * The assistant's briefing on Forecast and the client file, when the local
 * assistant is set up. Owned by the integrations domain, which fills it in;
 * the analytics domain's ForecastScreen and the clients domain's Overview
 * tab render it (keep it when replacing those placeholders). Render null
 * when the assistant isn't available, so the screen simply goes without.
 */
export type BriefingSubject = { kind: 'forecast' } | { kind: 'client'; clientId: number }

export interface AssistantBriefingProps {
  subject: BriefingSubject
}

export function AssistantBriefing(_props: AssistantBriefingProps): JSX.Element | null {
  return null
}
