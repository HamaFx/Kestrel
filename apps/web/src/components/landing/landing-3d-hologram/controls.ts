// SPDX-License-Identifier: Apache-2.0

// Pointer physics for the landing hero hologram: drag rotation with
// accumulated velocity, pointer capture, cached rects and hover parallax.
import type * as THREE from 'three';

export interface HologramControls {
  isDragging: boolean;
  velocityX: number;
  velocityY: number;
  mouseX: number;
  mouseY: number;
  updateRect: () => void;
  detach: () => void;
}

export function attachHologramControls(
  container: HTMLElement,
  masterGroup: THREE.Group,
): HologramControls {
  let prevPointerX = 0;
  let prevPointerY = 0;

  let cachedRect = container.getBoundingClientRect();
  const updateRect = () => {
    cachedRect = container.getBoundingClientRect();
  };

  const updateMouseHover = (clientX: number, clientY: number) => {
    if (!cachedRect.width || !cachedRect.height) return;
    const x = (clientX - cachedRect.left) / cachedRect.width - 0.5;
    const y = (clientY - cachedRect.top) / cachedRect.height - 0.5;
    controls.mouseX = Math.max(-1, Math.min(1, x * 2));
    controls.mouseY = Math.max(-1, Math.min(1, y * 2));
  };

  const onPointerDown = (e: PointerEvent) => {
    controls.isDragging = true;
    prevPointerX = e.clientX;
    prevPointerY = e.clientY;
    controls.velocityX = 0;
    controls.velocityY = 0;
    if (e.pointerType !== 'touch') {
      container.setPointerCapture?.(e.pointerId);
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    updateMouseHover(e.clientX, e.clientY);

    if (!controls.isDragging) return;

    const deltaX = e.clientX - prevPointerX;
    const deltaY = e.clientY - prevPointerY;
    prevPointerX = e.clientX;
    prevPointerY = e.clientY;

    // Inject direct rotation and accumulate velocity
    const sensitivity = 0.007;
    controls.velocityY = deltaX * sensitivity;
    controls.velocityX = deltaY * sensitivity;

    masterGroup.rotation.y += controls.velocityY;
    masterGroup.rotation.x += controls.velocityX;
  };

  const onPointerUp = (e: PointerEvent) => {
    if (controls.isDragging) {
      controls.isDragging = false;
      try {
        if (e.pointerType !== 'touch') {
          container.releasePointerCapture?.(e.pointerId);
        }
      } catch {
        // ignore
      }
    }
  };

  container.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerup', onPointerUp, { passive: true });
  window.addEventListener('pointercancel', onPointerUp, { passive: true });
  window.addEventListener('scroll', updateRect, { passive: true });

  const controls: HologramControls = {
    isDragging: false,
    velocityX: 0,
    velocityY: 0,
    mouseX: 0,
    mouseY: 0,
    updateRect,
    detach: () => {
      container.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('scroll', updateRect);
    },
  };

  return controls;
}
