import * as THREE from 'https://unpkg.com/three@0.160.0?module';
import { GUI } from 'https://cdn.skypack.dev/lil-gui@0.18.0';
import Delaunator   from 'https://cdn.skypack.dev/delaunator@5.0.0';
import { select } from 'three/tsl';
import { buildHelpOverlay } from './ui/help-overlay.js';

buildHelpOverlay();

const params = {
  xMin: -5,
  xMax: 5,
  yMin: -5,
  yMax: 5,
  samples: 100,
  rotationZ: 0,
  zoom: 15,
  altitude: 20,
  capZ: -1,
};

const polygons = [];
let pivot; 
let surfaceMesh, gridHelper, axesHelper;
let drawing = false;
let currentPoints = [];

let hoverBall   = null;
let staticBall = null;
let overlayDirty = true;   

// ──────────────────────────────────────────────────────────────────────────────
// 1.  SCENE, CAMERA, RENDERER
// ──────────────────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();

scene.add(new THREE.AmbientLight(0xffffff, 0.8));
scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.9)); 
const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
dirLight.position.set(3, 4, 6);
scene.add(dirLight);

scene.background = new THREE.Color(0xffffff);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.up.set(0, 0, 1);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// ──────────────────────────────────────────────────────────────────────────────
// 2.  2‑D OVERLAY CANVAS (top‑left)
// ──────────────────────────────────────────────────────────────────────────────
const overlayBox = document.createElement('div');
overlayBox.id = 'overlayBox';  
overlayBox.style.transformOrigin = '50% 50%'
document.body.appendChild(overlayBox);

const overlay = document.createElement('canvas');
overlay.style.width  = '100%';   
overlay.style.height = '100%';
overlayBox.appendChild(overlay);
const ctx = overlay.getContext('2d');
resizeOverlay();

function syncOverlayRotation () {
    overlayBox.style.transform = `rotate(${params.rotationZ}rad)`; 
  }
  
function screenToCanvas (e) {
    const rect = overlayBox.getBoundingClientRect(); 
    const cx = rect.left + rect.width  * 0.5;     
    const cy = rect.top  + rect.height * 0.5;
  
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
  
    const s = Math.sin(-params.rotationZ);
    const c = Math.cos(-params.rotationZ);
  
    const rx = dx * c - dy * s; 
    const ry = dx * s + dy * c;
  
    return {
      px: rx + overlay.width  * 0.5, 
      py: ry + overlay.height * 0.5
    };
  }

// ──────────────────────────────────────────────────────────────────────────────
// 3.  GUI PARAMETERS
// ──────────────────────────────────────────────────────────────────────────────

const tween = {
    active     : false,
    back       : false,
    duration   : 1,         
    startTime  : 0,
  
    startPos   : null,       
    endPos     : null,     

    polys      : [],   
    ball : null
  };
  

// const presets = [
//     {label: 'Radial Bowl', fn: (x,y) => Math.sqrt(x*x + y*y + 1) - 1},
//     { label: 'Log Barrier', fn: (x,y) => -Math.log(5.001-x) - Math.log(5.001 -y) }, 
//     { label: 'Paraboloid', fn: (x, y) => 0.125 * (x * x + y * y) },
//     {label: 'Tilted Quadratic', fn: (x, y) => (6*x*x + x*y + 2*y*y)/20},
//     {label: 'LogSumExp', fn: (x,y) =>  2 *Math.log(Math.exp(0.3*x) + Math.exp(0.3*y) + Math.exp(-0.3*(x+y)))},
//     { label: 'Sine × Cos', fn: (x, y) => Math.sin(x) * Math.cos(y) },
//   ];

const presets = [
  { label:'Radial Bowl',
    fn: (x,y)=> Math.sqrt(x*x + y*y + 1) - 1,
    tex: '\\sqrt{x^{2}+y^{2}+1}\\;{-}\\;1' },

  { label:'Log Barrier',
    fn: (x,y)=> -Math.log(5.001-x) - Math.log(5.001-y),
    tex: '-\\log(5{-}x)\\;{-}\\;\\log(5{-}y)' },

  { label:'Paraboloid',
    fn: (x,y)=> 0.125*(x*x + y*y),
    tex: '\\frac18\\bigl(x^{2}+y^{2}\\bigr)' },

  { label:'Tilted Quadratic',
    fn: (x,y)=> (6*x*x + x*y + 2*y*y)/20,
    tex: '\\tfrac1{20}\\bigl(6x^{2}+xy+2y^{2}\\bigr)' },

  { label:'LogSumExp',
    fn: (x,y)=> 2*Math.log(Math.exp(0.3*x)+Math.exp(0.3*y)+Math.exp(-0.3*(x+y))),
    tex: '2\\,\\log\\!\\bigl(e^{0.3x}+e^{0.3y}+e^{-0.3(x+y)}\\bigr)' },

  { label:'BigBowl',
    fn: (x,y)=> x + y - Math.log(x) - Math.log(y),
    tex: 'x+y\\,{-}\\log\\!\\bigl(x)\\,{-}\\log\\!\\bigl(x)' },

  { label:'Sine × Cos',
    fn: (x,y)=> Math.sin(x)*Math.cos(y),
    tex: '\\sin x\\,\\cos y' },
];


