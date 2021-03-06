import * as THREE from "./libs/three.module.js";
import { OrbitControls } from "./libs/OrbitControls.js";
import { VRButton } from "./webxr/VRButton.js";
import { XRControllerModelFactory } from "./webxr/XRControllerModelFactory.js";
import { OculusHandModel } from "./webxr/OculusHandModel.js";
import { OculusHandPointerModel } from "./webxr/OculusHandPointerModel.js";
import { createText } from "./webxr/Text2D.js";

import {
  World,
  System,
  Component,
  TagComponent,
  Types,
} from "./libs/ecsy.module.js";

class Object3D extends Component {}

Object3D.schema = {
  object: { type: Types.Ref },
};

class Button extends Component {}

Button.schema = {
  currState: { type: Types.String, default: "none" },
  prevState: { type: Types.String, default: "none" },
  action: { type: Types.Ref, default: () => {} },
};

class ButtonSystem extends System {
  execute(/*delta, time*/) {
    this.queries.buttons.results.forEach((entity) => {
      const button = entity.getMutableComponent(Button);
      const buttonMesh = entity.getComponent(Object3D).object;
      if (button.currState == "none") {
        buttonMesh.scale.set(1, 1, 1);
      } else {
        buttonMesh.scale.set(1.1, 1.1, 1.1);
      }

      if (button.currState === "pressed" && button.prevState !== "pressed") {
        button.action();
      }

      // preserve prevState, clear currState
      // HandRaySystem will update currState
      button.prevState = button.currState;
      button.currState = "none";
    });
  }
}

ButtonSystem.queries = {
  buttons: {
    components: [Button],
  },
};

class Draggable extends Component {}

Draggable.schema = {
  // draggable states: [detached, hovered, to-be-attached, attached, to-be-detached]
  state: { type: Types.String, default: "none" },
  originalParent: { type: Types.Ref, default: null },
  attachedPointer: { type: Types.Ref, default: null },
};

class DraggableSystem extends System {
  execute(/*delta, time*/) {
    this.queries.draggable.results.forEach((entity) => {
      const draggable = entity.getMutableComponent(Draggable);
      const object = entity.getComponent(Object3D).object;
      if (draggable.originalParent == null) {
        draggable.originalParent = object.parent;
      }

      switch (draggable.state) {
        case "to-be-attached":
          draggable.attachedPointer.children[0].attach(object);
          draggable.state = "attached";
          break;
        case "to-be-detached":
          draggable.originalParent.attach(object);
          draggable.state = "detached";
          break;
        default:
          object.scale.set(1, 1, 1);
      }
    });
  }
}

DraggableSystem.queries = {
  draggable: {
    components: [Draggable],
  },
};

class Intersectable extends TagComponent {}

class HandRaySystem extends System {
  init(attributes) {
    this.handPointers = attributes.handPointers;
  }

  execute(/*delta, time*/) {
    this.handPointers.forEach((hp) => {
      let distance = null;
      let intersectingEntity = null;
      this.queries.intersectable.results.forEach((entity) => {
        const object = entity.getComponent(Object3D).object;
        const intersections = hp.intersectObject(object);
        if (intersections && intersections.length > 0) {
          if (distance == null || intersections[0].distance < distance) {
            distance = intersections[0].distance;
            intersectingEntity = entity;
          }
        }
      });
      if (distance) {
        hp.setCursor(distance);
        if (intersectingEntity.hasComponent(Button)) {
          const button = intersectingEntity.getMutableComponent(Button);
          if (hp.isPinched()) {
            button.currState = "pressed";
          } else if (button.currState != "pressed") {
            button.currState = "hovered";
          }
        }

        if (intersectingEntity.hasComponent(Draggable)) {
          const draggable = intersectingEntity.getMutableComponent(Draggable);
          const object = intersectingEntity.getComponent(Object3D).object;
          object.scale.set(1.1, 1.1, 1.1);
          if (hp.isPinched()) {
            if (!hp.isAttached() && draggable.state != "attached") {
              draggable.state = "to-be-attached";
              draggable.attachedPointer = hp;
              hp.setAttached(true);
            }
          } else {
            if (hp.isAttached() && draggable.state == "attached") {
              console.log("hello");
              draggable.state = "to-be-detached";
              draggable.attachedPointer = null;
              hp.setAttached(false);
            }
          }
        }
      } else {
        hp.setCursor(1.5);
      }
    });
  }
}

