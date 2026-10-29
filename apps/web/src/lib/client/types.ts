import type { ActResult, Command, TodayView } from "@hub/core";

/** What the UI may ask of the hub. Server mode answers over /api/v1; the demo answers in the browser. */
export interface HubClient {
  today(): Promise<TodayView>;
  commands(): Promise<Command[]>;
  act(itemId: string, actionId: string): Promise<ActResult>;
  capture(text: string): Promise<ActResult>;
}