const bar = document.getElementById('funcBar');

presets.forEach(({ label }, i) => {
  const btn = document.createElement('button');
  btn.textContent = label;

  btn.className = 'preset-btn';        // ← use the CSS class
  if (i === 0) btn.classList.add('active');   // default

  btn.onclick = () => selectPreset(i);

  btn.onmouseenter = async () => {
    eqInner.innerHTML = `\\[ ${presets[i].tex} \\]`;  // display style
    await MathJax.typesetPromise([eqInner]);         // render JUST this box
    eqBox.style.opacity = 1;
  };

  btn.onmouseleave = () => {
    eqBox.style.opacity = 0;
  };

  bar.appendChild(btn);
});

/* --- centred translucent box ---------------------------------- */
const eqBox = document.createElement('div');
eqBox.style.cssText = `
  position:fixed; inset:0;
  display:flex; align-items:center; justify-content:center;
  pointer-events:none;                /* ignore clicks */
  opacity:0; transition:opacity .18s ease;
  z-index:9998;
`;
/* inner white card (shrinks around SVG) */
const eqInner = document.createElement('div');
eqInner.style.cssText = `
  background:rgba(255,255,255,.85);
  padding:14px 18px; border-radius:12px;
  box-shadow:0 4px 18px rgba(0,0,0,.25);
  font-size:22px;                      /* MathJax ignores but fixes flash */
`;
eqBox.appendChild(eqInner);
document.body.appendChild(eqBox);



function selectPreset(index) {
  f = presets[index].fn;             

  clearPolygons();
  resetDeformation();
  updateSurface();

  [...bar.children].forEach((b, i) =>
    b.classList.toggle('active', i === index));

  resetDeformation();                            
  updateSurface();            
}
  
  
const gui = new GUI({ width: 300 });

function resizeGUI () {
  /* 22 % of viewport, but clamp between 180-300 px */
  const w = Math.min(300, Math.max(180, window.innerWidth * 0.22));
  gui.domElement.style.width = w + 'px';
}
resizeGUI();                       // call once
window.addEventListener('resize', resizeGUI);

const camFolder = gui.addFolder('Camera');
const rotController = gui.add(params, 'rotationZ', -Math.PI, Math.PI, 0.01).name('Rotate Z');
syncOverlayRotation();    
rotController.onChange(() => {updateCamera(); syncOverlayRotation();});

camFolder.add(params, 'zoom', 1, 100, 0.1).name('Zoom').onChange(updateCamera);
camFolder.add(params, 'altitude', 0.1, 100, 0.1).name('Altitude').onChange(updateCamera);
camFolder.open();

gui.add(params, 'capZ', -10, 10, 0.1).name('Max Height').onChange(updateSurface);

// ──────────────────────────────────────────────────────────────────────────────
// 4.  GLOBALS
// ──────────────────────────────────────────────────────────────────────────────  
export const baseF = presets[0].fn;
let f = baseF;                                   



const raycaster = new THREE.Raycaster();		
const mouseNDC = new THREE.Vector2();		

let deformed = false; 
let originalGeometry = null;

const hoverDot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 16), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
  
const anchorDot = hoverDot.clone();
anchorDot.visible = false;

function resetDeformation() {
      if (deformed) {
        hoverBall = null;           
        staticBall = null;

        if (originalGeometry) originalGeometry.dispose();
      }
      deformed = false;
      originalGeometry  = null;
      anchorDot.visible = false;
      hoverDot.visible  = true;
    }

function transform_point (p, anchor, A) {
    const vx = p.x - anchor.x;
    const vy = p.y - anchor.y;
  
    const nx = A.L11 * vx + A.L12 * vy;
    const ny = A.L12 * vx + A.L22 * vy;

    if (!Number.isFinite(nx) || !Number.isFinite(ny))
      return new THREE.Vector3(p.x, p.y, p.z);
  
    return new THREE.Vector3(anchor.x + nx, anchor.y + ny, p.z);
  }

