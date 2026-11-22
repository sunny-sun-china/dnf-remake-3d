import * as THREE from 'three';

/**
 * Size an imported static GLTF scene in metres, with its feet or base at Y=0.
 * The returned group is safe to position and turn; materials and geometry are
 * shared with the source. frontYaw corrects a source whose face is away from +Z.
 */
export function instantiateResident(source, targetHeight, { frontYaw = 0 } = {}) {
  if (!source?.isObject3D || !Number.isFinite(targetHeight) || targetHeight <= 0) {
    throw new TypeError('A loaded Three.js scene and a positive target height are required.');
  }
  const base = new THREE.Group();
  const aligned = new THREE.Group();
  aligned.rotation.y = frontYaw;
  aligned.add(source.clone(true));
  aligned.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(aligned, true);
  const height = bounds.max.y - bounds.min.y;
  if (!Number.isFinite(height) || height <= 0) {
    throw new RangeError('The imported scene has no vertical mesh extent.');
  }
  const scale = targetHeight / height;
  const center = bounds.getCenter(new THREE.Vector3());
  aligned.scale.setScalar(scale);
  aligned.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
  aligned.traverse(part => {
    if (part.isMesh) {
      part.castShadow = true;
      part.receiveShadow = true;
    }
  });
  base.add(aligned);
  return base;
}
