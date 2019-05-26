"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const three_1 = require("three");
const STATE = { NONE: -1, ROTATE: 0, DOLLY: 1, PAN: 2, TOUCH_ROTATE: 3, TOUCH_DOLLY_PAN: 4 };
const EPS = 0.000001;
class OrbitControls extends three_1.EventDispatcher {
    constructor(object, domElement = document.body) {
        super();
        this.object = object;
        this.domElement = domElement;
        this.enabled = true;
        this.target = new three_1.Vector3();
        this.minDistance = 0;
        this.maxDistance = Infinity;
        this.minZoom = 0;
        this.maxZoom = Infinity;
        this.minPolarAngle = 0;
        this.maxPolarAngle = Math.PI;
        this.minAzimuthAngle = -Infinity;
        this.maxAzimuthAngle = Infinity;
        this.enableDamping = false;
        this.dampingFactor = 0.25;
        this.zoomSpeed = 1.0;
        this.rotateSpeed = 1.0;
        this.panSpeed = 1.0;
        this.screenSpacePanning = false;
        this.mouseButtons = { LEFT: three_1.MOUSE.LEFT, MIDDLE: three_1.MOUSE.MIDDLE, RIGHT: three_1.MOUSE.RIGHT };
        this.changeEvent = { type: 'change' };
        this.startEvent = { type: 'start' };
        this.endEvent = { type: 'end' };
        this.state = STATE.NONE;
        this.spherical = new three_1.Spherical();
        this.sphericalDelta = new three_1.Spherical();
        this.scale = 1;
        this.panOffset = new three_1.Vector3();
        this.zoomChanged = false;
        this.rotateStart = new three_1.Vector2();
        this.rotateEnd = new three_1.Vector2();
        this.rotateDelta = new three_1.Vector2();
        this.panStart = new three_1.Vector2();
        this.panEnd = new three_1.Vector2();
        this.panDelta = new three_1.Vector2();
        this.dollyStart = new three_1.Vector2();
        this.dollyEnd = new three_1.Vector2();
        this.dollyDelta = new three_1.Vector2();
        this.update = (() => {
            const offset = new three_1.Vector3();
            const quat = new three_1.Quaternion().setFromUnitVectors(this.object.up, new three_1.Vector3(0, 1, 0));
            const quatInverse = quat.clone().inverse();
            const lastPosition = new three_1.Vector3();
            const lastQuaternion = new three_1.Quaternion();
            return () => {
                const position = this.object.position;
                offset.copy(position).sub(this.target);
                offset.applyQuaternion(quat);
                this.spherical.setFromVector3(offset);
                this.spherical.theta += this.sphericalDelta.theta;
                this.spherical.phi += this.sphericalDelta.phi;
                this.spherical.theta = Math.max(this.minAzimuthAngle, Math.min(this.maxAzimuthAngle, this.spherical.theta));
                this.spherical.phi = Math.max(this.minPolarAngle, Math.min(this.maxPolarAngle, this.spherical.phi));
                this.spherical.makeSafe();
                this.spherical.radius *= this.scale;
                this.spherical.radius = Math.max(this.minDistance, Math.min(this.maxDistance, this.spherical.radius));
                this.target.add(this.panOffset);
                offset.setFromSpherical(this.spherical);
                offset.applyQuaternion(quatInverse);
                position.copy(this.target).add(offset);
                this.object.lookAt(this.target);
                if (this.enableDamping) {
                    this.sphericalDelta.theta *= (1 - this.dampingFactor);
                    this.sphericalDelta.phi *= (1 - this.dampingFactor);
                    this.panOffset.multiplyScalar(1 - this.dampingFactor);
                }
                else {
                    this.sphericalDelta.set(0, 0, 0);
                    this.panOffset.set(0, 0, 0);
                }
                this.scale = 1;
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
        this.panLeft = (() => {
            const v = new three_1.Vector3();
            return (distance, objectMatrix) => {
                v.setFromMatrixColumn(objectMatrix, 0);
                v.multiplyScalar(-distance);
                this.panOffset.add(v);
            };
        })();
        this.panUp = (() => {
            const v = new three_1.Vector3();
            return (distance, objectMatrix) => {
                if (this.screenSpacePanning) {
                    v.setFromMatrixColumn(objectMatrix, 1);
                }
                else {
                    v.setFromMatrixColumn(objectMatrix, 0);
                    v.crossVectors(this.object.up, v);
                }
                v.multiplyScalar(distance);
                this.panOffset.add(v);
            };
        })();
        this.pan = (() => {
            const offset = new three_1.Vector3();
            return (deltaX, deltaY) => {
                const element = this.domElement;
                const position = this.object.position;
                offset.copy(position).sub(this.target);
                let targetDistance = offset.length();
                targetDistance *= Math.tan((this.object.fov / 2) * Math.PI / 180.0);
                this.panLeft(2 * deltaX * targetDistance / element.clientHeight, this.object.matrix);
                this.panUp(2 * deltaY * targetDistance / element.clientHeight, this.object.matrix);
            };
        })();
        this.onMouseDown = (event) => {
            event.preventDefault();
            this.domElement.focus ? this.domElement.focus() : window.focus();
            switch (event.button) {
                case this.mouseButtons.LEFT:
                    if (event.ctrlKey || event.metaKey || event.shiftKey) {
                        this.handleMouseDownPan(event);
                        this.state = STATE.PAN;
                    }
                    else {
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
        };
        this.onMouseMove = (event) => {
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
        };
        this.onMouseUp = () => {
            document.removeEventListener('mousemove', this.onMouseMove, false);
            document.removeEventListener('mouseup', this.onMouseUp, false);
            this.dispatchEvent(this.endEvent);
            this.state = STATE.NONE;
        };
        this.onMouseWheel = (event) => {
            if (this.state !== STATE.NONE && this.state !== STATE.ROTATE)
                return;
            event.preventDefault();
            event.stopPropagation();
            this.dispatchEvent(this.startEvent);
            this.handleMouseWheel(event);
            this.dispatchEvent(this.endEvent);
        };
        this.onTouchStart = (event) => {
            event.preventDefault();
            switch (event.touches.length) {
                case 1:
                    this.handconstouchStartRotate(event);
                    this.state = STATE.TOUCH_ROTATE;
                    break;
                case 2:
                    this.handconstouchStartDollyPan(event);
                    this.state = STATE.TOUCH_DOLLY_PAN;
                    break;
                default:
                    this.state = STATE.NONE;
            }
            if (this.state !== STATE.NONE) {
                this.dispatchEvent(this.startEvent);
            }
        };
        this.onTouchEnd = () => {
            this.dispatchEvent(this.endEvent);
            this.state = STATE.NONE;
        };
        this.onContextMenu = (event) => {
            event.preventDefault();
        };
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
    getPolarAngle() {
        return this.spherical.phi;
    }
    getAzimuthalAngle() {
        return this.spherical.theta;
    }
    saveState() {
        this.target0.copy(this.target);
        this.position0.copy(this.object.position);
        this.zoom0 = this.object.zoom;
    }
    reset() {
        this.target.copy(this.target0);
        this.object.position.copy(this.position0);
        this.object.zoom = this.zoom0;
        this.object.updateProjectionMatrix();
        this.dispatchEvent(this.changeEvent);
        this.update();
        this.state = STATE.NONE;
    }
    dispose() {
        this.domElement.removeEventListener('contextmenu', this.onContextMenu, false);
        this.domElement.removeEventListener('mousedown', this.onMouseDown, false);
        this.domElement.removeEventListener('wheel', this.onMouseWheel, false);
        this.domElement.removeEventListener('touchstart', this.onTouchStart, false);
        this.domElement.removeEventListener('touchend', this.onTouchEnd, false);
        this.domElement.removeEventListener('touchmove', this.onTouchMove, false);
        document.removeEventListener('mousemove', this.onMouseMove, false);
        document.removeEventListener('mouseup', this.onMouseUp, false);
    }
    getZoomScale() {
        return Math.pow(0.95, this.zoomSpeed);
    }
    rotateLeft(angle) {
        this.sphericalDelta.theta -= angle;
    }
    rotateUp(angle) {
        this.sphericalDelta.phi -= angle;
    }
    dollyIn(dollyScale) {
        this.scale /= dollyScale;
    }
    dollyOut(dollyScale) {
        this.scale *= dollyScale;
    }
    handleMouseDownRotate(event) {
        this.rotateStart.set(event.clientX, event.clientY);
    }
    handleMouseDownDolly(event) {
        this.dollyStart.set(event.clientX, event.clientY);
    }
    handleMouseDownPan(event) {
        this.panStart.set(event.clientX, event.clientY);
    }
    handleMouseMoveRotate(event) {
        this.rotateEnd.set(event.clientX, event.clientY);
        this.rotateDelta.subVectors(this.rotateEnd, this.rotateStart).multiplyScalar(this.rotateSpeed);
        this.rotateLeft(2 * Math.PI * this.rotateDelta.x / this.domElement.clientHeight);
        this.rotateUp(2 * Math.PI * this.rotateDelta.y / this.domElement.clientHeight);
        this.rotateStart.copy(this.rotateEnd);
        this.update();
    }
    handleMouseMoveDolly(event) {
        this.dollyEnd.set(event.clientX, event.clientY);
        this.dollyDelta.subVectors(this.dollyEnd, this.dollyStart);
        if (this.dollyDelta.y > 0) {
            this.dollyIn(this.getZoomScale());
        }
        else if (this.dollyDelta.y < 0) {
            this.dollyOut(this.getZoomScale());
        }
        this.dollyStart.copy(this.dollyEnd);
        this.update();
    }
    handleMouseMovePan(event) {
        this.panEnd.set(event.clientX, event.clientY);
        this.panDelta.subVectors(this.panEnd, this.panStart).multiplyScalar(this.panSpeed);
        this.pan(this.panDelta.x, this.panDelta.y);
        this.panStart.copy(this.panEnd);
        this.update();
    }
    handleMouseWheel(event) {
        if (event.deltaY < 0) {
            this.dollyOut(this.getZoomScale());
        }
        else if (event.deltaY > 0) {
            this.dollyIn(this.getZoomScale());
        }
        this.update();
    }
    handconstouchStartRotate(event) {
        this.rotateStart.set(event.touches[0].pageX, event.touches[0].pageY);
    }
    handconstouchStartDollyPan(event) {
        const dx = event.touches[0].pageX - event.touches[1].pageX;
        const dy = event.touches[0].pageY - event.touches[1].pageY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        this.dollyStart.set(0, distance);
        const x = 0.5 * (event.touches[0].pageX + event.touches[1].pageX);
        const y = 0.5 * (event.touches[0].pageY + event.touches[1].pageY);
        this.panStart.set(x, y);
    }
    handconstouchMoveRotate(event) {
        this.rotateEnd.set(event.touches[0].pageX, event.touches[0].pageY);
        this.rotateDelta.subVectors(this.rotateEnd, this.rotateStart).multiplyScalar(this.rotateSpeed);
        this.rotateLeft(2 * Math.PI * this.rotateDelta.x / this.domElement.clientHeight);
        this.rotateUp(2 * Math.PI * this.rotateDelta.y / this.domElement.clientHeight);
        this.rotateStart.copy(this.rotateEnd);
        this.update();
    }
    handconstouchMoveDollyPan(event) {
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
    onTouchMove(event) {
        event.preventDefault();
        event.stopPropagation();
        switch (event.touches.length) {
            case 1:
                if (this.state !== STATE.TOUCH_ROTATE)
                    return;
                this.handconstouchMoveRotate(event);
                break;
            case 2:
                if (this.state !== STATE.TOUCH_DOLLY_PAN)
                    return;
                this.handconstouchMoveDollyPan(event);
                break;
            default:
                this.state = STATE.NONE;
        }
    }
}
exports.OrbitControls = OrbitControls;
//# sourceMappingURL=orbit.js.map