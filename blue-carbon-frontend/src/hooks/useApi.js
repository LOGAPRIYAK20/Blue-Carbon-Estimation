import { useCallback, useEffect, useState } from "react";

/**
 * Loads data with explicit loading / success / error state and a retry.
 * `fetcher` receives an AbortSignal and must return a promise.
 */
export function useApi(fetcher) {
  const [state, setState] = useState({
    data: null,
    loading: true,
    error: "",
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    fetcher(controller.signal)
      .then((data) => {
        if (active) setState({ data, loading: false, error: "" });
      })
      .catch((error) => {
        if (active && error.name !== "AbortError") {
          setState({ data: null, loading: false, error: error.message });
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [fetcher, attempt]);

  const retry = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: "" }));
    setAttempt((n) => n + 1);
  }, []);

  return { ...state, retry };
}
