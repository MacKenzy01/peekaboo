const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const { RateLimiterMemory } = require('rate-limiter-flexible');

// Rate Limiter Setup: 5 attempts per 60 seconds. 
// If limit reached, block IP for 900 seconds (15 minutes).
const rateLimiter = new RateLimiterMemory({
    points: 5, 
    duration: 60, 
    blockDuration: 900, 
});

app.use(express.static('public'));

io.on('connection', (socket) => {
    // Get the user's IP address
    const ipAddress = socket.handshake.address;
    console.log('A user connected:', ipAddress);

    socket.on('join-room', async (roomId) => {
        try {
            // Consume 1 point for the IP address
            await rateLimiter.consume(ipAddress);

            const room = io.sockets.adapter.rooms.get(roomId);
            const numClients = room ? room.size : 0;

            if (numClients === 0) {
                socket.join(roomId);
                socket.emit('room-created', roomId);
                console.log(`Room ${roomId} created.`);
            } else if (numClients === 1) {
                socket.join(roomId);
                socket.emit('room-joined', roomId);
                socket.to(roomId).emit('peer-joined'); 
                console.log(`User joined Room ${roomId}.`);
            } else {
                socket.emit('room-full');
            }
        } catch (rejRes) {
            // This block runs if the rate limit is hit
            const secsLeft = Math.round(rejRes.msBeforeNext / 1000) || 1;
            socket.emit('status-message', `Too many attempts. Try again in ${Math.ceil(secsLeft / 60)} mins.`);
            console.log(`Rate limit blocked IP: ${ipAddress}`);
        }
    });

    socket.on('signal', (data) => {
        if (data.room) {
            socket.to(data.room).emit('signal', data.signal);
        }
    });

    socket.on('disconnect', () => {
        console.log('A user disconnected.');
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Peekaboo Switchboard is live on http://localhost:${PORT}`);
});