const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 3000;
const rooms = new Map();
app.use(express.static(__dirname));
app.get('/health', (_req, res) => res.json({ ok: true, game: 'TEN NIGHTS IN A HOTEL 10.2' }));

function roomInfo(code) {
  if (!rooms.has(code)) rooms.set(code, { host: null, guest: null, state: null });
  return rooms.get(code);
}
io.on('connection', socket => {
  socket.on('room:join', payload => {
    const room = String(payload && payload.room || 'HOTEL').toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 16) || 'HOTEL';
    const data = roomInfo(room);
    let role;
    if (!data.host || !io.sockets.sockets.has(data.host)) {
      data.host = socket.id; role = 'host';
    } else if (!data.guest || !io.sockets.sockets.has(data.guest)) {
      data.guest = socket.id; role = 'guest';
    } else {
      socket.emit('room:error', 'Комната уже заполнена (максимум 2 игрока).');
      return;
    }
    socket.data.room = room;
    socket.data.role = role;
    socket.join(room);
    socket.emit('room:joined', { room, role, players: [data.host, data.guest].filter(Boolean).length });
    if (data.state) socket.emit('game:state', data.state);
    io.to(room).emit('room:players', { count: [data.host, data.guest].filter(Boolean).length });
    console.log(`${socket.id} joined ${room} as ${role}`);
  });

  socket.on('game:state', payload => {
    const room = socket.data.room;
    if (!room || socket.data.role !== 'host' || !payload || payload.room !== room || !payload.state) return;
    const data = roomInfo(room);
    data.state = payload.state;
    socket.to(room).emit('game:state', payload.state);
  });

  socket.on('player:action', payload => {
    const room = socket.data.room;
    if (!room || !payload || payload.room !== room) return;
    socket.to(room).emit('player:action', { role: socket.data.role, action: payload.action });
  });

  socket.on('disconnect', () => {
    const room = socket.data.room;
    if (!room) return;
    const data = rooms.get(room);
    if (!data) return;
    if (data.host === socket.id) {
      data.host = data.guest && io.sockets.sockets.has(data.guest) ? data.guest : null;
      if (data.host) {
        const promoted = io.sockets.sockets.get(data.host);
        if (promoted) { promoted.data.role = 'host'; promoted.emit('room:joined', { room, role: 'host', players: 1 }); }
      }
    }
    if (data.guest === socket.id) data.guest = null;
    io.to(room).emit('room:players', { count: [data.host, data.guest].filter(Boolean).length });
    if (!data.host && !data.guest) rooms.delete(room);
  });
});
server.listen(PORT, () => console.log(`TEN NIGHTS online server listening on ${PORT}`));
