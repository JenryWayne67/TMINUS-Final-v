import net from "node:net";
import { randomBytes } from "node:crypto";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function framed(payload) {
  const data = Buffer.from(JSON.stringify(payload)),
    mask = Buffer.from([0x19, 0x23, 0x37, 0x42]);
  const header = data.length < 126 ? 6 : data.length <= 65535 ? 8 : 14;
  const b = Buffer.alloc(header + data.length);
  b[0] = 0x81;
  if (header === 6) b[1] = 0x80 | data.length;
  else if (header === 8) {
    b[1] = 0xfe;
    b.writeUInt16BE(data.length, 2);
  } else {
    b[1] = 0xff;
    b.writeBigUInt64BE(BigInt(data.length), 2);
  }
  mask.copy(b, header - 4);
  for (let i = 0; i < data.length; i++) b[header + i] = data[i] ^ mask[i % 4];
  return b;
}
export function wsClient(
  port,
  { deliveryDelayMs = 0, origin = `http://127.0.0.1:${port}` } = {},
) {
  const socket = net.connect(port, "127.0.0.1");
  let buf = Buffer.alloc(0),
    handshake = "",
    ready = false,
    closed = false;
  const queue = [],
    waiters = [];
  const deliver = (data) => {
    queue.push(data);
    for (let i = waiters.length - 1; i >= 0; i--) {
      const w = waiters[i];
      if (w.matches(data)) {
        waiters.splice(i, 1);
        clearTimeout(w.timer);
        w.resolve(data);
      }
    }
  };
  const emit = (data) => {
    if (deliveryDelayMs) setTimeout(() => deliver(data), deliveryDelayMs);
    else deliver(data);
  };
  socket.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    if (!ready) {
      const end = buf.indexOf("\r\n\r\n");
      if (end < 0) return;
      handshake = buf.subarray(0, end + 4).toString();
      buf = buf.subarray(end + 4);
      ready = true;
      emit({
        kind: "handshake",
        status: handshake.split(" ")[1],
        header: handshake,
      });
    }
    while (buf.length >= 2) {
      const op = buf[0] & 15;
      let len = buf[1] & 127,
        at = 2;
      if (len === 126) {
        if (buf.length < 4) return;
        len = buf.readUInt16BE(2);
        at = 4;
      } else if (len === 127) {
        if (buf.length < 10) return;
        const n = buf.readBigUInt64BE(2);
        if (n > 65536n) throw Error("oversize test frame");
        len = Number(n);
        at = 10;
      }
      if (buf.length < at + len) return;
      const bytes = buf.subarray(at, at + len);
      buf = buf.subarray(at + len);
      if (op === 1) {
        try {
          emit(JSON.parse(bytes.toString()));
        } catch (e) {
          emit({ kind: "bad-json" });
        }
      } else if (op === 8) emit({ kind: "close" });
    }
  });
  socket.on("close", () => {
    closed = true;
    emit({ kind: "socket-closed" });
  });
  socket.on("error", (e) => emit({ kind: "socket-error", error: e.message }));
  const head = `GET /ws HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${randomBytes(16).toString("base64")}\r\nSec-WebSocket-Version: 13\r\n${origin ? `Origin: ${origin}\r\n` : ""}\r\n`;
  socket.once("connect", () => socket.write(head));
  return {
    get closed() {
      return closed;
    },
    socket,
    send(x) {
      socket.write(framed(x));
    },
    waitFor(kind, predicate = () => true, timeout = 2500) {
      const prior = queue.find((m) => m.kind === kind && predicate(m));
      if (prior) return Promise.resolve(prior);
      return new Promise((resolve, reject) => {
        const w = {
          matches: (m) => m.kind === kind && predicate(m),
          resolve,
          timer: null,
        };
        w.timer = setTimeout(() => {
          const at = waiters.indexOf(w);
          if (at >= 0) waiters.splice(at, 1);
          reject(Error(`Timed out waiting for ${kind}`));
        }, timeout);
        waiters.push(w);
      });
    },
    close() {
      socket.destroy();
    },
  };
}
