const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Armazena as salas na memória
const rooms = new Map(); // roomId -> { players: Map, pack: {...}, createdAt }

io.on('connection', (socket) => {
  console.log('Usuário conectado:', socket.id);

  // Criar sala
  socket.on('create-room', ({ name, packData }) => {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    rooms.set(roomId, {
      players: new Map([[socket.id, { name, id: socket.id, recordings: new Map() }]]),
      pack: packData || null,
      createdAt: Date.now()
    });
    socket.join(roomId);
    socket.emit('room-created', {
      roomId,
      players: Array.from(rooms.get(roomId).players.entries())
    });
    console.log('Sala criada:', roomId, 'por', name);
  });

  // Entrar em sala
  socket.on('join-room', ({ roomId, name }) => {
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('error', { message: 'Sala não encontrada' });
      return;
    }
    room.players.set(socket.id, { name, id: socket.id, recordings: new Map() });
    socket.join(roomId);
    socket.emit('room-joined', {
      roomId,
      players: Array.from(room.players.entries()),
      pack: room.pack
    });
    socket.to(roomId).emit('player-joined', {
      player: { id: socket.id, name },
      players: Array.from(room.players.entries())
    });
  });

  // Sincronizar gravação de um trecho
  socket.on('update-recording', ({ roomId, trechoIdx, status }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player) return;
    player.recordings.set(trechoIdx, status);
    socket.to(roomId).emit('recording-updated', {
      playerId: socket.id,
      trechoIdx,
      status
    });
  });

  // Tocar dublagem sincronizada
  socket.on('play-dub', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    io.to(roomId).emit('sync-play-dub');
  });

  // Atualizar pacote da sala
  socket.on('update-pack', ({ roomId, packData }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    room.pack = packData;
    socket.to(roomId).emit('pack-updated', { pack: packData });
  });

  socket.on('disconnect', () => {
    rooms.forEach((room, roomId) => {
      if (room.players.has(socket.id)) {
        const playerName = room.players.get(socket.id).name;
        room.players.delete(socket.id);
        io.to(roomId).emit('player-left', {
          playerId: socket.id,
          playerName,
          players: Array.from(room.players.entries())
        });
        if (room.players.size === 0) {
          rooms.delete(roomId);
        }
      }
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor Voicer rodando na porta ${PORT}`);
});
