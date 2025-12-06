import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { io } from 'socket.io-client';

// Initialize socket connection
const socket = io('http://localhost:3001');

// ==================== MAIN APP COMPONENT ====================
function App() {
  const [page, setPage] = useState('landing');
  const [username, setUsername] = useState('');
  const [userData, setUserData] = useState(null);
  const [currentRoom, setCurrentRoom] = useState('public');
  const [theme, setTheme] = useState('seaside');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [isFirstVisit, setIsFirstVisit] = useState(true);

  // Load user preferences on mount
  useEffect(() => {
    const savedUsername = localStorage.getItem('niamchat_username');
    const savedTheme = localStorage.getItem('niamchat_theme') || 'seaside';
    const savedSound = localStorage.getItem('niamchat_sound') !== 'false';
    const savedNotifications = localStorage.getItem('niamchat_notifications') !== 'false';
    const visited = localStorage.getItem('niamchat_visited');

    if (savedUsername) {
      setUsername(savedUsername);
      setIsFirstVisit(!visited);
    }

    setTheme(savedTheme);
    setSoundEnabled(savedSound);
    setNotificationsEnabled(savedNotifications);
    document.body.className = `theme-${savedTheme}`;
  }, []);

  // Handle username submission
  const handleUsernameSubmit = (e) => {
    e.preventDefault();
    if (username.trim()) {
      socket.emit('set_username', username.trim());
      socket.once('username_set', (data) => {
        setUserData(data);
        localStorage.setItem('niamchat_username', username.trim());
        localStorage.setItem('niamchat_visited', 'true');
        
        if (isFirstVisit) {
          setPage('main-hub');
        } else {
          setPage('chat');
          joinRoom('public', 'Public Chat');
        }
      });
    }
  };

  // Join a room
  const joinRoom = (roomId, roomName, isPrivate = false) => {
    socket.emit('join_room', { roomId, roomName, isPrivate });
    setCurrentRoom(roomId);
  };

  // Change theme
  const changeTheme = (newTheme) => {
    setTheme(newTheme);
    localStorage.setItem('niamchat_theme', newTheme);
    document.body.className = `theme-${newTheme}`;
  };

  // Toggle sound
  const toggleSound = () => {
    const newValue = !soundEnabled;
    setSoundEnabled(newValue);
    localStorage.setItem('niamchat_sound', newValue.toString());
  };

  // Toggle notifications
  const toggleNotifications = () => {
    const newValue = !notificationsEnabled;
    setNotificationsEnabled(newValue);
    localStorage.setItem('niamchat_notifications', newValue.toString());
  };

  // Render current page
  switch (page) {
    case 'landing':
      return (
        <LandingPage
          username={username}
          setUsername={setUsername}
          onSubmit={handleUsernameSubmit}
          theme={theme}
        />
      );
    case 'main-hub':
      return (
        <MainHub
          onSelectPublic={() => {
            setPage('chat');
            joinRoom('public', 'Public Chat');
          }}
          onSelectPrivate={() => setPage('private-rooms')}
          theme={theme}
          soundEnabled={soundEnabled}
          notificationsEnabled={notificationsEnabled}
          onToggleSound={toggleSound}
          onToggleNotifications={toggleNotifications}
          onChangeTheme={changeTheme}
        />
      );
    case 'private-rooms':
      return (
        <PrivateRooms
          onBack={() => setPage('main-hub')}
          onJoinRoom={joinRoom}
          theme={theme}
        />
      );
    case 'chat':
      return (
        <ChatRoom
          socket={socket}
          userData={userData}
          currentRoom={currentRoom}
          onBack={() => setPage('main-hub')}
          theme={theme}
          soundEnabled={soundEnabled}
          onChangeTheme={changeTheme}
          onToggleSound={toggleSound}
        />
      );
    default:
      return <LandingPage username={username} setUsername={setUsername} onSubmit={handleUsernameSubmit} />;
  }
}

// ==================== LANDING PAGE ====================
function LandingPage({ username, setUsername, onSubmit, theme }) {
  return (
    <div className="landing-container fade-in-up">
      <h1 className="landing-title">NiamChat</h1>
      <p className="landing-subtitle">Enter your username to begin chatting</p>
      <form onSubmit={onSubmit}>
        <input
          type="text"
          className="username-input"
          placeholder="Enter your username..."
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
          maxLength={20}
          required
        />
        <button type="submit" className="enter-button">
          Enter Chat
        </button>
      </form>
      <div className="mt-3 text-center">
        <small style={{ color: '#94a3b8' }}>
          Choose any username. Admin access requires special username.
        </small>
      </div>
    </div>
  );
}

