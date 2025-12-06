const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:5173", // Frontend URL
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Store data in memory (we'll add database later)
const users = new Map(); // socket.id -> user data
const rooms = new Map(); // roomId -> room data

// Hardcoded admin username - CHANGE THIS TO YOUR SECRET USERNAME
const ADMIN_USERNAME = "CharlieMartin12344";

// Generate 6-character room code
function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('New user connected:', socket.id);

  // Set username
  socket.on('set_username', (username) => {
    const displayName = username === ADMIN_USERNAME ? "Admin - Niam" : username;
    const userData = {
      id: socket.id,
      username: username,
      displayName: displayName,
      isAdmin: username === ADMIN_USERNAME,
      currentRoom: null,
      joinedAt: Date.now()
    };
    
    users.set(socket.id, userData);
    socket.emit('username_set', userData);
    console.log(`User set: ${username} -> ${displayName} (Admin: ${userData.isAdmin})`);
  });

  // Join room (public or private)
  socket.on('join_room', ({ roomId, roomName, isPrivate = false }) => {
    const user = users.get(socket.id);
    if (!user) return;

    // Leave previous room if any
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

    // Create room if it doesn't exist
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        id: roomId,
        name: roomName || 'Public Chat',
        isPrivate: isPrivate,
        code: isPrivate ? generateRoomCode() : null,
        createdBy: user.username,
        createdAt: Date.now(),
        users: [],
        messages: []
      });
    }

    const room = rooms.get(roomId);
    
    // Add user to room
    room.users.push({
      id: socket.id,
      username: user.displayName,
      isAdmin: user.isAdmin
    });

    // Notify room about new user
    socket.to(roomId).emit('user_joined', {
      username: user.displayName,
      userId: socket.id,
      isAdmin: user.isAdmin
    });

    // Send room data to the joining user
    socket.emit('room_joined', {
      room: {
        id: room.id,
        name: room.name,
        isPrivate: room.isPrivate,
        code: room.code,
        userCount: room.users.length
      },
      users: room.users,
      messages: room.messages.slice(-45) // Last 45 messages
    });

    console.log(`${user.displayName} joined ${room.name} (${roomId})`);
  });

  // Send message
  socket.on('send_message', ({ content, imageUrl }) => {
    const user = users.get(socket.id);
    if (!user || !user.currentRoom) return;

    const room = rooms.get(user.currentRoom);
    if (!room) return;

    // Check message length
    const trimmedContent = content.substring(0, 400);
    
    const message = {
      id: Date.now().toString(),
      userId: socket.id,
      username: user.displayName,
      content: trimmedContent,
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
    
    // Send to everyone in the room
    io.to(user.currentRoom).emit('new_message', message);
    
    console.log(`Message from ${user.displayName} in ${room.name}: ${trimmedContent.substring(0, 30)}...`);
  });

  // Like message
  socket.on('like_message', ({ messageId }) => {
    handleReaction(socket.id, messageId, 'like');
  });

  // Dislike message
  socket.on('dislike_message', ({ messageId }) => {
    handleReaction(socket.id, messageId, 'dislike');
  });

  // Handle reaction helper
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

  // Disconnect
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
        }
      }
      users.delete(socket.id);
      console.log('User disconnected:', user.displayName);
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    users: users.size,
    rooms: rooms.size
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📡 WebSocket server ready for connections`);
});
