// app/index.tsx 
import { useRouter } from "expo-router";
import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { getToken } from "../lib/session";


export default function Index() {
  const router = useRouter();


  useEffect(() => {
    let cancelled = false;


    (async () => {
      const token = await getToken();
      if (cancelled) return;


      const target = token ? "/(tabs)" : "/login";
      router.replace(target);

    })();


    return () => {
      cancelled = true;
    };
  }, [router]);


  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator />
    </View>
  );
}
