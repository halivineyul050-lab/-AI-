// environment_materials.js - shared environment-only material vocabulary.
// These values belong to concrete, containers and port markings; the environment
// layer has no dependency on the weapon modules or their palettes.
(function (root) {
  const sharedSurface = Object.freeze({
    textureKey: 'concrete',
    baseColor: 0x6f7579,
    roughness: 0.9,
    metalness: 0.03,
    tileWorldSize: 4,
  });

  root.CS15_ENVIRONMENT_ASSETS = Object.freeze({
    sharedSurface,
    portModel: Object.freeze({
      baseColorKey: 'portBase',
      normalKey: 'portNormal',
      mrKey: 'portMR',
      metalnessKey: 'portMetallic',
      roughnessKey: 'portRoughness',
    }),
    // Muted port colors are environment references only; keep them independent
    // from every weapon material definition.
    containerPalette: Object.freeze([0x724a45, 0x456074, 0x8b7546, 0x626a66]),
    boundaryColor: 0x4b555c,
    markingColor: 0xb48c39,
  });
})(window);
