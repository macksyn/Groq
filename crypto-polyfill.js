// crypto-polyfill.js - Ensure crypto is available globally
import { webcrypto } from 'crypto';
import crypto from 'crypto';
import { Buffer } from 'buffer';

// Polyfill for cloud environments that might not have crypto properly set up
if (!global.crypto) {
  global.crypto = webcrypto || crypto;
}

// Ensure Buffer is globally available
if (!global.Buffer) {
  global.Buffer = Buffer;
}

// Ensure crypto functions are available
if (!global.crypto.randomUUID) {
  global.crypto.randomUUID = () => {
    return crypto.randomUUID();
  };
}

if (!global.crypto.getRandomValues) {
  global.crypto.getRandomValues = (array) => {
    return crypto.getRandomValues(array);
  };
}

// Ensure TextEncoder/TextDecoder are available
if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = TextEncoder;
}

if (typeof global.TextDecoder === 'undefined') {
  global.TextDecoder = TextDecoder;
}

console.log('✅ Crypto polyfill loaded successfully');

export default global.crypto;
