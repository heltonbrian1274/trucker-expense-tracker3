
export default async function handler(req, res) {
  // Basic environment check
  const envCheck = {
    hasStripeKey: !!process.env.STRIPE_SECRET_KEY,
    hasRedisUrl: !!process.env.KV_REST_API_URL,
    hasRedisToken: !!process.env.KV_REST_API_TOKEN,
    hasZeptoMail: !!process.env.ZEPTOMAIL_TOKEN,
    stripeKeyLength: process.env.STRIPE_SECRET_KEY ? process.env.STRIPE_SECRET_KEY.length : 0,
    nodeVersion: process.version,
    timestamp: new Date().toISOString()
  };

  // Test Redis connection
  try {
    const { Redis } = await import('@upstash/redis');
    const redis = new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    });
    
    await redis.set('debug-test', 'working');
    const testResult = await redis.get('debug-test');
    envCheck.redisConnection = testResult === 'working' ? 'SUCCESS' : 'FAILED';
    await redis.del('debug-test');
  } catch (error) {
    envCheck.redisConnection = `ERROR: ${error.message}`;
  }

  // Test Stripe connection
  try {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    await stripe.customers.list({ limit: 1 });
    envCheck.stripeConnection = 'SUCCESS';
  } catch (error) {
    envCheck.stripeConnection = `ERROR: ${error.message}`;
  }

  res.json(envCheck);
}
