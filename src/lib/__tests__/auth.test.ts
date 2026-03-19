// @vitest-environment node
import { describe, test, expect, vi, beforeEach } from "vitest";

// Mock server-only so it doesn't throw in test environment
vi.mock("server-only", () => ({}));

// Mock next/headers cookies
const cookieStore = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => Promise.resolve(cookieStore)),
}));

// Mock next/server
vi.mock("next/server", () => ({
  NextRequest: class NextRequest {
    cookies: { get: (name: string) => { value: string } | undefined };
    constructor(_url: string, options?: { headers?: Record<string, string> }) {
      this.cookies = {
        get: vi.fn(),
      };
    }
  },
}));

import { createSession, getSession, deleteSession, verifySession } from "@/lib/auth";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";

const JWT_SECRET = new TextEncoder().encode("development-secret-key");

async function makeToken(payload: object, expiresIn = "7d") {
  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(expiresIn)
    .setIssuedAt()
    .sign(JWT_SECRET);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createSession", () => {
  test("sets an httpOnly cookie with a JWT token", async () => {
    await createSession("user-1", "test@example.com");

    expect(cookieStore.set).toHaveBeenCalledOnce();
    const [name, token, options] = cookieStore.set.mock.calls[0];

    expect(name).toBe("auth-token");
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3); // valid JWT format
    expect(options.httpOnly).toBe(true);
    expect(options.path).toBe("/");
    expect(options.expires).toBeInstanceOf(Date);
  });

  test("token expires approximately 7 days from now", async () => {
    const before = Date.now();
    await createSession("user-1", "test@example.com");
    const after = Date.now();

    const [, , options] = cookieStore.set.mock.calls[0];
    const expiresMs = options.expires.getTime();

    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    expect(expiresMs).toBeGreaterThanOrEqual(before + sevenDays - 1000);
    expect(expiresMs).toBeLessThanOrEqual(after + sevenDays + 1000);
  });
});

describe("getSession", () => {
  test("returns null when no cookie is present", async () => {
    cookieStore.get.mockReturnValue(undefined);

    const session = await getSession();
    expect(session).toBeNull();
  });

  test("returns session payload for a valid token", async () => {
    const payload = {
      userId: "user-1",
      email: "test@example.com",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    };
    const token = await makeToken(payload);
    cookieStore.get.mockReturnValue({ value: token });

    const session = await getSession();

    expect(session).not.toBeNull();
    expect(session?.userId).toBe("user-1");
    expect(session?.email).toBe("test@example.com");
  });

  test("returns null for an expired token", async () => {
    const token = await makeToken(
      { userId: "user-1", email: "test@example.com" },
      "-1s"
    );
    cookieStore.get.mockReturnValue({ value: token });

    const session = await getSession();
    expect(session).toBeNull();
  });

  test("returns null for a tampered token", async () => {
    const token = "header.tampered-payload.signature";
    cookieStore.get.mockReturnValue({ value: token });

    const session = await getSession();
    expect(session).toBeNull();
  });
});

describe("deleteSession", () => {
  test("deletes the auth-token cookie", async () => {
    await deleteSession();

    expect(cookieStore.delete).toHaveBeenCalledOnce();
    expect(cookieStore.delete).toHaveBeenCalledWith("auth-token");
  });
});

describe("verifySession", () => {
  test("returns null when no cookie on request", async () => {
    const req = new NextRequest("http://localhost/");
    vi.mocked(req.cookies.get).mockReturnValue(undefined);

    const session = await verifySession(req);
    expect(session).toBeNull();
  });

  test("returns session payload for a valid token on request", async () => {
    const payload = {
      userId: "user-2",
      email: "other@example.com",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    };
    const token = await makeToken(payload);

    const req = new NextRequest("http://localhost/");
    vi.mocked(req.cookies.get).mockReturnValue({ value: token });

    const session = await verifySession(req);

    expect(session).not.toBeNull();
    expect(session?.userId).toBe("user-2");
    expect(session?.email).toBe("other@example.com");
  });

  test("returns null for an expired token on request", async () => {
    const token = await makeToken(
      { userId: "user-2", email: "other@example.com" },
      "-1s"
    );

    const req = new NextRequest("http://localhost/");
    vi.mocked(req.cookies.get).mockReturnValue({ value: token });

    const session = await verifySession(req);
    expect(session).toBeNull();
  });

  test("returns null for a malformed token on request", async () => {
    const req = new NextRequest("http://localhost/");
    vi.mocked(req.cookies.get).mockReturnValue({ value: "not.a.jwt" });

    const session = await verifySession(req);
    expect(session).toBeNull();
  });
});
