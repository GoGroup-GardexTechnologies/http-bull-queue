// Set required env vars before any module loads.
// globals.ts exits the process if these are missing.
process.env.QUEUE_SECRET = 'test-queue-secret';
process.env.ADMIN_SECRET = 'test-admin-secret';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.REDIS_PASS = '';
process.env.SEND_GRID_API_KEY = 'SG.test';
process.env.SMS_PORTAL_CLIENT_ID = 'test-client-id';
process.env.SMS_PORTAL_API_KEY = 'test-api-key';
process.env.VERIFIED_EMAIL = 'noreply@test.com';
