import express from 'express';
import { disconnect } from 'node:cluster';
import { createServer } from 'node:http';
import { Server } from 'socket.io';

const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: 'http://localhost:5173/',
});

app.get('/', (req, res) => {
    res.send('<h1>Hello world 3</h1>');
});

io.on('connection', (socket) => {
    console.log('a user connected', socket.id);

    socket.on('chat message', (msg) => {
        console.log(`message: ` + msg);
        io.emit('chat message', msg);
    });


    socket.on('disconnect', () => {
        console.log('User disconnected', socket.id);
    });
});

server.listen(3000, () => {
    console.log('server running at http://localhost:3000');
});