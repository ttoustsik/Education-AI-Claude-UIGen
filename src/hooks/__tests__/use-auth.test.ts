import { describe, test, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAuth } from "@/hooks/use-auth";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock server actions
vi.mock("@/actions", () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("@/actions/get-projects", () => ({
  getProjects: vi.fn(),
}));

vi.mock("@/actions/create-project", () => ({
  createProject: vi.fn(),
}));

// Mock anon-work-tracker
vi.mock("@/lib/anon-work-tracker", () => ({
  getAnonWorkData: vi.fn(),
  clearAnonWork: vi.fn(),
}));

import { signIn as signInAction, signUp as signUpAction } from "@/actions";
import { getProjects } from "@/actions/get-projects";
import { createProject } from "@/actions/create-project";
import { getAnonWorkData, clearAnonWork } from "@/lib/anon-work-tracker";

const mockSignInAction = vi.mocked(signInAction);
const mockSignUpAction = vi.mocked(signUpAction);
const mockGetProjects = vi.mocked(getProjects);
const mockCreateProject = vi.mocked(createProject);
const mockGetAnonWorkData = vi.mocked(getAnonWorkData);
const mockClearAnonWork = vi.mocked(clearAnonWork);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAnonWorkData.mockReturnValue(null);
});

describe("useAuth - initial state", () => {
  test("starts with isLoading false", () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.isLoading).toBe(false);
  });

  test("exposes signIn and signUp functions", () => {
    const { result } = renderHook(() => useAuth());
    expect(typeof result.current.signIn).toBe("function");
    expect(typeof result.current.signUp).toBe("function");
  });
});

describe("useAuth - signIn", () => {
  test("sets isLoading to true while signing in and false after", async () => {
    let resolveSignIn!: (v: any) => void;
    mockSignInAction.mockReturnValue(
      new Promise((res) => { resolveSignIn = res; })
    );
    mockGetAnonWorkData.mockReturnValue(null);
    mockGetProjects.mockResolvedValue([]);
    mockCreateProject.mockResolvedValue({ id: "proj-1" } as any);

    const { result } = renderHook(() => useAuth());

    let signInPromise: Promise<any>;
    act(() => {
      signInPromise = result.current.signIn("user@example.com", "password123");
    });

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolveSignIn({ success: true });
      await signInPromise;
    });

    expect(result.current.isLoading).toBe(false);
  });

  test("returns the result from signInAction on success", async () => {
    mockSignInAction.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue(null);
    mockGetProjects.mockResolvedValue([{ id: "proj-1" }] as any);

    const { result } = renderHook(() => useAuth());
    let returnVal: any;

    await act(async () => {
      returnVal = await result.current.signIn("user@example.com", "pass");
    });

    expect(returnVal).toEqual({ success: true });
  });

  test("returns the result from signInAction on failure", async () => {
    mockSignInAction.mockResolvedValue({ success: false, error: "Invalid credentials" });

    const { result } = renderHook(() => useAuth());
    let returnVal: any;

    await act(async () => {
      returnVal = await result.current.signIn("user@example.com", "wrongpass");
    });

    expect(returnVal).toEqual({ success: false, error: "Invalid credentials" });
    expect(mockGetAnonWorkData).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  test("resets isLoading to false even when signInAction throws", async () => {
    mockSignInAction.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signIn("user@example.com", "pass").catch(() => {});
    });

    expect(result.current.isLoading).toBe(false);
  });
});

