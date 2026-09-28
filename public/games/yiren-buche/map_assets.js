// Package-local port material texture paths.
window.TEX = window.TEX || {};
window.TEX.portBase = 'port_base.webp';
window.TEX.portNormal = 'port_normal.webp';
window.TEX.portMR = 'port_mr.webp';

// Keep the legacy channel names on the packed MR texture for existing callers.
window.TEX.portMetallic = window.TEX.portMR;
window.TEX.portRoughness = window.TEX.portMR;
