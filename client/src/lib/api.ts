const API_BASE = "/api";

async function fetchAPI(endpoint: string, options?: RequestInit) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export const api = {
  auth: {
    login: (username: string, password: string) =>
      fetchAPI("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      }),
    register: (username: string, password: string, inviteCode: string) =>
      fetchAPI("/auth/register", {
        method: "POST",
        body: JSON.stringify({ username, password, inviteCode }),
      }),
    logout: () => fetchAPI("/auth/logout", { method: "POST" }),
    me: () => fetchAPI("/auth/me"),
    checkIp: () => fetchAPI("/auth/check-ip"),
  },
  users: {
    getAll: () => fetchAPI("/users"),
    suspend: (id: string) => fetchAPI(`/users/${id}/suspend`, { method: "PATCH" }),
    unsuspend: (id: string) => fetchAPI(`/users/${id}/unsuspend`, { method: "PATCH" }),
    edit: (id: string, data: any) => fetchAPI(`/users/${id}/edit`, { method: "PATCH", body: JSON.stringify(data) }),
    create: (data: any) => fetchAPI("/users/create", { method: "POST", body: JSON.stringify(data) }),
  },
  invites: {
    generate: () => fetchAPI("/invites/generate", { method: "POST" }),
    verify: (code: string, userId: string) => fetchAPI("/invites/verify", { method: "POST", body: JSON.stringify({ code, userId }) }),
  },
  cases: {
    getAll: () => fetchAPI("/cases"),
    getPublic: () => fetchAPI("/cases/public"),
    get: (id: string) => fetchAPI(`/cases/${id}`),
    create: (data: any) =>
      fetchAPI("/cases", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: any) =>
      fetchAPI(`/cases/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      fetchAPI(`/cases/${id}`, { method: "DELETE" }),
    togglePublic: (id: string) =>
      fetchAPI(`/cases/${id}/toggle-public`, { method: "PATCH" }),
  },
  logs: {
    getAll: () => fetchAPI("/logs"),
  },
};
