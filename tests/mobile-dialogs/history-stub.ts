// Exact Vite alias for the isolated browser test only. No application server functions are imported.
import type { ChartFeed } from "../../src/lib/chartFeed.server";
export async function getChartFeed(): Promise<ChartFeed> {
  return fetch("/isolated-chart-server").then((response) => response.json());
}
export async function getCandleHistoryPage() {
  return [];
}
