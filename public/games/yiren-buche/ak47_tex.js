// Package-local AK-47 PBR texture paths.
window.Ak47Tex = {
  albedo: 'ak47_albedo.webp',
  normal: 'ak47_normal.webp',
  mr: 'ak47_mr.webp',
  metallic: 'ak47_mr.webp',
  roughness: 'ak47_mr.webp',
  size: 1024,
  mime: 'image/webp'
};

let ak47LoadAllPromise = null;

function loadAk47Texture(loader, path, colorSpace) {
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

window.Ak47Tex.loadAll = function () {
  if (ak47LoadAllPromise) return ak47LoadAllPromise;

  const loader = new THREE.TextureLoader();
  ak47LoadAllPromise = Promise.all([
    loadAk47Texture(loader, window.Ak47Tex.albedo, THREE.SRGBColorSpace),
    loadAk47Texture(loader, window.Ak47Tex.normal, THREE.NoColorSpace),
    loadAk47Texture(loader, window.Ak47Tex.mr, THREE.NoColorSpace)
  ]).then(([albedo, normal, mr]) => ({
    albedo,
    normal,
    metallic: mr,
    roughness: mr,
    mr
  }));

  return ak47LoadAllPromise;
};
