import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import Stats from "three/examples/jsm/libs/stats.module.js";
import { World } from "./world";
import { createUI } from "./ui";
import { Player } from "./player";

const stats = new Stats();
document.body.appendChild(stats.dom);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
});
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x80a0e0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const orbitCamera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  2000
);
orbitCamera.position.set(-32, 16, -32);

const controls = new OrbitControls(orbitCamera, renderer.domElement);
controls.target.set(16, 16, 16);
controls.update();

const scene = new THREE.Scene();
const world = new World();
world.generate();
scene.add(world);

//player
const player = new Player(scene);

function setupLight() {
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.position.set(50, 50, 50);
  sun.castShadow = true;
  // Set the size of the sun's shadow box
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40;
  sun.shadow.camera.bottom = -40;
  sun.shadow.camera.near = 0.1;
  sun.shadow.camera.far = 200;
  sun.shadow.bias = -0.0001;
  sun.shadow.mapSize = new THREE.Vector2(2048, 2048);
  scene.add(sun);

  const shadowHelper = new THREE.CameraHelper(sun.shadow.camera);
  // scene.add(shadowHelper);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.1);
  scene.add(ambientLight);
}

let previousTime = performance.now();
function animate() {
  let currentTime = performance.now();
  let deltaTime = (currentTime - previousTime) / 1000;

  requestAnimationFrame(animate);
  player.applyInputs(deltaTime);
  renderer.render(
    scene,
    player.controls.isLocked ? player.camera : orbitCamera
  );
  stats.update();

  previousTime = currentTime;
}

window.addEventListener("resize", () => {
  orbitCamera.aspect = window.innerWidth / window.innerHeight;
  orbitCamera.updateProjectionMatrix();
  player.camera.aspect = window.innerWidth / window.innerHeight;
  player.camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

setupLight();
createUI(world, player);
animate();
