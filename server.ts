import express from 'express';
import { createServer as createViteServer } from 'vite';
import { Server } from 'socket.io';
import http from 'http';
import path from 'path';

const PORT = 3000;
const TICK_RATE = 60; // 60 updates per second for physics
const UPDATE_RATE = 15; // 15 updates per second sent to clients
const GRAVITY = 0.5;
const JUMP_SPEED = 12;
const MOVE_SPEED = 6;
const PLAYER_SIZE = 30;
const WORLD_WIDTH = 1200;
const WORLD_HEIGHT = 800;
const MAX_PLAYERS = 6;
const TAG_COOLDOWN = 60; // 1 second at 60fps

const PLATFORMS = [
  // Bottom floor
  { x: 0, y: 760, width: 1200, height: 40 },
  // Lower platforms
  { x: 100, y: 620, width: 250, height: 20 },
  { x: 500, y: 660, width: 200, height: 20 },
  { x: 850, y: 620, width: 250, height: 20 },
  // Mid platforms
  { x: 300, y: 480, width: 600, height: 20 },
  { x: 0, y: 400, width: 150, height: 20 },
  { x: 1050, y: 400, width: 150, height: 20 },
  // High platforms
  { x: 200, y: 300, width: 200, height: 20 },
  { x: 800, y: 300, width: 200, height: 20 },
  { x: 450, y: 180, width: 300, height: 20 },
];

interface Player {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  isIt: boolean;
  tagCooldown: number;
  lastProcessedInput: number;
  pendingInput?: { left: boolean; right: boolean; jump: boolean; seq: number };
  username: string;
  avatar: string;
}

interface Room {
  id: string;
  players: Record<string, Player>;
  itId: string | null;
}

const rooms: Record<string, Room> = {};

function createPlayer(id: string, username: string, avatar: string): Player {
  return {
    id,
    x: Math.random() * (WORLD_WIDTH - PLAYER_SIZE),
    y: Math.random() * (WORLD_HEIGHT - PLAYER_SIZE),
    vx: 0,
    vy: 0,
    color: `hsl(${Math.random() * 360}, 80%, 50%)`,
    isIt: false,
    tagCooldown: 0,
    lastProcessedInput: 0,
    username,
    avatar
  };
}

function checkRectCollision(p: {x: number, y: number}, plat: {x: number, y: number, width: number, height: number}) {
  return (
    p.x < plat.x + plat.width &&
    p.x + PLAYER_SIZE > plat.x &&
    p.y < plat.y + plat.height &&
    p.y + PLAYER_SIZE > plat.y
  );
}

