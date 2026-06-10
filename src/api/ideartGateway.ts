import axios from "axios";
import {
  apiClient,
  DEFAULT_API_BASE_URL,
  IDEART_API_BASE_URL_STORAGE_KEY,
} from "@/api/client";
import { useModelsStore } from "@/stores/modelsStore";

const IDEART_GATEWAY_TOKEN_KEY = "ideart_gateway_token";

export interface IdeartDesktopUser {
  id: string;
  merchantId: string | null;
  phone: string | null;
  email: string | null;
  points: number;
}

export interface IdeartLoginResult {
  token: string;
  tokenType: "Bearer";
  user: IdeartDesktopUser;
}

function normalizeBaseUrl(baseUrl: string): string {
  return String(baseUrl || "")
    .trim()
    .replace(/\/+$/, "");
}

function createGatewayHttp(baseUrl: string, token?: string) {
  return axios.create({
    baseURL: normalizeBaseUrl(baseUrl),
    timeout: 60000,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

export function saveIdeartGatewaySession(baseUrl: string, token: string) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  localStorage.setItem(IDEART_API_BASE_URL_STORAGE_KEY, normalizedBaseUrl);
  localStorage.setItem(IDEART_GATEWAY_TOKEN_KEY, token);
  apiClient.setBaseUrl(normalizedBaseUrl);
  apiClient.setApiKey(token);
}

export function loadIdeartGatewaySession(): {
  baseUrl: string;
  token: string;
} | null {
  const baseUrl = normalizeBaseUrl(
    localStorage.getItem(IDEART_API_BASE_URL_STORAGE_KEY) ||
      DEFAULT_API_BASE_URL,
  );
  const token = String(localStorage.getItem(IDEART_GATEWAY_TOKEN_KEY) || "");
  if (!baseUrl || !token) return null;
  apiClient.setBaseUrl(baseUrl);
  apiClient.setApiKey(token);
  return { baseUrl, token };
}

export function clearIdeartGatewaySession() {
  localStorage.removeItem(IDEART_GATEWAY_TOKEN_KEY);
  apiClient.setApiKey("");
}

export async function sendIdeartPhoneCode(baseUrl: string, phone: string) {
  const http = createGatewayHttp(baseUrl);
  await http.post("/api/desktop/auth/send-code", { phone });
}

export async function loginIdeartWithPhoneCode(params: {
  baseUrl: string;
  phone: string;
  code: string;
}): Promise<IdeartLoginResult> {
  const http = createGatewayHttp(params.baseUrl);
  const response = await http.post<{
    code: number;
    message: string;
    data: IdeartLoginResult;
  }>("/api/desktop/auth/login", {
    phone: params.phone,
    code: params.code,
  });

  if (response.data.code !== 200) {
    throw new Error(response.data.message || "Ideart 登录失败");
  }

  saveIdeartGatewaySession(params.baseUrl, response.data.data.token);
  await useModelsStore.getState().fetchModels(true);
  return response.data.data;
}

export async function getIdeartGatewayMe(baseUrl?: string, token?: string) {
  const session =
    baseUrl && token ? { baseUrl, token } : loadIdeartGatewaySession();
  if (!session) return null;
  const http = createGatewayHttp(session.baseUrl, session.token);
  const response = await http.get<{
    code: number;
    message: string;
    data: { user: IdeartDesktopUser };
  }>("/api/desktop/auth/me");
  if (response.data.code !== 200) {
    throw new Error(response.data.message || "Ideart 登录已失效");
  }
  return response.data.data.user;
}
