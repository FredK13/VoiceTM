// app/hooks/useUnifiedBubbles.ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiJson } from "../../lib/api";
import type { Conversation } from "../../lib/types";
import {
  clamp,
  findSpawnPosition,
  randomIn,
  stepBubbles,
  type BubbleObstacle,
  type PhysicsBounds,
  type PhysicsBubble,
} from "../utils/bubblePhysics";


const REAL_SIZE_RATIO = 0.21 * 0.77;
const FAKE_SIZE_RATIO = 0.15;


const REAL_SPEED_MIN = 18;
const REAL_SPEED_MAX = 26;
const FAKE_SPEED_MIN = 12;
const FAKE_SPEED_MAX = 20;


const TOP_BOUNDARY_RATIO = 0.05;
const BOTTOM_BOUNDARY_RATIO = 0.9;
const WALL_PADDING = 4;


export const MAX_FAKE_BUBBLES = 4;



export type UnifiedBubbleKind = "real" | "fake";


export type UnifiedBubble = PhysicsBubble & {
  kind: UnifiedBubbleKind;
  conversation?: Conversation;
};

type ApiFakeBubble = {
  id: string;
  userId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  createdAt: string;
  updatedAt: string;
};


type Args = {
  conversations: Conversation[];
  obstacles?: BubbleObstacle[];
  disabled?: boolean;
  screenWidth: number;
  screenHeight: number;
};


function makeVelocity(speedMin: number, speedMax: number) {
  const angle = Math.random() * Math.PI * 2;
  const speed = randomIn(speedMin, speedMax);


  return {
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
  };
}


function createRealBubble(
  conversation: Conversation,
  screenWidth: number,
  bubbleSize: number,
  topBoundary: number,
  bottomBoundary: number
): UnifiedBubble
 {
  const { vx, vy } = makeVelocity(REAL_SPEED_MIN, REAL_SPEED_MAX);

  return {
    id: conversation.id,
    kind: "real",
    size: bubbleSize,
    x: Math.random() * Math.max(1, screenWidth - bubbleSize),
    y: topBoundary + Math.random() * Math.max(1, bottomBoundary - topBoundary - bubbleSize),
    vx,
    vy,
    conversation,
  };
}


