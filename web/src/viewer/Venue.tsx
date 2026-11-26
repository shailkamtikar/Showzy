import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { LayoutMeta } from '../lib/types'
import { glowTexture, screenTexture, stripesTexture } from './geometry'

/** Static venue shell. Everything here is built once per layout and rendered only on demand. */
export default function Venue({ meta, radius, title, accent }: { meta: LayoutMeta; radius: number; title: string; accent: string }) {
  return meta.kind === 'cinema' ? <CinemaHall meta={meta} title={title} accent={accent} /> : <Bowl meta={meta} radius={radius} />
}

function CinemaHall({ meta, title, accent }: { meta: LayoutMeta; title: string; accent: string }) {
  const h = meta.hall!
  const sc = meta.screen!
  const glow = useMemo(() => glowTexture(), [])
  const film = useMemo(() => screenTexture(title, accent, sc.width / sc.height), [title, accent, sc.width, sc.height])
  useEffect(() => () => { glow.dispose(); film.dispose() }, [glow, film])
  const roomH = sc.y + sc.height / 2 + 2.2
  return (
    <group>
      {/* Room as an inside-out box: from outside, the near walls are culled so you can see in. */}
      <mesh position={[0, roomH / 2, h.depth / 2]}>
        <boxGeometry args={[h.width + 2, roomH, h.depth + 0.2]} />
        <meshLambertMaterial color="#3a3128" side={THREE.BackSide} />
      </mesh>
      {/* Light spilling off the screen onto the front rows (one cheap point light, no shadows). */}
      <pointLight position={[0, sc.y, 3]} color="#ffe1b3" intensity={4} distance={h.depth * 1.6} decay={1} />
      {/* Screen (unlit so it reads as projected light) + soft glow on the wall */}
      <mesh position={[0, sc.y, 0.12]}>
        <planeGeometry args={[sc.width, sc.height]} />
        <meshBasicMaterial map={film} toneMapped={false} />
      </mesh>
      <mesh position={[0, sc.y, 0.08]}>
        <planeGeometry args={[sc.width * 1.7, sc.height * 2.1]} />
        <meshBasicMaterial map={glow} transparent opacity={0.22} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
      {/* Stage lip under the screen */}
      <mesh position={[0, 0.25, 1.4]}>
        <boxGeometry args={[sc.width + 1, 0.5, 2.4]} />
        <meshLambertMaterial color="#1b1712" />
      </mesh>
      {/* Aisle-light strip along the front for depth cues */}
      <mesh position={[0, 0.02, 3.2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[h.width, 0.06]} />
        <meshBasicMaterial color="#dfa243" toneMapped={false} />
      </mesh>
    </group>
  )
}

function Bowl({ meta, radius }: { meta: LayoutMeta; radius: number }) {
  const f = meta.field!
  const stadium = meta.kind === 'stadium'
  const tex = useMemo(() => stripesTexture(stadium ? 'stadium' : 'arena'), [stadium])
  useEffect(() => () => tex.dispose(), [tex])
  const towers = useMemo(() => [45, 135, 225, 315].map((d) => (d * Math.PI) / 180), [])
  const towerR = radius + 4
  const towerH = stadium ? 30 : 0
  return (
    <group>
      {/* Ground outside the field */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <circleGeometry args={[radius + 14, 48]} />
        <meshLambertMaterial color="#17140f" />
      </mesh>
      {/* Field: ellipse with a tiny canvas texture */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[f.a + 3, f.b + 3, 1]} position={[0, 0.01, 0]}>
        <circleGeometry args={[1, 64]} />
        <meshLambertMaterial map={tex} />
      </mesh>
      {stadium ? (
        // Boundary rope
        <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[f.a + 1.5, f.b + 1.5, 1]} position={[0, 0.03, 0]}>
          <ringGeometry args={[0.985, 1, 64]} />
          <meshBasicMaterial color="#e9e1cb" toneMapped={false} />
        </mesh>
      ) : (
        <group position={[0, 0, -f.b * 0.45]}>
          <mesh position={[0, 0.7, 0]}>
            <boxGeometry args={[f.a * 1.1, 1.4, f.b * 0.42]} />
            <meshLambertMaterial color="#2a241b" />
          </mesh>
          <mesh position={[0, 5, -f.b * 0.2]}>
            <planeGeometry args={[f.a * 1.1, 6]} />
            <meshBasicMaterial color="#3b2f1c" toneMapped={false} />
          </mesh>
          <mesh position={[0, 1.42, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[f.a * 0.9, 0.08]} />
            <meshBasicMaterial color="#dfa243" toneMapped={false} />
          </mesh>
        </group>
      )}
      {towerH > 0 &&
        towers.map((a, i) => (
          <group key={i} position={[Math.cos(a) * towerR * 1.05, 0, Math.sin(a) * towerR * 0.9]}>
            <mesh position={[0, towerH / 2, 0]}>
              <cylinderGeometry args={[0.35, 0.5, towerH, 6]} />
              <meshLambertMaterial color="#3a352c" />
            </mesh>
            <mesh position={[0, towerH + 1, 0]} rotation={[0, -a + Math.PI / 2, 0]}>
              <boxGeometry args={[5, 2.4, 0.4]} />
              <meshBasicMaterial color="#fff3d6" toneMapped={false} />
            </mesh>
          </group>
        ))}
    </group>
  )
}
