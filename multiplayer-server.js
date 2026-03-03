import { WebSocketServer } from "ws";

const PORT = Number(process.env.PORT || 8080);
const rooms = new Map();

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function send(sock, payload) {
  if (!sock || sock.readyState !== 1) return;
  sock.send(JSON.stringify(payload));
}

function closeRoomIfEmpty(code) {
  const room = rooms.get(code);
  if (!room) return;
  const hostOpen = room.host && room.host.readyState === 1;
  const guestOpen = room.guest && room.guest.readyState === 1;
  if (!hostOpen && !guestOpen) rooms.delete(code);
}

function attachSocketMeta(sock) {
  sock.roomCode = "";
  sock.slot = 0;
}

function handleCreateRoom(sock) {
  let code = makeCode();
  while (rooms.has(code)) code = makeCode();
  rooms.set(code, { host: sock, guest: null });
  sock.roomCode = code;
  sock.slot = 1;
  send(sock, { type: "room_created", roomCode: code });
}

function handleJoinRoom(sock, roomCodeRaw) {
  const roomCode = String(roomCodeRaw || "").trim().toUpperCase();
  const room = rooms.get(roomCode);
  if (!room) return send(sock, { type: "error", message: "Room not found." });
  if (!room.host || room.host.readyState !== 1) return send(sock, { type: "error", message: "Host unavailable." });
  if (room.guest && room.guest.readyState === 1) return send(sock, { type: "error", message: "Room already full." });

  room.guest = sock;
  sock.roomCode = roomCode;
  sock.slot = 2;
  send(sock, { type: "room_joined", roomCode });
  send(room.host, { type: "peer_joined", roomCode });
}

function handleGuestInput(sock, input) {
  if (sock.slot !== 2) return;
  const room = rooms.get(sock.roomCode);
  if (!room || !room.host) return;
  send(room.host, { type: "guest_input", input: input || {} });
}

function handleStateSnapshot(sock, seq, snapshot) {
  if (sock.slot !== 1) return;
  const room = rooms.get(sock.roomCode);
  if (!room || !room.guest) return;
  send(room.guest, { type: "state_snapshot", seq: Number(seq || 0), snapshot: snapshot || {} });
}

const wss = new WebSocketServer({ port: PORT });
console.log(`Multiplayer server running on ws://localhost:${PORT}`);

wss.on("connection", (sock) => {
  attachSocketMeta(sock);

  sock.on("message", (buf) => {
    let msg;
    try {
      msg = JSON.parse(String(buf));
    } catch {
      return;
    }
    if (msg.type === "create_room") return handleCreateRoom(sock);
    if (msg.type === "join_room") return handleJoinRoom(sock, msg.roomCode);
    if (msg.type === "guest_input") return handleGuestInput(sock, msg.input);
    if (msg.type === "state_snapshot") return handleStateSnapshot(sock, msg.seq, msg.snapshot);
  });

  sock.on("close", () => {
    if (!sock.roomCode) return;
    const room = rooms.get(sock.roomCode);
    if (!room) return;
    if (sock.slot === 1 && room.guest) send(room.guest, { type: "peer_left" });
    if (sock.slot === 2 && room.host) send(room.host, { type: "peer_left" });
    if (sock.slot === 1) room.host = null;
    if (sock.slot === 2) room.guest = null;
    closeRoomIfEmpty(sock.roomCode);
  });
});
