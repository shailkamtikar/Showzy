import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { TIER, deviceTier } from './perf'

/**
 * Decorative hero figure: a small procedural bowl. Battery-friendly:
 * it only animates while on screen (IntersectionObserver) and renders nothing when scrolled away.
 * Low-end devices and reduced-motion users get a single still frame.
 */
function Bowl() {
  const { matrices, colors } = useMemo(() => {
    const m: THREE.Matrix4[] = []
    const c: THREE.Color[] = []
    const o = new THREE.Object3D()
    for (let t = 0; t < 2; t++) {
      for (let r = 0; r < 7; r++) {
        const radius = 9 + t * 7 + r * 0.9
        const y = 0.3 + t * 4.2 + r * 0.5
        const count = Math.floor(radius * 3.6)
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2
          if (Math.floor((a / (Math.PI * 2)) * 24) % 2 === 1 && r % 3 === 0) continue
          o.position.set(Math.cos(a) * radius * 1.25, y, Math.sin(a) * radius)
          o.lookAt(0, y, 0)
          o.updateMatrix()
          m.push(o.matrix.clone())
          const hot = (i * 7 + r * 13 + t * 5) % 23 === 0
          c.push(new THREE.Color(hot ? '#dfa243' : t === 0 ? '#8c8470' : '#5d5748'))
        }
      }
    }
    return { matrices: m, colors: c }
  }, [])

  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[8, 48]} />
        <meshBasicMaterial color="#2a2f22" />
      </mesh>
      <instancedMesh
        ref={(im) => {
          if (!im) return
          matrices.forEach((mt, i) => {
            im.setMatrixAt(i, mt)
            im.setColorAt(i, colors[i])
          })
          im.instanceMatrix.needsUpdate = true
          if (im.instanceColor) im.instanceColor.needsUpdate = true
        }}
        args={[undefined, undefined, matrices.length]}
      >
        <boxGeometry args={[0.7, 0.45, 0.6]} />
        <meshBasicMaterial />
      </instancedMesh>
    </>
  )
}

function Spinner({ spin }: { spin: boolean }) {
  const g = useRef<THREE.Group>(null!)
  const { gl, invalidate } = useThree()
  const vel = useRef(0)
  useEffect(() => {
    const el = gl.domElement
    let last: number | null = null
    const down = (e: PointerEvent) => { last = e.clientX; el.setPointerCapture?.(e.pointerId) }
    const move = (e: PointerEvent) => {
      if (last === null) return
      vel.current = (e.clientX - last) * 0.004
      g.current.rotation.y += vel.current
      last = e.clientX
      invalidate()
    }
    const up = () => { last = null }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
    }
  }, [gl, invalidate])
  useFrame((_, dt) => {
    if (spin) g.current.rotation.y += Math.min(dt, 0.05) * 0.12
  })
  return (
    <group ref={g}>
      <Bowl />
    </group>
  )
}

export default function HeroScene({ still = false }: { still?: boolean }) {
  const host = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const tier = useMemo(() => deviceTier(), [])
  const animate = !still && tier !== 'low'
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.05 })
    if (host.current) io.observe(host.current)
    return () => io.disconnect()
  }, [])
  return (
    <div ref={host} className="h-full w-full" style={{ touchAction: 'pan-y' }}>
      <Canvas
        frameloop={animate && visible ? 'always' : 'demand'}
        dpr={[1, TIER[tier].dpr]}
        gl={{ antialias: TIER[tier].aa, alpha: true, stencil: false }}
        camera={{ position: [0, 24, 34], fov: 38 }}
        onCreated={({ camera }) => camera.lookAt(0, 0, 0)}
        aria-hidden
      >
        <Spinner spin={animate && visible} />
      </Canvas>
    </div>
  )
}
