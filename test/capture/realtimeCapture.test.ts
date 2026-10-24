import { beforeEach, describe, expect, test } from "vitest";
import { networkMonitor } from "../../src/capture/networkMonitor";
import { tapRealtimeAdapter, type RealtimeAdapterLike } from "../../src/capture/realtimeCapture";

class FakeSocket implements RealtimeAdapterLike {
  listener: ((p: { event: string; data: unknown }) => void) | null = null;
  presence: ((s: string) => void) | null = null;
  connected = 0;
  connect() {
    this.connected += 1;
  }
  disconnect() {}
  subscribe() {}
  onMessage(cb: (p: { event: string; data: unknown }) => void) {
    this.listener = cb;
  }
  onPresenceUpdate(cb: (s: string) => void) {
    this.presence = cb;
  }
  extra() {
    return this.connected;
  }
}

const sockets = () => networkMonitor.getSnapshot().filter((e) => e.kind === "ws");

beforeEach(() => networkMonitor.clear());

describe("tapRealtimeAdapter", () => {
  test("a connection is one row; its frames go on it in order", () => {
    const raw = new FakeSocket();
    const socket = tapRealtimeAdapter(raw, "actioncable");
    const received: unknown[] = [];
    socket.onMessage((p) => received.push(p.data));
    socket.connect("tok", "wss://rt.test/cable");
    socket.subscribe("orders");
    raw.listener?.({ event: "order.updated", data: { id: 1 } });
    socket.disconnect();

    const [row] = sockets();
    expect(row).toMatchObject({ method: "WS", transport: "actioncable", state: "success" });
    expect(row.frames?.map((f) => `${f.direction}:${f.event}`)).toEqual([
      "system:connect",
      "out:subscribe:orders",
      "in:order.updated",
      "system:disconnect",
    ]);
    expect(received).toEqual([{ id: 1 }]);
  });

  test("the token in the URL is hidden, readably", () => {
    const socket = tapRealtimeAdapter(new FakeSocket(), "ws");
    socket.connect("t", "wss://rt.test/cable?room=7&token=SECRET123&x=%20y");
    expect(sockets()[0].url).toBe("wss://rt.test/cable?room=7&token=•••&x=%20y");
  });

  test("a relative URL stays relative, every credential key hidden", () => {
    const socket = tapRealtimeAdapter(new FakeSocket(), "ws");
    socket.connect("t", "/cable?access_token=A&auth=B&accessToken=C");
    expect(sockets()[0].url).toBe("/cable?access_token=•••&auth=•••&accessToken=•••");
  });

  test("connecting again ends the previous connection instead of leaving it open forever", () => {
    const socket = tapRealtimeAdapter(new FakeSocket(), "ws");
    socket.connect("t", "wss://rt.test/a");
    socket.connect("t", "wss://rt.test/b");
    const [newer, older] = sockets();
    expect(newer.url).toBe("wss://rt.test/b");
    expect(newer.state).toBe("pending");
    expect(older.state).not.toBe("pending");
  });

  test("going offline closes the connection as an error", () => {
    const raw = new FakeSocket();
    const socket = tapRealtimeAdapter(raw, "ws");
    socket.onPresenceUpdate(() => {});
    socket.connect("t", "wss://rt.test/a");
    raw.presence?.("offline");
    expect(sockets()[0].state).toBe("error");
  });

  test("messages with no connection open are not recorded anywhere", () => {
    const raw = new FakeSocket();
    const socket = tapRealtimeAdapter(raw, "ws");
    socket.onMessage(() => {});
    raw.listener?.({ event: "early", data: 1 });
    expect(sockets()).toHaveLength(0);
  });

  test("the adapter's own methods and values still work through the tap", () => {
    const raw = new FakeSocket();
    const socket = tapRealtimeAdapter(raw, "ws");
    socket.connect("t", "/x");
    expect(socket.extra()).toBe(1);
    expect(socket.connected).toBe(1);
  });

  test("a listener that throws still has its frame recorded, and the error reaches the caller", () => {
    const raw = new FakeSocket();
    const socket = tapRealtimeAdapter(raw, "ws");
    socket.onMessage(() => {
      throw new Error("handler bug");
    });
    socket.connect("t", "/x");
    expect(() => raw.listener?.({ event: "boom", data: null })).toThrow("handler bug");
    expect(sockets()[0].frames?.some((f) => f.event === "boom")).toBe(true);
  });
});