function checkCollision(p1: Player, p2: Player) {
  return (
    p1.x < p2.x + PLAYER_SIZE &&
    p1.x + PLAYER_SIZE > p2.x &&
    p1.y < p2.y + PLAYER_SIZE &&
    p1.y + PLAYER_SIZE > p2.y
  );
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: '*' }
  });

  io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);
    let currentRoom: string | null = null;

    socket.on('joinRoom', (data: { roomId: string, username: string, avatar: string }) => {
      const { roomId, username, avatar } = data;
      if (currentRoom) {
        socket.leave(currentRoom);
        if (rooms[currentRoom]) {
          delete rooms[currentRoom].players[socket.id];
          if (Object.keys(rooms[currentRoom].players).length === 0) {
            delete rooms[currentRoom];
          }
        }
      }

      if (!rooms[roomId]) {
        rooms[roomId] = { id: roomId, players: {}, itId: null };
      }

      const room = rooms[roomId];
      if (Object.keys(room.players).length >= MAX_PLAYERS) {
        socket.emit('roomFull');
        return;
      }

      socket.join(roomId);
      currentRoom = roomId;

      const player = createPlayer(socket.id, username, avatar);
      room.players[socket.id] = player;

      if (!room.itId) {
        player.isIt = true;
        room.itId = socket.id;
      }

      socket.emit('joined', { id: socket.id, roomId });
      io.to(roomId).emit('playerJoined', player);
    });

    socket.on('input', (data: { left: boolean; right: boolean; jump: boolean; seq: number }) => {
      if (!currentRoom || !rooms[currentRoom]) return;
      const player = rooms[currentRoom].players[socket.id];
      if (!player) return;

      player.pendingInput = data;
    });

    socket.on('disconnect', () => {
      console.log('Player disconnected:', socket.id);
      if (currentRoom && rooms[currentRoom]) {
        const room = rooms[currentRoom];
        delete room.players[socket.id];
        
        if (room.itId === socket.id) {
          const remainingIds = Object.keys(room.players);
          if (remainingIds.length > 0) {
            const newItId = remainingIds[Math.floor(Math.random() * remainingIds.length)];
            room.players[newItId].isIt = true;
            room.itId = newItId;
          } else {
            delete rooms[currentRoom];
          }
        }
      }
    });
  });

  // Physics loop
  setInterval(() => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const playerIds = Object.keys(room.players);
      
      for (const id of playerIds) {
        const p = room.players[id];
        
        // Apply pending input
        let input = p.pendingInput;
        
        if (input) {
          if (input.left) p.vx = -MOVE_SPEED;
          else if (input.right) p.vx = MOVE_SPEED;
          else p.vx = 0;

          p.lastProcessedInput = input.seq;
          p.pendingInput = undefined;
        }

        // Move X
        p.x += p.vx;
        
        // Check X collisions
        for (const plat of PLATFORMS) {
          if (checkRectCollision(p, plat)) {
            if (p.vx > 0) p.x = plat.x - PLAYER_SIZE;
            else if (p.vx < 0) p.x = plat.x + plat.width;
            p.vx = 0;
          }
        }

        // Boundaries X
        if (p.x < 0) { p.x = 0; p.vx = 0; }
        if (p.x > WORLD_WIDTH - PLAYER_SIZE) { p.x = WORLD_WIDTH - PLAYER_SIZE; p.vx = 0; }

        // Apply gravity
        p.vy += GRAVITY;
        
        // Move Y
        p.y += p.vy;
        
        let onGround = false;
        
        // Check Y collisions
        for (const plat of PLATFORMS) {
          if (checkRectCollision(p, plat)) {
            if (p.vy > 0) {
              p.y = plat.y - PLAYER_SIZE;
              onGround = true;
            } else if (p.vy < 0) {
              p.y = plat.y + plat.height;
            }
            p.vy = 0;
          }
        }

        // Boundaries Y
        if (p.y > WORLD_HEIGHT - PLAYER_SIZE) {
          p.y = WORLD_HEIGHT - PLAYER_SIZE;
          p.vy = 0;
          onGround = true;
        }
        if (p.y < 0) {
          p.y = 0;
          p.vy = 0;
        }

        // Jump
        if (input && input.jump && onGround) {
          p.vy = -JUMP_SPEED;
        }
        
        // Cooldown
        if (p.tagCooldown > 0) p.tagCooldown--;
      }
      
      // Tag logic
      if (room.itId && room.players[room.itId]) {
        const itPlayer = room.players[room.itId];
        if (itPlayer.tagCooldown <= 0) {
          for (const id of playerIds) {
            if (id !== room.itId) {
              const other = room.players[id];
              if (checkCollision(itPlayer, other)) {
                itPlayer.isIt = false;
                other.isIt = true;
                other.tagCooldown = TAG_COOLDOWN;
                room.itId = id;
                break;
              }
            }
          }
        }
      }
    }
  }, 1000 / TICK_RATE);

  // Network update loop
  setInterval(() => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const state = Object.values(room.players).map(p => ({
        id: p.id,
        x: p.x,
        y: p.y,
        vx: p.vx,
        vy: p.vy,
        color: p.color,
        isIt: p.isIt,
        lastProcessedInput: p.lastProcessedInput,
        username: p.username,
        avatar: p.avatar
      }));
      io.to(roomId).emit('stateUpdate', state);
    }
  }, 1000 / UPDATE_RATE);

  // Vite middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
