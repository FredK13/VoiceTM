// app/lib/session.ts
import * as SecureStore from "expo-secure-store";


const TOKEN_KEY = "yap_token";
const USER_ID_KEY = "yap_user_id";


export async function saveToken(token: string) {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}


export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}


export async function saveUserId(userId: string) {
  await SecureStore.setItemAsync(USER_ID_KEY, userId);
}


export async function getUserId(): Promise<string | null> {
  return SecureStore.getItemAsync(USER_ID_KEY);
}


export async function clearSession() {
  await Promise.all([
    SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {}),
    SecureStore.deleteItemAsync(USER_ID_KEY).catch(() => {}),
  ]);
}
