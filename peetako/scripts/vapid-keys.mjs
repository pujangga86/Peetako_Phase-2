// Prints a new VAPID key pair for care alerts (Web Push). Run: node scripts/vapid-keys.mjs
// Public half → wrangler.jsonc vars.VAPID_PUBLIC_KEY. Private half → Worker secret VAPID_PRIVATE_KEY (never commit it).
const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const pub = Buffer.from(await crypto.subtle.exportKey('raw', kp.publicKey)).toString('base64url');
const priv = (await crypto.subtle.exportKey('jwk', kp.privateKey)).d;
console.log(`VAPID_PUBLIC_KEY  (wrangler.jsonc): ${pub}\nVAPID_PRIVATE_KEY (Worker secret):  ${priv}`);
