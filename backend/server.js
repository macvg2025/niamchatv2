const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: ["https://niamchat-frontend.netlify.app", "http://localhost:5173"],
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(cors());
app.use(express.json());

// Store data in memory
const users = new Map(); // socket.id -> user data
const rooms = new Map(); // roomId -> room data
const privateRooms = new Map(); // roomCode -> room data

// Constants
const ADMIN_USERNAME = "CharlieMartin12344";
const MAX_ROOM_USERS = 15;
const MAX_MESSAGE_LENGTH = 400;
const PRIVATE_ROOM_CODE_LENGTH = 6;

// Utility functions
function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < PRIVATE_ROOM_CODE_LENGTH; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function sanitizeMessage(content) {
  return content.substring(0, MAX_MESSAGE_LENGTH).trim();
}

function formatUserForDisplay(username) {
  return username === ADMIN_USERNAME ? "Admin - Niam" : username;
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    users: users.size,
    rooms: rooms.size,
    privateRooms: privateRooms.size,
    version: '2.0.0'
  });
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('New connection:', socket.id);

  // ========== USER MANAGEMENT ==========
  socket.on('set_username', (username) => {
    const displayName = formatUserForDisplay(username);
    const isAdmin = username === ADMIN_USERNAME;
    
    const userData = {
      id: socket.id,
      username: username,
      displayName: displayName,
      isAdmin: isAdmin,
      currentRoom: null,
      joinedAt: Date.now(),
      lastActive: Date.now()
    };
    
    users.set(socket.id, userData);
    socket.emit('username_set', userData);
    console.log(`User set: ${username} -> ${displayName} (Admin: ${isAdmin})`);
  });

  // ========== ROOM MANAGEMENT ==========
  socket.on('join_room', ({ roomId, roomName, isPrivate = false }) => {
    const user = users.get(socket.id);
    if (!user) return;

    // Leave previous room
    if (user.currentRoom) {
      socket.leave(user.currentRoom);
      const oldRoom = rooms.get(user.currentRoom);
      if (oldRoom) {
        oldRoom.users = oldRoom.users.filter(u => u.id !== socket.id);
        socket.to(user.currentRoom).emit('user_left', {
          username: user.displayName,
          userId: socket.id
        });
      }
    }

    // Join new room
    socket.join(roomId);
    user.currentRoom = roomId;
    user.lastActive = Date.now();

    // Create room if it doesn't exist
    if (!rooms.has(roomId)) {
      const roomCode = isPrivate ? generateRoomCode() : null;
      const room = {
        id: roomId,
        name: roomName || (isPrivate ? `Private Room ${roomCode}` : 'Public Chat'),
        isPrivate: isPrivate,
        code: roomCode,
        createdBy: user.username,
        createdAt: Date.now(),
        users: [],
        messages: [],
        maxUsers: isPrivate ? MAX_ROOM_USERS : Infinity
      };

      rooms.set(roomId, room);
      if (isPrivate && roomCode) {
        privateRooms.set(roomCode, room);
      }
    }

    const room = rooms.get(roomId);
    
    // Check room capacity
    if (room.users.length >= room.maxUsers) {
      socket.emit('room_error', { message: 'Room is full (max 15 users)' });
      socket.leave(roomId);
      user.currentRoom = null;
      return;
    }

    // Add user to room
    room.users.push({
      id: socket.id,
      username: user.displayName,
      isAdmin: user.isAdmin,
      isCreator: user.username === room.createdBy
    });

    // Notify room about new user
    socket.to(roomId).emit('user_joined', {
      username: user.displayName,
      userId: socket.id,
      isAdmin: user.isAdmin,
      isCreator: user.username === room.createdBy
    });

    // Send room data to joining user
    socket.emit('room_joined', {
      room: {
        id: room.id,
        name: room.name,
        isPrivate: room.isPrivate,
        code: room.code,
        userCount: room.users.length,
        maxUsers: room.maxUsers,
        createdBy: room.createdBy
      },
      users: room.users,
      messages: room.messages.slice(-45) // Last 45 messages
    });

    console.log(`${user.displayName} joined ${room.name} (${roomId})`);
  });

  // ========== PRIVATE ROOM SPECIFIC ==========
  socket.on('create_private_room', ({ roomName }) => {
    const user = users.get(socket.id);
    if (!user) return;

    const roomCode = generateRoomCode();
    const roomId = `private_${roomCode}`;
    
    const room = {
      id: roomId,
      name: roomName || `Private Room ${roomCode}`,
      code: roomCode,
      createdBy: user.username,
      createdAt: Date.now(),
      isPrivate: true,
      users: [],
      messages: [],
      maxUsers: MAX_ROOM_USERS
    };

    rooms.set(roomId, room);
    privateRooms.set(roomCode, room);

    socket.emit('private_room_created', {
      roomId: roomId,
      roomCode: roomCode,
      roomName: room.name
    });

    console.log(`Private room created: ${room.name} (${roomCode}) by ${user.displayName}`);
  });

  socket.on('join_private_room', ({ roomCode }) => {
    const user = users.get(socket.id);
    if (!user) return;

    const roomData = privateRooms.get(roomCode.toUpperCase());
    if (!roomData) {
      socket.emit('room_error', { message: 'Room not found. Check the code.' });
      return;
    }

    // Join using existing join_room event
    socket.emit('join_room', {
      roomId: roomData.id,
      roomName: roomData.name,
      isPrivate: true
    });
  });

  socket.on('get_my_rooms', () => {
    const user = users.get(socket.id);
    if (!user) return;

    const myRooms = Array.from(privateRooms.values())
      .filter(room => room.createdBy === user.username)
      .map(room => ({
        id: room.id,
        name: room.name,
        code: room.code,
        createdAt: room.createdAt,
        userCount: room.users.length
      }));

    socket.emit('my_rooms_list', myRooms);
  });

  // ========== MESSAGING ==========
  socket.on('send_message', ({ content, imageUrl }) => {
    const user = users.get(socket.id);
    if (!user || !user.currentRoom) return;

    const room = rooms.get(user.currentRoom);
    if (!room) return;

    const sanitizedContent = sanitizeMessage(content);
    if (!sanitizedContent && !imageUrl) return;

    const message = {
      id: Date.now().toString(),
      userId: socket.id,
      username: user.displayName,
      content: sanitizedContent,
      imageUrl: imageUrl || null,
      timestamp: new Date().toISOString(),
      likes: [],
      dislikes: [],
      replies: [],
      reactions: {},
      isAdmin: user.isAdmin,
      isCreator: user.username === room.createdBy
    };

    room.messages.push(message);
    
    // Update user's last active time
    user.lastActive = Date.now();
    
    // Send to everyone in room
    io.to(user.currentRoom).emit('new_message', message);
    
    console.log(`Message from ${user.displayName} in ${room.name}: ${sanitizedContent.substring(0, 50)}...`);
  });

  // ========== MESSAGE REACTIONS ==========
  socket.on('like_message', ({ messageId }) => {
    handleReaction(socket.id, messageId, 'like');
  });

  socket.on('dislike_message', ({ messageId }) => {
    handleReaction(socket.id, messageId, 'dislike');
  });

  socket.on('add_reaction', ({ messageId, emoji }) => {
    const user = users.get(socket.id);
    if (!user || !user.currentRoom) return;

    const room = rooms.get(user.currentRoom);
    if (!room) return;

    const message = room.messages.find(m => m.id === messageId);
    if (!message) return;

    if (!message.reactions[emoji]) {
      message.reactions[emoji] = [];
    }

    if (!message.reactions[emoji].includes(socket.id)) {
      message.reactions[emoji].push(socket.id);
      io.to(user.currentRoom).emit('message_updated', message);
    }
  });

  // ========== TYPING INDICATORS ==========
  socket.on('typing_start', () => {
    const user = users.get(socket.id);
    if (!user || !user.currentRoom) return;

    socket.to(user.currentRoom).emit('user_typing', {
      userId: socket.id,
      username: user.displayName
    });
  });

  socket.on('typing_stop', () => {
    const user = users.get(socket.id);
    if (!user || !user.currentRoom) return;

    socket.to(user.currentRoom).emit('user_stopped_typing', { 
      userId: socket.id 
    });
  });

  // ========== HELPER FUNCTIONS ==========
  function handleReaction(userId, messageId, type) {
    const user = users.get(userId);
    if (!user || !user.currentRoom) return;

    const room = rooms.get(user.currentRoom);
    if (!room) return;

    const message = room.messages.find(m => m.id === messageId);
    if (!message) return;

    if (type === 'like') {
      if (!message.likes.includes(userId)) {
        message.likes.push(userId);
        // Remove from dislikes if present
        const dislikeIndex = message.dislikes.indexOf(userId);
        if (dislikeIndex > -1) {
          message.dislikes.splice(dislikeIndex, 1);
        }
      } else {
        // Remove like if already liked
        const likeIndex = message.likes.indexOf(userId);
        if (likeIndex > -1) {
          message.likes.splice(likeIndex, 1);
        }
      }
    } else if (type === 'dislike') {
      if (!message.dislikes.includes(userId)) {
        message.dislikes.push(userId);
        // Remove from likes if present
        const likeIndex = message.likes.indexOf(userId);
        if (likeIndex > -1) {
          message.likes.splice(likeIndex, 1);
        }
      } else {
        // Remove dislike if already disliked
        const dislikeIndex = message.dislikes.indexOf(userId);
        if (dislikeIndex > -1) {
          message.dislikes.splice(dislikeIndex, 1);
        }
      }
    }

    io.to(user.currentRoom).emit('message_updated', message);
  }

  // ========== DISCONNECTION ==========
  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user) {
      if (user.currentRoom) {
        const room = rooms.get(user.currentRoom);
        if (room) {
          room.users = room.users.filter(u => u.id !== socket.id);
          socket.to(user.currentRoom).emit('user_left', {
            username: user.displayName,
            userId: socket.id
          });

          // Clean up empty private rooms after 5 minutes
          if (room.isPrivate && room.users.length === 0) {
            setTimeout(() => {
              if (rooms.get(room.id)?.users.length === 0) {
                rooms.delete(room.id);
                if (room.code) privateRooms.delete(room.code);
                console.log(`Cleaned up empty room: ${room.name}`);
              }
            }, 5 * 60 * 1000); // 5 minutes
          }
        }
      }
      users.delete(socket.id);
      console.log('User disconnected:', user.displayName);
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`✅ NiamChat Server v2.0.0 running on port ${PORT}`);
  console.log(`📡 WebSocket server ready for connections`);
  console.log(`👑 Admin username: ${ADMIN_USERNAME}`);
});
