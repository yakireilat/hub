import type { ActResult, Command, ServiceInput, ServiceSuggestion, ServicesPayload, ServiceView, TodayView } from "@hub/core";

export type SaveResult = ActResult & { service?: ServiceView; errors?: Record<string, string> };

/** What the UI may ask of the hub. Server mode answers over /api/v1; the demo answers in the browser. */
export interface HubClient {
  today(): Promise<TodayView>;
  commands(): Promise<Command[]>;
  act(itemId: string, actionId: string): Promise<ActResult>;
  capture(text: string): Promise<ActResult>;
  services(): Promise<ServicesPayload>;
  /** Smart add: a suggestion for a typed name or address. Throws with a readable message on bad input. */
  detectService(input: string): Promise<ServiceSuggestion>;
  addService(input: ServiceInput): Promise<SaveResult>;
  updateService(id: string, input: ServiceInput): Promise<SaveResult>;
  removeService(id: string): Promise<ActResult>;
  restoreService(id: string): Promise<ActResult>;
}