function intrinsicBall (cx, cy, A, steps = 64) {
    const pts = [];
    for (let k = 0; k < steps; ++k) {
      const θ = 2 * Math.PI * k / steps;
      const ux = Math.cos(θ), uy = Math.sin(θ);
      const quad = ux * (A.a11 * ux + A.a12 * uy) +
                   uy * (A.a12 * ux + A.a22 * uy);
      if (quad <= 0) continue;                 // should not happen if A ≻ 0
      const r = 1 / Math.sqrt(quad);
      pts.push({ x: cx + r * ux, y: cy + r * uy });
    }
    return pts;
  }
  
function addColormap(geom, stops, flip = false) {
    const pos    = geom.getAttribute('position');
    const nVerts = pos.count;

    let zMin =  Infinity, zMax = -Infinity;
    for (let i = 0; i < nVerts; ++i) {
      const z = pos.getZ(i);
      if (z < zMin) zMin = z;
      if (z > zMax) zMax = z;
    }
  
    const palette = stops.map(c => new THREE.Color(c));
    const colors = new Float32Array(nVerts * 3);
    const col    = new THREE.Color();
  
    for (let i = 0; i < nVerts; ++i) {
      let t = (pos.getZ(i) - zMin) / (zMax - zMin || 1);
      if (flip) t = 1 - t;

      const s     = t * (palette.length - 1);
      const i0    = Math.floor(s);
      const i1    = Math.min(i0 + 1, palette.length - 1);
      const local = s - i0;                     
  
      col.copy(palette[i0]).lerp(palette[i1], local);
  
      colors[3 * i    ] = col.r;
      colors[3 * i + 1] = col.g;
      colors[3 * i + 2] = col.b;
    }
  
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
  
const viridis = [ '#440154', '#414487', '#2a788e', '#21a585',
                  '#7ad151', '#fde725' ];

const viridis_rev = [ '#fde725', '#7ad151', '#21a585', '#2a788e',
                      '#414487', '#440154' ];
  
// ──────────────────────────────────────────────────────────────────────────────
// 6.  MATH/UTILITY HELPERS
// ──────────────────────────────────────────────────────────────────────────────
function modelToCanvas(x, y) {
  const { xMin, xMax, yMin, yMax } = params;
  const px = ((x - xMin) / (xMax - xMin)) * overlay.width;
  const py = overlay.height - ((y - yMin) / (yMax - yMin)) * overlay.height;
  return { px, py };
}
function canvasToModel(px, py) {
  const { xMin, xMax, yMin, yMax } = params;
  const x = (px / overlay.width) * (xMax - xMin) + xMin;
  const y = ((overlay.height - py) / overlay.height) * (yMax - yMin) + yMin;
  return { x, y };
}
function distanceSq(a, b) {
  const dx = a.px - b.px;
  const dy = a.py - b.py;
  return dx * dx + dy * dy;
}

function computeHalfspaces(pts) {
  const hs = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const nvec = { x: -dy, y:  dx }
    const c = nvec.x * p.x + nvec.y * p.y;
    hs.push({ n: nvec, c });
  }
  return hs;
}

function applyPolygonTransforms(anchorW, A2) {
    polygons.forEach(poly => {
      if (!poly.mesh) return; 
      const geom = poly.mesh.geometry;
      const pos  = geom.getAttribute('position');
      const arr  = pos.array;
  
      for (let i = 0; i < arr.length; i += 3) {
        const v = new THREE.Vector3(arr[i], arr[i + 1], arr[i + 2]);
        const nv = transform_point(v, anchorW, A2);
        arr[i]     = nv.x;
        arr[i + 1] = nv.y;
      }
      pos.needsUpdate = true;
      geom.computeVertexNormals();
    });
  }
  
const globalHalfspaces = [];

function buildBarrierFunction() {
  if (!globalHalfspaces.length) return baseF;

  return (x, y) => {
    let z = 0;                       
    for (const { n, c } of globalHalfspaces) {
      const s = n.x * x + n.y * y - c; 
      if (s <= 0) return NaN;     
      z += Math.log(s);
    }
    return -z;
  };
}

function pointInPoly (pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect =
      ( (yi > pt.y) !== (yj > pt.y) ) &&
      ( pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi );
    if (intersect) inside = !inside;
  }
  return inside;
}

