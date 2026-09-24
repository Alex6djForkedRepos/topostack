// Capture-only access to the real renderer. Installed by Playwright response
// interception; this never modifies or ships in the application bundle.
export async function installNativeCapture(page) {
  await page.route("**/src/lib/studio/ThreePreview.svelte*", async route => {
    const response = await route.fetch();
    const source = await response.text();
    if (!source.includes("let runtime;")) throw new Error("Native capture hook no longer matches ThreePreview");
    await route.fulfill({ response, body: source.replace("let runtime;", "let runtime; window.__topostackNativeCapture = () => ({ runtime, THREE, applyExploded });") });
  });
}

export async function nativeFrame(frame, options) {
  const data = await frame.evaluate(({ amount, azimuth, elevation, width, height }) => {
    const { runtime: r, THREE, applyExploded } = window.__topostackNativeCapture();
    if (!r?.content.children.length) throw new Error("Native terrain scene is not ready");
    const { renderer, camera, content, rig } = r;
    const original = { position: camera.position.clone(), quaternion: camera.quaternion.clone(), up: camera.up.clone(), aspect: camera.aspect, near: camera.near, far: camera.far, size: renderer.getSize(new THREE.Vector2()), ratio: renderer.getPixelRatio(), rotation: rig.rotation.clone(), lift: rig.position.z, z: content.children.map(child => child.position.z) };
    try {
      rig.rotation.set(0, 0, 0); rig.position.z = 0;
      applyExploded(content, amount);
      rig.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(content), target = box.getCenter(new THREE.Vector3());
      const az = azimuth * Math.PI / 180, el = elevation * Math.PI / 180;
      const direction = new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(az) * Math.cos(el), Math.sin(el));
      camera.up.set(0, 0, 1); camera.aspect = width / height;
      camera.position.copy(target).add(direction); camera.lookAt(target); camera.updateMatrixWorld(true);
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      const tan = Math.tan(camera.fov * Math.PI / 360);
      let distance = 0;
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
        const v = new THREE.Vector3(x, y, z).sub(target);
        distance = Math.max(distance, v.dot(direction) + Math.max(Math.abs(v.dot(right)) / (tan * camera.aspect * 0.86), Math.abs(v.dot(up)) / (tan * 0.82)));
      }
      camera.position.copy(target).addScaledVector(direction, distance * 1.03);
      camera.near = 1; camera.far = 20000; camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
      renderer.setPixelRatio(1); renderer.setSize(width, height, false); renderer.shadowMap.needsUpdate = true;
      renderer.render(rig.parent, camera);
      return renderer.domElement.toDataURL("image/png").split(",")[1];
    } finally {
      content.children.forEach((child, i) => { child.position.z = original.z[i]; });
      rig.rotation.copy(original.rotation); rig.position.z = original.lift;
      camera.position.copy(original.position); camera.quaternion.copy(original.quaternion); camera.up.copy(original.up);
      camera.aspect = original.aspect; camera.near = original.near; camera.far = original.far; camera.updateProjectionMatrix();
      renderer.setPixelRatio(original.ratio); renderer.setSize(original.size.x, original.size.y, false);
      renderer.shadowMap.needsUpdate = true; r.requestRender();
    }
  }, options);
  return Buffer.from(data, "base64");
}
