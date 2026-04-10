import { Tabs } from "expo-router";
import { useEffect } from "react";
import { AppState, AppStateStatus } from "react-native";
import { apiFetch } from "../../lib/api";
import { PresenceProvider } from "../../lib/presence";
import { getUserId } from "@/lib/session";

export default function TabLayout() {
  useEffect(() => {
    let isMounted = true;


    const sendHeartbeat = async () => {
  if (!isMounted) return;


  const userId = await getUserId().catch(() => null);
  if (!userId) return;


  apiFetch("/api/presence/heartbeat", { method: "POST" }).catch(() => {});
};


    // fire immediately
    sendHeartbeat();


    // keep alive
    const id = setInterval(sendHeartbeat, 25_000);


    // refresh on resume/foreground
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
  if (state === "active") {
    sendHeartbeat();
    return;
  }


  if (state === "background" || state === "inactive") {
    apiFetch("/api/presence/offline", { method: "POST" }).catch(() => {});
  }
});



    return () => {
      isMounted = false;
      clearInterval(id);
      sub.remove();
    };
  }, []);


return (
    <PresenceProvider>
    {<Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          display: "none",
        },
      }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="messages" />
      <Tabs.Screen name="contacts" options={{ href: null }} />
      <Tabs.Screen name="settings" />
    </Tabs>}
    </PresenceProvider>
  );
}
 

