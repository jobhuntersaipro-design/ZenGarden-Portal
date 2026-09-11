// Local-dev only. The app talks to Postgres through the Neon serverless driver,
// which speaks the Postgres wire protocol over a WebSocket to Neon's `wsproxy`.
// There is no Neon in a local/offline environment, so this tiny proxy stands in
// for it: every WebSocket connection is tunnelled, byte for byte, to a plain TCP
// Postgres. It is the exact contract Neon's own `wsproxy` implements — connect,
// read `?address=host:port`, pipe both ways — and nothing here runs in production.
import net from "node:net";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.NEON_LOCAL_PROXY_PORT ?? 5433);

const wss = new WebSocketServer({ port: PORT }, () => {
  console.log(`[neon-local-proxy] listening on ws://127.0.0.1:${PORT}/v1`);
});

wss.on("connection", (ws, req) => {
  const url = new URL(req.url ?? "", "http://localhost");
  const address = url.searchParams.get("address");
  if (!address) {
    ws.close(1008, "missing ?address=host:port");
    return;
  }
  const [host, portRaw] = address.split(":");
  const port = Number(portRaw);

  const socket = net.connect({ host, port }, () => {
    // connected to Postgres
  });

  ws.on("message", (data) => socket.write(data));
  socket.on("data", (data) => {
    if (ws.readyState === ws.OPEN) ws.send(data);
  });

  const shutdown = () => {
    socket.destroy();
    if (ws.readyState === ws.OPEN || ws.readyState === ws.CONNECTING) ws.close();
  };
  ws.on("close", shutdown);
  ws.on("error", shutdown);
  socket.on("close", shutdown);
  socket.on("error", (err) => {
    console.error(`[neon-local-proxy] tcp error to ${address}:`, err.message);
    shutdown();
  });
});

wss.on("error", (err) => {
  console.error("[neon-local-proxy] server error:", err.message);
  process.exit(1);
});
