import * as THREE from "./libs/three.module.js";
import { OrbitControls } from "./libs/OrbitControls.js";
import { VRButton } from "./webxr/VRButton.js";
import { XRControllerModelFactory } from "./webxr/XRControllerModelFactory.js";
import { XRHandModelFactory } from "./webxr/XRHandModelFactory.js";

let container;
let camera, scene, renderer;
let hand1, hand2;
let controller1, controller2;
let controllerGrip1, controllerGrip2;

const tmpVector1 = new THREE.Vector3();
const tmpVector2 = new THREE.Vector3();

let controls;

let grabbing = false;

const spheres = [];
const sphereRadius = 0.05;

init();
animate();

function init() {
  container = document.createElement("div");
  document.body.appendChild(container);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x444444);

  camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    10
  );
  camera.position.set(0, 1.6, 3);
  controls = new OrbitControls(camera, container);
  controls.target.set(0, 1.6, 0);
  controls.update();

  // Floor
  const floorGeometry = new THREE.PlaneGeometry(4, 4);
  const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x156289 });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Lights
  const hemisphereLight = new THREE.HemisphereLight(0x808080, 0x606060);
  scene.add(hemisphereLight);

  const light = new THREE.DirectionalLight(0xffffff);
  light.position.set(0, 6, 0);
  light.castShadow = true;
  light.shadow.camera.top = 2;
  light.shadow.camera.bottom = -2;
  light.shadow.camera.right = 2;
  light.shadow.camera.left = -2;
  light.shadow.mapSize.set(4096, 4096);
  scene.add(light);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = true;
  renderer.xr.enabled = true;

  container.appendChild(renderer.domElement);
  document.body.appendChild(VRButton.createButton(renderer));

  // Controllers
  controller1 = renderer.xr.getController(0);
  scene.add(controller1);

  controller2 = renderer.xr.getController(2);
  scene.add(controller2);

  const controllerModelFactory = new XRControllerModelFactory();
  const handModelFactory = new XRHandModelFactory();

  // Hand1
  controllerGrip1 = renderer.xr.getControllerGrip(0);
  controllerGrip1.add(
    controllerModelFactory.createControllerModel(controllerGrip1)
  );
  scene.add(controllerGrip1);

  hand1 = renderer.xr.getHand(0);
  hand1.addEventListener("pinchstart", onPinchStart);
  hand1.addEventListener("pinchend", onPinchEnd);
  hand1.add(handModelFactory.createHandModel(hand1, "mesh"));
  scene.add(hand1);

  // Hand2
  controllerGrip2 = renderer.xr.getControllerGrip(1);
  controllerGrip2.add(
    controllerModelFactory.createControllerModel(controllerGrip2)
  );
  scene.add(controllerGrip2);

  hand2 = renderer.xr.getHand(1);
  hand2.addEventListener("pinchstart", onPinchStart);
  hand2.addEventListener("pinchend", onPinchEnd);
  hand2.add(handModelFactory.createHandModel(hand2, "mesh"));
  scene.add(hand2);

  // Dummy boxes
  const geometry = new THREE.BoxGeometry(
    sphereRadius,
    sphereRadius,
    sphereRadius
  );
  const material = new THREE.MeshStandardMaterial({
    color: 0xff0000,
    roughness: 1.0,
    metalness: 0.0,
  });

  const box1 = new THREE.Mesh(geometry, material);
  box1.geometry.computeBoundingSphere();
  box1.position.set(-0.2, 1.4, -0.5);

  const box2 = new THREE.Mesh(geometry, material);
  box2.geometry.computeBoundingSphere();
  box2.position.set(0.2, 1.4, -0.5);

  spheres.push(box1, box2);
  scene.add(box1, box2);

  window.addEventListener("resize", onWindowResize);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  renderer.setAnimationLoop(render);
}

function render() {
  renderer.render(scene, camera);
}

function collideObject(indexTip) {
  for (let i = 0; i < spheres.length; i++) {
    const sphere = spheres[i];
    const distance = indexTip
      .getWorldPosition(tmpVector1)
      .distanceTo(sphere.getWorldPosition(tmpVector2));
    if (distance < sphere.geometry.boundingSphere.radius * sphere.scale.x) {
      return sphere;
    }
  }
  return null;
}

function onPinchEnd(event) {
  const controller = event.target;
  if (controller.userData.selected !== undefined) {
    const object = controller.userData.selected;
    object.material.emissive.b = 0;
    scene.attach(object);
    controller.userData.selected = undefined;
    grabbing = false;
  }
}

function onPinchStart(event) {
  const controller = event.target;
  const indexTip = controller.joints["index-finger-tip"];
  const object = collideObject(indexTip);
  if (object) {
    grabbing = true;
    indexTip.attach(object);
    controller.userData.selected = object;
    console.log("Selected", object);
  }
}