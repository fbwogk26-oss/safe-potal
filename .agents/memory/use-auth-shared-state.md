---
name: useAuth 공유 상태는 QueryClient 캐시 사용
description: useAuth() 훅 내부의 상태를 여러 컴포넌트 간에 공유하는 방법
---

# useAuth 공유 상태 패턴

## 규칙

`useState`는 `useAuth()`를 호출한 **각 컴포넌트마다 독립적인 인스턴스**를 생성한다.
A 컴포넌트에서 `setPendingTotp(true)`를 해도 B 컴포넌트의 `pendingTotp`는 변하지 않는다.

공유가 필요한 상태는 `queryClient.setQueryData`로 처리:

```ts
const PENDING_TOTP_KEY = ["__pendingTotp"];

// 읽기: 모든 useAuth() 인스턴스가 동일한 값 관찰
const { data: pendingTotp } = useQuery<boolean>({
  queryKey: PENDING_TOTP_KEY,
  queryFn: () => false,
  initialData: false,
  staleTime: Infinity,
  gcTime: Infinity,
});

// 쓰기: 한 컴포넌트에서 설정하면 모든 인스턴스에 전파됨
const setPendingTotp = (val: boolean) =>
  queryClient.setQueryData(PENDING_TOTP_KEY, val);
```

**Why:** TOTP 로그인 시 `Login` 페이지의 `useAuth()` 인스턴스에서 `setPendingTotp(true)`를 호출했지만, `App.tsx`의 `AppContent` 컴포넌트는 자신의 독립적인 `pendingTotp = false`를 유지해서 `<TotpVerify />`가 렌더링되지 않았음.

**How to apply:** 서로 다른 컴포넌트(부모-자식 관계 아님)에서 공유해야 하는 훅 내부 상태는 항상 `queryClient.setQueryData`로 처리. UI-only 로컬 상태(open/close 등)는 여전히 `useState` 사용.
