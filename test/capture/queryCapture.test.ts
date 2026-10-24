import { QueryClient } from "@tanstack/react-query";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { attachFetchMonitor } from "../../src/capture/attachFetch";
import { networkMonitor } from "../../src/capture/networkMonitor";
import { tapQueryClient } from "../../src/capture/queryCapture";

/* A fake network: `/s/<status>?…` answers that status with the URL in the body. */
const realFetch = globalThis.fetch;
let detach: () => void = () => {};
beforeAll(() => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    const status = Number(/\/s\/(\d+)/.exec(url)?.[1] ?? 200);
    await new Promise((r) => setTimeout(r, 2));
    return new Response(JSON.stringify({ url }), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  detach = attachFetchMonitor();
});
afterAll(() => {
  detach();
  globalThis.fetch = realFetch;
});
beforeEach(() => networkMonitor.clear());

const settle = () => new Promise((r) => setTimeout(r, 30));
const all = () => networkMonitor.getSnapshot();
const queryRows = (key: string) => all().filter((e) => e.kind === "query" && e.query?.sub === "query" && e.url === key);
const mutationRow = (id: number) => all().find((e) => e.kind === "query" && e.query?.sub === "mutation" && e.query.hash === String(id));
const http = (part: string) => all().find((e) => (e.kind ?? "http") === "http" && e.url.includes(part));

function client() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const dispose = tapQueryClient(qc as never);
  return { qc, dispose };
}

describe("queries", () => {
  test("one row per key; it holds the data, and the request it made is linked both ways", async () => {
    const { qc } = client();
    await qc.fetchQuery({ queryKey: ["users"], queryFn: () => fetch("/s/200?q=users").then((r) => r.json()) });
    await settle();
    const [row] = queryRows('["users"]');
    const request = http("q=users")!;
    expect(row.state).toBe("success");
    expect(row.responsePayload).toEqual({ url: "/s/200?q=users" });
    expect(row.sizeBytes).toBeGreaterThan(0);
    expect(request.ownerId).toBe(row.id);
    expect(row.query?.causedIds).toEqual([request.id]);
  });

  test("refetching the same key reuses the row and counts each fetch", async () => {
    const { qc } = client();
    const options = { queryKey: ["count"], queryFn: () => fetch("/s/200?q=count").then((r) => r.json()) };
    await qc.fetchQuery(options);
    await qc.refetchQueries({ queryKey: ["count"] });
    await qc.invalidateQueries({ queryKey: ["count"] });
    await settle();
    const rows = queryRows('["count"]');
    expect(rows).toHaveLength(1);
    expect(rows[0].query?.fetchCount).toBeGreaterThanOrEqual(2);
    expect(rows[0].frames?.some((f) => f.event === "invalidate")).toBe(true);
  });

  test("removal from the cache is recorded, not deleted", async () => {
    const { qc } = client();
    await qc.fetchQuery({ queryKey: ["gone"], queryFn: () => 1 });
    qc.removeQueries({ queryKey: ["gone"] });
    const [row] = queryRows('["gone"]');
    expect(row.query?.gcRemoved).toBe(true);
    expect(row.frames?.at(-1)?.event).toBe("removed");
  });

  test("a request started after an await in queryFn has no owner", async () => {
    const { qc } = client();
    await qc.fetchQuery({
      queryKey: ["late"],
      queryFn: async () => {
        await Promise.resolve();
        return fetch("/s/200?q=late").then((r) => r.json());
      },
    });
    await settle();
    expect(http("q=late")?.ownerId).toBeUndefined();
  });

  test("two clients with the same key get two rows", async () => {
    const a = client();
    const b = client();
    await a.qc.fetchQuery({ queryKey: ["shared"], queryFn: () => "a" });
    await b.qc.fetchQuery({ queryKey: ["shared"], queryFn: () => "b" });
    expect(queryRows('["shared"]').map((r) => r.responsePayload).sort()).toEqual(["a", "b"]);
  });

  test("dispose and reinstall of the same client (Strict Mode) does not duplicate rows", async () => {
    const { qc, dispose } = client();
    await qc.fetchQuery({ queryKey: ["strict"], queryFn: () => 1 });
    dispose();
    tapQueryClient(qc as never);
    await qc.fetchQuery({ queryKey: ["strict"], queryFn: () => 2, staleTime: 0 });
    expect(queryRows('["strict"]')).toHaveLength(1);
  });

  test("a failed query keeps the error and borrows the body of the request it caused", async () => {
    const { qc } = client();
    await qc
      .fetchQuery({
        queryKey: ["fails"],
        queryFn: async () => {
          const r = await fetch("/s/409?q=fails");
          if (!r.ok) throw Object.assign(new Error("conflict"), { status: r.status });
          return r.json();
        },
      })
      .catch(() => {});
    await settle();
    const [row] = queryRows('["fails"]');
    const error = row.error as { message: string; responseFrom?: string; responseMatch?: string; response?: unknown };
    expect(row.state).toBe("error");
    expect(error.message).toBe("conflict");
    expect(error.responseFrom).toBe(http("q=fails")?.id);
    expect(error.responseMatch).toBe("caused");
    expect(error.response).toEqual({ url: "/s/409?q=fails" });
  });
});

