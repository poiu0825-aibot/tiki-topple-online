import { Server as BoardServer, Origins } from 'boardgame.io/server';
import { Server as SocketServer } from 'socket.io';
import { createServer } from 'node:http';
import { TikiTopple } from '../src/game.js';

const board = BoardServer({ games: [TikiTopple], origins: [Origins.LOCALHOST, 'http://localhost:5173', 'http://127.0.0.1:5173', process.env.GAME_ORIGIN].filter(Boolean) });
board.run(8000);

const httpServer = createServer();
const io = new SocketServer(httpServer, { cors: { origin: process.env.GAME_ORIGIN || true, methods: ['GET', 'POST'] } });
io.on('connection', socket => {
  socket.on('room:join', ({ room, name }) => {
    if (!room) return;
    socket.join(`room:${room}`);
    socket.to(`room:${room}`).emit('chat:system', { text: `${name || '玩家'} 加入聊天室`, at: Date.now() });
  });
  socket.on('chat:message', ({ room, name, text }) => {
    if (!room || !text?.trim()) return;
    io.to(`room:${room}`).emit('chat:message', { name: String(name || '玩家').slice(0, 20), text: String(text).slice(0, 240), at: Date.now() });
  });
  socket.on('chat:emote', ({ room, name, emoji, phrase }) => {
    if (!room) return;
    io.to(`room:${room}`).emit('chat:emote', { name: String(name || '玩家').slice(0, 20), emoji, phrase, at: Date.now() });
  });
});
httpServer.listen(8001, () => console.log('Chat server listening on :8001'));

