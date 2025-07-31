
// /api/check-subscription.js

import { redis } from '../utils/api-middleware.js';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { token } = req.query;

  if (!token) {
    return res.status(400).json({ success: false, message: 'Token is required' });
  }

  try {
    const isSubscribed = await redis.get(`user:${token}:isSubscribed`);
    const active = isSubscribed === 'true';
    return res.status(200).json({ success: true, active });
  } catch (error) {
    console.error('Subscription check error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}
