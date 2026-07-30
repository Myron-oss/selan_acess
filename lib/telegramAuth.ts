import "server-only";

import {
  createHmac,
  timingSafeEqual
} from "node:crypto";
import type { NextRequest } from "next/server";

export const SESSION_COOKIE_NAME = "selan_session";
const INIT_DATA_MAX_AGE_SECONDS = 24 * 60 * 60;
const SESSION_MAX_AGE_SECONDS = 24 * 60 * 60;
const MAX_CLOCK_SKEW_SECONDS = 5 * 60;

interface SessionPayload {
  v: 1;
  tgId: number;
  exp: number;
}

function safeHexEqual(received: string, expected: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(received)) {
    return false;
  }

  const receivedBuffer = Buffer.from(received, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");

  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

function safeBase64UrlEqual(received: string, expected: string): boolean {
  try {
    const receivedBuffer = Buffer.from(received, "base64url");
    const expectedBuffer = Buffer.from(expected, "base64url");

    return (
      receivedBuffer.length === expectedBuffer.length &&
      timingSafeEqual(receivedBuffer, expectedBuffer)
    );
  } catch {
    return false;
  }
}

export function verifyTelegramInitData(
  initData: string,
  botToken: string
): { valid: boolean; userId?: number } {
  if (!initData || !botToken) {
    return { valid: false };
  }

  try {
    const params = new URLSearchParams(initData);
    const receivedHash = params.get("hash");

    if (!receivedHash) {
      return { valid: false };
    }

    params.delete("hash");

    const dataCheckString = Array.from(params.entries())
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");

    // Telegram Mini Apps algorithm:
    // secret_key = HMAC_SHA256(key="WebAppData", data=botToken)
    const secretKey = createHmac("sha256", "WebAppData")
      .update(botToken)
      .digest();
    const expectedHash = createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");

    if (!safeHexEqual(receivedHash, expectedHash)) {
      return { valid: false };
    }

    const authDate = Number(params.get("auth_date"));
    const now = Math.floor(Date.now() / 1000);
    const age = now - authDate;

    if (
      !Number.isInteger(authDate) ||
      authDate <= 0 ||
      age > INIT_DATA_MAX_AGE_SECONDS ||
      age < -MAX_CLOCK_SKEW_SECONDS
    ) {
      return { valid: false };
    }

    const rawUser = params.get("user");
    if (!rawUser) {
      return { valid: false };
    }

    const user = JSON.parse(rawUser) as { id?: unknown };
    const userId = Number(user.id);

    if (!Number.isSafeInteger(userId) || userId <= 0) {
      return { valid: false };
    }

    return { valid: true, userId };
  } catch {
    return { valid: false };
  }
}

export function createSessionToken(tgId: number, secret: string): string {
  if (!secret) {
    throw new Error("SESSION_SECRET is not configured");
  }

  const payload: SessionPayload = {
    v: 1,
    tgId,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url"
  );
  const signature = createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");

  return `${encodedPayload}.${signature}`;
}

export function verifySessionToken(
  token: string,
  secret: string
): SessionPayload | null {
  if (!token || !secret) {
    return null;
  }

  const [encodedPayload, receivedSignature, extraPart] = token.split(".");
  if (!encodedPayload || !receivedSignature || extraPart) {
    return null;
  }

  const expectedSignature = createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");

  if (!safeBase64UrlEqual(receivedSignature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8")
    ) as Partial<SessionPayload>;
    const now = Math.floor(Date.now() / 1000);

    if (
      payload.v !== 1 ||
      !Number.isSafeInteger(payload.tgId) ||
      Number(payload.tgId) <= 0 ||
      !Number.isInteger(payload.exp) ||
      Number(payload.exp) <= now
    ) {
      return null;
    }

    return payload as SessionPayload;
  } catch {
    return null;
  }
}

export function getSessionUserId(request: NextRequest): number | null {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const secret = process.env.SESSION_SECRET;

  if (!token || !secret) {
    return null;
  }

  return verifySessionToken(token, secret)?.tgId ?? null;
}

export const SESSION_COOKIE_MAX_AGE = SESSION_MAX_AGE_SECONDS;
