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
import * as THREE from 'three';
import { cn } from '@/lib/cn';

interface Props {
  className?: string;
}

export function Landing3DHologram({ className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 380;
    const height = container.clientHeight || 380;

    // 1. Scene & Camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.z = 5.5;

    // 2. WebGL Renderer with Alpha transparency (guarded against WebGL context failures)
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.2;
      container.appendChild(renderer.domElement);
    } catch (e) {
      console.warn('[Landing3DHologram] WebGL initialization failed or unsupported:', e);
      return;
    }

    // 3. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const orangeLight = new THREE.PointLight(0xff3616, 8, 20);
    orangeLight.position.set(3, 4, 3);
    scene.add(orangeLight);

    const goldLight = new THREE.PointLight(0xe5a93c, 6, 20);
    goldLight.position.set(-3, -2, 2);
    scene.add(goldLight);

    // 4. 3D Master Group
    const masterGroup = new THREE.Group();
    scene.add(masterGroup);

    // Central Core: Faceted Golden Octahedron / Icosahedron
    const coreGeo = new THREE.IcosahedronGeometry(1.1, 1);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x18191a,
      metalness: 0.9,
      roughness: 0.15,
      wireframe: false,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    masterGroup.add(coreMesh);

    // Core Wireframe Cage
    const wireGeo = new THREE.IcosahedronGeometry(1.11, 1);
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0xff3616,
      wireframe: true,
      transparent: true,
      opacity: 0.45,
    });
    const wireMesh = new THREE.Mesh(wireGeo, wireMat);
    masterGroup.add(wireMesh);

    // Gimbal Ring 1 (Equatorial)
    const ring1Geo = new THREE.TorusGeometry(1.8, 0.022, 16, 100);
    const ring1Mat = new THREE.MeshStandardMaterial({
      color: 0xff3616,
      emissive: 0xff3616,
      emissiveIntensity: 0.6,
      roughness: 0.2,
      metalness: 0.8,
    });
    const ring1 = new THREE.Mesh(ring1Geo, ring1Mat);
    masterGroup.add(ring1);

    // Gimbal Ring 2 (Polar)
    const ring2Geo = new THREE.TorusGeometry(2.1, 0.018, 16, 100);
    const ring2Mat = new THREE.MeshStandardMaterial({
      color: 0xe5a93c,
      emissive: 0xe5a93c,
      emissiveIntensity: 0.5,
      roughness: 0.2,
      metalness: 0.8,
    });
    const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
    ring2.rotation.x = Math.PI / 2;
    masterGroup.add(ring2);

    // Gimbal Ring 3 (Oblique)
    const ring3Geo = new THREE.TorusGeometry(2.4, 0.015, 16, 100);
    const ring3Mat = new THREE.MeshStandardMaterial({
      color: 0x555555,
      roughness: 0.3,
      metalness: 0.9,
    });
    const ring3 = new THREE.Mesh(ring3Geo, ring3Mat);
    ring3.rotation.y = Math.PI / 3;
    masterGroup.add(ring3);

    // Floating Quantum Particle Swarm with Gravitational Coordinates
    const particleCount = 200;
    const basePositions = new Float32Array(particleCount * 3);
    const currentPositions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const idx = i * 3;
      const r = 2.2 + Math.random() * 1.3;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);

      basePositions[idx] = x;
      basePositions[idx + 1] = y;
      basePositions[idx + 2] = z;

      currentPositions[idx] = x;
      currentPositions[idx + 1] = y;
      currentPositions[idx + 2] = z;
    }

    const particleGeo = new THREE.BufferGeometry();
    const positionAttribute = new THREE.BufferAttribute(currentPositions, 3);
    particleGeo.setAttribute('position', positionAttribute);

    const particleMat = new THREE.PointsMaterial({
      color: 0xff5533,
      size: 0.045,
      transparent: true,
      opacity: 0.75,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    masterGroup.add(particles);

    // Physics Engine: Drag Velocity, Momentum & Damping
    let isDragging = false;
    let prevPointerX = 0;
    let prevPointerY = 0;
    let velocityX = 0;
    let velocityY = 0;
    let mouseX = 0;
    let mouseY = 0;

    let cachedRect = container.getBoundingClientRect();
    const updateRect = () => {
      if (container) {
        cachedRect = container.getBoundingClientRect();
      }
    };

    const updateMouseHover = (clientX: number, clientY: number) => {
      if (!cachedRect.width || !cachedRect.height) return;
      const x = (clientX - cachedRect.left) / cachedRect.width - 0.5;
      const y = (clientY - cachedRect.top) / cachedRect.height - 0.5;
      mouseX = Math.max(-1, Math.min(1, x * 2));
      mouseY = Math.max(-1, Math.min(1, y * 2));
    };

    const onPointerDown = (e: PointerEvent) => {
      isDragging = true;
      prevPointerX = e.clientX;
      prevPointerY = e.clientY;
      velocityX = 0;
      velocityY = 0;
      container.setPointerCapture?.(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      updateMouseHover(e.clientX, e.clientY);

      if (!isDragging) return;

      const deltaX = e.clientX - prevPointerX;
      const deltaY = e.clientY - prevPointerY;
      prevPointerX = e.clientX;
      prevPointerY = e.clientY;

      // Inject direct rotation and accumulate velocity
      const sensitivity = 0.007;
      velocityY = deltaX * sensitivity;
      velocityX = deltaY * sensitivity;

      masterGroup.rotation.y += velocityY;
      masterGroup.rotation.x += velocityX;
    };

    const onPointerUp = (e: PointerEvent) => {
      if (isDragging) {
        isDragging = false;
        try {
          container.releasePointerCapture?.(e.pointerId);
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

    // Resize Handler
    const onResize = () => {
      if (!container) return;
      updateRect();
      const newW = container.clientWidth || 380;
      const newH = container.clientHeight || 380;
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      renderer.setSize(newW, newH);
    };
    window.addEventListener('resize', onResize);

    // 5. Animation Loop with IntersectionObserver & Inertia Decay
    let animationId: number | null = null;
    const clock = new THREE.Clock();
    let isVisible = true;
    const motionMediaQuery =
      typeof window !== 'undefined'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;
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
      const elapsed = clock.getElapsedTime() * speedMultiplier;

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
      if (!isDragging) {
        // Friction decay
        velocityX *= 0.94;
        velocityY *= 0.94;

        // Apply remaining velocity + base idle spin
        masterGroup.rotation.y += velocityY + 0.003 * speedMultiplier;
        masterGroup.rotation.x += velocityX;

        // Gentle spring pull toward hover parallax rest point
        const targetRotX = -mouseY * 0.35;
        const targetRotY = mouseX * 0.35;
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
            clock.start();
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
      container.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('scroll', updateRect);
      window.removeEventListener('resize', onResize);
      motionMediaQuery?.removeEventListener('change', handleMotionChange);

      // Clean up DOM
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }

      // Dispose all geometries and materials
      coreGeo.dispose();
      wireGeo.dispose();
      ring1Geo.dispose();
      ring2Geo.dispose();
      ring3Geo.dispose();
      particleGeo.dispose();

      coreMat.dispose();
      wireMat.dispose();
      ring1Mat.dispose();
      ring2Mat.dispose();
      ring3Mat.dispose();
      particleMat.dispose();

      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative w-full aspect-square max-w-[420px] mx-auto select-none touch-none cursor-grab active:cursor-grabbing',
        className,
      )}
    />
  );
}
