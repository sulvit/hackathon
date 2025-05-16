// File: store/store.ts
import { configureStore } from "@reduxjs/toolkit";
import sessionReducer from "./sessionSlice";

export const store = configureStore({
  reducer: {
    session: sessionReducer,
    // Add other reducers here as your app grows
  },
});

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
