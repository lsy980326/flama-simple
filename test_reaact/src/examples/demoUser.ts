import React from "react";

type DemoUser = {
  id: string;
  name: string;
  color: string;
  isOnline: boolean;
};

function getOrCreateSessionValue(key: string, create: () => string): string {
  if (typeof window === "undefined") return create();
  try {
    const existing = window.sessionStorage.getItem(key);
    if (existing) return existing;
    const next = create();
    window.sessionStorage.setItem(key, next);
    return next;
  } catch {
    return create();
  }
}

function randomId(prefix: string) {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rand}`;
}

function randomColorHex() {
  const n = Math.floor(Math.random() * 0xffffff);
  return `#${n.toString(16).padStart(6, "0")}`;
}

/**
 * 탭(세션)마다 유니크한 user를 만들어서
 * 같은 roomId에서도 "원격 그리기"가 제대로 렌더링되도록 합니다.
 */
export function useDemoUser(prefix: string, displayName: string): DemoUser {
  const id = React.useMemo(
    () =>
      getOrCreateSessionValue(`lct-demo-user-id:${prefix}`, () => randomId(prefix)),
    [prefix]
  );
  const color = React.useMemo(
    () =>
      getOrCreateSessionValue(`lct-demo-user-color:${prefix}`, () => randomColorHex()),
    [prefix]
  );

  return React.useMemo(
    () => ({
      id,
      name: `${displayName} (${id.slice(-4)})`,
      color,
      isOnline: true,
    }),
    [id, color, displayName]
  );
}

