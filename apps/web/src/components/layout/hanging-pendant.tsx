// SPDX-License-Identifier: Apache-2.0

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

import { useEffect, useRef } from 'react';

interface Point {
  x: number;
  y: number;
  oldX: number;
  oldY: number;
  pinned?: boolean;
}

/**
 * 5-node Verlet physics hanging charm matching Hoplite's sidebar pendant.
 * Renders on a high-DPI canvas with interactive cursor repulsion and gravitational damping.
 */
export function HangingPendant({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = 64;
    const height = 130;
    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Initialize 5 Verlet nodes
    const nodeCount = 5;
    const segmentLength = 18;
    const originX = width / 2;
    const originY = 8;

    const points: Point[] = [];
    for (let i = 0; i < nodeCount; i++) {
      const y = originY + i * segmentLength;
      points.push({
        x: originX,
        y,
        oldX: originX,
        oldY: y,
        pinned: i === 0,
      });
    }

    let mouseX = -999;
    let mouseY = -999;
    let isDragging = false;
    let animId: number;

    const gravity = 0.28;
    const friction = 0.985;

    function onMouseMove(e: MouseEvent) {
      const rect = canvas?.getBoundingClientRect();
      if (!rect) return;
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;
    }

    function onMouseDown(e: MouseEvent) {
      const rect = canvas?.getBoundingClientRect();
      if (!rect) return;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const tip = points[points.length - 1];
      if (tip) {
        const dx = tip.x - mx;
        const dy = tip.y - my;
        if (Math.hypot(dx, dy) < 22) {
          isDragging = true;
        }
      }
    }

    function onMouseUp() {
      isDragging = false;
    }

    function onMouseLeave() {
      mouseX = -999;
      mouseY = -999;
      isDragging = false;
    }

    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseLeave);

    function update() {
      if (!ctx) return;
      // 1. Verlet point integration
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        if (!p || p.pinned) continue;

        if (i === points.length - 1 && isDragging) {
          p.x = mouseX;
          p.y = mouseY;
          p.oldX = mouseX;
          p.oldY = mouseY;
          continue;
        }

        const vx = (p.x - p.oldX) * friction;
        const vy = (p.y - p.oldY) * friction;

        p.oldX = p.x;
        p.oldY = p.y;

        p.x += vx;
        p.y += vy + gravity;

        // Subtle mouse repulsion when hovering nearby
        if (mouseX > -100 && !isDragging) {
          const dx = p.x - mouseX;
          const dy = p.y - mouseY;
          const dist = Math.hypot(dx, dy);
          if (dist < 32 && dist > 0.01) {
            const force = (32 - dist) / 32;
            p.x += (dx / dist) * force * 1.8;
            p.y += (dy / dist) * force * 1.8;
          }
        }
      }

      // 2. Relaxation constraints (run 5 iterations for stability)
      for (let iter = 0; iter < 5; iter++) {
        for (let i = 0; i < points.length - 1; i++) {
          const p1 = points[i];
          const p2 = points[i + 1];
          if (!p1 || !p2) continue;

          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const dist = Math.hypot(dx, dy);
          if (dist === 0) continue;

          const diff = (dist - segmentLength) / dist;
          if (p1.pinned) {
            p2.x -= dx * diff;
            p2.y -= dy * diff;
          } else if (p2.pinned) {
            p1.x += dx * diff;
            p1.y += dy * diff;
          } else {
            p1.x += dx * 0.5 * diff;
            p1.y += dy * 0.5 * diff;
            p2.x -= dx * 0.5 * diff;
            p2.y -= dy * 0.5 * diff;
          }
        }
      }

      // 3. Render cord and charm
      ctx.clearRect(0, 0, width, height);

      // Top anchor bead
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.beginPath();
      ctx.arc(originX, originY, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Cord line with subtle gradient
      ctx.beginPath();
      ctx.moveTo(points[0]!.x, points[0]!.y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i]!.x, points[i]!.y);
      }
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Middle micro-beads
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      for (let i = 1; i < points.length - 1; i++) {
        const p = points[i]!;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // End Pendant / Golden Falcon Charm
      const tip = points[points.length - 1]!;
      const prev = points[points.length - 2]!;
      const angle = Math.atan2(tip.y - prev.y, tip.x - prev.x) - Math.PI / 2;

      ctx.save();
      ctx.translate(tip.x, tip.y);
      ctx.rotate(angle);

      // Specular golden diamond charm
      ctx.shadowColor = 'rgba(212, 175, 55, 0.45)';
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#c5a059';
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(5, 0);
      ctx.lineTo(0, 7);
      ctx.lineTo(-5, 0);
      ctx.closePath();
      ctx.fill();

      // Center specular gleam
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.beginPath();
      ctx.arc(0, 0, 1.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      animId = requestAnimationFrame(update);
    }

    animId = requestAnimationFrame(update);

    return () => {
      cancelAnimationFrame(animId);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('mouseleave', onMouseLeave);
    };
  }, []);

  return (
    <div className={className} title="Interactive pendant physics">
      <canvas
        ref={canvasRef}
        style={{ width: 64, height: 130 }}
        className="cursor-grab active:cursor-grabbing select-none"
      />
    </div>
  );
}
