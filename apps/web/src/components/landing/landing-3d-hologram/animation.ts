// SPDX-License-Identifier: Apache-2.0

// Animation loop for the landing hero hologram: core and gimbal rotations,
// particle breathing, drag inertia, hover parallax, resize handling and
// visibility / reduced-motion gating.
import type { HologramControls } from './controls';
import type { HologramScene } from './scene';

export function startHologramAnimation(
  hologramScene: HologramScene,
  controls: HologramControls,
): () => void {
  const {
    container,
    scene,
    camera,
    renderer,
    masterGroup,
    coreMesh,
    wireMesh,
    ring1,
    ring2,
    ring3,
    particles,
    positionAttribute,
    basePositions,
    particleCount,
  } = hologramScene;

  // Resize Handler
  const onResize = () => {
    controls.updateRect();
    const newW = container.clientWidth || 380;
    const newH = container.clientHeight || 380;
    camera.aspect = newW / newH;
    camera.updateProjectionMatrix();
    renderer.setSize(newW, newH);
  };
  window.addEventListener('resize', onResize);

  // 5. Animation Loop with IntersectionObserver & Inertia Decay
  let animationId: number | null = null;
  const startTime = performance.now();
  let isVisible = true;
  const motionMediaQuery =
    typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  let prefersReducedMotion = motionMediaQuery?.matches ?? false;
  let speedMultiplier = prefersReducedMotion ? 0.05 : 1;

  const handleMotionChange = (e: MediaQueryListEvent) => {
    prefersReducedMotion = e.matches;
    speedMultiplier = prefersReducedMotion ? 0.05 : 1;
  };
  motionMediaQuery?.addEventListener('change', handleMotionChange);

  const animate = () => {
    if (!isVisible) return;
    animationId = requestAnimationFrame(animate);
    const elapsed = (performance.now() - startTime) * 0.001 * speedMultiplier;

    // Inner Gimbal & Core Multi-Speed Rotations
    coreMesh.rotation.y += 0.006 * speedMultiplier;
    coreMesh.rotation.x += 0.004 * speedMultiplier;
    wireMesh.rotation.y += 0.006 * speedMultiplier;
    wireMesh.rotation.x += 0.004 * speedMultiplier;

    ring1.rotation.z += 0.008 * speedMultiplier;
    ring2.rotation.y += 0.007 * speedMultiplier;
    ring3.rotation.x += 0.005 * speedMultiplier;

    // Gravitational Particle Swarm Breathing
    const posArr = positionAttribute.array as Float32Array;
    for (let i = 0; i < particleCount; i++) {
      const idx = i * 3;
      const breath = 1 + 0.06 * Math.sin(elapsed * 2.2 + i * 0.15);
      posArr[idx] = basePositions[idx]! * breath;
      posArr[idx + 1] = basePositions[idx + 1]! * breath;
      posArr[idx + 2] = basePositions[idx + 2]! * breath;
    }
    positionAttribute.needsUpdate = true;
    particles.rotation.y += 0.002 * speedMultiplier;

    // Momentum Physics & Inertia Damping
    if (!controls.isDragging) {
      // Friction decay
      controls.velocityX *= 0.94;
      controls.velocityY *= 0.94;

      // Apply remaining velocity + base idle spin
      masterGroup.rotation.y += controls.velocityY + 0.003 * speedMultiplier;
      masterGroup.rotation.x += controls.velocityX;

      // Gentle spring pull toward hover parallax rest point
      const targetRotX = -controls.mouseY * 0.35;
      const targetRotY = controls.mouseX * 0.35;
      masterGroup.rotation.x += (targetRotX - masterGroup.rotation.x) * 0.02;
      masterGroup.rotation.y += (targetRotY - (masterGroup.rotation.y % (Math.PI * 2))) * 0.001;
    }

    renderer.render(scene, camera);
  };

  // Pause rendering when scrolled out of view
  const observer = new IntersectionObserver(
    ([entry]) => {
      if (!entry) return;
      isVisible = entry.isIntersecting;
      if (isVisible) {
        if (!animationId) {
          animate();
        }
      } else if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }
    },
    { threshold: 0.05 },
  );
  observer.observe(container);

  animate();

  return () => {
    observer.disconnect();
    if (animationId) {
      cancelAnimationFrame(animationId);
    }
    window.removeEventListener('resize', onResize);
    motionMediaQuery?.removeEventListener('change', handleMotionChange);
  };
}
