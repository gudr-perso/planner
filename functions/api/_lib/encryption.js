// AES-256-GCM symmetric encryption using Web Crypto API (native in Workers)
// Format: base64url(iv_12bytes) + '.' + base64url(ciphertext)

function b64uEncode(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function b64uDecode(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}

async function importKey(hexKey) {
  const raw = new Uint8Array(hexKey.match(/.{2}/g).map(b => parseInt(b, 16)));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encrypt(plaintext, hexKey) {
  const key = await importKey(hexKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return b64uEncode(iv) + '.' + b64uEncode(cipher);
}

export async function decrypt(ciphertext, hexKey) {
  const [ivB64, dataB64] = ciphertext.split('.');
  const iv = b64uDecode(ivB64);
  const data = b64uDecode(dataB64);
  const key = await importKey(hexKey);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(plain);
}
