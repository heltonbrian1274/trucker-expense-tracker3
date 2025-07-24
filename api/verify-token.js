import { Redis } from '@upstash/redis';

// Initialize Upstash Redis client using the Vercel KV environment variables
const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  // Only allow POST requests for security
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  const { token } = req.body;

  // Ensure a token was sent in the request
  if (!token) {
    return res.status(400).json({ success: false, message: 'Token is required.' });
  }

  try {
    const key = `token:${token}`;
    // We just need to check if the token exists. We don't need its value.
    const tokenExists = await redis.get(key);

    // If the token doesn't exist in the database, it's invalid or expired
    if (!tokenExists) {
      return res.status(404).json({ success: false, message: 'Invalid or expired activation link.' });
    }
    
    // SUCCESS! The token is valid because it exists in our database.
    return res.status(200).json({ success: true, message: 'Subscription activated!' });

  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(500).json({ success: false, message: 'An internal server error occurred.' });
  }
}
