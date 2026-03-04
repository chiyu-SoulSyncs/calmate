/**
 * Google OAuth認証フック
 * expo-auth-sessionを使用してExpo Go / ネイティブビルド / Webの全環境で動作する
 *
 * 使い方:
 * const { signIn, isLoading } = useGoogleAuth({ onSuccess, onError });
 */
import { useEffect, useCallback, useRef } from "react";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { getApiBaseUrl } from "@/constants/oauth";

// Webブラウザの認証セッションを完了させるために必要
WebBrowser.maybeCompleteAuthSession();

// Google Cloud Console に登録されているクライアントID
// Web用クライアントID（Expo Goプロキシ経由のリダイレクトを受け取るため使用）
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "";
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? "";
const ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? "";

export interface UseGoogleAuthOptions {
  onSuccess?: (accessToken: string) => void | Promise<void>;
  onError?: (error: string) => void;
}

export function useGoogleAuth({ onSuccess, onError }: UseGoogleAuthOptions = {}) {
  const calledRef = useRef(false);

  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: WEB_CLIENT_ID,
    iosClientId: IOS_CLIENT_ID || undefined,
    androidClientId: ANDROID_CLIENT_ID || undefined,
    scopes: [
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
  });

  useEffect(() => {
    if (!response) return;
    if (calledRef.current) return;

    if (response.type === "success") {
      const accessToken = response.authentication?.accessToken;
      if (accessToken) {
        calledRef.current = true;
        onSuccess?.(accessToken);
      } else {
        onError?.("アクセストークンの取得に失敗しました");
      }
    } else if (response.type === "error") {
      onError?.(response.error?.message ?? "認証エラーが発生しました");
    } else if (response.type === "cancel") {
      // ユーザーがキャンセルした場合は何もしない
    }
  }, [response, onSuccess, onError]);

  const signIn = useCallback(async () => {
    calledRef.current = false;
    try {
      await promptAsync();
    } catch (err: any) {
      onError?.(err?.message ?? "認証の開始に失敗しました");
    }
  }, [promptAsync, onError]);

  return {
    signIn,
    isReady: !!request,
    response,
  };
}

/**
 * アクセストークンをサーバーに送信してGoogle連携を完了する
 */
export async function saveGoogleTokenToServer(
  userId: string,
  accessToken: string
): Promise<boolean> {
  try {
    const apiBase = getApiBaseUrl();
    const res = await fetch(`${apiBase}/api/google/save-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, accessToken }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
