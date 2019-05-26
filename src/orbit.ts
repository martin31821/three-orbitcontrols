/* three-orbitcontrols addendum */
import {
  Vector3, EventDispatcher, MOUSE, PerspectiveCamera, Spherical, Vector2, Quaternion, Matrix4,
} from 'three';
/**
 * @author qiao / https://github.com/qiao
 * @author mrdoob / http://mrdoob.com
 * @author alteredq / http://alteredqualia.com/
 * @author WestLangley / http://github.com/WestLangley
 * @author erich666 / http://erichaines.com
 */

// This set of controls performs orbiting, dollying (zooming), and panning.
// Unlike TrackballControls, it maintains the "up" direction object.up (+Y by default).
//
//    Orbit - left mouse / touch: one-finger move
//    Zoom - middle mouse, or mousewheel / touch: two-finger spread or squish
//    Pan - right mouse, or left mouse + ctrl/meta/shiftKey, or arrow keys / touch: two-finger move
const STATE = { NONE: - 1, ROTATE: 0, DOLLY: 1, PAN: 2, TOUCH_ROTATE: 3, TOUCH_DOLLY_PAN: 4 };
const EPS = 0.000001;

export class OrbitControls extends EventDispatcher {
  public enabled = true;
  public target = new Vector3();

  public minDistance = 0;
  public maxDistance = Infinity;

  public minZoom = 0;
  public maxZoom = Infinity;

  public minPolarAngle = 0;
  public maxPolarAngle = Math.PI;

  public minAzimuthAngle = - Infinity; // radians
  public maxAzimuthAngle = Infinity; // radians

  public enableDamping = false;
  public dampingFactor = 0.25;
  public zoomSpeed = 1.0;
  public rotateSpeed = 1.0;
  public panSpeed = 1.0;
  public screenSpacePanning = false; // if true, pan in screen-space

  // Mouse buttons
  public mouseButtons = { LEFT: MOUSE.LEFT, MIDDLE: MOUSE.MIDDLE, RIGHT: MOUSE.RIGHT };

  public target0: Vector3;
  public position0: Vector3;
  public zoom0: number;

  private changeEvent = { type: 'change' };
  private startEvent = { type: 'start' };
  private endEvent = { type: 'end' };

  private state = STATE.NONE;
  private spherical = new Spherical();
  private sphericalDelta = new Spherical();

  private scale = 1;
  private panOffset = new Vector3();
  private zoomChanged = false;

  private rotateStart = new Vector2();
  private rotateEnd = new Vector2();
  private rotateDelta = new Vector2();

  private panStart = new Vector2();
  private panEnd = new Vector2();
  private panDelta = new Vector2();

  private dollyStart = new Vector2();
  private dollyEnd = new Vector2();
  private dollyDelta = new Vector2();

  constructor (public object: PerspectiveCamera, public domElement: HTMLElement = document.body) {
    super();
    // for reset
    this.target0 = this.target.clone();
    this.position0 = this.object.position.clone();
    this.zoom0 = this.object.zoom;

    this.domElement.addEventListener('contextmenu', this.onContextMenu, false);

    this.domElement.addEventListener('mousedown', this.onMouseDown, false);
    this.domElement.addEventListener('wheel', this.onMouseWheel, false);

    this.domElement.addEventListener('touchstart', this.onTouchStart, false);
    this.domElement.addEventListener('touchend', this.onTouchEnd, false);
    this.domElement.addEventListener('touchmove', this.onTouchMove, false);
    this.update();
  }
  //
  // public methods
  //

  public getPolarAngle() {
    return this.spherical.phi;
  }

  public getAzimuthalAngle() {
    return this.spherical.theta;
  }

  public saveState() {
    this.target0.copy(this.target);
    this.position0.copy(this.object.position);
    this.zoom0 = this.object.zoom;
  }

  public reset() {
    this.target.copy(this.target0);
    this.object.position.copy(this.position0);
    this.object.zoom = this.zoom0;

    this.object.updateProjectionMatrix();
    this.dispatchEvent(this.changeEvent);
    this.update();

    this.state = STATE.NONE;
  }

