import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { easeInOutCubic, finite, type Framing } from './math'

/**
 * Camera director: time-based tweens (exact at any frame rate) + on-demand rendering.
 * Nothing renders while the camera is still; each tween frame calls invalidate().
 *
 * A plan is a list of shots; it ends either in 'orbit' (OrbitControls on) or 'pov'
 * (drag to look around from a seat). A new plan interrupts the current one smoothly,
 * because every shot starts from wherever the camera is right now.
 */
export type Shot = Framing & { duration: number; fov: number; arc?: number; ease?: (t: number) => number }
export type Plan = { id: number; shots: Shot[]; end: 'orbit' | 'pov' }

type Limits = { minDistance: number; maxDistance: number; maxPolarAngle: number }

export default function Director({
  plan,
  limits,
  maxDpr,
  onSettled,
}: {
  plan: Plan
  limits: Limits
  maxDpr: number
  onSettled?: (end: 'orbit' | 'pov') => void
}) {
  const { camera, gl, invalidate, setDpr } = useThree()
  const cam = camera as THREE.PerspectiveCamera
  const controls = useRef<OrbitControls | null>(null)
  const st = useRef({
    queue: [] as Shot[],
    cur: null as null | { shot: Shot; t0: number; fromPos: THREE.Vector3; fromTarget: THREE.Vector3; fromFov: number },
    look: new THREE.Vector3(),
    mode: 'orbit' as 'orbit' | 'pov' | 'anim',
    end: 'orbit' as 'orbit' | 'pov',
    pov: { eye: new THREE.Vector3(), base: new THREE.Vector3(0, 0, -1), yaw: 0, pitch: 0 },
    slow: 0,
    dpr: maxDpr,
  })

  // OrbitControls created once, imperatively (no extra React tree, no drei bundle).
  useEffect(() => {
    const c = new OrbitControls(cam, gl.domElement)
    c.enablePan = false
    c.enableDamping = true
    c.dampingFactor = 0.12
    c.rotateSpeed = 0.55
    c.zoomSpeed = 0.8
    c.enabled = false
    c.addEventListener('change', () => invalidate())
    controls.current = c
    return () => {
      c.dispose()
      controls.current = null
    }
  }, [cam, gl, invalidate])

  useEffect(() => {
    const c = controls.current
    if (!c) return
    c.minDistance = limits.minDistance
    c.maxDistance = limits.maxDistance
    c.maxPolarAngle = limits.maxPolarAngle
  }, [limits])

  // New plan: queue the shots and start from the current camera state.
  useEffect(() => {
    const s = st.current
    s.queue = [...plan.shots]
    s.end = plan.end
    s.cur = null
    s.mode = 'anim'
    if (controls.current) controls.current.enabled = false
    invalidate()
  }, [plan.id, invalidate])

  // Drag-to-look and wheel-zoom while sitting in a seat (POV).
  useEffect(() => {
    const el = gl.domElement
    let drag: { x: number; y: number } | null = null
    const down = (e: PointerEvent) => {
      if (st.current.mode !== 'pov') return
      drag = { x: e.clientX, y: e.clientY }
      el.setPointerCapture?.(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      if (!drag || st.current.mode !== 'pov') return
      const p = st.current.pov
      p.yaw = THREE.MathUtils.clamp(p.yaw + (e.clientX - drag.x) * 0.005, -1.15, 1.15)
      p.pitch = THREE.MathUtils.clamp(p.pitch - (e.clientY - drag.y) * 0.004, -0.5, 0.45)
      drag = { x: e.clientX, y: e.clientY }
      invalidate()
    }
    const up = () => { drag = null }
    const wheel = (e: WheelEvent) => {
      if (st.current.mode !== 'pov') return
      e.preventDefault()
      cam.fov = THREE.MathUtils.clamp(cam.fov + e.deltaY * 0.02, 35, 75)
      cam.updateProjectionMatrix()
      invalidate()
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('wheel', wheel, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.removeEventListener('wheel', wheel)
    }
  }, [gl, cam, invalidate])

  useFrame((_, delta) => {
    const s = st.current
    const c = controls.current

    if (s.mode === 'anim') {
      if (!s.cur) {
        const next = s.queue.shift()
        if (!next) {
          finish()
          return
        }
        s.cur = {
          shot: next,
          t0: performance.now(),
          fromPos: cam.position.clone(),
          fromTarget: s.look.clone(),
          fromFov: cam.fov,
        }
      }
      const { shot, t0, fromPos, fromTarget, fromFov } = s.cur
      const raw = shot.duration <= 0 ? 1 : Math.min(1, (performance.now() - t0) / shot.duration)
      const k = (shot.ease ?? easeInOutCubic)(raw)
      const pos = fromPos.clone().lerp(shot.pos, k)
      if (shot.arc) pos.y += Math.sin(Math.PI * k) * shot.arc
      const target = fromTarget.clone().lerp(shot.target, k)
      if (finite(pos) && finite(target)) {
        cam.position.copy(pos)
        s.look.copy(target)
        cam.lookAt(target)
      }
      const fov = fromFov + (shot.fov - fromFov) * k
      if (Math.abs(cam.fov - fov) > 1e-3) {
        cam.fov = fov
        cam.updateProjectionMatrix()
      }
      // Adaptive resolution: if animated frames are slow, drop to DPR 1 for the rest of the visit.
      if (delta > 1 / 28) {
        if (++s.slow > 12 && s.dpr > 1) {
          s.dpr = 1
          setDpr(1)
        }
      } else s.slow = Math.max(0, s.slow - 1)
      if (raw >= 1) s.cur = null
      invalidate()
      return
    }

    if (s.mode === 'pov') {
      const p = s.pov
      const d = p.base.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -p.yaw)
      const side = new THREE.Vector3().crossVectors(d, new THREE.Vector3(0, 1, 0))
      if (side.lengthSq() > 1e-8) d.applyAxisAngle(side.normalize(), p.pitch)
      cam.position.copy(p.eye)
      s.look.copy(p.eye).addScaledVector(d, 10)
      cam.lookAt(s.look)
      return
    }

    if (c && c.enabled) s.look.copy(c.target)
  })

  function finish() {
    const s = st.current
    const c = controls.current
    s.cur = null
    if (s.end === 'pov') {
      s.mode = 'pov'
      s.pov.eye.copy(cam.position)
      s.pov.base.copy(s.look).sub(cam.position).normalize()
      s.pov.yaw = 0
      s.pov.pitch = 0
      if (c) c.enabled = false
    } else {
      s.mode = 'orbit'
      if (c) {
        c.target.copy(s.look)
        c.enabled = true
        c.update()
      }
    }
    onSettled?.(s.end)
    invalidate()
  }

  // OrbitControls damping needs update() on rendered frames; 'change' events keep frames coming only while moving.
  useFrame(() => {
    const c = controls.current
    if (c && c.enabled) c.update()
  }, -1)

  return null
}