describe("mutations", () => {
  test("variables, data, and a timeline of mutate then success, settled once", async () => {
    const { qc } = client();
    const m = qc.getMutationCache().build(qc, { mutationFn: async (v: { id: number }) => ({ saved: v.id }) });
    await m.execute({ id: 3 });
    await settle();
    const row = mutationRow(m.mutationId)!;
    expect(row.requestPayload).toEqual({ id: 3 });
    expect(row.responsePayload).toEqual({ saved: 3 });
    expect(row.frames?.map((f) => f.event)).toEqual(["mutate", "success"]);
    const end = row.endTime;
    qc.getMutationCache().notify({ type: "observerRemoved", mutation: m } as never);
    expect(mutationRow(m.mutationId)!.endTime).toBe(end);
  });

  test("an error that keeps the Response links exactly, past an earlier decoy", async () => {
    const { qc } = client();
    await fetch("/s/409?q=decoy");
    const m = qc.getMutationCache().build(qc, {
      onMutate: async () => {
        await new Promise((r) => setTimeout(r, 1));
      },
      mutationFn: async () => {
        const r = await fetch("/s/409?q=mine");
        throw Object.assign(new Error("conflict"), { response: r });
      },
    });
    await m.execute({}).catch(() => {});
    await settle();
    const error = mutationRow(m.mutationId)!.error as { responseFrom?: string; responseMatch?: string };
    expect(error.responseMatch).toBe("exact");
    expect(error.responseFrom).toBe(http("q=mine")?.id);
  });

  test("a mutation whose row was cleared mid-flight gets a row again with its outcome", async () => {
    const { qc } = client();
    const m = qc.getMutationCache().build(qc, {
      mutationFn: async () => {
        networkMonitor.clear((e) => e.kind === "query");
        throw new Error("after the clear");
      },
    });
    await m.execute({}).catch(() => {});
    const row = mutationRow(m.mutationId);
    expect(row?.state).toBe("error");
    expect((row?.error as { message?: string })?.message).toBe("after the clear");
  });

  test("a request made in mutationFn after onMutate is still the mutation's", async () => {
    const { qc } = client();
    const m = qc.getMutationCache().build(qc, {
      onMutate: async () => {
        await new Promise((r) => setTimeout(r, 1));
      },
      mutationFn: () => fetch("/s/200?q=after-onmutate").then((r) => r.json()),
    });
    await m.execute({});
    await settle();
    expect(http("q=after-onmutate")?.ownerId).toBe(mutationRow(m.mutationId)?.id);
  });
});
