// /api/redis-keepalive.js
import { redis } from '../utils/api-middleware.js';

export default async function handler(req, res) {
    try {
        const timestamp = new Date().toISOString();
        const keepaliveKey = `keepalive:${Date.now()}`;
        
        // Write to Redis to show activity
        await redis.set(keepaliveKey, {
            timestamp: timestamp,
            purpose: 'keepalive',
            message: 'Keeping Redis instance active'
        }, { ex: 3600 }); // Expire after 1 hour
        
        // Also do a read operation
        const result = await redis.get(keepaliveKey);
        
        // Clean up old keepalive keys (keep only last 10)
        const allKeys = await redis.keys('keepalive:*');
        if (allKeys.length > 10) {
            const oldKeys = allKeys.slice(0, -10);
            if (oldKeys.length > 0) {
                await redis.del(...oldKeys);
            }
        }
        
        console.log(`✅ Redis keepalive successful at ${timestamp}`);
        
        return res.status(200).json({
            success: true,
            timestamp: timestamp,
            activity: 'Redis keepalive completed',
            keysProcessed: allKeys.length
        });
        
    } catch (error) {
        console.error('❌ Redis keepalive failed:', error);
        
        return res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
}