  // this method is exposed, but perhaps it would be better if we can make it private...
  public update = (() => {
    const offset = new Vector3();
    const quat = new Quaternion().setFromUnitVectors(this.object.up, new Vector3(0, 1, 0));
    const quatInverse = quat.clone().inverse();
    const lastPosition = new Vector3();
    const lastQuaternion = new Quaternion();

    return () => {
      const position = this.object.position;
      // rotate offset to "y-axis-is-up" space
      offset.copy(position).sub(this.target);
      offset.applyQuaternion(quat);

      // angle from z-axis around y-axis
      this.spherical.setFromVector3(offset);
      this.spherical.theta += this.sphericalDelta.theta;
      this.spherical.phi += this.sphericalDelta.phi;

      // restrict theta to be between desired limits
      this.spherical.theta = Math.max(
        this.minAzimuthAngle,
        Math.min(this.maxAzimuthAngle, this.spherical.theta),
      );

      // restrict phi to be between desired limits
      this.spherical.phi = Math.max(
        this.minPolarAngle,
        Math.min(this.maxPolarAngle, this.spherical.phi),
      );
      this.spherical.makeSafe();
      this.spherical.radius *= this.scale;

      // restrict radius to be between desired limits
      this.spherical.radius = Math.max(
        this.minDistance,
        Math.min(this.maxDistance, this.spherical.radius),
      );

      // move target to panned location
      this.target.add(this.panOffset);
      offset.setFromSpherical(this.spherical);

      // rotate offset back to "camera-up-vector-is-up" space
      offset.applyQuaternion(quatInverse);
      position.copy(this.target).add(offset);
      this.object.lookAt(this.target);

      if (this.enableDamping) {
        this.sphericalDelta.theta *= (1 - this.dampingFactor);
        this.sphericalDelta.phi *= (1 - this.dampingFactor);
        this.panOffset.multiplyScalar(1 - this.dampingFactor);
      } else {
        this.sphericalDelta.set(0, 0, 0);
        this.panOffset.set(0, 0, 0);
      }

      this.scale = 1;

      // update condition is:
      // min(camera displacement, camera rotation in radians)^2 > EPS
      // using small-angle approximation cos(x/2) = 1 - x^2 / 8

      if (this.zoomChanged ||
        lastPosition.distanceToSquared(this.object.position) > EPS ||
        8 * (1 - lastQuaternion.dot(this.object.quaternion)) > EPS) {

        this.dispatchEvent(this.changeEvent);
        lastPosition.copy(this.object.position);
        lastQuaternion.copy(this.object.quaternion);
        this.zoomChanged = false;
        return true;
      }
      return false;
    };
  })();

  public dispose() {
    this.domElement.removeEventListener('contextmenu', this.onContextMenu, false);
    this.domElement.removeEventListener('mousedown', this.onMouseDown, false);
    this.domElement.removeEventListener('wheel', this.onMouseWheel, false);

    this.domElement.removeEventListener('touchstart', this.onTouchStart, false);
    this.domElement.removeEventListener('touchend', this.onTouchEnd, false);
    this.domElement.removeEventListener('touchmove', this.onTouchMove, false);

    document.removeEventListener('mousemove', this.onMouseMove, false);
    document.removeEventListener('mouseup', this.onMouseUp, false);
  }

  private getZoomScale() {
    return Math.pow(0.95, this.zoomSpeed);
  }

  private rotateLeft(angle: number) {
    this.sphericalDelta.theta -= angle;
  }

  private rotateUp(angle: number) {
    this.sphericalDelta.phi -= angle;
  }

  private panLeft = (() => {
    const v = new Vector3();
    return (distance: number, objectMatrix: Matrix4) => {
      v.setFromMatrixColumn(objectMatrix, 0); // get X column of objectMatrix
      v.multiplyScalar(- distance);
      this.panOffset.add(v);
    };
  })();

  private panUp = (() => {
    const v = new Vector3();
    return (distance: number, objectMatrix: Matrix4) => {
      if (this.screenSpacePanning) {
        v.setFromMatrixColumn(objectMatrix, 1);
      } else {
        v.setFromMatrixColumn(objectMatrix, 0);
        v.crossVectors(this.object.up, v);
      }
      v.multiplyScalar(distance);
      this.panOffset.add(v);
    };
  })();

