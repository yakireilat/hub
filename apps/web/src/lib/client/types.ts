import type { ActResult, AutomationsPayload, Command, InboxPayload, NodesPayload, ServiceInput, ServiceSuggestion, ServicesPayload, ServiceView, TodayView } from "@hub/core";

export type SaveResult = ActResult & { service?: ServiceView; errors?: Record<string, string> };

/** What the UI may ask of the hub. Server mode answers over /api/v1; the demo answers in the browser. */
export interface HubClient {
  today(): Promise<TodayView>;
  commands(): Promise<Command[]>;
  act(itemId: string, actionId: string): Promise<ActResult>;
  capture(text: string): Promise<ActResult>;
  services(): Promise<ServicesPayload>;
  inbox(): Promise<InboxPayload>;
  snooze(itemId: string, until: number): Promise<ActResult>;
  unsnooze(itemId: string): Promise<ActResult>;
  /** n8n workflows with today's runs. */
  automations(): Promise<AutomationsPayload>;
  setWorkflowActive(id: string, active: boolean): Promise<ActResult>;
  /** Node tiles: tailnet presence and node-exporter metrics per machine. */
  nodes(): Promise<NodesPayload>;
  /** Smart add: a suggestion for a typed name or address. Throws with a readable message on bad input. */
  detectService(input: string): Promise<ServiceSuggestion>;
  addService(input: ServiceInput): Promise<SaveResult>;
  updateService(id: string, input: ServiceInput): Promise<SaveResult>;
  removeService(id: string): Promise<ActResult>;
  restoreService(id: string): Promise<ActResult>;
}
