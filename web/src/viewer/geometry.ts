import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * One merged low-poly seat (base, pan, backrest): 3 boxes = 72 vertices, drawn for every seat with
 * a single InstancedMesh, so a 2,000-seat stadium costs one draw call.
 * Local +Z is the seat's front: Object3D.lookAt() turns +Z toward the screen/stage.
 */
export function seatGeometry(scale: number): THREE.BufferGeometry {
  const base = new THREE.BoxGeometry(0.42, 0.36, 0.38)
  base.translate(0, 0.18, 0)
  const pan = new THREE.BoxGeometry(0.54, 0.09, 0.5)
  pan.translate(0, 0.4, 0.02)
  const back = new THREE.BoxGeometry(0.54, 0.52, 0.09)
  back.translate(0, 0.68, -0.22)
  const g = mergeGeometries([base, pan, back])!
  base.dispose(); pan.dispose(); back.dispose()
  g.scale(scale, scale, scale)
  g.computeBoundingSphere()
  return g
}

/** Seated person silhouette for sold seats (body + low-poly head), also instanced. */
export function personGeometry(scale: number): THREE.BufferGeometry {
  const body = new THREE.BoxGeometry(0.4, 0.5, 0.26)
  body.translate(0, 0.7, -0.08)
  const head = new THREE.SphereGeometry(0.13, 7, 5)
  head.translate(0, 1.1, -0.06)
  const nb = body.toNonIndexed()
  const nh = head.toNonIndexed()
  const g = mergeGeometries([nb, nh])!
  ;[body, head, nb, nh].forEach((x) => x.dispose())
  g.scale(scale, scale, scale)
  return g
}

/** Unit box standing on y=0; scaled per seat into the stepped rake / stand concrete under it. */
export function plinthGeometry(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1, 1, 1)
  g.translate(0, 0.5, 0)
  return g
}

/** Small canvas textures (no image downloads). Caller must dispose. */
export function stripesTexture(kind: 'stadium' | 'arena'): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const x = c.getContext('2d')!
  if (kind === 'stadium') {
    for (let i = 0; i < 16; i++) {
      x.fillStyle = i % 2 ? '#3a4630' : '#36412c'
      x.fillRect(0, i * 16, 256, 16)
    }
    x.fillStyle = '#9a9168'
    x.fillRect(112, 88, 32, 80) // pitch strip
    x.strokeStyle = 'rgba(235,228,210,0.5)'
    x.lineWidth = 2
    x.beginPath()
    x.arc(128, 128, 92, 0, Math.PI * 2) // inner ring
    x.stroke()
  } else {
    x.fillStyle = '#1d1a15'
    x.fillRect(0, 0, 256, 256)
    x.strokeStyle = 'rgba(223,162,67,0.18)'
    for (let i = 0; i < 256; i += 32) {
      x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 256); x.stroke()
      x.beginPath(); x.moveTo(0, i); x.lineTo(256, i); x.stroke()
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 2
  return t
}

/**
 * What's "on screen": an original title card from the listing's own title and accent (no film artwork).
 * Muted, so the screen reads as projected light rather than a white slab. 1024px wide, ~100 KB of GPU memory.
 */
export function screenTexture(title: string, accent: string, aspect: number): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = Math.round(1024 / aspect)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  const draw = () => {
    const x = c.getContext('2d')!
    const w = c.width
    const h = c.height
    const g = x.createLinearGradient(0, 0, w, h)
    g.addColorStop(0, '#0f0d0a')
    g.addColorStop(0.55, accent)
    g.addColorStop(1, '#14110d')
    x.fillStyle = g
    x.fillRect(0, 0, w, h)
    x.fillStyle = 'rgba(10,8,6,0.45)' // tone the accent down: no neon on the big screen
    x.fillRect(0, 0, w, h)
    const v = x.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, w * 0.7)
    v.addColorStop(0, 'rgba(0,0,0,0)')
    v.addColorStop(1, 'rgba(0,0,0,0.65)')
    x.fillStyle = v
    x.fillRect(0, 0, w, h)
    x.fillStyle = 'rgba(239,232,216,0.92)'
    x.textAlign = 'center'
    x.textBaseline = 'middle'
    let size = Math.round(h * 0.26)
    x.font = `italic ${size}px "Instrument Serif", Georgia, serif`
    while (x.measureText(title).width > w * 0.86 && size > 24) {
      size -= 4
      x.font = `italic ${size}px "Instrument Serif", Georgia, serif`
    }
    x.fillText(title, w / 2, h * 0.5)
    x.font = `500 ${Math.round(h * 0.045)}px "JetBrains Mono", monospace`
    x.fillStyle = 'rgba(239,232,216,0.55)'
    x.fillText('N O W   S H O W I N G', w / 2, h * 0.26)
    t.needsUpdate = true
  }
  draw()
  // Redraw once the web fonts are ready (first draw may use the fallback serif).
  document.fonts?.ready.then(draw).catch(() => {})
  return t
}

export function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const x = c.getContext('2d')!
  const g = x.createRadialGradient(64, 64, 4, 64, 64, 64)
  g.addColorStop(0, 'rgba(255,240,210,0.9)')
  g.addColorStop(1, 'rgba(255,240,210,0)')
  x.fillStyle = g
  x.fillRect(0, 0, 128, 128)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
