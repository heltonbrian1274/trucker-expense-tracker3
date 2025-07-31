
// /utils/api-middleware.js
// Shared middleware for API endpoints

import { Redis } from '@upstash/redis';

// Initialize Redis connection
export const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

// Set CORS headers
export function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// Handle preflight requests
export function handlePreflight(req, res) {
  if (req.method === 'OPTIONS') {
    setCorsHeaders(res);
    return res.status(200).end();
  }
  return false;
}

// Validate HTTP method
export function validateMethod(req, res, allowedMethods) {
  if (!allowedMethods.includes(req.method)) {
    return res.status(405).json({ 
      success: false, 
      message: 'Method not allowed' 
    });
  }
  return false;
}

// Parse token data from Redis
export function parseTokenData(tokenData) {
  try {
    console.log('Raw token data from Redis:', tokenData);
    console.log('Type of token data:', typeof tokenData);
    
    // If tokenData is already an object, don't parse it
    if (typeof tokenData === 'object') {
      return tokenData;
    } else {
      return JSON.parse(tokenData);
    }
  } catch (error) {
    console.error('❌ Failed to parse token data:', error);
    console.error('Raw token data was:', tokenData);
    throw new Error('Invalid token data');
  }
}
