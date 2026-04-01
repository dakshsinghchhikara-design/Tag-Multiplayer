import React, { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const WORLD_WIDTH = 1200;
const WORLD_HEIGHT = 800;
const PLAYER_SIZE = 30;
const GRAVITY = 0.5;
const JUMP_SPEED = 12;
const MOVE_SPEED = 6;

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

function checkRectCollision(p: {x: number, y: number}, plat: {x: number, y: number, width: number, height: number}) {
  return (
    p.x < plat.x + plat.width &&
    p.x + PLAYER_SIZE > plat.x &&
    p.y < plat.y + plat.height &&
    p.y + PLAYER_SIZE > plat.y
  );
}

interface PlayerState {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  isIt: boolean;
  lastProcessedInput?: number;
  username: string;
  avatar: string;
}

interface Input {
  seq: number;
  left: boolean;
  right: boolean;
  jump: boolean;
}

export default function Game({ roomId, username, avatar, timeLimit, onLeave }: { roomId: string, username: string, avatar: string, timeLimit: number, onLeave: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [timeRemaining, setTimeRemaining] = useState<number>(timeLimit);
  const [gameStatus, setGameStatus] = useState<'waiting' | 'playing' | 'finished'>('playing');
  const [gameOverData, setGameOverData] = useState<{ loserId: string | null, loserName: string } | null>(null);
  const imageCache = useRef<Record<string, HTMLImageElement>>({});
  
  // Mobile controls state
  const keysRef = useRef({ left: false, right: false, jump: false });
  const [joystickPos, setJoystickPos] = useState({ x: 0, y: 0 });
  const joystickBaseRef = useRef<HTMLDivElement>(null);
  const joystickTouchId = useRef<number | null>(null);

  useEffect(() => {
    const newSocket = io({
      transports: ['websocket'], // Force WebSockets, disable HTTP polling
    });
    setSocket(newSocket);

    newSocket.on('connect', () => {
      setConnectionStatus('connected');
      newSocket.emit('joinRoom', { roomId, username, avatar, timeLimit });
    });

    newSocket.on('connect_error', (err) => {
      console.error('Socket connection error:', err);
      setConnectionStatus('error');
    });

    newSocket.on('joined', (data: { id: string, roomId: string }) => {
      setMyId(data.id);
    });

    newSocket.on('roomFull', () => {
      alert('Room is full!');
      onLeave();
    });

    newSocket.on('gameOver', (data: { loserId: string | null, loserName: string }) => {
      setGameOverData(data);
      setGameStatus('finished');
    });

    return () => {
      newSocket.disconnect();
    };
  }, [roomId, onLeave]);

  useEffect(() => {
    if (!socket || !myId || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Game state
    let serverState: PlayerState[] = [];
    let players: Record<string, PlayerState> = {};
    
    // Interpolation buffers
    const stateBuffer: { time: number, state: PlayerState[] }[] = [];
    
    // Client-side prediction
    let pendingInputs: Input[] = [];
    let sequenceNumber = 0;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') keysRef.current.left = true;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') keysRef.current.right = true;
      if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Space') keysRef.current.jump = true;
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') keysRef.current.left = false;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') keysRef.current.right = false;
      if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Space') keysRef.current.jump = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    socket.on('stateUpdate', (data: { players: PlayerState[], timeRemaining: number, status: 'waiting' | 'playing' | 'finished' }) => {
      const newState = data.players;
      setTimeRemaining(data.timeRemaining);
      setGameStatus(data.status);
      
      serverState = newState;
      stateBuffer.push({ time: performance.now(), state: newState });
      
      // Keep buffer small
      if (stateBuffer.length > 10) {
        stateBuffer.shift();
      }

      // Reconciliation for local player
      const myServerState = newState.find(p => p.id === myId);
      if (myServerState) {
        // Remove processed inputs
        pendingInputs = pendingInputs.filter(input => input.seq > (myServerState.lastProcessedInput || 0));
        
        // Snap to server state
        if (!players[myId]) players[myId] = { ...myServerState };
        players[myId].x = myServerState.x;
        players[myId].y = myServerState.y;
        players[myId].vx = myServerState.vx;
        players[myId].vy = myServerState.vy;
        players[myId].isIt = myServerState.isIt;
        players[myId].color = myServerState.color;
        players[myId].username = myServerState.username;
        players[myId].avatar = myServerState.avatar;

        // Re-apply pending inputs
        for (const input of pendingInputs) {
          if (input.left) players[myId].vx = -MOVE_SPEED;
          else if (input.right) players[myId].vx = MOVE_SPEED;
          else players[myId].vx = 0;

          players[myId].x += players[myId].vx;
          for (const plat of PLATFORMS) {
            if (checkRectCollision(players[myId], plat)) {
              if (players[myId].vx > 0) players[myId].x = plat.x - PLAYER_SIZE;
              else if (players[myId].vx < 0) players[myId].x = plat.x + plat.width;
              players[myId].vx = 0;
            }
          }

          if (players[myId].x < 0) { players[myId].x = 0; players[myId].vx = 0; }
          if (players[myId].x > WORLD_WIDTH - PLAYER_SIZE) { players[myId].x = WORLD_WIDTH - PLAYER_SIZE; players[myId].vx = 0; }

          players[myId].vy += GRAVITY;
          players[myId].y += players[myId].vy;

          let onGround = false;
          for (const plat of PLATFORMS) {
            if (checkRectCollision(players[myId], plat)) {
              if (players[myId].vy > 0) {
                players[myId].y = plat.y - PLAYER_SIZE;
                onGround = true;
              } else if (players[myId].vy < 0) {
                players[myId].y = plat.y + plat.height;
              }
              players[myId].vy = 0;
            }
          }

          if (players[myId].y > WORLD_HEIGHT - PLAYER_SIZE) {
            players[myId].y = WORLD_HEIGHT - PLAYER_SIZE;
            players[myId].vy = 0;
            onGround = true;
          }
          if (players[myId].y < 0) {
            players[myId].y = 0;
            players[myId].vy = 0;
          }

          if (input.jump && onGround) {
            players[myId].vy = -JUMP_SPEED;
          }
        }
      }
    });

    let animationFrameId: number;
    let physicsIntervalId: NodeJS.Timeout;

    // Fixed time step for physics and input (60Hz)
    physicsIntervalId = setInterval(() => {
      // 1. Process local input and send to server
      sequenceNumber++;
      const currentInput = { seq: sequenceNumber, left: keysRef.current.left, right: keysRef.current.right, jump: keysRef.current.jump };
      pendingInputs.push(currentInput);
      socket.emit('input', currentInput);

      // 2. Client-side prediction for local player (apply current input)
      if (players[myId]) {
        const p = players[myId];
        if (currentInput.left) p.vx = -MOVE_SPEED;
        else if (currentInput.right) p.vx = MOVE_SPEED;
        else p.vx = 0;

        p.x += p.vx;
        for (const plat of PLATFORMS) {
          if (checkRectCollision(p, plat)) {
            if (p.vx > 0) p.x = plat.x - PLAYER_SIZE;
            else if (p.vx < 0) p.x = plat.x + plat.width;
            p.vx = 0;
          }
        }

        if (p.x < 0) { p.x = 0; p.vx = 0; }
        if (p.x > WORLD_WIDTH - PLAYER_SIZE) { p.x = WORLD_WIDTH - PLAYER_SIZE; p.vx = 0; }

        p.vy += GRAVITY;
        p.y += p.vy;

        let onGround = false;
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

        if (p.y > WORLD_HEIGHT - PLAYER_SIZE) {
          p.y = WORLD_HEIGHT - PLAYER_SIZE;
          p.vy = 0;
          onGround = true;
        }
        if (p.y < 0) {
          p.y = 0;
          p.vy = 0;
        }

        if (currentInput.jump && onGround) {
          p.vy = -JUMP_SPEED;
        }
      }
    }, 1000 / 60);

    const render = (time: number) => {
      // 3. Interpolate other players
      const renderTime = performance.now() - 100; // 100ms interpolation delay
      
      // Find the two states to interpolate between
      let state0 = null;
      let state1 = null;
      
      for (let i = 0; i < stateBuffer.length; i++) {
        if (stateBuffer[i].time <= renderTime) {
          state0 = stateBuffer[i];
        }
        if (stateBuffer[i].time > renderTime) {
          state1 = stateBuffer[i];
          break;
        }
      }

      if (state0 && state1) {
        const t = (renderTime - state0.time) / (state1.time - state0.time);
        
        for (const p1 of state1.state) {
          if (p1.id === myId) continue; // Don't interpolate local player
          
          const p0 = state0.state.find(p => p.id === p1.id);
          if (p0) {
            if (!players[p1.id]) players[p1.id] = { ...p0 };
            players[p1.id].x = p0.x + (p1.x - p0.x) * t;
            players[p1.id].y = p0.y + (p1.y - p0.y) * t;
            players[p1.id].isIt = p1.isIt;
            players[p1.id].color = p1.color;
            players[p1.id].username = p1.username;
            players[p1.id].avatar = p1.avatar;
          } else {
            players[p1.id] = { ...p1 };
          }
        }
      } else if (state0) {
        // Extrapolate or just snap if we don't have a future state
        for (const p0 of state0.state) {
          if (p0.id === myId) continue;
          if (!players[p0.id]) players[p0.id] = { ...p0 };
          players[p0.id].x = p0.x;
          players[p0.id].y = p0.y;
          players[p0.id].isIt = p0.isIt;
          players[p0.id].color = p0.color;
          players[p0.id].username = p0.username;
          players[p0.id].avatar = p0.avatar;
        }
      }

      // Cleanup disconnected players
      const currentIds = serverState.map(p => p.id);
      for (const id in players) {
        if (!currentIds.includes(id) && id !== myId) {
          delete players[id];
        }
      }

      // 4. Render
      ctx.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

      // Draw grid/background
      ctx.fillStyle = '#4cb5f9'; // Light blue sky
      ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
      
      // Draw platforms
      for (const plat of PLATFORMS) {
        // Main body (pinkish)
        ctx.fillStyle = '#ff4d85';
        ctx.fillRect(plat.x, plat.y, plat.width, plat.height);
        // Top grass (green)
        ctx.fillStyle = '#00e676';
        ctx.fillRect(plat.x, plat.y, plat.width, Math.min(8, plat.height));
        
        // Border
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.strokeRect(plat.x, plat.y, plat.width, plat.height);
      }

      // Draw players
      for (const id in players) {
        const p = players[id];
        
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(p.x + 4, p.y + 4, PLAYER_SIZE, PLAYER_SIZE);
        
        // Player body
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, PLAYER_SIZE, PLAYER_SIZE);
        
        // Border
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.strokeRect(p.x, p.y, PLAYER_SIZE, PLAYER_SIZE);

        // Draw Avatar
        if (p.avatar && p.avatar.startsWith('data:')) {
          if (!imageCache.current[p.avatar]) {
            const img = new Image();
            img.src = p.avatar;
            imageCache.current[p.avatar] = img;
          }
          const img = imageCache.current[p.avatar];
          if (img.complete) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(p.x, p.y, PLAYER_SIZE, PLAYER_SIZE);
            ctx.clip();
            ctx.drawImage(img, p.x, p.y, PLAYER_SIZE, PLAYER_SIZE);
            ctx.restore();
          }
        } else if (p.avatar) {
          ctx.font = '20px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(p.avatar, p.x + PLAYER_SIZE / 2, p.y + PLAYER_SIZE / 2 + 2);
          ctx.textBaseline = 'alphabetic'; // reset
        }

        // Draw Username
        ctx.fillStyle = 'black';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(p.username + (id === myId ? ' (You)' : ''), p.x + PLAYER_SIZE / 2, p.y - 10);

        // "It" indicator
        if (p.isIt) {
          ctx.fillStyle = 'red';
          ctx.font = 'bold 16px Arial';
          ctx.textAlign = 'center';
          ctx.fillText('IT!', p.x + PLAYER_SIZE / 2, p.y - 25);
          
          // Glow effect for IT
          ctx.shadowColor = 'red';
          ctx.shadowBlur = 15;
          ctx.strokeStyle = 'red';
          ctx.lineWidth = 3;
          ctx.strokeRect(p.x, p.y, PLAYER_SIZE, PLAYER_SIZE);
          ctx.shadowBlur = 0; // reset
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      clearInterval(physicsIntervalId);
      cancelAnimationFrame(animationFrameId);
    };
  }, [socket, myId]);

  const handleJoystickStart = (e: React.TouchEvent) => {
    const touch = e.changedTouches[0];
    joystickTouchId.current = touch.identifier;
    updateJoystick(touch);
  };

  const handleJoystickMove = (e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === joystickTouchId.current) {
        updateJoystick(e.changedTouches[i]);
      }
    }
  };

  const handleJoystickEnd = (e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === joystickTouchId.current) {
        joystickTouchId.current = null;
        setJoystickPos({ x: 0, y: 0 });
        keysRef.current.left = false;
        keysRef.current.right = false;
      }
    }
  };

  const updateJoystick = (touch: React.Touch) => {
    if (!joystickBaseRef.current) return;
    const rect = joystickBaseRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    let dx = touch.clientX - centerX;
    let dy = touch.clientY - centerY;
    
    const maxDist = rect.width / 2;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist > maxDist) {
      dx = (dx / dist) * maxDist;
      dy = (dy / dist) * maxDist;
    }
    
    setJoystickPos({ x: dx, y: dy });
    
    if (dx < -15) {
      keysRef.current.left = true;
      keysRef.current.right = false;
    } else if (dx > 15) {
      keysRef.current.right = true;
      keysRef.current.left = false;
    } else {
      keysRef.current.left = false;
      keysRef.current.right = false;
    }
  };

  const handleJumpStart = () => { keysRef.current.jump = true; };
  const handleJumpEnd = () => { keysRef.current.jump = false; };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col items-center justify-center w-full h-full">
      <div className="mb-4 flex items-center justify-between w-full max-w-[1200px]">
        <h2 className="text-2xl font-bold text-gray-800">Room: {roomId}</h2>
        <div className="text-2xl font-bold text-indigo-600 bg-white px-4 py-1 rounded-full shadow-sm border-2 border-indigo-100">
          {formatTime(timeRemaining)}
        </div>
        <button 
          onClick={onLeave}
          className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors font-medium shadow-sm"
        >
          Leave Room
        </button>
      </div>
      <div className="relative shadow-2xl rounded-lg overflow-hidden border-4 border-gray-800 w-full max-w-[1200px] aspect-[3/2]">
        {connectionStatus === 'connecting' && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#4cb5f9] z-10">
            <div className="text-white text-2xl font-bold animate-pulse">Connecting to server...</div>
          </div>
        )}
        {connectionStatus === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#4cb5f9] z-10 p-8 text-center">
            <div className="text-red-500 text-2xl font-bold mb-4 bg-white px-4 py-2 rounded">Connection Error</div>
            <p className="text-white text-lg max-w-md">
              Could not connect to the multiplayer server. If you deployed this to Render, make sure you created a <strong>Web Service</strong> and not a Static Site, and that your backend is running.
            </p>
          </div>
        )}
        
        {gameStatus === 'finished' && gameOverData && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 z-30 p-8 text-center backdrop-blur-sm animate-in fade-in duration-500">
            <h2 className="text-5xl sm:text-7xl font-black text-white mb-8 tracking-tight drop-shadow-lg">GAME OVER</h2>
            {gameOverData.loserId === myId ? (
              <div className="text-2xl sm:text-4xl font-bold text-red-600 mb-10 bg-white px-8 py-4 rounded-2xl shadow-2xl transform -rotate-2">
                You Lost! You were IT!
              </div>
            ) : (
              <div className="text-2xl sm:text-4xl font-bold text-green-600 mb-10 bg-white px-8 py-4 rounded-2xl shadow-2xl transform rotate-2">
                You Won! {gameOverData.loserName} was IT!
              </div>
            )}
            <button 
              onClick={onLeave}
              className="px-8 py-4 bg-indigo-600 text-white text-xl font-bold rounded-xl hover:bg-indigo-700 transition-all hover:scale-105 shadow-xl"
            >
              Back to Menu
            </button>
          </div>
        )}

        <canvas 
          ref={canvasRef} 
          width={WORLD_WIDTH} 
          height={WORLD_HEIGHT}
          className="w-full h-full object-contain bg-[#4cb5f9] block"
        />
        
        {/* Mobile Controls Overlay */}
        <div className="absolute inset-0 pointer-events-none flex justify-between items-end p-4 sm:p-8 z-20 md:hidden">
          {/* Joystick */}
          <div 
            ref={joystickBaseRef}
            className="w-28 h-28 sm:w-32 sm:h-32 bg-white/20 rounded-full border-2 border-white/40 relative pointer-events-auto touch-none backdrop-blur-sm"
            onTouchStart={handleJoystickStart}
            onTouchMove={handleJoystickMove}
            onTouchEnd={handleJoystickEnd}
            onTouchCancel={handleJoystickEnd}
          >
            <div 
              className="w-12 h-12 sm:w-16 sm:h-16 bg-white/70 rounded-full absolute top-1/2 left-1/2 shadow-lg"
              style={{ transform: `translate(calc(-50% + ${joystickPos.x}px), calc(-50% + ${joystickPos.y}px))` }}
            />
          </div>

          {/* Jump Button */}
          <div 
            className="w-20 h-20 sm:w-24 sm:h-24 bg-white/20 rounded-full border-2 border-white/40 flex items-center justify-center pointer-events-auto touch-none active:bg-white/50 backdrop-blur-sm mb-2 sm:mb-4 mr-2 sm:mr-4"
            onTouchStart={handleJumpStart}
            onTouchEnd={handleJumpEnd}
            onTouchCancel={handleJumpEnd}
            onMouseDown={handleJumpStart}
            onMouseUp={handleJumpEnd}
            onMouseLeave={handleJumpEnd}
          >
            <span className="text-white font-bold text-lg sm:text-xl select-none">JUMP</span>
          </div>
        </div>
      </div>
      <div className="mt-4 text-gray-600 hidden md:flex gap-6">
        <div className="flex items-center gap-2">
          <kbd className="px-2 py-1 bg-gray-200 rounded border border-gray-300 font-mono text-sm">A</kbd>
          <kbd className="px-2 py-1 bg-gray-200 rounded border border-gray-300 font-mono text-sm">D</kbd>
          <span>Move</span>
        </div>
        <div className="flex items-center gap-2">
          <kbd className="px-2 py-1 bg-gray-200 rounded border border-gray-300 font-mono text-sm">W</kbd>
          <kbd className="px-2 py-1 bg-gray-200 rounded border border-gray-300 font-mono text-sm">Space</kbd>
          <span>Jump</span>
        </div>
      </div>
    </div>
  );
}