  // deltaX and deltaY are in pixels; right and down are positive
  private pan = (() => {
    const offset = new Vector3();
    return (deltaX: number, deltaY: number) => {
      const element = this.domElement;
      // perspective
      const position = this.object.position;
      offset.copy(position).sub(this.target);
      let targetDistance = offset.length();
      // half of the fov is center to top of screen
      targetDistance *= Math.tan((this.object.fov / 2) * Math.PI / 180.0);
      // we use only clientHeight here so aspect ratio does not distort speed
      this.panLeft(2 * deltaX * targetDistance / element.clientHeight, this.object.matrix);
      this.panUp(2 * deltaY * targetDistance / element.clientHeight, this.object.matrix);
    };
  })();

  private dollyIn (dollyScale: number) {
    this.scale /= dollyScale;
  }

  private dollyOut(dollyScale: number) {
    this.scale *= dollyScale;
  }

  //
  // event callbacks - update the object state
  //

  private handleMouseDownRotate(event: MouseEvent) {
    this.rotateStart.set(event.clientX, event.clientY);
  }

  private handleMouseDownDolly(event: MouseEvent) {
    this.dollyStart.set(event.clientX, event.clientY);
  }

  private handleMouseDownPan(event: MouseEvent) {
    this.panStart.set(event.clientX, event.clientY);
  }

  private handleMouseMoveRotate(event: MouseEvent) {
    this.rotateEnd.set(event.clientX, event.clientY);
    this.rotateDelta.subVectors(this.rotateEnd, this.rotateStart).multiplyScalar(this.rotateSpeed);
    this.rotateLeft(2 * Math.PI * this.rotateDelta.x / this.domElement.clientHeight); // yes, height
    this.rotateUp(2 * Math.PI * this.rotateDelta.y / this.domElement.clientHeight);
    this.rotateStart.copy(this.rotateEnd);

    this.update();
  }

  private handleMouseMoveDolly(event: MouseEvent) {
    this.dollyEnd.set(event.clientX, event.clientY);
    this.dollyDelta.subVectors(this.dollyEnd, this.dollyStart);
    if (this.dollyDelta.y > 0) {
      this.dollyIn(this.getZoomScale());
    } else if (this.dollyDelta.y < 0) {
      this.dollyOut(this.getZoomScale());
    }

    this.dollyStart.copy(this.dollyEnd);
    this.update();
  }

  private handleMouseMovePan(event: MouseEvent) {
    this.panEnd.set(event.clientX, event.clientY);
    this.panDelta.subVectors(this.panEnd, this.panStart).multiplyScalar(this.panSpeed);
    this.pan(this.panDelta.x, this.panDelta.y);
    this.panStart.copy(this.panEnd);

    this.update();
  }

  private handleMouseWheel(event: WheelEvent) {
    if (event.deltaY < 0) {
      this.dollyOut(this.getZoomScale());
    } else if (event.deltaY > 0) {
      this.dollyIn(this.getZoomScale());
    }

    this.update();
  }

  private handconstouchStartRotate(event: TouchEvent) {
    this.rotateStart.set(event.touches[0].pageX, event.touches[0].pageY);
  }

  private handconstouchStartDollyPan(event: TouchEvent) {
    const dx = event.touches[0].pageX - event.touches[1].pageX;
    const dy = event.touches[0].pageY - event.touches[1].pageY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    this.dollyStart.set(0, distance);

    const x = 0.5 * (event.touches[0].pageX + event.touches[1].pageX);
    const y = 0.5 * (event.touches[0].pageY + event.touches[1].pageY);
    this.panStart.set(x, y);
  }

  private handconstouchMoveRotate(event: TouchEvent) {
    this.rotateEnd.set(event.touches[0].pageX, event.touches[0].pageY);
    this.rotateDelta.subVectors(this.rotateEnd, this.rotateStart).multiplyScalar(this.rotateSpeed);
    this.rotateLeft(2 * Math.PI * this.rotateDelta.x / this.domElement.clientHeight); // yes, height
    this.rotateUp(2 * Math.PI * this.rotateDelta.y / this.domElement.clientHeight);
    this.rotateStart.copy(this.rotateEnd);

    this.update();
  }