HandRaySystem.queries = {
  intersectable: {
    components: [Intersectable],
  },
};

class HandsInstructionText extends TagComponent {}

class InstructionSystem extends System {
  init(attributes) {
    this.controllers = attributes.controllers;
  }

  execute(/*delta, time*/) {
    let visible = false;
    this.controllers.forEach((controller) => {
      if (controller.visible) {
        visible = true;
      }
    });

    this.queries.instructionTexts.results.forEach((entity) => {
      const object = entity.getComponent(Object3D).object;
      object.visible = visible;
    });
  }
}

InstructionSystem.queries = {
  instructionTexts: {
    components: [HandsInstructionText],
  },
};

class OffsetFromCamera extends Component {}

OffsetFromCamera.schema = {
  x: { type: Types.Number, default: 0 },
  y: { type: Types.Number, default: 0 },
  z: { type: Types.Number, default: 0 },
};

class NeedCalibration extends TagComponent {}

class CalibrationSystem extends System {
  init(attributes) {
    this.camera = attributes.camera;
    this.renderer = attributes.renderer;
  }

  execute(/*delta, time*/) {
    this.queries.needCalibration.results.forEach((entity) => {
      if (this.renderer.xr.getSession()) {
        const offset = entity.getComponent(OffsetFromCamera);
        const object = entity.getComponent(Object3D).object;
        const xrCamera = this.renderer.xr.getCamera();
        object.position.x = xrCamera.position.x + offset.x;
        object.position.y = xrCamera.position.y + offset.y;
        object.position.z = xrCamera.position.z + offset.z;
        entity.removeComponent(NeedCalibration);
      }
    });
  }
}

CalibrationSystem.queries = {
  needCalibration: {
    components: [NeedCalibration],
  },
};

const world = new World();
const clock = new THREE.Clock();

let container;
let camera, scene, renderer;
let hand1, hand2;
let controller1, controller2;
let controllerGrip1, controllerGrip2;

let controls;

