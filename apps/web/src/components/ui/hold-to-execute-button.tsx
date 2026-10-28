'use client';

/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// <HoldToExecuteButton> — Tactile press-and-hold confirmation control.
// Prevents fat-finger execution errors on critical trades and agent mutations.
// Features: 1.2s spring-progress bar with machined hazard-stripe texture,
// zero audio, and tactile mobile haptics.
import { IconCheck, IconShieldLock } from '@tabler/icons-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/formatters/cn';

export interface HoldToExecuteButtonProps {
  onExecute: () => void | Promise<void>;
  holdDurationMs?: number;
  label?: string;
  executingLabel?: string;
  completedLabel?: string;
  variant?: 'brand' | 'bull' | 'bear' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  className?: string;
  icon?: React.ReactNode;
}

export function HoldToExecuteButton({
  onExecute,
  holdDurationMs = 1200,
  label = 'Hold to execute',
  executingLabel = 'Executing…',
  completedLabel = 'Confirmed',
  variant = 'brand',
  size = 'md',
  disabled = false,
  className,
  icon,
}: HoldToExecuteButtonProps) {
  const [progress, setProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const startTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const midHapticFiredRef = useRef(false);

  const triggerHaptic = useCallback((pattern: number | number[]) => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate?.(pattern);
      } catch {
        // Silently ignore if vibrate is unsupported/blocked
      }
    }
  }, []);

  const cancelHold = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    startTimeRef.current = null;
    setIsHolding(false);
    midHapticFiredRef.current = false;
    setProgress(0);
  }, []);

  const completeHold = useCallback(async () => {
    cancelHold();
    triggerHaptic([30, 40, 50]);
    setIsExecuting(true);
    try {
      await onExecute();
      setIsDone(true);
      setTimeout(() => {
        setIsDone(false);
        setIsExecuting(false);
      }, 1500);
    } catch {
      setIsExecuting(false);
      setIsDone(false);
    }
  }, [cancelHold, onExecute, triggerHaptic]);

  const step = useCallback(
    (timestamp: number) => {
      if (!startTimeRef.current) {
        startTimeRef.current = timestamp;
      }
      const elapsed = timestamp - startTimeRef.current;
      const currentProgress = Math.min(elapsed / holdDurationMs, 1);
      setProgress(currentProgress);

      if (currentProgress >= 0.5 && !midHapticFiredRef.current) {
        triggerHaptic(15);
        midHapticFiredRef.current = true;
      }

      if (currentProgress >= 1) {
        completeHold();
      } else {
        rafRef.current = requestAnimationFrame(step);
      }
    },
    [holdDurationMs, triggerHaptic, completeHold],
  );

  const startHold = useCallback(() => {
    if (disabled || isExecuting || isDone) return;
    setIsHolding(true);
    triggerHaptic(10);
    startTimeRef.current = null;
    rafRef.current = requestAnimationFrame(step);
  }, [disabled, isExecuting, isDone, triggerHaptic, step]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const variantStyles = {
    brand: {
      border: 'border-brand/60 focus:border-brand',
      fill: 'bg-brand',
      glow: 'shadow-[0_0_20px_rgba(255,54,22,0.32)]',
      text: 'text-white',
      accent: 'text-brand',
    },
    bull: {
      border: 'border-bull/60 focus:border-bull',
      fill: 'bg-bull',
      glow: 'shadow-[0_0_20px_rgba(63,158,61,0.32)]',
      text: 'text-white',
      accent: 'text-bull',
    },
    bear: {
      border: 'border-bear/60 focus:border-bear',
      fill: 'bg-bear',
      glow: 'shadow-[0_0_20px_rgba(240,62,62,0.32)]',
      text: 'text-white',
      accent: 'text-bear',
    },
    danger: {
      border: 'border-danger/60 focus:border-danger',
      fill: 'bg-danger',
      glow: 'shadow-[0_0_20px_rgba(240,62,62,0.32)]',
      text: 'text-white',
      accent: 'text-danger',
    },
  }[variant];

  const sizeStyles = {
    sm: 'h-9 px-3 text-xs',
    md: 'h-11 px-4 text-sm',
    lg: 'h-12 px-5 text-base',
  }[size];

  const currentLabel = isDone
    ? completedLabel
    : isExecuting
      ? executingLabel
      : isHolding
        ? `Holding… ${Math.round(progress * 100)}%`
        : label;

  return (
    <button
      type="button"
      role="button"
      disabled={disabled || isExecuting}
      aria-label={currentLabel}
      aria-busy={isExecuting}
      onPointerDown={startHold}
      onPointerUp={cancelHold}
      onPointerLeave={cancelHold}
      onPointerCancel={cancelHold}
      onKeyDown={(e) => {
        if ((e.key === ' ' || e.key === 'Enter') && !isHolding) {
          e.preventDefault();
          startHold();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          cancelHold();
        }
      }}
      className={cn(
        'relative inline-flex items-center justify-center overflow-hidden rounded-xl border font-mono font-semibold tracking-wider tabular-nums transition-all select-none',
        'bg-bg-elev-2/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_2px_8px_rgba(0,0,0,0.45)] backdrop-blur-md',
        variantStyles.border,
        isHolding && variantStyles.glow,
        isHolding && 'scale-[0.98]',
        disabled && 'pointer-events-none cursor-not-allowed opacity-50',
        sizeStyles,
        className,
      )}
    >
      {/* Background Fill Progress Bar with Milled Diagonal Hatch Texture */}
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-y-0 left-0 transition-opacity',
          variantStyles.fill,
          isHolding ? 'opacity-90' : 'opacity-0',
        )}
        style={{
          width: `${progress * 100}%`,
          backgroundImage:
            'repeating-linear-gradient(-45deg, rgba(255,255,255,0.12) 0px, rgba(255,255,255,0.12) 6px, transparent 6px, transparent 12px)',
          transition: isHolding ? 'none' : 'width 0.2s ease-out, opacity 0.2s ease-out',
        }}
      />

      {/* Button Content */}
      <span className="relative z-10 flex items-center justify-center gap-2">
        {isDone ? (
          <IconCheck className="size-4 text-white" strokeWidth={2.5} />
        ) : icon ? (
          icon
        ) : (
          <IconShieldLock
            className={cn('size-4', isHolding ? 'text-white' : variantStyles.accent)}
            strokeWidth={1.85}
          />
        )}
        <span className={cn('truncate', isHolding ? 'text-white' : 'text-fg')}>{currentLabel}</span>
      </span>
    </button>
  );
}