function createFakeBubble(
  existing: UnifiedBubble[],
  obstacles: BubbleObstacle[],
  bounds: PhysicsBounds,
  bubbleSize: number
): UnifiedBubble {
  const { vx, vy } = makeVelocity(FAKE_SPEED_MIN, FAKE_SPEED_MAX);

  const spawn = findSpawnPosition({
    size: bubbleSize,
    bounds,
    existingBubbles: existing,
    obstacles,
    maxTries: 40,
  });


  return {
    id: `fake:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    kind: "fake",
    size: bubbleSize,
    x: spawn.x,
    y: spawn.y,
    vx,
    vy,
  };
}

function mapApiFakeBubbleToUnifiedBubble(row: ApiFakeBubble): UnifiedBubble {
    return {
      id: row.id,
      kind: "fake",
      size: row.size,
      x: row.x,
      y: row.y,
      vx: row.vx,
      vy: row.vy,
    };
  }


export default function useUnifiedBubbles({
  conversations,
  obstacles = [],
  disabled = false,
  screenHeight,
  screenWidth,
}: Args) {
  const [bubbles, setBubbles] = useState<UnifiedBubble[]>([]);
  const lastTimeRef = useRef<number>(Date.now());
  const frameRef = useRef<number>(0);
  const loadedFakeBubblesRef = useRef(false);

const realBubbleSize = useMemo(
  () => screenWidth * REAL_SIZE_RATIO,
  [screenWidth]
);


const fakeBubbleSize = useMemo(
  () => screenWidth * FAKE_SIZE_RATIO,
  [screenWidth]
);


const topBoundary = useMemo(
  () => screenHeight * TOP_BOUNDARY_RATIO,
  [screenHeight]
);


const bottomBoundary = useMemo(
  () => screenHeight * BOTTOM_BOUNDARY_RATIO,
  [screenHeight]
);


const bounds = useMemo<PhysicsBounds>(
  () => ({
    width: screenWidth,
    top: topBoundary,
    bottom: bottomBoundary,
    wallPadding: WALL_PADDING,
  }),
  [screenWidth, topBoundary, bottomBoundary]
);

   useEffect(() => {
    if (loadedFakeBubblesRef.current) return;
    loadedFakeBubblesRef.current = true;


    let cancelled = false;


    (async () => {
      try {
        const rows = await apiJson<ApiFakeBubble[]>("/api/fake-bubbles");
        if (cancelled) return;


        const safeRows = Array.isArray(rows) ? rows : [];
        const hydratedFakeBubbles = safeRows.map(mapApiFakeBubbleToUnifiedBubble);


        setBubbles((prev) => {
          const realOnly = prev.filter((b) => b.kind === "real");
          return [...realOnly, ...hydratedFakeBubbles];
        });

      } catch (err) {
        console.warn("Failed to load fake bubbles:", err);
      }

    })();


    return () => {
      cancelled = true;
    };
  }, []);


  const syncRealBubbles = useCallback(() => {
    setBubbles((prev) => {
      const prevRealMap = new Map(
        prev.filter((b) => b.kind === "real").map((b) => [b.id, b] as const)
      );


      const nextReal: UnifiedBubble[] = conversations.map((conversation) => {
        const existing = prevRealMap.get(conversation.id);


        if (!existing) {
          return createRealBubble(
            conversation,
            screenWidth,
            realBubbleSize,
            topBoundary,
            bottomBoundary
          );
        }

        return {
          ...existing,
          conversation,
        };
      });


      const nextFake = prev.filter((b) => b.kind === "fake");
      return [...nextReal, ...nextFake];
    });
  }, [conversations, screenWidth, realBubbleSize, topBoundary, bottomBoundary]);


  useEffect(() => {
    syncRealBubbles();
  }, [syncRealBubbles]);


  useEffect(() => {
    if (disabled) return;


    let mounted = true;
    lastTimeRef.current = Date.now();


    const TARGET_DT = 1 / 45;


    const step = () => {
        if (!mounted) return;

    const now = Date.now();
    const rawDt = (now - lastTimeRef.current) / 1000;
        if (rawDt < TARGET_DT) {
            frameRef.current = requestAnimationFrame(step);
        return;
    }

    const dt = clamp(rawDt, TARGET_DT, 0.04);
    lastTimeRef.current = now;


    setBubbles((prev) =>
        stepBubbles({
            bubbles: prev,
            dt,
            bounds,
            obstacles,
        })
    );


    frameRef.current = requestAnimationFrame(step);
};


    frameRef.current = requestAnimationFrame(step);


    return () => {
      mounted = false;
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [bounds, disabled, obstacles]);


   const addFakeBubble = useCallback(async () => {
    const existing = bubbles;
    const fakeCount = existing.filter((b) => b.kind === "fake").length;
    if (fakeCount >= MAX_FAKE_BUBBLES) return;


    const localBubble = createFakeBubble(existing, obstacles, bounds, fakeBubbleSize);


    try {
      const saved = await apiJson<ApiFakeBubble>("/api/fake-bubbles", {
        method: "POST",
        json: {
          x: localBubble.x,
          y: localBubble.y,
          vx: localBubble.vx,
          vy: localBubble.vy,
          size: localBubble.size,
        },
      });

        const hydrated = mapApiFakeBubbleToUnifiedBubble(saved);

          setBubbles((prev) => {
            const fakeCountNow = prev.filter((b) => b.kind === "fake").length;
            if (fakeCountNow >= MAX_FAKE_BUBBLES) return prev;


            return [...prev, hydrated];
          });

        } catch (err) {
          console.warn("Failed to create fake bubble:", err);
          throw err;
        }

      }, [bubbles, obstacles, bounds, fakeBubbleSize]);




   const removeFakeBubble = useCallback(async (id: string) => {
    try {
      await apiJson<{ ok: true }>(`/api/fake-bubbles/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });


      setBubbles((prev) =>
        prev.filter((b) => !(b.kind === "fake" && b.id === id))
      );
    } catch (err) {
      console.warn("Failed to delete fake bubble:", err);
      throw err;
    }
  }, []);


  const realBubbles = useMemo(
    () => bubbles.filter((b): b is UnifiedBubble & { kind: "real"; conversation: Conversation } => b.kind === "real" && !!b.conversation),
    [bubbles]
  );


  const fakeBubbles = useMemo(
    () => bubbles.filter((b): b is UnifiedBubble & { kind: "fake" } => b.kind === "fake"),
    [bubbles]
  );


  return {
    allBubbles: bubbles,
    realBubbles,
    fakeBubbles,
    addFakeBubble,
    removeFakeBubble,
    syncRealBubbles,
  };
}
