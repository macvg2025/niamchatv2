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
app.use('/sound', express.static('../')); // For msg.mp3

// ========== OWNER & ADMIN SYSTEM ==========
const OWNER_USERNAME = "AdminH214";

// Read admins from environment variable (persistent)
// In Render dashboard: Add ADMINS="User1,User2,User3"
const HARDCODED_ADMINS = (process.env.ADMINS || "").split(",").filter(name => name.trim());
const adminUsers = new Set([OWNER_USERNAME, ...HARDCODED_ADMINS]);

console.log('Initial admin users:', Array.from(adminUsers));

// Store active data in memory
const users = new Map(); // socket.id -> user data
const rooms = new Map(); // roomId -> room data
const privateRooms = new Map(); // roomCode -> private room data

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

  // ========== USER MANAGEMENT ==========
  socket.on('set_username', (username) => {
    const isOwner = username === OWNER_USERNAME;
    const isAdmin = adminUsers.has(username);
    
    const displayName = isOwner ? "👑 Owner - Niam" : 
                       isAdmin ? "⭐ Admin" : username;
    
    const userData = {
      id: socket.id,
      username: username,
      displayName: displayName,
      isOwner: isOwner,
      isAdmin: isAdmin,
      currentRoom: null,
      joinedAt: Date.now()
    };
    
    users.set(socket.id, userData);
    socket.emit('username_set', userData);
    console.log(`User ${username} → ${displayName} (Owner: ${isOwner}, Admin: ${isAdmin})`);
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
      
      // Store private room by code
      if (isPrivate) {
        const room = rooms.get(roomId);
        privateRooms.set(room.code, {
          id: roomId,
          name: roomName,
          code: room.code,
          createdBy: user.username
        });
      }
    }

    const room = rooms.get(roomId);
    
    // Add user to room
    room.users.push({
      id: socket.id,
      username: user.displayName,
      isOwner: user.isOwner,
      isAdmin: user.isAdmin
    });

    // Notify room about new user
    socket.to(roomId).emit('user_joined', {
      username: user.displayName,
      userId: socket.id,
      isOwner: user.isOwner,
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

  // ========== MESSAGING ==========
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
      isOwner: user.isOwner,
      isAdmin: user.isAdmin,
      isCreator: user.username === room.createdBy
    };

    room.messages.push(message);
    
    // Send to everyone in the room
    io.to(user.currentRoom).emit('new_message', message);
    
    console.log(`Message from ${user.displayName} in ${room.name}: ${trimmedContent.substring(0, 30)}...`);
  });

  // ========== MESSAGE REACTIONS ==========
  socket.on('like_message', ({ messageId }) => {
    handleReaction(socket.id, messageId, 'like');
  });

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

  // ========== PRIVATE ROOMS ==========
  socket.on('create_private_room', ({ roomName }) => {
    const user = users.get(socket.id);
    if (!user) return;

    const roomCode = generateRoomCode();
    const roomId = `private_${roomCode}`;
    
    const room = {
      id: roomId,
      name: roomName,
      code: roomCode,
      createdBy: user.username,
      createdAt: Date.now(),
      isPrivate: true,
      users: [],
      messages: []
    };

    privateRooms.set(roomCode, room);
    rooms.set(roomId, room);

    socket.emit('private_room_created', {
      roomId: roomId,
      roomCode: roomCode,
      roomName: roomName
    });

    console.log(`Private room created: ${roomName} (${roomCode})`);
  });

  socket.on('join_private_room', ({ roomCode }) => {
    const user = users.get(socket.id);
    if (!user) return;

    const roomData = privateRooms.get(roomCode.toUpperCase());
    if (!roomData) {
      socket.emit('room_error', { message: 'Room not found' });
      return;
    }

    // Join the room using existing join_room event
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
        createdAt: room.createdAt
      }));

    socket.emit('my_rooms_list', myRooms);
  });

  // ========== ADMIN MANAGEMENT (OWNER ONLY) ==========
  socket.on('grant_admin', ({ targetUsername }) => {
    const user = users.get(socket.id);
    if (!user || !user.isOwner) {
      socket.emit('admin_error', { message: 'Only owner can grant admin' });
      return;
    }

    if (targetUsername === OWNER_USERNAME) {
      socket.emit('admin_error', { message: 'Cannot modify owner status' });
      return;
    }

    adminUsers.add(targetUsername);
    
    // Update target user if online
    const targetSocket = Array.from(users.entries())
      .find(([id, data]) => data.username === targetUsername)?.[0];
    
    if (targetSocket) {
      const targetData = users.get(targetSocket);
      targetData.isAdmin = true;
      targetData.displayName = "⭐ Admin";
      users.set(targetSocket, targetData);
      
      io.to(targetSocket).emit('admin_granted', { 
        grantedBy: user.username 
      });
      
      // Notify room
      if (targetData.currentRoom) {
        io.to(targetData.currentRoom).emit('user_updated', {
          userId: targetSocket,
          username: targetData.displayName,
          isOwner: targetData.isOwner,
          isAdmin: targetData.isAdmin
        });
      }
    }

    socket.emit('admin_granted_response', { 
      success: true, 
      username: targetUsername,
      message: `Admin granted to ${targetUsername}`
    });
    
    console.log(`Owner granted admin to ${targetUsername}`);
  });

  socket.on('revoke_admin', ({ targetUsername }) => {
    const user = users.get(socket.id);
    if (!user || !user.isOwner) {
      socket.emit('admin_error', { message: 'Only owner can revoke admin' });
      return;
    }

    if (targetUsername === OWNER_USERNAME) {
      socket.emit('admin_error', { message: 'Cannot modify owner status' });
      return;
    }

    adminUsers.delete(targetUsername);
    
    // Update target user if online
    const targetSocket = Array.from(users.entries())
      .find(([id, data]) => data.username === targetUsername)?.[0];
    
    if (targetSocket) {
      const targetData = users.get(targetSocket);
      targetData.isAdmin = false;
      targetData.displayName = targetData.username;
      users.set(targetSocket, targetData);
      
      io.to(targetSocket).emit('admin_revoked');
      
      // Notify room
      if (targetData.currentRoom) {
        io.to(targetData.currentRoom).emit('user_updated', {
          userId: targetSocket,
          username: targetData.displayName,
          isOwner: targetData.isOwner,
          isAdmin: targetData.isAdmin
        });
      }
    }

    socket.emit('admin_revoked_response', { 
      success: true, 
      username: targetUsername,
      message: `Admin revoked from ${targetUsername}`
    });
    
    console.log(`Owner revoked admin from ${targetUsername}`);
  });

  socket.on('get_admin_list', () => {
    const user = users.get(socket.id);
    if (!user || !user.isOwner) return;
    
    socket.emit('admin_list', {
      admins: Array.from(adminUsers).filter(name => name !== OWNER_USERNAME),
      owner: OWNER_USERNAME
    });
  });

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
    rooms: rooms.size,
    privateRooms: privateRooms.size,
    adminCount: adminUsers.size - 1 // Exclude owner
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📡 WebSocket server ready for connections`);
  console.log(`👑 Owner: ${OWNER_USERNAME}`);
  console.log(`⭐ Admins: ${Array.from(adminUsers).filter(name => name !== OWNER_USERNAME).join(', ') || 'None'}`);
});