// ==================== MAIN HUB ====================
function MainHub({
  onSelectPublic,
  onSelectPrivate,
  theme,
  soundEnabled,
  notificationsEnabled,
  onToggleSound,
  onToggleNotifications,
  onChangeTheme
}) {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="main-hub fade-in-up">
      <h1 className="hub-title">Welcome to NiamChat</h1>
      <p className="hub-subtitle">Choose where you want to chat</p>
      
      <div className="hub-buttons">
        <button className="hub-button public" onClick={onSelectPublic}>
          <span className="button-icon">🌐</span>
          <span>Public Chat</span>
          <span className="button-description">Chat with everyone online</span>
        </button>
        
        <button className="hub-button private" onClick={onSelectPrivate}>
          <span className="button-icon">🔒</span>
          <span>Private Chats</span>
          <span className="button-description">Create or join private rooms</span>
        </button>
      </div>

      <div className="first-time-settings">
        <h3 style={{ marginBottom: '20px', color: '#f8fafc' }}>First Time Setup</h3>
        
        <div className="setting-option" style={{ marginBottom: '15px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={soundEnabled}
              onChange={onToggleSound}
              style={{ width: '18px', height: '18px' }}
            />
            <span>Enable message sounds</span>
          </label>
        </div>

        <div className="setting-option" style={{ marginBottom: '25px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={notificationsEnabled}
              onChange={onToggleNotifications}
              style={{ width: '18px', height: '18px' }}
            />
            <span>Enable browser notifications</span>
          </label>
        </div>

        <div className="theme-selection">
          <p style={{ marginBottom: '10px', color: '#f8fafc' }}>Choose a theme:</p>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {['seaside', 'cozy', 'neon', 'glacier', 'sunset', 'midnight', 'minty', 'cloudline', 'urban', 'crystal'].map((t) => (
              <button
                key={t}
                onClick={() => onChangeTheme(t)}
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '8px',
                  border: theme === t ? '2px solid white' : '1px solid #666',
                  background: getThemeColor(t),
                  cursor: 'pointer'
                }}
                title={t.charAt(0).toUpperCase() + t.slice(1)}
              />
            ))}
          </div>
        </div>
      </div>

      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Settings</h2>
            </div>
            {/* Settings content would go here */}
          </div>
        </div>
      )}
    </div>
  );
}

// Helper function for theme colors
function getThemeColor(theme) {
  const colors = {
    seaside: 'linear-gradient(135deg, #0c4a6e 0%, #0ea5e9 100%)',
    cozy: 'linear-gradient(135deg, #7c2d12 0%, #c2410c 100%)',
    neon: 'linear-gradient(135deg, #1e1b4b 0%, #8b5cf6 100%)',
    glacier: 'linear-gradient(135deg, #164e63 0%, #06b6d4 100%)',
    sunset: 'linear-gradient(135deg, #7c2d12 0%, #dc2626 100%)',
    midnight: 'linear-gradient(135deg, #1e1b4b 0%, #6366f1 100%)',
    minty: 'linear-gradient(135deg, #064e3b 0%, #10b981 100%)',
    cloudline: 'linear-gradient(135deg, #374151 0%, #9ca3af 100%)',
    urban: 'linear-gradient(135deg, #6d28d9 0%, #a78bfa 100%)',
    crystal: 'linear-gradient(135deg, #0d9488 0%, #2dd4bf 100%)'
  };
  return colors[theme] || colors.seaside;
}