  private handconstouchMoveDollyPan(event: TouchEvent) {
    const dx = event.touches[0].pageX - event.touches[1].pageX;
    const dy = event.touches[0].pageY - event.touches[1].pageY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    this.dollyEnd.set(0, distance);
    this.dollyDelta.set(0, Math.pow(this.dollyEnd.y / this.dollyStart.y, this.zoomSpeed));
    this.dollyIn(this.dollyDelta.y);
    this.dollyStart.copy(this.dollyEnd);

    const x = 0.5 * (event.touches[0].pageX + event.touches[1].pageX);
    const y = 0.5 * (event.touches[0].pageY + event.touches[1].pageY);
    this.panEnd.set(x, y);
    this.panDelta.subVectors(this.panEnd, this.panStart).multiplyScalar(this.panSpeed);
    this.pan(this.panDelta.x, this.panDelta.y);
    this.panStart.copy(this.panEnd);

    this.update();
  }

  //
  // event handlers - FSM: listen for events and reset state
  //

  private onMouseDown = (event: MouseEvent) => {
    // Prevent the browser from scrolling.
    event.preventDefault();

    // Manually set the focus since calling preventDefault above
    // prevents the browser from setting it automatically.
    this.domElement.focus ? this.domElement.focus() : window.focus();

    switch (event.button) {
      case this.mouseButtons.LEFT:
        if (event.ctrlKey || event.metaKey || event.shiftKey) {
          this.handleMouseDownPan(event);
          this.state = STATE.PAN;
        } else {
          this.handleMouseDownRotate(event);
          this.state = STATE.ROTATE;
        }
        break;
      case this.mouseButtons.MIDDLE:
        this.handleMouseDownDolly(event);
        this.state = STATE.DOLLY;
        break;
      case this.mouseButtons.RIGHT:
        this.handleMouseDownPan(event);
        this.state = STATE.PAN;
        break;
    }

    if (this.state !== STATE.NONE) {
      document.addEventListener('mousemove', this.onMouseMove, false);
      document.addEventListener('mouseup', this.onMouseUp, false);
      this.dispatchEvent(this.startEvent);
    }
  }

  private onMouseMove = (event: MouseEvent) => {
    event.preventDefault();
    switch (this.state) {
      case STATE.ROTATE:
        this.handleMouseMoveRotate(event);
        break;
      case STATE.DOLLY:
        this.handleMouseMoveDolly(event);
        break;
      case STATE.PAN:
        this.handleMouseMovePan(event);
        break;
    }
  }

  private onMouseUp = () => {
    document.removeEventListener('mousemove', this.onMouseMove, false);
    document.removeEventListener('mouseup', this.onMouseUp, false);
    this.dispatchEvent(this.endEvent);
    this.state = STATE.NONE;
  }

  private onMouseWheel = (event: WheelEvent) => {
    if (this.state !== STATE.NONE && this.state !== STATE.ROTATE) return;

    event.preventDefault();
    event.stopPropagation();
    this.dispatchEvent(this.startEvent);
    this.handleMouseWheel(event);
    this.dispatchEvent(this.endEvent);
  }

  private onTouchStart = (event: TouchEvent) => {
    event.preventDefault();

    switch (event.touches.length) {
      case 1:	// one-fingered touch: rotate
        this.handconstouchStartRotate(event);
        this.state = STATE.TOUCH_ROTATE;
        break;
      case 2:	// two-fingered touch: dolly-pan
        this.handconstouchStartDollyPan(event);
        this.state = STATE.TOUCH_DOLLY_PAN;
        break;
      default:
        this.state = STATE.NONE;
    }

    if (this.state !== STATE.NONE) {
      this.dispatchEvent(this.startEvent);
    }
  }

  private onTouchMove(event: TouchEvent) {
    event.preventDefault();
    event.stopPropagation();

    switch (event.touches.length) {
      case 1: // one-fingered touch: rotate
        if (this.state !== STATE.TOUCH_ROTATE) return; // is this needed?
        this.handconstouchMoveRotate(event);
        break;
      case 2: // two-fingered touch: dolly-pan
        if (this.state !== STATE.TOUCH_DOLLY_PAN) return; // is this needed?
        this.handconstouchMoveDollyPan(event);
        break;
      default:
        this.state = STATE.NONE;
    }
  }

  private onTouchEnd = () => {
    this.dispatchEvent(this.endEvent);
    this.state = STATE.NONE;
  }

  private onContextMenu = (event: MouseEvent) => {
    event.preventDefault();
  }
}
