const SAVE_FORMAT = 'pkmon-save-v1';
const SAVE_VERSION = 1;
const PBKDF2_ITERATIONS = 210000;

function getRandomBytes(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function toBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function assertCryptoAvailable() {
  if (!crypto?.subtle) {
    throw new Error('Web Crypto API is unavailable in this browser.');
  }
}

async function deriveAesKey(passphrase, salt, keyUsages = ['encrypt']) {
  const enc = new TextEncoder();
  const material = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    keyUsages,
  );
}

export async function encryptSavePayload({ mode, data }, passphrase) {
  assertCryptoAvailable();
  if (typeof passphrase !== 'string' || passphrase.length < 8) {
    throw new Error('Passphrase must be at least 8 characters.');
  }

  const salt = getRandomBytes(16);
  const iv = getRandomBytes(12);
  const key = await deriveAesKey(passphrase, salt, ['encrypt']);

  const plaintext = new TextEncoder().encode(JSON.stringify({ mode, data }));
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext,
  );
  const ciphertext = new Uint8Array(ciphertextBuffer);

  const checksumBuffer = await crypto.subtle.digest('SHA-256', ciphertext);
  const checksum = toHex(new Uint8Array(checksumBuffer));

  return {
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    createdAt: new Date().toISOString(),
    mode,
    kdf: {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: PBKDF2_ITERATIONS,
      salt: toBase64(salt),
    },
    cipher: {
      name: 'AES-GCM',
      iv: toBase64(iv),
      ciphertext: toBase64(ciphertext),
    },
    checksum: {
      name: 'SHA-256',
      value: checksum,
    },
  };
}

export async function decryptSavePayload(fileText, passphrase) {
  assertCryptoAvailable();
  if (typeof passphrase !== 'string' || passphrase.length < 8) {
    throw new Error('Passphrase must be at least 8 characters.');
  }

  let envelope;
  try {
    envelope = JSON.parse(fileText);
  } catch {
    throw new Error('Invalid save file format.');
  }

  if (envelope?.format !== SAVE_FORMAT || envelope?.version !== SAVE_VERSION) {
    throw new Error('Unsupported save file format version.');
  }

  const salt = fromBase64(envelope?.kdf?.salt ?? '');
  const iv = fromBase64(envelope?.cipher?.iv ?? '');
  const ciphertext = fromBase64(envelope?.cipher?.ciphertext ?? '');

  const checksumBuffer = await crypto.subtle.digest('SHA-256', ciphertext);
  const checksum = toHex(new Uint8Array(checksumBuffer));
  if (checksum !== envelope?.checksum?.value) {
    throw new Error('Save file checksum verification failed.');
  }

  const key = await deriveAesKey(passphrase, salt, ['decrypt']);

  let plaintextBuffer;
  try {
    plaintextBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext,
    );
  } catch {
    throw new Error('Unable to decrypt save file. Check your passphrase.');
  }

  let payload;
  try {
    const text = new TextDecoder().decode(plaintextBuffer);
    payload = JSON.parse(text);
  } catch {
    throw new Error('Save payload is corrupted.');
  }

  if (!payload || (payload.mode !== 'sandbox' && payload.mode !== 'economy')) {
    throw new Error('Save payload mode is invalid.');
  }

  return payload;
}

export function downloadSaveObject(saveObj, filename) {
  const blob = new Blob([JSON.stringify(saveObj)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Failed to read selected file.'));
    reader.readAsText(file);
  });
}
