import { useCallback, useRef, useEffect } from "react";

export type LoginState = "idle" | "submitting" | "waking_server" | "success" | "error";

interface UseLoginColdStartOptions {
  apiUrl: string;
  wakingThresholdMs?: number; // tempo em ms antes de considerar "acordando"
  maxRetries?: number; // tentativas de retry
  retryBackoffMs?: number; // backoff entre retries
}

interface LoginAttempt {
  username: string;
  password: string;
  onSuccess: (token: string) => void;
  onError: (message: string) => void;
}

interface ColdStartResponse {
  state: LoginState;
  message?: string;
  data?: { token?: string; elapsedMs?: number } | Record<string, unknown> | null;
  needsRetry?: boolean;
}

interface LoginPhaseUpdate {
  state: Exclude<LoginState, "success" | "error">;
  message?: string;
}

/**
 * Hook que gerencia login com detecção elegante de cold start.
 * 
 * Estados:
 * - idle: pronto para fazer login
 * - submitting: enviando credentials (0-3s)
 * - waking_server: servidor acordando (3s+)
 * - success: login bem-sucedido
 * - error: erro permanente
 */
export function useLoginColdStart(options: UseLoginColdStartOptions) {
  const {
    apiUrl,
    wakingThresholdMs = 3000,
    maxRetries = 3,
    retryBackoffMs = 1000,
  } = options;

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const retryCountRef = useRef(0);

  // Limpar resources ao desmontar
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  /**
   * Faz health check rápido do backend
   */
  const checkHealth = useCallback(
    async (timeoutMs = 2000): Promise<boolean> => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const res = await fetch(`${apiUrl}/health`, {
          signal: controller.signal,
        }).catch(() => null);

        clearTimeout(timeoutId);
        return res?.ok ?? false;
      } catch {
        return false;
      }
    },
    [apiUrl]
  );

  /**
   * Realiza tentativa de login com controle de tempo
   */
  const attemptLogin = useCallback(
    async (
      username: string,
      password: string,
      forceSession: boolean,
      getCurrentState: () => LoginState
    ): Promise<ColdStartResponse> => {
      const startTime = Date.now();
      let timedOut = false;

      try {
        const controller = new AbortController();
        abortControllerRef.current = controller;

        const loginPromise = fetch(`${apiUrl}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password, forceSession }),
          signal: controller.signal,
        }).then(async (res) => {
          const elapsedMs = Date.now() - startTime;
          const data = await res.json().catch(() => null);

          if (!res.ok) {
            // Erros transitórios típicos de cold start
            if ([502, 503, 504].includes(res.status)) {
              return {
                state: "waking_server" as LoginState,
                message: "Servidor acordando...",
                needsRetry: true,
                data: null,
              };
            }

            // Erros de autenticação
            if (res.status === 404) {
              return {
                state: "error" as LoginState,
                message: "Usuário inexistente",
                data,
              };
            }

            if (res.status === 401) {
              return {
                state: "error" as LoginState,
                message: data?.message ?? "Senha incorreta",
                data,
              };
            }

            // Outros erros
            return {
              state: "error" as LoginState,
              message:
                data?.message ||
                data?.error ||
                "Erro ao autenticar. Verifique suas credenciais.",
              data,
            };
          }

          // Sucesso
          const token =
            data?.access_token ||
            data?.accessToken ||
            data?.token;

          if (!token) {
            return {
              state: "error" as LoginState,
              message: "Login falhou: token não recebido",
              data: null,
            };
          }

          const payload = data && typeof data === "object" ? data : {};

          return {
            state: "success" as LoginState,
            message: undefined,
            data: { ...payload, token, elapsedMs },
          };
        });

        // Aguardar a resposta com timeout
        const result = await Promise.race([
          loginPromise,
          new Promise<ColdStartResponse>((resolve) => {
            timeoutRef.current = setTimeout(() => {
              timedOut = true;
              resolve({
                state: "waking_server" as LoginState,
                message: "Servidor acordando...",
                needsRetry: true,
              });
              controller.abort();
            }, wakingThresholdMs);
          }),
        ]);

        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }

        return result;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          if (timedOut) {
            return {
              state: "waking_server" as LoginState,
              message: "Servidor acordando...",
              needsRetry: true,
              data: null,
            };
          }

          return {
            state: "error" as LoginState,
            message: "Login cancelado",
            data: null,
          };
        }

        return {
          state: "waking_server" as LoginState,
          message: "Falha ao conectar. Tentando reconectar...",
          needsRetry: true,
          data: null,
        };
      }
    },
    [apiUrl, wakingThresholdMs]
  );

  /**
   * Realiza login com retry automático para cold start
   */
  const executeLoginWithRetry = useCallback(
    async (
      username: string,
      password: string,
      forceSession = false,
      onPhaseUpdate?: (phase: LoginPhaseUpdate) => void
    ): Promise<ColdStartResponse> => {
      retryCountRef.current = 0;
      onPhaseUpdate?.({ state: "submitting" });

      while (retryCountRef.current < maxRetries) {
        const response = await attemptLogin(username, password, forceSession, () => "submitting");

        if (response.state === "success" || response.state === "error") {
          retryCountRef.current = 0;
          return response;
        }

        // Se for "waking_server" e temos retries
        if (response.needsRetry && retryCountRef.current < maxRetries - 1) {
          onPhaseUpdate?.({
            state: "waking_server",
            message:
              response.message ??
              "Estamos iniciando o ambiente seguro. A primeira conexao pode levar alguns segundos.",
          });
          retryCountRef.current++;

          // Aguardar com backoff exponencial
          const delay = retryBackoffMs * Math.pow(1.5, retryCountRef.current - 1);
          await new Promise((resolve) => {
            timeoutRef.current = setTimeout(resolve, delay);
          });

          // Fazer health check antes de retry
          const isHealthy = await checkHealth(2000);
          if (!isHealthy) {
            // Continuar mesmo se health check falhar
            continue;
          }
        } else {
          // Sem mais retries, retornar o estado
          break;
        }
      }

      retryCountRef.current = 0;
      return {
        state: "error" as LoginState,
        message:
          "Servidor ainda está iniciando. Tente novamente em alguns segundos.",
        data: null,
      };
    },
    [attemptLogin, checkHealth, maxRetries, retryBackoffMs]
  );

  /**
   * Cancelar requisição em progresso
   */
  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  }, []);

  return {
    executeLoginWithRetry,
    checkHealth,
    cancel,
  };
}