export function buildClampedGeometry (f, polygon, opts = {}) {
  const {
    step = 0.005,
    maxZ = Infinity
  } = opts;

  if (!polygon?.length) return new THREE.BufferGeometry();

  let minX =  Infinity, minY =  Infinity,
      maxX = -Infinity, maxY = -Infinity;
  for (const p of polygon) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const pts = [];               
  for (let x = minX; x <= maxX; x += step)
    for (let y = minY; y <= maxY; y += step)
      if (pointInPoly({ x, y }, polygon)) {
        let z = f(x, y);
        if (!Number.isFinite(z) || z > maxZ) continue; 
        pts.push({ x, y, z });
      }

  for (const { x, y } of polygon) {
    let z = f(x, y);
    if (!Number.isFinite(z) || z > maxZ) z = maxZ;
    pts.push({ x, y, z });
  }

  if (pts.length < 3)                 
    return new THREE.BufferGeometry();

  const dela   = Delaunator.from(pts, p => p.x, p => p.y);
  const idxArr = [];
  for (let t = 0; t < dela.triangles.length; t += 3)
    idxArr.push(dela.triangles[t], dela.triangles[t + 1], dela.triangles[t + 2]);

  const posArr = new Float32Array(pts.length * 3);
  pts.forEach((p, i) => {posArr[3 * i    ] = p.x; posArr[3 * i + 1] = p.y; posArr[3 * i + 2] = p.z; });

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  geom.setIndex(idxArr);
  geom.computeVertexNormals();
  return geom;
}

// ──────────────────────────────────────────────────────────────────────────────
// 7.  3‑D BUILDERS
// ──────────────────────────────────────────────────────────────────────────────
function generateGeometry(xMin, xMax, yMin, yMax, samples) {
    const insideAnyPoly = (x, y) => {
      if (!polygons.length) return true;         
      const p = { x, y };
      return polygons.some(poly => pointInPoly(p, poly.points));
    };
  
    const g     = new THREE.BufferGeometry();
    const verts = [];
    const idx   = [];
  
    // 2-D array that maps (i,j) → new vertex index, or –1 if that vertex was culled
    const map = Array.from({ length: samples + 1 }, () =>
                new Int32Array(samples + 1).fill(-1));
  
    let nextIndex = 0;
  
    // ── first pass: add only the vertices we keep ──────────────────────────────
    for (let i = 0; i <= samples; i++) {
      const x = THREE.MathUtils.lerp(xMin, xMax, i / samples);
  
      for (let j = 0; j <= samples; j++) {
        const y = THREE.MathUtils.lerp(yMin, yMax, j / samples);
  
        if (!insideAnyPoly(x, y)) continue;       // cull this vertex
  
        map[i][j] = nextIndex++;                  // remember remapped index
        const z = f(x, y);                        // evaluate *after* the test
        verts.push(x, y, z);
      }
    }
  
    // ── second pass: emit triangles whose 3 corners survived ──────────────────
    for (let i = 0; i < samples; i++) {
      for (let j = 0; j < samples; j++) {
        const a = map[i    ][j    ];
        const b = map[i + 1][j    ];
        const c = map[i + 1][j + 1];
        const d = map[i    ][j + 1];
  
        // triangle (a,b,d)
        if (a !== -1 && b !== -1 && d !== -1) idx.push(a, b, d);
        // triangle (b,c,d)
        if (b !== -1 && c !== -1 && d !== -1) idx.push(b, c, d);
      }
    }
  
    // ── build the BufferGeometry ───────────────────────────────────────────────
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  
function buildGrid(size = 100, div = 100) {
  const g = new THREE.GridHelper(size, div, 0x000000, 0x000000);
  g.rotation.x = Math.PI / 2;
  return g;
}
function buildAxes(len = 20) {
  const mat = new THREE.LineBasicMaterial({ color: 0x000000 });
  const grp = new THREE.Group();
  grp.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-len, 0, 0), new THREE.Vector3(len, 0, 0)]), mat));
  grp.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -len, 0), new THREE.Vector3(0, len, 0)]), mat));
  grp.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -len), new THREE.Vector3(0, 0, len)]), mat));
  return grp;
}


  function create3DPolygon(points) {
    return { mesh: null, halfspaces: computeHalfspaces(points) };
  }

export function clearPolygons() {
  for (const p of polygons) {
    if (p.mesh) pivot.remove(p.mesh);   // add this guard
  }
  // polygons.forEach(p => pivot.remove(p.mesh));
  polygons.length        = 0;                   
  globalHalfspaces.length = 0;                
  drawing       = false;
  currentPoints = [];
  hoverDot.visible  = false;
  anchorDot.visible = false;
  overlayDirty = true;
  drawOverlay();                           
}

  

