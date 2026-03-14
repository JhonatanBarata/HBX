"use client";

import { useEffect, useRef, useState } from "react";

type AnimatedNumberProps = {
  value: number;
  duration?: number;
  formatter?: (value: number) => string;
};

function defaultFormatter(value: number) {
  return Math.round(value).toLocaleString("pt-BR");
}

export default function AnimatedNumber({
  value,
  duration = 900,
  formatter = defaultFormatter,
}: AnimatedNumberProps) {
  const [displayValue, setDisplayValue] = useState(0);
  const lastValueRef = useRef(0);

  useEffect(() => {
    let frameId = 0;
    const startValue = lastValueRef.current;

    if (typeof window !== "undefined") {
      const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      if (mediaQuery.matches) {
        frameId = window.requestAnimationFrame(() => {
          lastValueRef.current = value;
          setDisplayValue(value);
        });

        return () => {
          window.cancelAnimationFrame(frameId);
        };
      }
    }

    if (startValue === value) {
      return;
    }

    const startedAt = performance.now();

    const animate = (timestamp: number) => {
      const progress = Math.min(1, (timestamp - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const nextValue = startValue + (value - startValue) * eased;

      lastValueRef.current = nextValue;
      setDisplayValue(nextValue);

      if (progress < 1) {
        frameId = window.requestAnimationFrame(animate);
      }
    };

    frameId = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [duration, value]);

  useEffect(() => {
    lastValueRef.current = displayValue;
  }, [displayValue]);

  return <span aria-live="polite">{formatter(displayValue)}</span>;
}
