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

  // Solo manda historial si no se pudo recuperar la conexión
  if (!socket.recovered) {
    try {
      const serverOffset = socket.handshake.auth.serverOffset;

      // Si no hay offset, el cliente es nuevo — no mandar historial completo,
      // o mandar solo los últimos N. Aquí mandamos desde donde quedó.
      const result = await pool.query(
        'SELECT id, content FROM messages WHERE id > $1 ORDER BY id',
        [serverOffset ?? 0]
      );
      for (const row of result.rows) {
        socket.emit('chat message', row.content, row.id);
      }
    } catch (e) {
      console.error('Error fetching history:', e);
    }
  }

  socket.on('chat message', async (msg, clientOffset, callback) => {
    console.log('message:', msg, 'offset:', clientOffset);
    try {
      const result = await pool.query(
        `INSERT INTO messages (content, client_offset)
         VALUES ($1, $2)
         ON CONFLICT (client_offset) DO NOTHING
         RETURNING id`,
        [msg, clientOffset]
      );

      // Si DO NOTHING se disparó, el mensaje ya existía — ignorar
      if (result.rows.length === 0) {
        console.log('Duplicate message ignored:', clientOffset);
        if (typeof callback === 'function') callback();
        return;
      }

      const msgId = result.rows[0].id;

      // FIX PRINCIPAL: broadcast al resto, confirmación solo al sender
      socket.emit('chat message', msg, msgId);           // confirma al sender
      socket.broadcast.emit('chat message', msg, msgId); // manda al resto

      if (typeof callback === 'function') callback();
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