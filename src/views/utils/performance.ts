// Performance optimization utilities for React views

import React, { useCallback, useRef, useEffect } from 'react';

// Debounce hook for search inputs and API calls
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = React.useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// Throttle hook for scroll events and frequent updates
export function useThrottle<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  const lastRan = useRef<number>(Date.now());

  return useCallback(
    ((...args) => {
      if (Date.now() - lastRan.current >= delay) {
        callback(...args);
        lastRan.current = Date.now();
      }
    }) as T,
    [callback, delay]
  );
}

// Memoization hook with deep comparison for complex objects
export function useDeepMemo<T>(
  factory: () => T,
  deps: React.DependencyList
): T {
  const prevDeps = useRef<React.DependencyList>([]);
  const prevResult = useRef<T | undefined>(undefined);

  const depsChanged = !prevDeps.current ||
    deps.length !== prevDeps.current.length ||
    deps.some((dep, index) => !Object.is(dep, prevDeps.current![index]));

  if (depsChanged) {
    prevDeps.current = deps;
    prevResult.current = factory();
  }

  return prevResult.current!;
}

// Intersection Observer hook for lazy loading
export function useIntersectionObserver(
  elementRef: React.RefObject<Element>,
  options: IntersectionObserverInit = {}
): boolean {
  const [isIntersecting, setIsIntersecting] = React.useState(false);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsIntersecting(entry.isIntersecting);
      },
      {
        threshold: 0.1,
        rootMargin: '50px',
        ...options
      }
    );

    observer.observe(element);

    return () => {
      observer.unobserve(element);
    };
  }, [elementRef, options]);

  return isIntersecting;
}

// Resize Observer hook for responsive components
export function useResizeObserver<T extends HTMLElement>(
  elementRef: React.RefObject<T>
): DOMRectReadOnly | null {
  const [size, setSize] = React.useState<DOMRectReadOnly | null>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setSize(entry.contentRect);
      }
    });

    resizeObserver.observe(element);

    return () => {
      resizeObserver.unobserve(element);
    };
  }, [elementRef]);

  return size;
}

// Performance monitoring hook
export function usePerformanceMonitor(componentName: string) {
  const renderCount = useRef<number>(0);
  const lastRenderTime = useRef<number>(Date.now());

  useEffect(() => {
    renderCount.current += 1;
    const now = Date.now();
    const renderTime = now - lastRenderTime.current;

    // Log performance metrics in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`${componentName} rendered ${renderCount.current} times, last render took ${renderTime}ms`);
    }

    lastRenderTime.current = now;
  });

  return {
    renderCount: renderCount.current,
    resetCounter: useCallback(() => {
      renderCount.current = 0;
    }, [])
  };
}

// Bundle size optimization utilities
export const bundleOptimization = {
  // Dynamic import helper with error handling
  loadComponent: async <T>(
    importFn: () => Promise<T>,
    fallback?: T
  ): Promise<T> => {
    try {
      const startTime = Date.now();
      const result = await importFn();
      const loadTime = Date.now() - startTime;

      if (process.env.NODE_ENV === 'development') {
        console.log(`Component loaded in ${loadTime}ms`);
      }

      return result;
    } catch (error) {
      console.error('Failed to load component:', error);
      return fallback as T;
    }
  },

  // Preload critical components
  preloadComponent: (importFn: () => Promise<any>) => {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => importFn(), { timeout: 2000 });
    } else {
      setTimeout(() => importFn(), 0);
    }
  }
};

// Tree shaking helpers
export const optimizeImports = {
  // Import only what you need from large libraries
  pick: <T extends Record<string, any>, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> => {
    const result = {} as Pick<T, K>;
    keys.forEach(key => {
      if (key in obj) {
        result[key] = obj[key];
      }
    });
    return result;
  }
};
