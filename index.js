import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import pg from 'pg';

const app = express();
const server = createServer(app);

const io = new Server(server, {
  cors: {
    origin: /\.vercel\.app$/,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

await pool.query(`
  CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    client_offset TEXT UNIQUE,
    content TEXT
  );
`);

app.get('/', (req, res) => {
  res.send('<h1>Chatify Server</h1>');
});

io.on('connection', async (socket) => {
  console.log('a user connected', socket.id);

  if (!socket.recovered) {
    try {
      const result = await pool.query(
        'SELECT id, content FROM messages WHERE id > $1 ORDER BY id',
        [socket.handshake.auth.serverOffset || 0]
      );
      for (const row of result.rows) {
        socket.emit('chat message', row.content, row.id);
      }
    } catch (e) {
      console.error('Error fetching messages:', e);
    }
  }

  socket.on('chat message', async (msg) => {
    console.log('message: ' + msg);
    try {
      const result = await pool.query(
        'INSERT INTO messages (content) VALUES ($1) RETURNING id',
        [msg]
      );
      io.emit('chat message', msg, result.rows[0].id);
    } catch (e) {
      console.error('Error inserting message:', e);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`server running on port ${PORT}`);
});