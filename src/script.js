import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import {
  DotScreenPass,
  RenderPass,
  EffectComposer,
  GlitchPass,
  ShaderPass,
  RGBShiftShader,
  GammaCorrectionShader,
  UnrealBloomPass,
} from "three/examples/jsm/Addons.js"

import GUI from "lil-gui"

/**
 * Base
 */
// Debug
const gui = new GUI()

// Canvas
const canvas = document.querySelector("canvas.webgl")

// Scene
const scene = new THREE.Scene()

/**
 * Loaders
 */
const gltfLoader = new GLTFLoader()
const cubeTextureLoader = new THREE.CubeTextureLoader()
const textureLoader = new THREE.TextureLoader()

/**
 * Update all materials
 */
const updateAllMaterials = () => {
  scene.traverse((child) => {
    if (
      child instanceof THREE.Mesh &&
      child.material instanceof THREE.MeshStandardMaterial
    ) {
      child.material.envMapIntensity = 2.5
      child.material.needsUpdate = true
      child.castShadow = true
      child.receiveShadow = true
    }
  })
}

/**
 * Environment map
 */
const environmentMap = cubeTextureLoader.load([
  "/textures/environmentMaps/0/px.jpg",
  "/textures/environmentMaps/0/nx.jpg",
  "/textures/environmentMaps/0/py.jpg",
  "/textures/environmentMaps/0/ny.jpg",
  "/textures/environmentMaps/0/pz.jpg",
  "/textures/environmentMaps/0/nz.jpg",
])

scene.background = environmentMap
scene.environment = environmentMap

/**
 * Models
 */
gltfLoader.load("/models/DamagedHelmet/glTF/DamagedHelmet.gltf", (gltf) => {
  gltf.scene.scale.set(2, 2, 2)
  gltf.scene.rotation.y = Math.PI * 0.5
  scene.add(gltf.scene)

  updateAllMaterials()
})

/**
 * Lights
 */
const directionalLight = new THREE.DirectionalLight("#ffffff", 3)
directionalLight.castShadow = true
directionalLight.shadow.mapSize.set(1024, 1024)
directionalLight.shadow.camera.far = 15
directionalLight.shadow.normalBias = 0.05
directionalLight.position.set(0.25, 3, -2.25)
scene.add(directionalLight)

/**
 * Sizes
 */
const sizes = {
  width: window.innerWidth,
  height: window.innerHeight,
}

window.addEventListener("resize", () => {
  // Update sizes
  sizes.width = window.innerWidth
  sizes.height = window.innerHeight

  // Update camera
  camera.aspect = sizes.width / sizes.height
  camera.updateProjectionMatrix()

  // Update renderer
  renderer.setSize(sizes.width, sizes.height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

  // UPDATE EFFECT COMPOSER
  effectComposer.setSize(sizes.width, sizes.height)
  effectComposer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
})

/**
 * Camera
 */
// Base camera
const camera = new THREE.PerspectiveCamera(
  75,
  sizes.width / sizes.height,
  0.1,
  100
)
camera.position.set(4, 1, -4)
scene.add(camera)

// Controls
const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true

/**
 * Renderer
 */
const renderer = new THREE.WebGLRenderer({
  canvas: canvas,
  antialias: true,
})
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap
renderer.toneMapping = THREE.ReinhardToneMapping
renderer.toneMappingExposure = 1.5
renderer.setSize(sizes.width, sizes.height)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

// POST PROCESSING

// CREATE YOURE OWN RENDER TARGET WITH ANTI ALIASING
const renderTarget = new THREE.WebGLRenderTarget(sizes.width, sizes.height, {
  samples: renderer.getPixelRatio() === 1 ? 2 : 0,
})

// EFFECT COMPOSER
const effectComposer = new EffectComposer(renderer, renderTarget)
effectComposer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
effectComposer.setSize(sizes.width, sizes.height)

// FIRST PASS RENDER THE SCENE
const renderPass = new RenderPass(scene, camera)
effectComposer.addPass(renderPass)

// TINT PASS

const tintShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTint: { value: null },
  },
  vertexShader: `
    varying vec2 vUv;
    void main()
    {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec3 uTint;

    varying vec2 vUv;
    void main()
    {
        vec4 color = texture2D(tDiffuse, vUv);
        color.rgb += uTint;

        gl_FragColor = color;
    }
  `,
}