describe("useAuth - signUp", () => {
  test("sets isLoading during sign up and resets after", async () => {
    mockSignUpAction.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue(null);
    mockGetProjects.mockResolvedValue([{ id: "proj-2" }] as any);

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signUp("new@example.com", "pass");
    });

    expect(result.current.isLoading).toBe(false);
  });

  test("returns result from signUpAction on success", async () => {
    mockSignUpAction.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue(null);
    mockGetProjects.mockResolvedValue([{ id: "proj-2" }] as any);

    const { result } = renderHook(() => useAuth());
    let returnVal: any;

    await act(async () => {
      returnVal = await result.current.signUp("new@example.com", "pass");
    });

    expect(returnVal).toEqual({ success: true });
  });

  test("does not navigate when signUp fails", async () => {
    mockSignUpAction.mockResolvedValue({ success: false, error: "Email taken" });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signUp("taken@example.com", "pass");
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  test("resets isLoading even when signUpAction throws", async () => {
    mockSignUpAction.mockRejectedValue(new Error("Server error"));

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signUp("user@example.com", "pass").catch(() => {});
    });

    expect(result.current.isLoading).toBe(false);
  });
});

describe("useAuth - handlePostSignIn with anon work", () => {
  test("creates project from anon work and redirects when messages exist", async () => {
    const anonWork = {
      messages: [{ role: "user", content: "hello" }],
      fileSystemData: { "/": { type: "directory" } },
    };
    mockSignInAction.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue(anonWork);
    mockCreateProject.mockResolvedValue({ id: "anon-proj" } as any);

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signIn("user@example.com", "pass");
    });

    expect(mockCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: anonWork.messages,
        data: anonWork.fileSystemData,
      })
    );
    expect(mockClearAnonWork).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/anon-proj");
    expect(mockGetProjects).not.toHaveBeenCalled();
  });

  test("does not migrate anon work when messages array is empty", async () => {
    mockSignInAction.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue({ messages: [], fileSystemData: {} });
    mockGetProjects.mockResolvedValue([{ id: "existing-proj" }] as any);

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signIn("user@example.com", "pass");
    });

    expect(mockCreateProject).not.toHaveBeenCalledWith(
      expect.objectContaining({ messages: [] })
    );
    expect(mockClearAnonWork).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/existing-proj");
  });

  test("does not migrate when getAnonWorkData returns null", async () => {
    mockSignInAction.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue(null);
    mockGetProjects.mockResolvedValue([{ id: "proj-x" }] as any);

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signIn("user@example.com", "pass");
    });

    expect(mockClearAnonWork).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/proj-x");
  });
});

describe("useAuth - handlePostSignIn project navigation", () => {
  test("redirects to most recent project when user has projects", async () => {
    mockSignInAction.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue(null);
    mockGetProjects.mockResolvedValue([
      { id: "recent-proj" },
      { id: "older-proj" },
    ] as any);

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signIn("user@example.com", "pass");
    });

    expect(mockPush).toHaveBeenCalledWith("/recent-proj");
    expect(mockCreateProject).not.toHaveBeenCalled();
  });

  test("creates a new project and redirects when user has no projects", async () => {
    mockSignInAction.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue(null);
    mockGetProjects.mockResolvedValue([]);
    mockCreateProject.mockResolvedValue({ id: "brand-new-proj" } as any);

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signIn("user@example.com", "pass");
    });

    expect(mockCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({ messages: [], data: {} })
    );
    expect(mockPush).toHaveBeenCalledWith("/brand-new-proj");
  });

  test("new project name starts with 'New Design #'", async () => {
    mockSignInAction.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue(null);
    mockGetProjects.mockResolvedValue([]);
    mockCreateProject.mockResolvedValue({ id: "new-proj" } as any);

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signIn("user@example.com", "pass");
    });

    expect(mockCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        name: expect.stringMatching(/^New Design #\d+$/),
      })
    );
  });

  test("anon project name starts with 'Design from'", async () => {
    const anonWork = {
      messages: [{ role: "user", content: "make a button" }],
      fileSystemData: {},
    };
    mockSignInAction.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue(anonWork);
    mockCreateProject.mockResolvedValue({ id: "anon-proj" } as any);

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signIn("user@example.com", "pass");
    });

    expect(mockCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        name: expect.stringMatching(/^Design from /),
      })
    );
  });
});