// ── finite-difference Hessian of the scalar field f(x,y) ─────────────
function hessian2D (f, x, y, h = 1e-4) {
    /* ---- finite differences (unchanged) ------------------------ */
    const fxph = f(x + h, y),  fxmh = f(x - h, y);
    const fyph = f(x, y + h),  fymh = f(x, y - h);
    const fpp  = f(x + h, y + h),  fpm = f(x + h, y - h),
          fmp  = f(x - h, y + h),  fmm = f(x - h, y - h);
  
    const fxy = (fpp - fpm - fmp + fmm) / (4 * h * h);
    const fxx = (fxph - 2 * f(x, y) + fxmh) / (h * h);
    const fyy = (fyph - 2 * f(x, y) + fymh) / (h * h);
  
    /* ---- eigen-decomposition of the 2×2 SPD matrix  A ---------- */
    const a = fxx, b = fxy, c = fyy;          // A = [a b; b c]
    const tr = a + c;
    const del = Math.sqrt((a - c) * (a - c) + 4 * b * b);
    const λ1 = 0.5 * (tr + del);
    const λ2 = 0.5 * (tr - del);
  
    /* eigen-vector for λ₁ (fallback for diagonal A) */
    let u1x, u1y;
    if (Math.abs(b) > 1e-20) {          // general case
        u1x = λ1 - c;  u1y =  b;
      } else {                            // diagonal A, pick the right axis
        if (a >= c) { u1x = 1; u1y = 0; } // λ₁ = a  →  (1,0)
        else        { u1x = 0; u1y = 1; } // λ₁ = c  →  (0,1)
      }
      
    const nrm = Math.hypot(u1x, u1y);  u1x /= nrm;  u1y /= nrm;
  
    /* orthogonal eigen-vector */
    const u2x = -u1y, u2y =  u1x;

    /* --- numerical safety -------------------------------------------------- */
    const EPS  = 1e-12;          // keep λ strictly positive
    const CLIP = 1e12;           // and below overflow

    let lam1 = λ1,   lam2 = λ2;  // (copy so the maths below stays readable)

    /* round small negatives up, bound huge values down */
    lam1 = Math.min(Math.max(lam1, EPS), CLIP);
    lam2 = Math.min(Math.max(lam2, EPS), CLIP);

  
    const s1 = Math.sqrt(lam1),      // √λ₁
          s2 = Math.sqrt(lam2);      // √λ₂
  
    /* symmetric square-root  L  such that  A = L Lᵀ */
    const L11 = s1*u1x*u1x + s2*u2x*u2x;
    const L12 = s1*u1x*u1y + s2*u2x*u2y;
    const L22 = s1*u1y*u1y + s2*u2y*u2y;
  
    /* return **both** A and L so old code keeps working */
    return {               // Hessian (old API)
             a11: a, a12: b, a22: c,
             // square-root (new)
             L11, L12, L22
           };
  }
  
  
  function applyVertexTransform(anchorW, A2) {
    /* ---------- surface grid ----------------------------------- */
    const oldGeom  = surfaceMesh.geometry;
    const posAttr  = oldGeom.getAttribute('position');
    const startPos = posAttr.array.slice();
    const endPos   = new Float32Array(startPos.length);
  
    for (let i = 0; i < startPos.length; i += 3) {
      const v  = new THREE.Vector3(startPos[i], startPos[i + 1], startPos[i + 2]);
      const nv = transform_point(v, anchorW, A2);
      endPos[i]     = nv.x;
      endPos[i + 1] = nv.y;
      endPos[i + 2] = nv.z;
    }
  
    /* ---------- polygons --------------------------------------- */
        /* ---------- overlay polygons ----------------------------------- */
    const overlayTweens = polygons.map(poly => {
        const start = poly.points.flatMap(p => [p.x, p.y]); // 2·n array
        const end   = [];
    
        poly.points.forEach(({x, y}) => {
            const nv = transform_point(
                        new THREE.Vector3(x, y, 0),  // z ignored
                        anchorW, A2);
            end.push(nv.x, nv.y);
        });
        return { poly, start, end };
        });
    tween.overlay = overlayTweens;

    const startArr = intrinsicBall(anchorW.x, anchorW.y, A2, 244);
      const endArr   = startArr.map(p => {
        const nv = transform_point(
                     new THREE.Vector3(p.x, p.y, 0),
                     anchorW, A2);
    return { x: nv.x, y: nv.y };
  });

  tween.ball = {
    start : Float32Array.from(startArr.flatMap(p => [p.x, p.y])),
    end   : Float32Array.from(endArr .flatMap(p => [p.x, p.y]))
  };

  staticBall = startArr.slice();     // render immediately

      
    const polyTweens = [];
    polygons.forEach(poly => {
      if (!poly.mesh) return;
      const attr  = poly.mesh.geometry.getAttribute('position');
      const s     = attr.array.slice();
      const e     = new Float32Array(s.length);
  
      for (let i = 0; i < s.length; i += 3) {
        const v  = new THREE.Vector3(s[i], s[i + 1], s[i + 2]);
        const nv = transform_point(v, anchorW, A2);
        e[i]     = nv.x;
        e[i + 1] = nv.y;
        e[i + 2] = nv.z;
      }
      polyTweens.push({ attr, start: s, end: e });
    });
  
    /* ---------- stash in tween state --------------------------- */
    tween.active    = true;
    tween.back      = false;
    tween.startTime = performance.now();
    tween.startPos  = startPos;
    tween.endPos    = endPos;
    tween.polys     = polyTweens;
  }
  

