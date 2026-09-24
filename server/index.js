import { Server as SocketServer } from 'socket.io';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { TikiTopple } from '../src/game.js';

const require = createRequire(import.meta.url);
const { Server: BoardServer, Origins } = require('boardgame.io/server');

const production = process.env.NODE_ENV === 'production';
const publicOrigin = process.env.GAME_ORIGIN || process.env.RENDER_EXTERNAL_URL;
const board = BoardServer({ games: [TikiTopple], origins: [Origins.LOCALHOST, 'http://localhost:5173', 'http://127.0.0.1:5173', publicOrigin].filter(Boolean) });

if (production) {
  const distDir = resolve(process.cwd(), 'dist');
  board.app.use(async (ctx, next) => {
    if (ctx.path === '/healthz') { ctx.status = 200; ctx.body = 'ok'; return; }
    if (ctx.path.startsWith('/games') || ctx.path.startsWith('/socket.io') || ctx.path.startsWith('/chat/socket.io')) return next();
    const requestedPath = decodeURIComponent(ctx.path);
    const candidate = resolve(distDir, `.${requestedPath}`);
    if (candidate !== distDir && !candidate.startsWith(`${distDir}${sep}`)) { ctx.status = 400; return; }
    const file = existsSync(candidate) && statSync(candidate).isFile() ? candidate : resolve(distDir, 'index.html');
    if (!existsSync(file)) { ctx.status = 503; ctx.body = 'Game client has not been built'; return; }
    ctx.type = extname(file) || 'html';
    ctx.body = createReadStream(file);
  });
}

const port = Number(process.env.PORT) || 8000;
const servers = await board.run(port);
const chatOptions = { cors: { origin: publicOrigin || true, methods: ['GET', 'POST'] } };
const io = production
  ? new SocketServer(servers.appServer, { ...chatOptions, path: '/chat/socket.io' })
  : new SocketServer(createServer(), chatOptions);
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
if (!production) {
  const chatServer = io.httpServer;
  chatServer.listen(8001, () => console.log('Chat server listening on :8001'));
}

