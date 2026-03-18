import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  StyleSheet,
  Platform,
  Alert,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { useAuthContext } from "@/lib/auth-context";

export default function AdminScreen() {
  const c = useColors();
  const { user } = useAuthContext();

  // Not admin - show nothing
  if (!user || (user as any).role !== "admin") {
    return null;
  }

  return (
    <ScreenContainer containerClassName="bg-background">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
          <Text style={{ fontSize: 26, fontWeight: "800", color: c.foreground }}>管理者</Text>
          <Text style={{ fontSize: 14, color: c.muted, marginTop: 4 }}>ユーザー招待・管理</Text>
        </View>
        <InviteSection colors={c} />
        <UsersSection colors={c} currentUserId={user.id} />
      </ScrollView>
    </ScreenContainer>
  );
}

// ─── 招待セクション ───

function InviteSection({ colors: c }: { colors: ReturnType<typeof useColors> }) {
  const [email, setEmail] = useState("");
  const utils = trpc.useUtils();
  const { data: allowedEmails = [], isLoading } = trpc.admin.allowedEmails.useQuery();
  const invite = trpc.admin.inviteEmail.useMutation({
    onSuccess: () => { utils.admin.allowedEmails.invalidate(); setEmail(""); },
  });
  const remove = trpc.admin.removeEmail.useMutation({
    onSuccess: () => utils.admin.allowedEmails.invalidate(),
  });

  const handleInvite = () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes("@")) {
      Alert.alert("エラー", "有効なメールアドレスを入力してください。");
      return;
    }
    invite.mutate({ email: trimmed });
  };

  const handleRemove = (id: number, emailAddr: string) => {
    if (Platform.OS === "web") {
      if (window.confirm(`「${emailAddr}」の招待を取り消しますか？`)) {
        remove.mutate({ id });
      }
    } else {
      Alert.alert("招待取り消し", `「${emailAddr}」の招待を取り消しますか？`, [
        { text: "キャンセル", style: "cancel" },
        { text: "取り消す", style: "destructive", onPress: () => remove.mutate({ id }) },
      ]);
    }
  };

  return (
    <View style={[st.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Text style={{ fontSize: 14, fontWeight: "700", color: c.foreground, marginBottom: 12 }}>ユーザー招待</Text>

      <View style={[st.row, { gap: 8, marginBottom: 14 }]}>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="メールアドレスを入力"
          placeholderTextColor={c.muted}
          keyboardType="email-address"
          autoCapitalize="none"
          style={[st.input, { flex: 1, color: c.foreground, backgroundColor: c.background, borderColor: c.border }]}
        />
        <Pressable
          style={({ pressed }) => [{
            paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10,
            backgroundColor: c.primary,
          }, pressed && { opacity: 0.7 }]}
          onPress={handleInvite}
          disabled={invite.isPending}
        >
          <Text style={{ fontSize: 13, fontWeight: "700", color: "#fff" }}>
            {invite.isPending ? "..." : "招待"}
          </Text>
        </Pressable>
      </View>

      {isLoading ? (
        <Text style={{ fontSize: 13, color: c.muted }}>読み込み中...</Text>
      ) : allowedEmails.length === 0 ? (
        <Text style={{ fontSize: 13, color: c.muted }}>招待済みのメールアドレスはありません</Text>
      ) : (
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 12, color: c.muted, marginBottom: 4 }}>招待済み（{allowedEmails.length}件）</Text>
          {allowedEmails.map((item) => (
            <View key={item.id} style={[st.row, { justifyContent: "space-between", paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: c.background }]}>
              <Text style={{ fontSize: 13, color: c.foreground, flex: 1 }} numberOfLines={1}>{item.email}</Text>
              <Pressable
                style={({ pressed }) => [{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }, pressed && { opacity: 0.7 }]}
                onPress={() => handleRemove(item.id, item.email)}
              >
                <IconSymbol name="xmark.circle.fill" size={18} color={c.error} />
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── ユーザーセクション ───

function UsersSection({ colors: c, currentUserId }: { colors: ReturnType<typeof useColors>; currentUserId: number }) {
  const utils = trpc.useUtils();
  const { data: userList = [], isLoading } = trpc.admin.users.useQuery();
  const updateRole = trpc.admin.updateRole.useMutation({
    onSuccess: () => utils.admin.users.invalidate(),
  });
  const deleteUser = trpc.admin.deleteUser.useMutation({
    onSuccess: () => utils.admin.users.invalidate(),
  });

  const handleToggleRole = (userId: number, currentRole: string, name: string | null) => {
    if (userId === currentUserId) {
      Alert.alert("エラー", "自分自身の権限は変更できません。");
      return;
    }
    const newRole = currentRole === "admin" ? "user" : "admin";
    const label = newRole === "admin" ? "管理者に変更" : "一般ユーザーに変更";
    if (Platform.OS === "web") {
      if (window.confirm(`「${name || "不明"}」を${label}しますか？`)) {
        updateRole.mutate({ userId, role: newRole });
      }
    } else {
      Alert.alert(label, `「${name || "不明"}」を${label}しますか？`, [
        { text: "キャンセル", style: "cancel" },
        { text: "変更", onPress: () => updateRole.mutate({ userId, role: newRole }) },
      ]);
    }
  };

  const handleDelete = (userId: number, name: string | null) => {
    if (userId === currentUserId) {
      Alert.alert("エラー", "自分自身は削除できません。");
      return;
    }
    if (Platform.OS === "web") {
      if (window.confirm(`「${name || "不明"}」を削除しますか？この操作は取り消せません。`)) {
        deleteUser.mutate({ userId });
      }
    } else {
      Alert.alert("ユーザー削除", `「${name || "不明"}」を削除しますか？この操作は取り消せません。`, [
        { text: "キャンセル", style: "cancel" },
        { text: "削除", style: "destructive", onPress: () => deleteUser.mutate({ userId }) },
      ]);
    }
  };

  return (
    <View style={[st.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Text style={{ fontSize: 14, fontWeight: "700", color: c.foreground, marginBottom: 12 }}>登録ユーザー</Text>

      {isLoading ? (
        <Text style={{ fontSize: 13, color: c.muted }}>読み込み中...</Text>
      ) : userList.length === 0 ? (
        <Text style={{ fontSize: 13, color: c.muted }}>ユーザーはいません</Text>
      ) : (
        <View style={{ gap: 8 }}>
          {userList.map((u) => (
            <View key={u.id} style={{ padding: 12, borderRadius: 12, backgroundColor: c.background, borderWidth: 1, borderColor: c.border }}>
              <View style={[st.row, { justifyContent: "space-between", marginBottom: 4 }]}>
                <View style={[st.row, { gap: 8, flex: 1 }]}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: c.foreground }} numberOfLines={1}>{u.name || "名前なし"}</Text>
                  {u.role === "admin" && (
                    <View style={{ backgroundColor: c.primary, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 }}>
                      <Text style={{ fontSize: 10, color: "#fff", fontWeight: "700" }}>管理者</Text>
                    </View>
                  )}
                  {u.id === currentUserId && (
                    <View style={{ backgroundColor: c.muted, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 }}>
                      <Text style={{ fontSize: 10, color: "#fff", fontWeight: "700" }}>あなた</Text>
                    </View>
                  )}
                </View>
              </View>
              <Text style={{ fontSize: 12, color: c.muted }} numberOfLines={1}>{u.email || "メールなし"}</Text>
              {u.id !== currentUserId && (
                <View style={[st.row, { gap: 8, marginTop: 8 }]}>
                  <Pressable
                    style={({ pressed }) => [{
                      flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center",
                      backgroundColor: c.tealLight,
                    }, pressed && { opacity: 0.7 }]}
                    onPress={() => handleToggleRole(u.id, u.role, u.name)}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "600", color: c.primary }}>
                      {u.role === "admin" ? "一般に変更" : "管理者に変更"}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [{
                      paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8,
                      backgroundColor: "#FEE2E2",
                    }, pressed && { opacity: 0.7 }]}
                    onPress={() => handleDelete(u.id, u.name)}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "600", color: c.error }}>削除</Text>
                  </Pressable>
                </View>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  card: { marginHorizontal: 16, marginBottom: 12, borderRadius: 18, padding: 16, borderWidth: 1 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
});
