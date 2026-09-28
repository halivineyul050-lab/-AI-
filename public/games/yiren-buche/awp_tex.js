// Package-local AWP PBR texture paths.
window.AwpTex = {
  albedo: 'awp_albedo.webp',
  normal: 'awp_normal.webp',
  mr: 'awp_mr.webp',
  metallic: 'awp_mr.webp',
  roughness: 'awp_mr.webp',
  size: 1024,
  mime: 'image/webp'
};

let awpLoadAllPromise = null;

function loadAwpTexture(loader, path, colorSpace) {
  return new Promise((resolve) => {
    loader.load(
      path,
      (texture) => {
        texture.userData = texture.userData || {};
        texture.userData.cs15PersistentAsset = true;
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.colorSpace = colorSpace;
        texture.anisotropy = Math.max(1, Number(window.CS15_TEXTURE_ANISOTROPY) || 1);
        texture.needsUpdate = true;
        resolve(texture);
      },
      undefined,
      () => resolve(null)
    );
  });
}

window.AwpTex.loadAll = function () {
  if (awpLoadAllPromise) return awpLoadAllPromise;

  const loader = new THREE.TextureLoader();
  awpLoadAllPromise = Promise.all([
    loadAwpTexture(loader, window.AwpTex.albedo, THREE.SRGBColorSpace),
    loadAwpTexture(loader, window.AwpTex.normal, THREE.NoColorSpace),
    loadAwpTexture(loader, window.AwpTex.mr, THREE.NoColorSpace)
  ]).then(([albedo, normal, mr]) => ({
    albedo,
    normal,
    metallic: mr,
    roughness: mr,
    mr
  }));

  return awpLoadAllPromise;
};
