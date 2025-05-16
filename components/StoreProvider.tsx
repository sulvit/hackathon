"use client";
import { Provider } from "react-redux";
import { store as appStoreInstance } from "../store/store"; // Use your actual store instance
// If you have preloadedState, you might need to initialize the store differently or use a ref for the store if creating it here.
// For simplicity, this example uses a single store instance imported directly.

export default function StoreProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // Simpler approach for client components if appStoreInstance is a singleton created in store.ts
  return <Provider store={appStoreInstance}>{children}</Provider>;
}
