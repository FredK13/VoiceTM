import { useEffect, useRef } from "react";
import { useFocusEffect } from "expo-router";


type RefreshFn = () => Promise<any>;


export default function useRefreshOnFocus(refreshFn: RefreshFn) {
  const refreshRef = useRef(refreshFn);


  useEffect(() => {
    refreshRef.current = refreshFn;
  }, [refreshFn]);


  useFocusEffect(() => {
    refreshRef.current?.().catch(() => {});
  });
}