// ==================== PRIVATE ROOMS ====================
function PrivateRooms({ onBack, onJoinRoom, theme }) {
  const [roomName, setRoomName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [createdRooms, setCreatedRooms] = useState([]);

  const createRoom = () => {
    if (roomName.trim()) {
      const roomId = `private_${Date.now()}`;
      onJoinRoom(roomId, roomName.trim(), true);
      
      // Save to local storage
      const newRoom = {
        id: roomId,
        name: roomName.trim(),
        code: generateRoomCode(),
        createdAt: new Date().toISOString()
      };
      
      const rooms = JSON.parse(localStorage.getItem('niamchat_rooms') || '[]');
      rooms.push(newRoom);
      localStorage.setItem('niamchat_rooms', JSON.stringify(rooms));
      setCreatedRooms(rooms);
      setRoomName('');
    }
  };

  const joinWithCode = () => {
    if (roomCode.trim().length === 6) {
      // In a real app, we'd validate the code with the server
      const roomId = `private_${roomCode.toUpperCase()}`;
      onJoinRoom(roomId, `Private Room ${roomCode}`, true);
    }
  };

  // Generate a 6-character room code
  const generateRoomCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  // Load created rooms from localStorage
  useEffect(() => {
    const rooms = JSON.parse(localStorage.getItem('niamchat_rooms') || '[]');
    setCreatedRooms(rooms);
  }, []);

  return (
    <div className="main-hub fade-in-up">
      <button onClick={onBack} style={{ marginBottom: '30px', padding: '10px 20px' }}>
        ← Back
      </button>
      
      <h1 className="hub-title">Private Chats</h1>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', marginBottom: '50px' }}>
        {/* Create Room */}
        <div style={{ background: 'rgba(30, 41, 59, 0.7)', padding: '30px', borderRadius: '15px' }}>
          <h3 style={{ marginBottom: '20px', color: '#f8fafc' }}>Create New Room</h3>
          <input
            type="text"
            placeholder="Room name"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            style={{ width: '100%', padding: '15px', marginBottom: '15px', borderRadius: '10px' }}
            maxLength={30}
          />
          <button
            onClick={createRoom}
            style={{ width: '100%', padding: '15px', background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer' }}
          >
            Create Room
          </button>
        </div>

        {/* Join Room */}
        <div style={{ background: 'rgba(30, 41, 59, 0.7)', padding: '30px', borderRadius: '15px' }}>
          <h3 style={{ marginBottom: '20px', color: '#f8fafc' }}>Join with Code</h3>
          <input
            type="text"
            placeholder="Enter 6-digit code"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            style={{ width: '100%', padding: '15px', marginBottom: '15px', borderRadius: '10px', textTransform: 'uppercase', letterSpacing: '2px' }}
            maxLength={6}
          />
          <button
            onClick={joinWithCode}
            style={{ width: '100%', padding: '15px', background: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer' }}
          >
            Join Room
          </button>
        </div>
      </div>

      {/* Previous Rooms */}
      {createdRooms.length > 0 && (
        <div>
          <h3 style={{ marginBottom: '20px', color: '#f8fafc' }}>Your Rooms</h3>
          <div style={{ display: 'grid', gap: '15px' }}>
            {createdRooms.map((room) => (
              <div key={room.id} style={{ background: 'rgba(30, 41, 59, 0.7)', padding: '20px', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 'bold', color: '#f8fafc' }}>{room.name}</div>
                  <div style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Code: {room.code}</div>
                </div>
                <button
                  onClick={() => onJoinRoom(room.id, room.name, true)}
                  style={{ padding: '10px 20px', background: 'rgba(59, 130, 246, 0.2)', border: '1px solid rgba(96, 165, 250, 0.3)', color: '#60a5fa', borderRadius: '8px', cursor: 'pointer' }}
                >
                  Join
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== CHAT ROOM ====================
function ChatRoom({ socket, userData, currentRoom, onBack, theme, soundEnabled, onChangeTheme, onToggleSound }) {
  const [messages, setMessages] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [roomInfo, setRoomInfo] = useState({ name: 'Public Chat', isPrivate: false });
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [notification, setNotification] = useState(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // Sound effect for new messages
  const playMessageSound = () => {
    if (soundEnabled) {
      try {
        const audio = new Audio('http://localhost:3001/sound/msg.mp3');
        audio.play().catch(() => {
          // Fallback to beep sound
          const audioContext = new (window.AudioContext || window.webkitAudioContext)();
          const oscillator = audioContext.createOscillator();
          const gainNode = audioContext.createGain();
          oscillator.connect(gainNode);
          gainNode.connect(audioContext.destination);
          oscillator.frequency.value = 800;
          gainNode.gain.value = 0.1;
          oscillator.start();
          setTimeout(() => oscillator.stop(), 100);
        });
      } catch (error) {
        console.log('Sound playback failed');
      }
    }
  };

  // Show notification
  const showNotification = (title, message) => {
    setNotification({ title, message });
    setTimeout(() => setNotification(null), 3000);
    
    // Browser notification if permitted
    if (Notification.permission === 'granted') {
      new Notification(title, { body: message });
    }
  };

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    socket.on('room_joined', ({ room, users, messages: roomMessages }) => {
      setRoomInfo(room);
      setMessages(roomMessages || []);
      setOnlineUsers(users || []);
    });

    socket.on('new_message', (message) => {
      setMessages(prev => [...prev, message]);
      if (message.userId !== socket.id) {
        playMessageSound();
        showNotification('New Message', `${message.username}: ${message.content.substring(0, 30)}...`);
      }
    });

    socket.on('message_updated', (updatedMessage) => {
      setMessages(prev => prev.map(msg => 
        msg.id === updatedMessage.id ? updatedMessage : msg
      ));
    });

    socket.on('user_joined', (user) => {
      setOnlineUsers(prev => [...prev, user]);
      if (user.userId !== socket.id) {
        showNotification('User Joined', `${user.username} joined the room`);
      }
    });

    socket.on('user_left', ({ userId, username }) => {
      setOnlineUsers(prev => prev.filter(user => user.id !== userId));
      if (userId !== socket.id) {
        showNotification('User Left', `${username} left the room`);
      }
    });

    // Request notification permission
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }

    return () => {
      socket.off('room_joined');
      socket.off('new_message');
      socket.off('message_updated');
      socket.off('user_joined');
      socket.off('user_left');
    };
  }, [socket, soundEnabled]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Send message
  const sendMessage = (e) => {
    e.preventDefault();
    if (newMessage.trim()) {
      socket.emit('send_message', {
        content: newMessage.trim(),
        imageUrl: null
      });
      setNewMessage('');
    }
  };

  // Handle image upload
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Check file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      showNotification('Error', 'Image size must be less than 5MB');
      return;
    }

    // Check file type
    if (!file.type.startsWith('image/')) {
      showNotification('Error', 'Please upload an image file');
      return;
    }

    // In a real app, we would upload to a server
    // For now, we'll create a local URL and send it
    const reader = new FileReader();
    reader.onloadend = () => {
      const imageUrl = reader.result;
      socket.emit('send_message', {
        content: '📸 Image',
        imageUrl: imageUrl
      });
    };
    reader.readAsDataURL(file);
  };

  // Like a message
  const likeMessage = (messageId) => {
    socket.emit('like_message', { messageId });
  };

  // Dislike a message
  const dislikeMessage = (messageId) => {
    socket.emit('dislike_message', { messageId });
  };

  // Copy message to clipboard
  const copyMessage = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      showNotification('Copied', 'Message copied to clipboard');
    });
  };

  return (
    <div className="chat-container">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="user-info">
          <div className="user-avatar">
            {userData?.displayName?.charAt(0) || 'U'}
          </div>
          <div className="username-display">{userData?.displayName}</div>
          <div className="user-status">
            <div className="status-dot"></div>
            <span>Online</span>
          </div>
        </div>

        <div className="room-switcher">
          <div className="switcher-title">Chat Rooms</div>
          <button 
            className={`switch-button ${currentRoom === 'public' ? 'active' : ''}`}
            onClick={() => {
              socket.emit('join_room', { roomId: 'public', roomName: 'Public Chat' });
              setCurrentRoom('public');
            }}
          >
            🌐 Public Chat
          </button>
          <button 
            className="switch-button"
            onClick={onBack}
          >
            ← Back to Hub
          </button>
        </div>

        <div className="online-users">
          <div className="online-title">
            <span>Online Users</span>
            <span className="user-count">{onlineUsers.length}</span>
          </div>
          <ul className="user-list">
            {onlineUsers.map(user => (
              <li key={user.id} className="user-item">
                <div className="user-avatar-small">
                  {user.username?.charAt(0) || 'U'}
                </div>
                <div className="user-details">
                  <div className="user-name">
                    {user.username}
                    {user.isAdmin && <span className="sender-badge admin">Admin</span>}
                  </div>
                  <div className="user-status-small">Online</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="chat-main">
        <div className="chat-header">
          <div className="room-info">
            <div className="room-icon">
              {roomInfo.isPrivate ? '🔒' : '🌐'}
            </div>
            <div className="room-details">
              <h2>{roomInfo.name}</h2>
              <div className="room-stats">
                <span>{onlineUsers.length} online</span>
                {roomInfo.code && <span className="room-code">{roomInfo.code}</span>}
              </div>
            </div>
          </div>

          <div className="chat-actions">
            <button className="action-button" onClick={() => setShowThemePicker(!showThemePicker)}>
              🎨 Theme
            </button>
            <button className="action-button" onClick={() => setShowSettings(true)}>
              ⚙️ Settings
            </button>
          </div>
        </div>

        <div className="messages-container">
          {messages.map((message) => (
            <Message
              key={message.id}
              message={message}
              isOwn={message.userId === socket.id}
              onLike={() => likeMessage(message.id)}
              onDislike={() => dislikeMessage(message.id)}
              onCopy={() => copyMessage(message.content)}
            />
          ))}
          <div ref={messagesEndRef} />
        </div>

        <form className="message-input-area" onSubmit={sendMessage}>
          <div className="input-wrapper">
            <textarea
              className="message-input"
              placeholder="Type your message here... (400 characters max)"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              maxLength={400}
              rows="3"
            />
            <div className={`char-count ${newMessage.length > 350 ? 'warning' : ''} ${newMessage.length >= 400 ? 'error' : ''}`}>
              {newMessage.length}/400
            </div>
          </div>

          <div className="input-actions">
            <button
              type="button"
              className="icon-button"
              onClick={() => fileInputRef.current?.click()}
              title="Upload image"
            >
              📷
            </button>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              onChange={handleImageUpload}
              style={{ display: 'none' }}
            />
            
            <button
              type="button"
              className="icon-button"
              onClick={onToggleSound}
              title={soundEnabled ? "Disable sounds" : "Enable sounds"}
            >
              {soundEnabled ? '🔊' : '🔇'}
            </button>

            <button
              type="submit"
              className="send-button"
              disabled={!newMessage.trim()}
              title="Send message"
            >
              ➤
            </button>
          </div>
        </form>
      </div>

      {/* Theme Picker */}
      {showThemePicker && (
        <div className="theme-picker show">
          {['seaside', 'cozy', 'neon', 'glacier', 'sunset', 'midnight', 'minty', 'cloudline', 'urban', 'crystal'].map((t) => (
            <button
              key={t}
              className={`theme-option ${theme === t ? 'active' : ''}`}
              data-theme={t}
              onClick={() => {
                onChangeTheme(t);
                setShowThemePicker(false);
              }}
              title={t.charAt(0).toUpperCase() + t.slice(1)}
            />
          ))}
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Settings</h2>
              <p className="modal-subtitle">Customize your chat experience</p>
            </div>
            
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={soundEnabled}
                  onChange={onToggleSound}
                />
                <span>Enable message sounds</span>
              </label>
            </div>

            <div className="modal-actions">
              <button className="modal-button secondary" onClick={() => setShowSettings(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification */}
      {notification && (
        <div className="notification slide-in-right">
          <div className="notification-icon">💬</div>
          <div className="notification-content">
            <div className="notification-title">{notification.title}</div>
            <div className="notification-message">{notification.message}</div>
          </div>
          <button onClick={() => setNotification(null)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}>
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

// ==================== MESSAGE COMPONENT ====================
function Message({ message, isOwn, onLike, onDislike, onCopy }) {
  const [showActions, setShowActions] = useState(false);
  
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div
      className={`message ${isOwn ? 'sent' : 'received'} ${message.isAdmin ? 'admin' : ''} ${message.isCreator ? 'creator' : ''}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className="message-header">
        <div className="message-sender">
          <div className="sender-avatar">
            {message.username?.charAt(0) || 'U'}
          </div>
          <div className="sender-name">
            {message.username}
            {message.isAdmin && <span className="sender-badge admin">Admin</span>}
            {message.isCreator && <span className="sender-badge creator">Creator</span>}
          </div>
        </div>
        <div className="message-time">{formatTime(message.timestamp)}</div>
      </div>

      <div className="message-content">
        {message.content}
        {message.imageUrl && (
          <img
            src={message.imageUrl}
            alt="Uploaded"
            className="message-image"
            onClick={() => window.open(message.imageUrl, '_blank')}
          />
        )}
      </div>

      <div className="message-actions">
        <button
          className={`action-button-small ${message.likes?.length > 0 ? 'liked' : ''}`}
          onClick={onLike}
          title="Like"
        >
          👍 <span className="action-count">{message.likes?.length || 0}</span>
        </button>
        
        <button
          className={`action-button-small ${message.dislikes?.length > 0 ? 'disliked' : ''}`}
          onClick={onDislike}
          title="Dislike"
        >
          👎 <span className="action-count">{message.dislikes?.length || 0}</span>
        </button>
        
        <button
          className="action-button-small"
          onClick={onCopy}
          title="Copy message"
        >
          📋 Copy
        </button>
      </div>
    </div>
  );
}

// ==================== RENDER APP ====================
const root = createRoot(document.getElementById('root'));
root.render(<App />);
