import { startScheduler } from "./lib/hub";

if (process.env.HUB_STATIC !== "1") startScheduler();
