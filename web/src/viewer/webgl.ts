let cached: boolean | null = null

/**
 * Is WebGL available? Computed ONCE per page load.
 *
 * Bug this prevents: probing creates a real GPU context. Probing on every render (once per selected seat)
 * piled up contexts until the browser hit its limit ("Too many active WebGL contexts") and killed the oldest
 * one, which was the live 3D view, so the viewer went black on the second seat. We probe once and release
 * the probe context immediately.
 */
export function webglAvailable(): boolean {
  if (cached !== null) return cached
  try {
    const c = document.createElement('canvas')
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null
    cached = !!gl
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    cached = false
  }
  return cached
}
