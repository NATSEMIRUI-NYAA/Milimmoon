const express = require('express');
const session = require('express-session');
const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config();
const app = express();

mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });

// โมเดล user
const User = mongoose.model('User', new mongoose.Schema({
  discordId: String,
  username: String,
  avatar: String,
  accessToken: String,
  refreshToken: String,
  guilds: Array
}));

app.use(express.static('public'));
app.use(session({
  secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false
}));

app.get('/api/auth/callback', async (req, res) => {
  const code = req.query.code;
  const params = new URLSearchParams();
  params.append('client_id', process.env.CLIENT_ID);
  params.append('client_secret', process.env.CLIENT_SECRET);
  params.append('grant_type', 'authorization_code');
  params.append('code', code);
  params.append('redirect_uri', 'https://nyaacat.online/api/auth/callback');
  try {
    const { data } = await axios.post('https://discord.com/api/oauth2/token', params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    // ดึงข้อมูล
    const user = (await axios.get('https://discord.com/api/users/@me', { headers: { Authorization: 'Bearer ' + data.access_token } })).data;
    const guilds = (await axios.get('https://discord.com/api/users/@me/guilds', { headers: { Authorization: 'Bearer ' + data.access_token } })).data;
    // save ลง mongoDB
    await User.findOneAndUpdate(
      { discordId: user.id },
      {
        discordId: user.id,
        username: user.username,
        avatar: user.avatar,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        guilds: guilds
      },
      { upsert: true }
    );
    req.session.discordId = user.id;
    res.redirect('/dashboard.html');
  } catch (e) {
    res.send('Login failed: ' + e);
  }
});

app.get('/api/dashboard', async (req, res) => {
  if (!req.session.discordId) return res.status(401).json({ error: "not logged in" });
  const user = await User.findOne({ discordId: req.session.discordId });
  // ตัวอย่าง: เช็คว่าแต่ละ guild มีบอทหรือยัง (mock: guild ที่ id ลงท้ายด้วยเลขคู่มีบอท)
  const botId = process.env.CLIENT_ID; // หรือ hardcode id bot
  user.guilds = user.guilds.map(g => ({
    ...g,
    bot_in_server: parseInt(g.id[g.id.length-1]) % 2 === 0 // เปลี่ยน logic นี้ตามจริง
  }));
  res.json({ user, guilds: user.guilds });
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));
