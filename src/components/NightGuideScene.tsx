import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { Water } from 'three/addons/objects/Water.js'
import { Sky } from 'three/addons/objects/Sky.js'
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js'
import { useTheme } from '@/lib/theme'

/**
 * Calm blue ocean with a clearly visible sun (day) or moon (night).
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
      // Sky’s built-in sun disc only — no extra orb mesh
      setDaySun(28, 180)
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

    // Daytime-only: small distant biplane towing a fluttering handwritten banner
    let flightRig: THREE.Group | null = null
    let propeller: THREE.Object3D | null = null
    let bannerMesh: THREE.Mesh | null = null
    let bannerBasePositions: Float32Array | null = null
    const flightTmp = {
      ndc: new THREE.Vector3(),
      dir: new THREE.Vector3(),
      nextNdc: new THREE.Vector3(),
      nextDir: new THREE.Vector3(),
      pos: new THREE.Vector3(),
      next: new THREE.Vector3(),
      tangent: new THREE.Vector3(),
      up: new THREE.Vector3(0, 1, 0),
      side: new THREE.Vector3(),
      look: new THREE.Matrix4(),
      quat: new THREE.Quaternion(),
    }
    const FLIGHT_DIST = 220
    const FLIGHT_SECONDS = 28
    const FLIGHT_PHASE = 0.02
    // Wide enough that plane + trailing banner fully clear both edges before the loop wraps
    const FLIGHT_NDC_START = 2.85
    const FLIGHT_NDC_END = -3.35

    if (isDay) {
      const built = buildSkyBiplane()
      flightRig = built.rig
      propeller = built.propeller
      bannerMesh = built.banner
      bannerBasePositions = built.bannerBasePositions
      ownedTextures.push(...built.textures)
      scene.add(flightRig)
      placeSkyBiplane(0)

      // Refresh handwritten banner once Caveat (or fallback) is ready
      void document.fonts.ready.then(() => {
        if (!bannerMesh) return
        const mat = bannerMesh.material as THREE.MeshBasicMaterial
        const fresh = makeHandwrittenBannerTexture(
          'Welcome to stress-free, data-driven teaching',
        )
        ownedTextures.push(fresh)
        mat.map = fresh
        mat.needsUpdate = true
      })
    }

    function placeSkyBiplane(progress: number) {
      if (!flightRig) return
      // High in the sky — right → left so the banner text reads naturally as it enters
      const ndcX = THREE.MathUtils.lerp(FLIGHT_NDC_START, FLIGHT_NDC_END, progress)
      const ndcY = 0.58 + Math.sin(progress * Math.PI) * 0.03
      flightTmp.ndc.set(ndcX, ndcY, 0.5)
      flightTmp.dir.copy(flightTmp.ndc).unproject(camera).sub(camera.position).normalize()
      flightTmp.pos.copy(camera.position).addScaledVector(flightTmp.dir, FLIGHT_DIST)
      flightTmp.pos.y = Math.max(flightTmp.pos.y, 70)

      // Sample ahead along the leftward flight path (nose leads)
      flightTmp.nextNdc.set(ndcX - 0.06, ndcY, 0.5)
      flightTmp.nextDir.copy(flightTmp.nextNdc).unproject(camera).sub(camera.position).normalize()
      flightTmp.next.copy(camera.position).addScaledVector(flightTmp.nextDir, FLIGHT_DIST)
      flightTmp.next.y = Math.max(flightTmp.next.y, 70)

      flightTmp.tangent.copy(flightTmp.next).sub(flightTmp.pos).normalize()
      // Build basis: +X = flight direction (nose forward), +Y ≈ up
      flightTmp.side.copy(flightTmp.tangent).cross(flightTmp.up).normalize()
      if (flightTmp.side.lengthSq() < 0.01) {
        flightTmp.side.set(0, 0, 1)
      }
      const trueUp = flightTmp.side.clone().cross(flightTmp.tangent).normalize()
      flightTmp.look.makeBasis(flightTmp.tangent, trueUp, flightTmp.side)
      flightTmp.quat.setFromRotationMatrix(flightTmp.look)

      flightRig.position.copy(flightTmp.pos)
      flightRig.quaternion.copy(flightTmp.quat)
      // Slight bank into the turn of the arc
      flightRig.rotateZ(Math.sin(progress * Math.PI * 2) * 0.04)

      // Hide only when fully off-screen so the loop wrap is invisible
      flightRig.visible = progress > 0.001 && progress < 0.999
    }

    function flutterBanner(t: number) {
      if (!bannerMesh || !bannerBasePositions) return
      const pos = bannerMesh.geometry.attributes.position as THREE.BufferAttribute
      const arr = pos.array as Float32Array
      for (let i = 0; i < pos.count; i++) {
        const ix = i * 3
        const x = bannerBasePositions[ix]
        const y = bannerBasePositions[ix + 1]
        // Soft cloth flutter trailing behind (local +Z undulation)
        const wave =
          Math.sin(x * 1.8 + t * 5.5) * 0.12 +
          Math.sin(y * 3.2 + t * 4.2) * 0.05 +
          Math.sin(x * 0.6 - t * 2.8) * 0.08
        arr[ix] = bannerBasePositions[ix]
        arr[ix + 1] = bannerBasePositions[ix + 1]
        arr[ix + 2] = bannerBasePositions[ix + 2] + wave
      }
      pos.needsUpdate = true
      bannerMesh.geometry.computeVertexNormals()
    }

    // Don't reflect sun/moon/plane into the water (avoids dark blotches)
    const waterBeforeRender = water.onBeforeRender.bind(water)
    water.onBeforeRender = (renderer, scene, camera, geometry, material, group) => {
      const planeWasVisible = flightRig?.visible ?? false
      bodyGroup.visible = false
      if (flightRig) flightRig.visible = false
      waterBeforeRender(renderer, scene, camera, geometry, material, group)
      bodyGroup.visible = true
      if (flightRig) flightRig.visible = planeWasVisible
    }

    let raf = 0
    let running = !reduceMotion
    const clock = new THREE.Clock()

    const onResize = () => {
      camera.aspect = w() / h()
      camera.updateProjectionMatrix()
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      renderer.setSize(w(), h())
      if (!isDay) {
        placeBodyInView(420)
        setLightingFromBody()
      }
      if (flightRig) {
        const p = reduceMotion
          ? 0.45
          : (clock.elapsedTime / FLIGHT_SECONDS + FLIGHT_PHASE) % 1
        placeSkyBiplane(p)
      }
    }
    window.addEventListener('resize', onResize)

    const onVisibility = () => {
      running = !document.hidden && !reduceMotion
      if (running && !raf) raf = requestAnimationFrame(tick)
    }
    document.addEventListener('visibilitychange', onVisibility)

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

      if (!isDay) {
        placeBodyInView(420)
        setLightingFromBody()
      }

      if (flightRig) {
        const flightProgress = (t / FLIGHT_SECONDS + FLIGHT_PHASE) % 1
        placeSkyBiplane(flightProgress)
        if (propeller) propeller.rotation.x += dt * 28
        flutterBanner(t)
      }

      renderer.render(scene, camera)
      raf = requestAnimationFrame(tick)
    }

    tick()
    if (reduceMotion) {
      running = false
      if (!isDay) {
        placeBodyInView(420)
        setLightingFromBody()
      }
      if (flightRig) placeSkyBiplane(0.45)
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
      flightRig?.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose()
          const m = obj.material
          if (Array.isArray(m)) m.forEach((x) => x.dispose())
          else m.dispose()
        }
        if (obj instanceof THREE.Line) {
          obj.geometry.dispose()
          ;(obj.material as THREE.Material).dispose()
        }
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

/** Low-poly red biplane (nose +X) + trailing handwritten banner (in XY, faces camera when flying across). */
function buildSkyBiplane() {
  const rig = new THREE.Group()
  const textures: THREE.Texture[] = []

  const red = new THREE.MeshStandardMaterial({
    color: 0xb91c1c,
    roughness: 0.55,
    metalness: 0.12,
  })
  const redDark = new THREE.MeshStandardMaterial({
    color: 0x7f1d1d,
    roughness: 0.6,
    metalness: 0.1,
  })
  const cream = new THREE.MeshStandardMaterial({
    color: 0xe7e5e4,
    roughness: 0.7,
    metalness: 0.05,
  })
  const metal = new THREE.MeshStandardMaterial({
    color: 0x44403c,
    roughness: 0.35,
    metalness: 0.65,
  })
  const wood = new THREE.MeshStandardMaterial({
    color: 0x92400e,
    roughness: 0.75,
    metalness: 0.05,
  })

  const craft = new THREE.Group()
  // Distant but readable silhouette
  craft.scale.setScalar(1.15)
  rig.add(craft)

  // Fuselage along +X (nose forward)
  const fuse = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 2.4, 4, 10), red)
  fuse.rotation.z = Math.PI / 2
  craft.add(fuse)

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.72), cream)
  stripe.position.set(0.1, 0.02, 0)
  craft.add(stripe)

  // Nose cone
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.7, 10), redDark)
  nose.rotation.z = -Math.PI / 2
  nose.position.x = 1.55
  craft.add(nose)

  // Open cockpit
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), metal)
  cockpit.position.set(0.15, 0.32, 0)
  craft.add(cockpit)

  // Biplane wings (upper + lower)
  const upperWing = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.07, 3.6), red)
  upperWing.position.set(0.15, 0.75, 0)
  craft.add(upperWing)
  const lowerWing = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.07, 3.4), red)
  lowerWing.position.set(0.2, -0.15, 0)
  craft.add(lowerWing)

  // Wing struts
  for (const z of [-1.2, 1.2]) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6), cream)
    strut.position.set(0.2, 0.3, z)
    craft.add(strut)
  }

  // Tail
  const hStab = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 1.3), red)
  hStab.position.set(-1.35, 0.1, 0)
  craft.add(hStab)
  const vStab = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.85, 0.06), redDark)
  vStab.position.set(-1.4, 0.5, 0)
  craft.add(vStab)

  // Landing gear (subtle at distance)
  for (const z of [-0.45, 0.45]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.55, 6), metal)
    leg.position.set(0.35, -0.45, z)
    leg.rotation.z = 0.25
    craft.add(leg)
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.05, 6, 12), metal)
    wheel.rotation.y = Math.PI / 2
    wheel.position.set(0.45, -0.7, z)
    craft.add(wheel)
  }
  const tailWheel = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), metal)
  tailWheel.position.set(-1.45, -0.35, 0)
  craft.add(tailWheel)

  // Propeller (spins around local X)
  const propGroup = new THREE.Group()
  propGroup.position.set(1.85, 0, 0)
  craft.add(propGroup)
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), wood)
  propGroup.add(hub)
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.15, 0.16), metal)
    blade.position.y = 0.45
    const pivot = new THREE.Group()
    pivot.rotation.x = (i * Math.PI * 2) / 3
    pivot.add(blade)
    propGroup.add(pivot)
  }

  // Tow line from tail to banner
  // Tow line from tail to the leading edge of the banner
  const bannerW = 36
  const bannerH = 6
  const bannerX = -(bannerW / 2 + 12)
  const bannerY = -0.25
  const leadingEdgeX = bannerX + bannerW / 2

  const tow = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-1.75, 0.08, 0),
      new THREE.Vector3(leadingEdgeX, bannerY, 0),
    ]),
    new THREE.LineBasicMaterial({ color: 0x57534e, transparent: true, opacity: 0.8 }),
  )
  craft.add(tow)

  // Small knot / attachment ring where the string meets the banner
  const hitch = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0x44403c }),
  )
  hitch.position.set(leadingEdgeX, bannerY, 0)
  craft.add(hitch)

  // Banner in XY plane so it faces the viewer when the plane flies left↔right in front of the camera
  const bannerTex = makeHandwrittenBannerTexture(
    'Welcome to stress-free, data-driven teaching',
  )
  textures.push(bannerTex)
  const bannerGeom = new THREE.PlaneGeometry(bannerW, bannerH, 40, 8)
  const banner = new THREE.Mesh(
    bannerGeom,
    new THREE.MeshBasicMaterial({
      map: bannerTex,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    }),
  )
  banner.position.set(bannerX, bannerY, 0)
  // Flip so handwriting still reads L→R when the plane flies right → left
  banner.scale.x = -1
  craft.add(banner)

  const bannerBasePositions = Float32Array.from(bannerGeom.attributes.position.array as Float32Array)

  // Overall distant scale
  rig.scale.setScalar(2.2)

  return {
    rig,
    propeller: propGroup,
    banner,
    bannerBasePositions,
    textures,
  }
}

function makeHandwrittenBannerTexture(text: string) {
  const c = document.createElement('canvas')
  c.width = 2560
  c.height = 480
  const ctx = c.getContext('2d')!

  // Bright opaque fabric for contrast against the sky
  ctx.fillStyle = 'rgba(255, 252, 245, 0.97)'
  roundRect(ctx, 16, 20, c.width - 32, c.height - 40, 18)
  ctx.fill()
  ctx.strokeStyle = 'rgba(90, 70, 50, 0.45)'
  ctx.lineWidth = 6
  roundRect(ctx, 16, 20, c.width - 32, c.height - 40, 18)
  ctx.stroke()

  ctx.fillStyle = '#1c1210'
  ctx.font = '600 132px "Caveat", "Segoe Script", "Apple Chancery", cursive'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // Soft shadow so letters pop against bright sky wash
  ctx.save()
  ctx.translate(c.width / 2, c.height / 2 + 8)
  ctx.rotate(-0.012)
  ctx.shadowColor = 'rgba(255, 255, 255, 0.55)'
  ctx.shadowBlur = 2
  ctx.fillText(text, 0, 0)
  ctx.restore()

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
