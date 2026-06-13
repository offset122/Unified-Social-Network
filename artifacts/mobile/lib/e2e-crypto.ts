import * as SecureStore from "expo-secure-store";

const PRIVATE_KEY_STORE_KEY = "e2e_private_key_jwk";
const PUBLIC_KEY_STORE_KEY = "e2e_public_key_jwk";

const subtle = globalThis.crypto?.subtle;

export function isE2ESupported(): boolean {
  return !!(globalThis.crypto && globalThis.crypto.subtle);
}

export async function getOrCreateKeyPair(): Promise<{ publicKeyJwk: string } | null> {
  if (!isE2ESupported()) return null;
  try {
    const stored = await SecureStore.getItemAsync(PRIVATE_KEY_STORE_KEY);
    if (stored) {
      const pubStored = await SecureStore.getItemAsync(PUBLIC_KEY_STORE_KEY);
      if (pubStored) return { publicKeyJwk: pubStored };
    }
    const keyPair = await subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveKey", "deriveBits"],
    );
    const privateJwk = await subtle.exportKey("jwk", keyPair.privateKey);
    const publicJwk = await subtle.exportKey("jwk", keyPair.publicKey);
    const privateStr = JSON.stringify(privateJwk);
    const publicStr = JSON.stringify(publicJwk);
    await SecureStore.setItemAsync(PRIVATE_KEY_STORE_KEY, privateStr);
    await SecureStore.setItemAsync(PUBLIC_KEY_STORE_KEY, publicStr);
    return { publicKeyJwk: publicStr };
  } catch {
    return null;
  }
}

async function loadPrivateKey(): Promise<CryptoKey | null> {
  try {
    const stored = await SecureStore.getItemAsync(PRIVATE_KEY_STORE_KEY);
    if (!stored) return null;
    return subtle.importKey(
      "jwk",
      JSON.parse(stored),
      { name: "ECDH", namedCurve: "P-256" },
      false,
      ["deriveKey", "deriveBits"],
    );
  } catch {
    return null;
  }
}

async function importPublicKey(jwkString: string): Promise<CryptoKey | null> {
  try {
    return subtle.importKey(
      "jwk",
      JSON.parse(jwkString),
      { name: "ECDH", namedCurve: "P-256" },
      false,
      [],
    );
  } catch {
    return null;
  }
}

const sharedKeyCache = new Map<string, CryptoKey>();

export async function getSharedKey(theirPublicKeyJwk: string, cacheKey: string): Promise<CryptoKey | null> {
  if (!isE2ESupported()) return null;
  if (sharedKeyCache.has(cacheKey)) return sharedKeyCache.get(cacheKey)!;
  try {
    const privateKey = await loadPrivateKey();
    const theirPublicKey = await importPublicKey(theirPublicKeyJwk);
    if (!privateKey || !theirPublicKey) return null;
    const sharedKey = await subtle.deriveKey(
      { name: "ECDH", public: theirPublicKey },
      privateKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    sharedKeyCache.set(cacheKey, sharedKey);
    return sharedKey;
  } catch {
    return null;
  }
}

const ENC_PREFIX = "E2E:";

export async function encryptMessage(sharedKey: CryptoKey, plaintext: string): Promise<string> {
  try {
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);
    const ciphertext = await subtle.encrypt({ name: "AES-GCM", iv }, sharedKey, encoded);
    const ivB64 = btoa(String.fromCharCode(...iv));
    const ctB64 = btoa(String.fromCharCode(...new Uint8Array(ciphertext)));
    return `${ENC_PREFIX}${ivB64}:${ctB64}`;
  } catch {
    return plaintext;
  }
}

export async function decryptMessage(sharedKey: CryptoKey, content: string): Promise<string> {
  if (!content.startsWith(ENC_PREFIX)) return content;
  try {
    const rest = content.slice(ENC_PREFIX.length);
    const colonIdx = rest.indexOf(":");
    const ivB64 = rest.slice(0, colonIdx);
    const ctB64 = rest.slice(colonIdx + 1);
    const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
    const ct = Uint8Array.from(atob(ctB64), (c) => c.charCodeAt(0));
    const decrypted = await subtle.decrypt({ name: "AES-GCM", iv }, sharedKey, ct);
    return new TextDecoder().decode(decrypted);
  } catch {
    return "🔒 [encrypted message]";
  }
}

export function isEncrypted(content: string): boolean {
  return content.startsWith(ENC_PREFIX);
}