const sphereRadius = 0.3;

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
  renderer.xr.cameraAutoUpdate = false;

  container.appendChild(renderer.domElement);
  document.body.appendChild(VRButton.createButton(renderer));

  // Controllers
  controller1 = renderer.xr.getController(0);
  scene.add(controller1);

  controller2 = renderer.xr.getController(1);
  scene.add(controller2);

  const controllerModelFactory = new XRControllerModelFactory();

  // Hand1
  controllerGrip1 = renderer.xr.getControllerGrip(0);
  controllerGrip1.add(
    controllerModelFactory.createControllerModel(controllerGrip1)
  );
  scene.add(controllerGrip1);

  hand1 = renderer.xr.getHand(0);
  hand1.add(new OculusHandModel(hand1));
  const handPointer1 = new OculusHandPointerModel(hand1, controller1);
  hand1.add(handPointer1);
  scene.add(hand1);

  // Hand2
  controllerGrip2 = renderer.xr.getControllerGrip(1);
  controllerGrip2.add(
    controllerModelFactory.createControllerModel(controllerGrip2)
  );
  scene.add(controllerGrip2);

  hand2 = renderer.xr.getHand(1);
  hand2.add(new OculusHandModel(hand2));
  const handPointer2 = new OculusHandPointerModel(hand2, controller2);
  hand2.add(handPointer2);
  scene.add(hand2);

  // Dummy boxes
  const geometry = new THREE.BoxGeometry(
    sphereRadius,
    sphereRadius,
    sphereRadius
  );
  const material = new THREE.MeshStandardMaterial({
    color: 0x0000ff,
    roughness: 1.0,
    metalness: 0.0,
  });

  const box1 = new THREE.Mesh(geometry, material);
  box1.geometry.computeBoundingSphere();
  box1.position.set(-0.3, 1.4, -2.5);

  const box2 = new THREE.Mesh(geometry, material);
  box2.geometry.computeBoundingSphere();
  box2.position.set(0.3, 1.4, -2.5);

  scene.add(box1, box2);

  const menuGeometry = new THREE.PlaneGeometry(0.24, 0.5);
  const menuMaterial = new THREE.MeshPhongMaterial({
    opacity: 0,
    transparent: true,
  });
  const menuMesh = new THREE.Mesh(menuGeometry, menuMaterial);
  menuMesh.position.set(0.5, 1, -1);
  menuMesh.rotation.y = -Math.PI / 12;
  scene.add(menuMesh);

  const exitText = createText("Exiting session...", 0.04);
  exitText.position.set(0, 1.5, -0.6);
  exitText.visible = false;
  scene.add(exitText);

  const resetButton = makeButtonMesh(0.2, 0.1, 0.01, 0x355c7d);
  const resetButtonText = createText("Reset", 0.06);
  resetButton.add(resetButtonText);
  resetButtonText.position.set(0, 0, 0.0051);
  resetButton.position.set(0, -0.06, 0);
  menuMesh.add(resetButton);

  const exitButton = makeButtonMesh(0.2, 0.1, 0.01, 0xff0000);
  const exitButtonText = createText("Exit", 0.06);
  exitButton.add(exitButtonText);
  exitButtonText.position.set(0, 0, 0.0051);
  exitButton.position.set(0, -0.18, 0);
  menuMesh.add(exitButton);

  const instructionText = createText(
    "This is a WebXR Hands demo, please explore with hands.",
    0.04
  );
  instructionText.position.set(0, 1.6, -0.6);
  scene.add(instructionText);

  world
    .registerComponent(Object3D)
    .registerComponent(Button)
    .registerComponent(Intersectable)
    .registerComponent(HandsInstructionText)
    .registerComponent(OffsetFromCamera)
    .registerComponent(NeedCalibration)
    .registerComponent(Draggable);

  world
    .registerSystem(InstructionSystem, {
      controllers: [controllerGrip1, controllerGrip2],
    })
    .registerSystem(CalibrationSystem, { renderer: renderer, camera: camera })
    .registerSystem(ButtonSystem)
    .registerSystem(DraggableSystem)
    .registerSystem(HandRaySystem, {
      handPointers: [handPointer1, handPointer2],
    });

  // Entities
  const boxEntity1 = world.createEntity();
  boxEntity1.addComponent(Intersectable);
  boxEntity1.addComponent(Object3D, { object: box1 });
  boxEntity1.addComponent(Draggable);

  const boxEntity2 = world.createEntity();
  boxEntity2.addComponent(Intersectable);
  boxEntity2.addComponent(Object3D, { object: box2 });
  boxEntity2.addComponent(Draggable);

  const menuEntity = world.createEntity();
  menuEntity.addComponent(Intersectable);
  menuEntity.addComponent(OffsetFromCamera, { x: 0.4, y: 0, z: -1 });
  menuEntity.addComponent(NeedCalibration);
  menuEntity.addComponent(Object3D, { object: menuMesh });

  const rbEntity = world.createEntity();
  rbEntity.addComponent(Intersectable);
  rbEntity.addComponent(Object3D, { object: resetButton });
  const rbAction = function () {
    box1.position.set(-0.3, 1.4, -2.5);
    box1.rotation.set(0, 0, 0);
    box2.position.set(0.3, 1.4, -2.5);
    box2.rotation.set(0, 0, 0);
  };

  rbEntity.addComponent(Button, { action: rbAction });

  const ebEntity = world.createEntity();
  ebEntity.addComponent(Intersectable);
  ebEntity.addComponent(Object3D, { object: exitButton });
  const ebAction = function () {
    exitText.visible = true;
    setTimeout(function () {
      exitText.visible = false;
      renderer.xr.getSession().end();
    }, 2000);
  };
  ebEntity.addComponent(Button, { action: ebAction });

  const itEntity = world.createEntity();
  itEntity.addComponent(HandsInstructionText);
  itEntity.addComponent(Object3D, { object: instructionText });

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
  const delta = clock.getDelta();
  const elapsedTime = clock.elapsedTime;
  renderer.xr.updateCamera(camera);
  world.execute(delta, elapsedTime);
  renderer.render(scene, camera);
}

function makeButtonMesh(x, y, z, color) {
  const geometry = new THREE.BoxGeometry(x, y, z);
  const material = new THREE.MeshPhongMaterial({ color: color });
  const buttonMesh = new THREE.Mesh(geometry, material);
  return buttonMesh;
}
