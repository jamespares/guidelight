import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { Water } from 'three/addons/objects/Water.js'
import { Sky } from 'three/addons/objects/Sky.js'
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js'
import { useTheme } from '@/lib/theme'

/**
 * Calm blue ocean with a Guidelight beacon in the sky:
 * day — a distant twinkling star; night — the moon.
 * Celestial body is pinned in screen-space so it always reads in frame.
 */
export function NightGuideScene({ className }: { className?: string }) {
  const mountRef = useRef<HTMLDivElement>(null)
  const { theme } = useTheme()

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const isDay = theme === 'light'

    const w = () => mount.clientWidth || window.innerWidth
    const h = () => mount.clientHeight || window.innerHeight

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(isDay ? 0x7eb6d9 : 0x060b16)

    const camera = new THREE.PerspectiveCamera(55, w() / h(), 1, 20000)
    camera.position.set(30, 22, 100)
    camera.lookAt(0, 3, 0)

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setSize(w(), h())
    renderer.setClearColor(isDay ? 0x7eb6d9 : 0x060b16, 1)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = isDay ? 0.42 : 0.5
    mount.appendChild(renderer.domElement)

    const textureLoader = new THREE.TextureLoader()
    const pmrem = new THREE.PMREMGenerator(renderer)
    const sceneEnv = new THREE.Scene()
    let envRT: THREE.WebGLRenderTarget | null = null

    const sky = new Sky()
    sky.scale.setScalar(10000)
    scene.add(sky)
    const skyU = sky.material.uniforms
    const lightDir = new THREE.Vector3()

    if (isDay) {
      skyU.turbidity.value = 2.8
      skyU.rayleigh.value = 1.0
      skyU.mieCoefficient.value = 0.0025
      skyU.mieDirectionalG.value = 0.7
      skyU.showSunDisc.value = 1
    } else {
      skyU.turbidity.value = 1.2
      skyU.rayleigh.value = 0.06
      skyU.mieCoefficient.value = 0.001
      skyU.mieDirectionalG.value = 0.7
      skyU.showSunDisc.value = 0
    }

    const waterNormals = textureLoader.load('/textures/waternormals.jpg', (tex) => {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    })
    waterNormals.wrapS = waterNormals.wrapT = THREE.RepeatWrapping

    const water = new Water(new THREE.PlaneGeometry(10000, 10000), {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals,
      sunDirection: new THREE.Vector3(),
      sunColor: isDay ? 0xfff2d6 : 0xc5d0e4,
      waterColor: isDay ? 0x1a6f9c : 0x0c2a45,
      distortionScale: 2.2,
      fog: false,
    })
    water.rotation.x = -Math.PI / 2
    if (water.material.uniforms.size) water.material.uniforms.size.value = 4.0
    if (water.material.uniforms.alpha) water.material.uniforms.alpha.value = 0.95
    scene.add(water)

    const bodyGroup = new THREE.Group()
    scene.add(bodyGroup)

    const ownedTextures: THREE.Texture[] = []
    let lensflare: Lensflare | null = null

    // Day Guidelight star (pinned where the moon sits at night)
    let starCore: THREE.Sprite | null = null
    let starGlow: THREE.Sprite | null = null
    let starRays: THREE.Sprite | null = null
    const starBaseScale = { core: 4, glow: 14, ray: 18 }

    // Pin celestial body to upper-left of the viewport (always visible)
    const screenNdc = new THREE.Vector3(-0.62, 0.58, 0.5)
    const screenDir = new THREE.Vector3()

    function placeBodyInView(distance: number) {
      screenDir.copy(screenNdc).unproject(camera).sub(camera.position).normalize()
      bodyGroup.position.copy(camera.position).addScaledVector(screenDir, distance)
    }

    function setDaySun(elevationDeg: number, azimuthDeg: number) {
      const phi = THREE.MathUtils.degToRad(90 - elevationDeg)
      const theta = THREE.MathUtils.degToRad(azimuthDeg)
      lightDir.setFromSphericalCoords(1, phi, theta)
      skyU.sunPosition.value.copy(lightDir)
      skyU.showSunDisc.value = 1
      water.material.uniforms.sunDirection.value.copy(lightDir)
      keyLight.position.copy(lightDir).multiplyScalar(100)
    }

    function setLightingFromBody() {
      lightDir.copy(bodyGroup.position).normalize()
      skyU.sunPosition.value.set(0, -1, 0)
      skyU.showSunDisc.value = 0
      water.material.uniforms.sunDirection.value.copy(lightDir)
      keyLight.position.copy(lightDir).multiplyScalar(100)
    }

    function bakeEnv() {
      const prev = skyU.showSunDisc.value
      skyU.showSunDisc.value = 0
      sceneEnv.add(sky)
      if (envRT) envRT.dispose()
      envRT = pmrem.fromScene(sceneEnv)
      scene.environment = envRT.texture
      scene.add(sky)
      skyU.showSunDisc.value = prev
    }

    const keyLight = new THREE.DirectionalLight(isDay ? 0xfff0dd : 0xb8c8e0, isDay ? 0.9 : 0.65)
    scene.add(keyLight)
    scene.add(new THREE.AmbientLight(isDay ? 0x6a8aaa : 0x101820, isDay ? 0.5 : 0.3))
    scene.add(
      new THREE.HemisphereLight(
        isDay ? 0xcfe6f5 : 0x1a2438,
        isDay ? 0x3a6a88 : 0x020408,
        isDay ? 0.55 : 0.35,
      ),
    )

    if (isDay) {
      // Sun disc lights the scene; Guidelight star sits where the moon is at night
      setDaySun(28, 180)

      const coreMap = makeRadialGlow('rgba(255,255,255,1)', 'rgba(255,240,200,0.55)')
      const glowMap = makeRadialGlow('rgba(255,248,220,1)', 'rgba(200,220,255,0.35)')
      const rayMap = makeStarRays()
      ownedTextures.push(coreMap, glowMap, rayMap)

      starGlow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowMap,
          transparent: true,
          opacity: 0.35,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        }),
      )
      starGlow.scale.set(starBaseScale.glow, starBaseScale.glow, 1)
      bodyGroup.add(starGlow)

      starRays = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: rayMap,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
          rotation: Math.PI / 4,
        }),
      )
      starRays.scale.set(starBaseScale.ray, starBaseScale.ray, 1)
      bodyGroup.add(starRays)

      starCore = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: coreMap,
          transparent: true,
          opacity: 0.7,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        }),
      )
      starCore.scale.set(starBaseScale.core, starBaseScale.core, 1)
      bodyGroup.add(starCore)

      placeBodyInView(420)
      bakeEnv()
    } else {
      const moonMap = textureLoader.load('/textures/moon_1024.jpg')
      moonMap.colorSpace = THREE.SRGBColorSpace
      ownedTextures.push(moonMap)

      const moon = new THREE.Mesh(
        new THREE.SphereGeometry(22, 48, 48),
        new THREE.MeshStandardMaterial({
          map: moonMap,
          roughness: 1,
          metalness: 0,
          emissiveMap: moonMap,
          emissive: new THREE.Color(0xffffff),
          emissiveIntensity: 1.1,
          toneMapped: false,
        }),
      )
      bodyGroup.add(moon)

      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: makeRadialGlow('rgba(240,244,252,1)', 'rgba(150,170,210,0.4)'),
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        }),
      )
      glow.scale.set(95, 95, 1)
      bodyGroup.add(glow)
      ownedTextures.push(glow.material.map!)

      const flare0 = textureLoader.load('/textures/lensflare/lensflare0.png')
      const flare3 = textureLoader.load('/textures/lensflare/lensflare3.png')
      ownedTextures.push(flare0, flare3)
      lensflare = new Lensflare()
      lensflare.addElement(new LensflareElement(flare0, 220, 0, new THREE.Color(0xd8e2f5)))
      lensflare.addElement(new LensflareElement(flare3, 36, 0.5))
      const flareLight = new THREE.PointLight(0xd8e2f5, 0, 0)
      bodyGroup.add(flareLight)
      flareLight.add(lensflare)

      placeBodyInView(420)
      setLightingFromBody()
      bakeEnv()
    }

    // Don't reflect moon/star into the water (avoids dark blotches)
    const waterBeforeRender = water.onBeforeRender.bind(water)
    water.onBeforeRender = (renderer, scene, camera, geometry, material, group) => {
      bodyGroup.visible = false
      waterBeforeRender(renderer, scene, camera, geometry, material, group)
      bodyGroup.visible = true
    }

    let raf = 0
    let running = !reduceMotion
    const clock = new THREE.Clock()

    const onResize = () => {
      camera.aspect = w() / h()
      camera.updateProjectionMatrix()
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      renderer.setSize(w(), h())
      placeBodyInView(420)
      if (!isDay) setLightingFromBody()
    }
    window.addEventListener('resize', onResize)

    const onVisibility = () => {
      running = !document.hidden && !reduceMotion
      if (running && !raf) raf = requestAnimationFrame(tick)
    }
    document.addEventListener('visibilitychange', onVisibility)

    /** Delayed flash → short twinkle → quiet rest. Cycle ~5.5s. */
    function guideStarBrightness(t: number) {
      const cycle = 5.5
      const phase = t % cycle
      // Quiet dim base between flashes — distant sky sparkle
      let bright = 0.22
      if (phase < 0.16) {
        // Sharp flash
        bright = 0.22 + 0.78 * Math.sin((phase / 0.16) * Math.PI)
      } else if (phase < 1.0) {
        // Afterglow + quick twinkles
        const local = phase - 0.16
        const afterglow = 0.3 * Math.exp(-local * 2.4)
        const twinkle =
          0.28 * Math.max(0, Math.sin(local * 20)) * Math.exp(-local * 1.5) +
          0.18 * Math.max(0, Math.sin(local * 32 + 1.2)) * Math.exp(-local * 2.0)
        bright = 0.22 + afterglow + twinkle
      }
      return THREE.MathUtils.clamp(bright, 0.15, 1)
    }

    function updateGuideStar(t: number) {
      if (!starCore || !starGlow || !starRays) return
      const b = guideStarBrightness(t)
      starCore.material.opacity = 0.4 + b * 0.6
      starGlow.material.opacity = 0.12 + b * 0.5
      starRays.material.opacity = 0.15 + b * 0.8
      const cs = starBaseScale.core * (0.8 + b * 0.7)
      starCore.scale.set(cs, cs, 1)
      const gs = starBaseScale.glow * (0.85 + b * 0.55)
      starGlow.scale.set(gs, gs, 1)
      const rs = starBaseScale.ray * (0.7 + b * 0.9)
      starRays.scale.set(rs, rs, 1)
      starRays.material.rotation = Math.PI / 4 + Math.sin(t * 0.35) * 0.08
    }

    function tick() {
      raf = 0
      if (!running) {
        renderer.render(scene, camera)
        return
      }

      const dt = Math.min(clock.getDelta(), 0.05)
      const t = clock.elapsedTime

      water.material.uniforms.time.value += dt * 0.85

      camera.position.x = 30 + Math.sin(t * 0.025) * 2
      camera.position.y = 22 + Math.sin(t * 0.02) * 0.5
      camera.lookAt(0, 3, 0)

      placeBodyInView(420)
      if (!isDay) setLightingFromBody()
      if (isDay) updateGuideStar(t)

      renderer.render(scene, camera)
      raf = requestAnimationFrame(tick)
    }

    tick()
    if (reduceMotion) {
      running = false
      placeBodyInView(420)
      if (!isDay) setLightingFromBody()
      // Steady mid-brightness Guidelight (no flash cycle)
      if (isDay) updateGuideStar(0.4)
      renderer.render(scene, camera)
    }

    return () => {
      running = false
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibility)
      lensflare?.dispose()
      if (envRT) envRT.dispose()
      pmrem.dispose()
      water.geometry.dispose()
      water.material.dispose()
      sky.geometry.dispose()
      sky.material.dispose()
      waterNormals.dispose()
      for (const tex of ownedTextures) tex.dispose()
      bodyGroup.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose()
          const m = obj.material
          if (Array.isArray(m)) m.forEach((x) => x.dispose())
          else m.dispose()
        }
        if (obj instanceof THREE.Sprite) obj.material.dispose()
      })
      renderer.dispose()
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement)
      }
    }
  }, [theme])

  return (
    <div
      ref={mountRef}
      className={className}
      aria-hidden
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    />
  )
}

function makeRadialGlow(inner: string, mid: string) {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(128, 128, 4, 128, 128, 128)
  g.addColorStop(0, inner)
  g.addColorStop(0.3, mid)
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 256)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** Soft four-point star rays for the daytime Guidelight. */
function makeStarRays() {
  const size = 256
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const mid = size / 2

  ctx.clearRect(0, 0, size, size)

  // Long cross rays
  const drawRay = (angle: number, length: number, width: number) => {
    ctx.save()
    ctx.translate(mid, mid)
    ctx.rotate(angle)
    const grad = ctx.createLinearGradient(0, -length, 0, length)
    grad.addColorStop(0, 'rgba(255,255,255,0)')
    grad.addColorStop(0.45, 'rgba(255,250,230,0.55)')
    grad.addColorStop(0.5, 'rgba(255,255,255,0.95)')
    grad.addColorStop(0.55, 'rgba(255,250,230,0.55)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = grad
    ctx.fillRect(-width / 2, -length, width, length * 2)
    ctx.restore()
  }

  drawRay(0, 118, 6)
  drawRay(Math.PI / 2, 118, 6)
  drawRay(Math.PI / 4, 72, 3.5)
  drawRay(-Math.PI / 4, 72, 3.5)

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