// ──────────────────────────────────────────────────────────────────────────────
// 8.  PIVOT & SURFACE REBUILD
// ──────────────────────────────────────────────────────────────────────────────
function rebuildPivot() {
    if (pivot) scene.remove(pivot);
  
    /* ── GLOBAL coordinate system: pivot now lives at the origin ── */
    pivot = new THREE.Object3D();
    scene.add(pivot);
  
    // helpers
    gridHelper  = buildGrid();
    axesHelper  = buildAxes();
    pivot.add(gridHelper, axesHelper, hoverDot, anchorDot);
  
    /* --- main surface --- */
    const geom = polygons.length === 0
        ? generateGeometry(params.xMin, params.xMax,
                           params.yMin, params.yMax, params.samples)
        : buildClampedGeometry(f, polygons[0].points,
                               { step:0.05, maxZ:params.capZ });
  
    addColormap(geom, viridis_rev, true);          // colour every mesh we build
  
    surfaceMesh = new THREE.Mesh(
      geom,
      new THREE.MeshBasicMaterial({ vertexColors:true, side:THREE.DoubleSide })
    );
    pivot.add(surfaceMesh);
  
    /* --- existing polygons --- */
    // polygons.forEach(p => {
    //   const { mesh } = create3DPolygon(p.points);   // see next item
    //   p.mesh = mesh;
    // });
    polygons.forEach(p => {
      if (p.mesh) pivot.add(p.mesh);      // add this guard
    });
  
    syncOverlayRotation();
  }

  
function updateSurface() {
  resetDeformation();                // reset deformation if any
  rebuildPivot();
  drawOverlay();
  updateCamera();
}

// ──────────────────────────────────────────────────────────────────────────────
// 9.  CAMERA HANDLING
// ──────────────────────────────────────────────────────────────────────────────
function updateCamera() {
    const { xMin, xMax, yMin, yMax, zoom, altitude, rotationZ } = params;
  
    // world-centre of the plotted domain
    const cx = 0.5 * (xMin + xMax);
    const cy = 0.5 * (yMin + yMax);
  
    /* put the camera on a horizontal circle of radius = zoom
       and spin it with rotationZ (positive = CCW)             */
    const dx =  Math.sin(rotationZ) * zoom;
    const dy = -Math.cos(rotationZ) * zoom;
  
    camera.position.set(cx + dx, cy + dy, altitude);
    camera.lookAt(cx, cy, 0);
    camera.updateProjectionMatrix();
  }
  


