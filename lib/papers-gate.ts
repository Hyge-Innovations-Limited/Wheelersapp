import type { DriverPaperNeed, DriverPapersResponse } from "@/lib/api";

export const PAPERS_GATE_TIMEOUT_MS = 6000;

export type PapersGate = { ok: true } | { ok: false; toDo: number };

/**
 * Before a driver's tap on Go online: are their papers in order? `toDo` comes
 * from the server (a paper sent and waiting for review already counts as
 * done). If the papers cannot be read in time (no network, no token, slow),
 * the answer is ok: a driver is never stranded by a bad connection.
 */
export async function checkPapersGate(deps: {
  getToken: () => Promise<string | null | undefined>;
  fetchPapers: (input: { accessToken: string }) => Promise<Pick<DriverPapersResponse, "toDo">>;
  timeoutMs?: number;
}): Promise<PapersGate> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const read = (async () => {
      const token = await deps.getToken();
      if (!token) throw new Error("no token");
      return deps.fetchPapers({ accessToken: token });
    })();
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("timeout")), deps.timeoutMs ?? PAPERS_GATE_TIMEOUT_MS);
    });
    const papers = await Promise.race([read, timeout]);
    const toDo = Number(papers?.toDo);
    return Number.isFinite(toDo) && toDo > 0 ? { ok: false, toDo } : { ok: true };
  } catch {
    return { ok: true };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export const PAPERS_GATE_BODY = "Send what is missing to go online.";

/**
 * The sign-up papers step: the required needs nothing good has been sent for
 * yet (missing, sent back or expired), by name. A paper sent and waiting to
 * be checked counts as sent, as it does for going online.
 */
export function papersStillToSend(papers: { needs: Pick<DriverPaperNeed, "label" | "required" | "state">[] }): string[] {
  return papers.needs
    .filter((need) => need.required && (need.state === "missing" || need.state === "rejected" || need.state === "expired"))
    .map((need) => need.label);
}
