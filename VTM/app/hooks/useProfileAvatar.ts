import { useCallback, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { Alert } from "react-native";
import { apiFetch, apiJson } from "../../lib/api";


type Args = {
  t: (key: string, options?: any) => string;
};


export function useProfileAvatar({ t }: Args) {
  const [myAvatarUrl, setMyAvatarUrl] = useState<string | null>(null);
  const [myUsername, setMyUsername] = useState<string>("");


  const refreshMe = useCallback(async () => {
  try {
    const me = await apiJson<{ id: string; username: string; avatarUrl?: string | null }>("/api/me");
    setMyUsername(me.username ?? "");
    setMyAvatarUrl(me.avatarUrl ?? null);
  } catch (e) {
    console.warn("refreshMe failed:", e);
  }
}, []);



  async function pickAndUploadAvatar() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t("common.permissionNeededTitle"), t("common.permissionNeededBody"));
      return;
    }


    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images" as any,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });


    if (result.canceled) return;


    const asset = result.assets?.[0];
    if (!asset?.uri) return;


    const uri = asset.uri;
    const ext = (uri.split(".").pop() || "").toLowerCase();


    const mime =
      ext === "png"
        ? "image/png"
        : ext === "webp"
        ? "image/webp"
        : ext === "jpg" || ext === "jpeg"
        ? "image/jpeg"
        : "image/jpeg";


    const filename = ext ? `avatar.${ext}` : "avatar.jpg";


    const form = new FormData();
    form.append(
      "file",
      {
        uri,
        name: filename,
        type: mime,
      } as any
    );


    try {
      const out = await apiFetch("/api/me/avatar", {
        method: "POST",
        body: form,
      });


      const avatarUrl = (out as any)?.avatarUrl ?? null;
      setMyAvatarUrl(avatarUrl);
      Alert.alert(t("common.updatedTitle"), t("common.profilePictureUpdated"));
    } catch (err: any) {
      Alert.alert(t("common.uploadFailed"), err?.message ?? t("common.couldNotUploadAvatar"));
    }
  }


  async function removeAvatar() {
    if (!myAvatarUrl) return;


    Alert.alert(t("common.removeImageTitle"), t("common.removeImageBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.remove"),
        style: "destructive",
        onPress: async () => {
          try {
            await apiFetch("/api/me/avatar", { method: "DELETE" });
            setMyAvatarUrl(null);
          } catch (err: any) {
            Alert.alert(t("common.removeFailed"), err?.message ?? t("common.couldNotRemoveAvatar"));
          }
        },
      },
    ]);
  }


  return {
    myAvatarUrl,
    myUsername,
    setMyAvatarUrl,
    setMyUsername,
    refreshMe,
    pickAndUploadAvatar,
    removeAvatar,
  };
}


export default useProfileAvatar;


