
// /api/verify-token.js

import { redis } from '../utils/api-middleware.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ success: false, message: 'Token is required.' });
  }

  try {
    const tokenKey = `token:${token}`;
    const exists = await redis.get(tokenKey);

    if (!exists) {
      return res.status(404).json({ success: false, message: 'Invalid or expired activation link.' });
    }

    // ✅ Save that this token is now Pro
    await redis.set(`user:${token}:isSubscribed`, 'true');

    return res.status(200).json({ success: true, message: 'Subscription activated!' });
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
}
