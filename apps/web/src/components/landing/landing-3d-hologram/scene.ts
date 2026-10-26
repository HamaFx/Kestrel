// SPDX-License-Identifier: Apache-2.0

// Three.js scene graph for the landing hero hologram: camera, lights, core
// mesh, gimbal rings and the particle swarm, plus teardown of every resource.
import * as THREE from 'three';

export interface HologramScene {
  container: HTMLElement;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  masterGroup: THREE.Group;
  coreMesh: THREE.Mesh;
  wireMesh: THREE.Mesh;
  ring1: THREE.Mesh;
  ring2: THREE.Mesh;
  ring3: THREE.Mesh;
  particles: THREE.Points;
  positionAttribute: THREE.BufferAttribute;
  basePositions: Float32Array;
  particleCount: number;
  dispose: () => void;
}

export function createHologramScene(
  container: HTMLElement,
  width: number,
  height: number,
): HologramScene | null {
  // 1. Scene & Camera
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  camera.position.z = 5.5;

  // 2. WebGL Renderer with Alpha transparency (guarded against WebGL context failures)
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);
  } catch (e) {
    console.warn('[Landing3DHologram] WebGL initialization failed or unsupported:', e);
    return null;
  }

  // 3. Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambientLight);

  const orangeLight = new THREE.PointLight(0xff3616, 8, 20);
  orangeLight.position.set(3, 4, 3);
  scene.add(orangeLight);

  const amberLight = new THREE.PointLight(0xff5722, 6, 20);
  amberLight.position.set(-3, -2, 2);
  scene.add(amberLight);

  // 4. 3D Master Group
  const masterGroup = new THREE.Group();
  scene.add(masterGroup);

  // Central Core: Faceted Obsidian Core
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
    color: 0xff5722,
    emissive: 0xff5722,
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

  const dispose = () => {
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

  return {
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
    dispose,
  };
}
