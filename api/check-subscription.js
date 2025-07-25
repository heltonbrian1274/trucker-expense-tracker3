// /api/check-subscription.js

import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  const { token } = req.query;

  if (!token) {
    return res.status(400).json({ success: false, message: 'Token is required.' });
  }

  try {
    const isSubscribed = await redis.get(`user:${token}:isSubscribed`);
    const active = isSubscribed === 'true';
    return res.status(200).json({ success: true, active });
  } catch (error) {
    console.error('Subscription check error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
}