// ──────────────────────────────────────────────────────────────────────────────
// 8.  OVERLAY DRAWING & INTERACTION
// ──────────────────────────────────────────────────────────────────────────────
function drawOverlay() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);          // identity – no accumulation
  ctx.clearRect(0, 0, overlay.width, overlay.height);
                                    // ① keep old state
  const cx = overlay.width  * 0.5;                    // ② pivot = canvas centre
  const cy = overlay.height * 0.5;

  // Draw grid
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  const { xMin, xMax, yMin, yMax } = params;
  for (let x = Math.ceil(xMin); x <= xMax; x++) {
    const { px } = modelToCanvas(x, 0);
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, overlay.height);
    ctx.stroke();
  }
  for (let y = Math.ceil(yMin); y <= yMax; y++) {
    const { py } = modelToCanvas(0, y);
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(overlay.width, py);
    ctx.stroke();
  }

  // Draw completed polygons
  ctx.fillStyle = 'rgba(255,0,0,0.1)';
  ctx.strokeStyle = 'red';
  polygons.forEach((poly) => {
    ctx.beginPath();
    poly.points.forEach((pt, i) => {
      const { px, py } = modelToCanvas(pt.x, pt.y);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });

  // Draw current in‑progress path
  if (drawing && currentPoints.length) {
    ctx.strokeStyle = '#00f';
    ctx.fillStyle = '#00f';
    ctx.beginPath();
    currentPoints.forEach((pt, i) => {
      const { px, py } = modelToCanvas(pt.x, pt.y);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

    // draw vertices
    currentPoints.forEach((pt) => {
      const { px, py } = modelToCanvas(pt.x, pt.y);
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }

    // ── unit intrinsic ball under the pointer ───────────────────────────
    if (hoverBall && hoverBall.length) {
        ctx.strokeStyle = 'red';
        ctx.lineWidth   = 2;
        ctx.beginPath();
        hoverBall.forEach((p, i) => {
          const { px, py } = modelToCanvas(p.x, p.y);
          if (i === 0) ctx.moveTo(px, py);
          else         ctx.lineTo(px, py);
        });
        ctx.closePath();
        ctx.stroke();
      }

      /* ── frozen or tweening ellipse ───────────────────────────── */
  if (staticBall && staticBall.length) {
        ctx.strokeStyle = 'red';
        ctx.lineWidth   = 2;
        ctx.beginPath();
        staticBall.forEach((p, i) => {
          const { px, py } = modelToCanvas(p.x, p.y);
          i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        });
        ctx.closePath();
        ctx.stroke();
      }
    
}

overlay.addEventListener('click', (e) => {
    const { px, py } = screenToCanvas(e);   // ← replaces the old maths
    const modelPt = canvasToModel(px, py);
  // If currently drawing, maybe add/close
  if (drawing) {
    const first = currentPoints[0];
    const firstPxPy = modelToCanvas(first.x, first.y);
    if (currentPoints.length >= 3 && distanceSq({ px, py }, firstPxPy) < 25) {
        // Close polygon
        const { mesh, halfspaces } = create3DPolygon(currentPoints);
        polygons.push({ points: currentPoints.slice(), mesh, halfspaces });

        // add its half-spaces to the global list *before* rebuilding
        globalHalfspaces.push(...halfspaces);
        f = buildBarrierFunction();             // swap in the new surface
        updateSurface();                        // redraw everything

      drawing = false;
      currentPoints = [];
    } else {
      currentPoints.push(modelPt);
    }
    drawOverlay();
    return;
  }

  // Not drawing: check if click is inside existing polygon (delete‑on‑click)
  for (let i = polygons.length - 1; i >= 0; i--) {
    if (pointInPoly(modelPt, polygons[i].points)) {
      // Delete polygon
      pivot.remove(polygons[i].mesh);
      const removed = polygons.splice(i, 1)[0];

        // rebuild the global list from the polygons we still have
        globalHalfspaces.length = 0;
        for (const p of polygons) globalHalfspaces.push(...p.halfspaces);

        f = buildBarrierFunction();
        updateSurface();
      drawOverlay();
      return;
    }
  }

  // Otherwise start new polygon
  drawing = true;
  currentPoints = [modelPt];
  drawOverlay();
});

// Redraw overlay whenever window resizes or limits change
window.addEventListener('resize', drawOverlay);

renderer.domElement.addEventListener('click', onSurfaceClick, false);

function onSurfaceClick(e) {

    /* undo deformation if we are already warped */
    if (deformed) {
      anchorDot.visible = false;
      hoverDot.visible  = true;
  
      tween.active    = true;
      tween.back      = true;
      tween.startTime = performance.now();
      return;
    }
  
    /* pick the surface (ray-cast in world coords) */
    const rect = renderer.domElement.getBoundingClientRect();
    mouseNDC.x =  (e.clientX - rect.left) / rect.width  * 2 - 1;
    mouseNDC.y = -(e.clientY - rect.top)  / rect.height * 2 + 1;
  
    raycaster.setFromCamera(mouseNDC, camera);
    const hit = raycaster.intersectObject(surfaceMesh, false)[0];
    if (!hit) return;                   // clicked empty space
  
    /* deform */
    const anchorW = hit.point.clone();                       // world === model
    const A2      = hessian2D(f, anchorW.x, anchorW.y);
  
    originalGeometry = surfaceMesh.geometry.clone();
    applyVertexTransform(anchorW, A2);
    applyPolygonTransforms(anchorW, A2);
  
    anchorDot.visible = true;
    anchorDot.position.copy(anchorW);                        // direct copy
    hoverDot.visible  = false;
    hoverBall         = null;
  
    deformed = true;
  }
  
  


// ──────────────────────────────────────────────────────────────────────────────
// 9.  INITIALISE EVERYTHING
// ──────────────────────────────────────────────────────────────────────────────
updateSurface();
updateCamera();

// ──────────────────────────────────────────────────────────────────────────────
// 10.  ANIMATION LOOP
// ──────────────────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function resizeOverlay () {
  const s = parseInt(getComputedStyle(overlayBox).width, 10); // square
  const gap = Math.round(s * 0.15);
  overlayBox.style.top  = gap + 'px';
  overlayBox.style.left = gap + 'px';

  overlay.width  = s;
  overlay.height = s;
  drawOverlay();
}
resizeOverlay();
window.addEventListener('resize', resizeOverlay);


window.addEventListener('mousemove', (e) => {
    mouseNDC.x =  (e.clientX / window.innerWidth)  * 2 - 1;
    mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
  });

const clock = new THREE.Clock();


  function animate() {
    requestAnimationFrame(animate);

    if (overlayDirty) {
        drawOverlay();
        overlayDirty = false;
      }
    

    // ----- vertex tween -------------------------------------------------
    // ----- vertex tween -------------------------------------------------
if (tween.active) {
    const a = Math.min(
      (performance.now() - tween.startTime) / (tween.duration * 1000),
      1
    );
  
    /* surface grid */
    {
      const pos = surfaceMesh.geometry.attributes.position.array;
      const src = tween.back ? tween.endPos   : tween.startPos;
      const dst = tween.back ? tween.startPos : tween.endPos;
      for (let i = 0; i < pos.length; ++i)
        pos[i] = src[i] + a * (dst[i] - src[i]);
      surfaceMesh.geometry.attributes.position.needsUpdate = true;
    }
  
    /* every polygon mesh */
    tween.polys.forEach(({ attr, start, end }) => {
      const arr = attr.array;
      const src = tween.back ? end   : start;
      const dst = tween.back ? start : end;
      for (let i = 0; i < arr.length; ++i)
        arr[i] = src[i] + a * (dst[i] - src[i]);
      attr.needsUpdate = true;
    });

    /* overlay polygons (2-D canvas) */
    tween.overlay.forEach(({ poly, start, end }) => {
            const src = tween.back ? end : start;
            const dst = tween.back ? start : end;
            for (let i = 0; i < src.length; i += 2) {
              poly.points[i >> 1].x = src[i]   + a * (dst[i]   - src[i]);
              poly.points[i >> 1].y = src[i+1] + a * (dst[i+1] - src[i+1]);
            }
          });
        
          /* intrinsic ball */
          if (tween.ball) {
            const { start, end } = tween.ball;
            const src = tween.back ? end : start;
            const dst = tween.back ? start : end;
        
            if (!staticBall) staticBall = [];            // create once
            for (let i = 0; i < src.length; i += 2) {
              if (!staticBall[i >> 1]) staticBall[i >> 1] = { x:0, y:0 };
              staticBall[i >> 1].x = src[i]   + a * (dst[i]   - src[i]);
              staticBall[i >> 1].y = src[i+1] + a * (dst[i+1] - src[i+1]);
            }
          }                     
      
          overlayDirty = true;
  
    /* finish? */
    if (a === 1) {
      surfaceMesh.geometry.computeVertexNormals();      // once
      tween.polys.forEach(({ attr }) =>
        attr.mesh?.geometry?.computeVertexNormals?.()); // optional
  
      tween.active = false;
      deformed     = !tween.back;
      hoverDot.visible  = !deformed;
      anchorDot.visible =  deformed;
      if (!deformed) staticBall = null; 
    }
  }
  
  
  
    // update hover dot only when not frozen
    if (!deformed) {
        raycaster.setFromCamera(mouseNDC, camera);
        const hit = surfaceMesh
              ? raycaster.intersectObject(surfaceMesh, false)[0]
              : null;
      
        if (hit) {
          hoverDot.visible = true;
      
          /* lift the dot a bit so it never falls behind the surface */
          const lifted = hit.point.clone()
                          .add(hit.face.normal.clone().multiplyScalar(0.02));
          hoverDot.position.copy(lifted);          // global coords
      
          const A  = hessian2D(f, hit.point.x, hit.point.y);
          hoverBall = intrinsicBall(hit.point.x, hit.point.y, A, 244);
          overlayDirty = true;
        } else {
          hoverDot.visible = false;
          hoverBall        = null;
          overlayDirty     = true;
        }
      }
      
  
    renderer.render(scene, camera);
  }
  animate();