const tintPass = new ShaderPass(tintShader)
tintPass.material.uniforms.uTint.value = new THREE.Vector3(0, 0, 0)
effectComposer.addPass(tintPass)
tintPass.enabled = false
gui.add(tintPass, "enabled").name("Tint Pass")

gui
  .add(tintPass.material.uniforms.uTint.value, "x")
  .min(-1)
  .max(1)
  .step(0.001)
  .name("Tint Red")
gui
  .add(tintPass.material.uniforms.uTint.value, "y")
  .min(-1)
  .max(0.5)
  .step(0.001)
  .name("Tint Green")
gui
  .add(tintPass.material.uniforms.uTint.value, "z")
  .min(-1)
  .max(1)
  .step(0.001)
  .name("Tint Blue")

//DISPLACEMENT PASS
const DisplacementShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: null },
    uNormalMap: { value: null },
  },
  vertexShader: `
      varying vec2 vUv;
      void main()
      {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
  fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float uTime;
      uniform sampler2D uNormalMap;
  
      varying vec2 vUv;
      void main()
      {
          vec3 normalColor = texture2D(uNormalMap, vUv).rgb * 2.0 - 1.0;
          vec2 newUv = vUv + normalColor.xy * 0.2 * sin(uTime);

          vec4 color = texture2D(tDiffuse, newUv);

        //   vec3 lightDirection = normalize(vec3(-1.0, 1.0, 0.0));
        //   float lightness = clamp(dot(normalColor, lightDirection), 0.0, 1.0);
        //   color.rgb += lightness * 0.5;



  
          gl_FragColor = color;
      }
    `,
}

const DisplacementPass = new ShaderPass(DisplacementShader)
DisplacementPass.material.uniforms.uTime.value = 0
DisplacementPass.material.uniforms.uNormalMap.value = textureLoader.load(
  "/textures/interfaceNormalMap.png"
)
effectComposer.addPass(DisplacementPass)
DisplacementPass.enabled = false
gui.add(DisplacementPass, "enabled").name("Displacement Pass")

// BLOOM PASS
const bloomPass = new UnrealBloomPass()
effectComposer.addPass(bloomPass)
bloomPass.strength = 0.5
bloomPass.radius = 0.5
bloomPass.threshold = 0.5
bloomPass.enabled = false
gui.add(bloomPass, "enabled").name("Bloom Pass")
gui.add(bloomPass, "strength").min(0).max(2).step(0.01).name("Bloom Strength")
gui.add(bloomPass, "radius").min(0).max(2).step(0.01).name("Bloom Radius")
gui.add(bloomPass, "threshold").min(0).max(1).step(0.01).name("Bloom Threshold")

// DOT SCREEN PASS
const dotScreenPass = new DotScreenPass()
effectComposer.addPass(dotScreenPass)
dotScreenPass.enabled = false
gui.add(dotScreenPass, "enabled").name("Dot Screen Pass")

// GLITCH PASS
const glitchPass = new GlitchPass()
effectComposer.addPass(glitchPass)
glitchPass.goWild = false
glitchPass.enabled = false
gui.add(glitchPass, "enabled").name("Glitch Pass")
gui.add(glitchPass, "goWild").name("Glitch Pass Go Wild")

// RGB SHIFT PASS
const rgbShiftPass = new ShaderPass(RGBShiftShader)
effectComposer.addPass(rgbShiftPass)
rgbShiftPass.enabled = false

gui.add(rgbShiftPass, "enabled").name("RGB Shift Pass")

// GAMMA CORRECTION PASS
// Use this pass to correct the gamma of the final image (change from linear coding to sRGB)
const gammaCorrectionPass = new ShaderPass(GammaCorrectionShader)
effectComposer.addPass(gammaCorrectionPass)

/**
 * Animate
 */
const clock = new THREE.Clock()

const tick = () => {
  const elapsedTime = clock.getElapsedTime()

  // Update passes
  DisplacementPass.material.uniforms.uTime.value = elapsedTime

  // Update controls
  controls.update()

  // Render
  // renderer.render(scene, camera)
  // RENDER POST PROCESSING
  effectComposer.render()

  // Call tick again on the next frame
  window.requestAnimationFrame(tick)
}

tick()
