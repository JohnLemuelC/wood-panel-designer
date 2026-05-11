"use client";

import { useCallback, useRef, useState } from "react";

const MAX_STEPS = 50;

export function useHistory<T>(initial: T) {
  // Use deep clone via JSON to keep snapshots independent.
  const cloneFn = (v: T): T => JSON.parse(JSON.stringify(v));
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const [state, setStateInternal] = useState<T>(cloneFn(initial));

  const set = useCallback(
    (next: T | ((prev: T) => T), opts?: { skipHistory?: boolean }) => {
      setStateInternal((prev) => {
        const nextVal = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        if (!opts?.skipHistory) {
          past.current.push(cloneFn(prev));
          if (past.current.length > MAX_STEPS) past.current.shift();
          future.current = [];
        }
        return cloneFn(nextVal);
      });
    },
    []
  );

  const undo = useCallback(() => {
    setStateInternal((current) => {
      const prev = past.current.pop();
      if (!prev) return current;
      future.current.push(cloneFn(current));
      return cloneFn(prev);
    });
  }, []);

  const redo = useCallback(() => {
    setStateInternal((current) => {
      const next = future.current.pop();
      if (!next) return current;
      past.current.push(cloneFn(current));
      return cloneFn(next);
    });
  }, []);

  const canUndo = past.current.length > 0;
  const canRedo = future.current.length > 0;

  const reset = useCallback((value: T) => {
    past.current = [];
    future.current = [];
    setStateInternal(cloneFn(value));
  }, []);

  return { state, set, undo, redo, canUndo, canRedo, reset };
}
