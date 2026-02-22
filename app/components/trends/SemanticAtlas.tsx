'use client';

import { useRef, useMemo, useCallback, useState } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AtlasPoint {
  articleId: string;
  x2d: number;
  y2d: number;
  x3d: number;
  y3d: number;
  z3d: number;
  clusterId: number;
  category: string;
}

interface SemanticAtlasProps {
  points: AtlasPoint[];
  mode: '2d' | '3d';
  selectedCategory: string | null;
  onPointClick: (articleId: string) => void;
  onPointHover: (articleId: string | null) => void;
}

// ---------------------------------------------------------------------------
// Category colors
// ---------------------------------------------------------------------------

const CATEGORY_COLORS: Record<string, [number, number, number]> = {
  ai_ml: [0.33, 0.67, 0.93],
  frontend: [0.35, 0.82, 0.56],
  backend: [0.93, 0.46, 0.33],
  devops: [0.67, 0.33, 0.93],
  security: [0.93, 0.33, 0.33],
  mobile: [0.93, 0.78, 0.33],
  database: [0.33, 0.93, 0.87],
  cloud: [0.53, 0.53, 0.93],
  data_science: [0.93, 0.53, 0.73],
  programming: [0.73, 0.87, 0.33],
  testing: [0.93, 0.67, 0.53],
  other: [0.67, 0.67, 0.67],
  null: [0.47, 0.47, 0.47],
  unknown: [0.47, 0.47, 0.47],
};

function getColor(category: string): [number, number, number] {
  return CATEGORY_COLORS[category] ?? CATEGORY_COLORS['null'];
}

// ---------------------------------------------------------------------------
// Custom point material shader for per-point alpha
// ---------------------------------------------------------------------------

const fragmentShaderPerColor = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;

  void main() {
    float dist = length(gl_PointCoord - vec2(0.5));
    if (dist > 0.5) discard;
    float edge = smoothstep(0.5, 0.35, dist);
    gl_FragColor = vec4(vColor, vAlpha * edge);
  }
`;

const vertexShaderPerColor = /* glsl */ `
  attribute float alpha;
  varying float vAlpha;
  varying vec3 vColor;

  void main() {
    vAlpha = alpha;
    vColor = color;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = max(2.0, 800.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

// ---------------------------------------------------------------------------
// PointCloud inner component (renders inside Canvas)
// ---------------------------------------------------------------------------

interface PointCloudProps {
  points: AtlasPoint[];
  mode: '2d' | '3d';
  selectedCategory: string | null;
  onPointClick: (articleId: string) => void;
  onPointHover: (articleId: string | null) => void;
}

function PointCloud({
  points,
  mode,
  selectedCategory,
  onPointClick,
  onPointHover,
}: PointCloudProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const { camera, pointer } = useThree();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Use our own raycaster to avoid react-hooks/immutability issues
  const raycasterRef = useRef(
    (() => {
      const rc = new THREE.Raycaster();
      rc.params.Points = { threshold: 0.5 };
      return rc;
    })()
  );

  // Build geometry buffers
  const { positions, colors, alphas, shaderMaterial } = useMemo(() => {
    const count = points.length;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const alp = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const p = points[i];
      if (mode === '3d') {
        pos[i * 3] = p.x3d;
        pos[i * 3 + 1] = p.y3d;
        pos[i * 3 + 2] = p.z3d;
      } else {
        pos[i * 3] = p.x2d;
        pos[i * 3 + 1] = p.y2d;
        pos[i * 3 + 2] = 0;
      }

      const c = getColor(p.category);
      col[i * 3] = c[0];
      col[i * 3 + 1] = c[1];
      col[i * 3 + 2] = c[2];

      alp[i] =
        selectedCategory === null || p.category === selectedCategory
          ? 0.85
          : 0.08;
    }

    const mat = new THREE.ShaderMaterial({
      vertexShader: vertexShaderPerColor,
      fragmentShader: fragmentShaderPerColor,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    return { positions: pos, colors: col, alphas: alp, shaderMaterial: mat };
  }, [points, mode, selectedCategory]);

  // Raycaster for hover/click detection
  const handlePointerMove = useCallback(() => {
    if (!pointsRef.current || !raycasterRef.current) return;
    const rc = raycasterRef.current;

    rc.setFromCamera(pointer, camera);
    const intersections = rc.intersectObject(pointsRef.current);

    if (intersections.length > 0) {
      const idx = intersections[0].index;
      if (idx !== undefined && idx !== hoveredIndex) {
        setHoveredIndex(idx);
        onPointHover(points[idx]?.articleId ?? null);
      }
    } else if (hoveredIndex !== null) {
      setHoveredIndex(null);
      onPointHover(null);
    }
  }, [camera, pointer, points, hoveredIndex, onPointHover]);

  const handleClick = useCallback(() => {
    if (!pointsRef.current || !raycasterRef.current) return;
    const rc = raycasterRef.current;

    rc.setFromCamera(pointer, camera);
    const intersections = rc.intersectObject(pointsRef.current);

    if (intersections.length > 0) {
      const idx = intersections[0].index;
      if (idx !== undefined) {
        onPointClick(points[idx].articleId);
      }
    }
  }, [camera, pointer, points, onPointClick]);

  // Subtle rotation for ambient motion
  useFrame((_, delta) => {
    if (pointsRef.current && mode === '3d') {
      pointsRef.current.rotation.y += delta * 0.02;
    }
  });

  return (
    <points
      ref={pointsRef}
      material={shaderMaterial}
      onPointerMove={handlePointerMove}
      onClick={handleClick}
    >
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
          count={positions.length / 3}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[colors, 3]}
          count={colors.length / 3}
        />
        <bufferAttribute
          attach="attributes-alpha"
          args={[alphas, 1]}
          count={alphas.length}
        />
      </bufferGeometry>
    </points>
  );
}

// ---------------------------------------------------------------------------
// SemanticAtlas (exported component)
// ---------------------------------------------------------------------------

export function SemanticAtlas({
  points,
  mode,
  selectedCategory,
  onPointClick,
  onPointHover,
}: SemanticAtlasProps) {
  return (
    <div className="relative h-full w-full" style={{ minHeight: 600 }}>
      <Canvas
        camera={{ position: [0, 0, 30], fov: 60, near: 0.1, far: 1000 }}
        gl={{ antialias: true, alpha: false }}
        onCreated={({ gl }) => {
          gl.setClearColor('#0a0a1a');
        }}
        style={{ background: '#0a0a1a' }}
      >
        <ambientLight intensity={0.5} />
        <PointCloud
          points={points}
          mode={mode}
          selectedCategory={selectedCategory}
          onPointClick={onPointClick}
          onPointHover={onPointHover}
        />
        <OrbitControls
          enableDamping
          dampingFactor={0.12}
          enablePan
          enableZoom
          minDistance={5}
          maxDistance={100}
          enableRotate={mode === '3d'}
        />
      </Canvas>
    </div>
  );
}
