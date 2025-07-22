import { Redis } from '@upstash/redis';

// Initialize Upstash Redis client from Vercel environment variables
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  // Only allow POST requests for security
  if (req.method !== 'POST') {
    return res.status(405).end('Method Not Allowed');
  }

  const { token } = req.body;

  // Ensure a token was sent in the request
  if (!token) {
    return res.status(400).json({ success: false, message: 'Token is required.' });
  }

  try {
    const key = `token:${token}`;
    const tokenDataString = await redis.get(key);

    // If the token doesn't exist in the database, it's invalid or expired
    if (!tokenDataString) {
      return res.status(404).json({ success: false, message: 'Invalid or expired activation link.' });
    }

    const tokenData = JSON.parse(tokenDataString);

    // Check if the token has already been used
    if (tokenData.used) {
      return res.status(400).json({ success: false, message: 'This activation link has already been used.' });
    }

    // SUCCESS! Mark the token as used so it cannot be used again
    await redis.set(key, JSON.stringify({ ...tokenData, used: true }), { keepttl: true });
    
    // Respond with success to the app
    return res.status(200).json({ success: true, message: 'Subscription activated!' });

  } catch (error)
    console.error('Token verification error:', error);
    return res.status(500).json({ success: false, message: 'An internal server error occurred.' });
  }
}
