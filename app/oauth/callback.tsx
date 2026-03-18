import { ThemedView } from "@/components/themed-view";
import * as Auth from "@/lib/_core/auth";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function OAuthCallback() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    sessionToken?: string;
    user?: string;
    error?: string;
  }>();
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Check for error
        if (params.error) {
          setStatus("error");
          setErrorMessage(params.error);
          return;
        }

        // Check for sessionToken (from native deep link or web redirect)
        if (!params.sessionToken) {
          setStatus("error");
          setErrorMessage("No session token received");
          return;
        }

        await Auth.setSessionToken(params.sessionToken);

        // Decode and store user info if available
        if (params.user) {
          try {
            const userJson =
              typeof atob !== "undefined"
                ? atob(params.user)
                : Buffer.from(params.user, "base64").toString("utf-8");
            const userData = JSON.parse(userJson);

            // Validate user data from deep link
            if (typeof userData.id !== 'number' || !userData.id) {
              throw new Error('Invalid user data');
            }

            const userInfo: Auth.User = {
              id: userData.id,
              googleId: userData.googleId ?? null,
              name: userData.name ?? null,
              email: userData.email ?? null,
              role: userData.role ?? "user",
            };
            await Auth.setUserInfo(userInfo);
          } catch (err) {
            if (__DEV__) console.error("[OAuth] Failed to parse user data:", err);
          }
        }

        setStatus("success");
        setTimeout(() => {
          router.replace("/(tabs)");
        }, 1000);
      } catch (error) {
        if (__DEV__) console.error("[OAuth] Callback error:", error);
        setStatus("error");
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to complete authentication",
        );
      }
    };

    handleCallback();
  }, [params.sessionToken, params.user, params.error, router]);

  return (
    <SafeAreaView className="flex-1" edges={["top", "bottom", "left", "right"]}>
      <ThemedView className="flex-1 items-center justify-center gap-4 p-5">
        {status === "processing" && (
          <>
            <ActivityIndicator size="large" />
            <Text className="mt-4 text-base leading-6 text-center text-foreground">
              Completing authentication...
            </Text>
          </>
        )}
        {status === "success" && (
          <>
            <Text className="text-base leading-6 text-center text-foreground">
              Authentication successful!
            </Text>
            <Text className="text-base leading-6 text-center text-foreground">
              Redirecting...
            </Text>
          </>
        )}
        {status === "error" && (
          <>
            <Text className="mb-2 text-xl font-bold leading-7 text-error">
              Authentication failed
            </Text>
            <Text className="text-base leading-6 text-center text-foreground">
              {errorMessage}
            </Text>
          </>
        )}
      </ThemedView>
    </SafeAreaView>
  );
}
