import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const AUTH_TOKEN_BYTES = 32;

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedValue: string) {
  const [salt, storedHash] = storedValue.split(":");

  if (!salt || !storedHash) {
    return false;
  }

  const computedHash = scryptSync(password, salt, 64);
  const storedHashBuffer = Buffer.from(storedHash, "hex");

  if (computedHash.length !== storedHashBuffer.length) {
    return false;
  }

  return timingSafeEqual(computedHash, storedHashBuffer);
}

export function createAuthToken() {
  return randomBytes(AUTH_TOKEN_BYTES).toString("hex");
}

export function getBearerToken(authorizationHeader?: string) {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    return "";
  }

  return authorizationHeader.slice("Bearer ".length).trim();
}
