import { useEffect, useRef, useState, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

type Point = { x: number; y: number };

// ─── Particle System ──────────────────────────────────────────────────────────
type ParticleType = "star" | "heart" | "butterfly" | "smoke" | "sparkle" | "ring";
interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  type: ParticleType;
  size: number;
  rotation: number; rotSpeed: number;
  hue: number; sat: number; lit: number;
  alpha: number;
  scale: number;
}

function createBurst(cx: number, cy: number, particles: Particle[], count = 40) {
  const types: ParticleType[] = ["star", "heart", "butterfly", "sparkle", "smoke", "ring"];
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const speed = 2 + Math.random() * 6;
    const t = types[Math.floor(Math.random() * types.length)];
    const hue = Math.random() * 360;
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 3,
      life: 1, maxLife: 0.6 + Math.random() * 0.8,
      type: t,
      size: t === "smoke" ? 20 + Math.random() * 30 : 8 + Math.random() * 18,
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.25,
      hue, sat: 80 + Math.random() * 20, lit: 55 + Math.random() * 20,
      alpha: 1, scale: 1,
    });
  }
  // Shockwave ring
  particles.push({
    x: cx, y: cy, vx: 0, vy: 0,
    life: 1, maxLife: 0.5,
    type: "ring", size: 10, rotation: 0, rotSpeed: 0,
    hue: 50, sat: 100, lit: 80, alpha: 1, scale: 1,
  });
}

function emitContinuous(cx: number, cy: number, particles: Particle[]) {
  if (Math.random() > 0.5) return;
  const types: ParticleType[] = ["star", "sparkle", "heart"];
  const t = types[Math.floor(Math.random() * types.length)];
  const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI;
  particles.push({
    x: cx + (Math.random() - 0.5) * 20,
    y: cy + (Math.random() - 0.5) * 20,
    vx: Math.cos(angle) * (1 + Math.random() * 3),
    vy: Math.sin(angle) * (1 + Math.random() * 3) - 1,
    life: 1, maxLife: 0.4 + Math.random() * 0.5,
    type: t,
    size: 5 + Math.random() * 12,
    rotation: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 0.2,
    hue: Math.random() * 360, sat: 90, lit: 65,
    alpha: 1, scale: 1,
  });
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, pts = 5) {
  const inner = r * 0.45;
  ctx.beginPath();
  for (let i = 0; i < pts * 2; i++) {
    const a = (i * Math.PI) / pts - Math.PI / 2;
    const rad = i % 2 === 0 ? r : inner;
    i === 0 ? ctx.moveTo(x + Math.cos(a)*rad, y + Math.sin(a)*rad)
             : ctx.lineTo(x + Math.cos(a)*rad, y + Math.sin(a)*rad);
  }
  ctx.closePath();
}

function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.3);
  ctx.bezierCurveTo(x, y - s * 0.3, x - s, y - s * 0.3, x - s, y + s * 0.1);
  ctx.bezierCurveTo(x - s, y + s * 0.6, x, y + s * 0.9, x, y + s);
  ctx.bezierCurveTo(x, y + s * 0.9, x + s, y + s * 0.6, x + s, y + s * 0.1);
  ctx.bezierCurveTo(x + s, y - s * 0.3, x, y - s * 0.3, x, y + s * 0.3);
  ctx.closePath();
}

function drawButterfly(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, t: number) {
  const flap = Math.sin(t * 10) * 0.4; // wing flap
  // Upper wings
  ctx.beginPath();
  ctx.ellipse(x - s * (0.8 + flap), y - s * 0.3, s * (0.9 + flap * 0.3), s * 0.6, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + s * (0.8 + flap), y - s * 0.3, s * (0.9 + flap * 0.3), s * 0.6, 0.4, 0, Math.PI * 2);
  ctx.fill();
  // Lower wings (smaller)
  ctx.globalAlpha *= 0.7;
  ctx.beginPath();
  ctx.ellipse(x - s * (0.6 + flap), y + s * 0.3, s * (0.6 + flap * 0.2), s * 0.4, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + s * (0.6 + flap), y + s * 0.3, s * (0.6 + flap * 0.2), s * 0.4, -0.3, 0, Math.PI * 2);
  ctx.fill();
  // Body
  ctx.globalAlpha *= 1.4;
  ctx.strokeStyle = `hsl(30,60%,30%)`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y - s * 0.8);
  ctx.lineTo(x, y + s * 0.7);
  ctx.stroke();
}

function updateAndDrawParticles(
  ctx: CanvasRenderingContext2D,
  particles: Particle[],
  dt: number,
  elapsed: number,
  W: number, H: number
) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt / p.maxLife;
    if (p.life <= 0) { particles.splice(i, 1); continue; }

    p.vy += dt * 3.5; // gravity
    p.x  += p.vx;
    p.y  += p.vy;
    p.rotation += p.rotSpeed;

    const t = p.life; // 1→0
    p.alpha = t < 0.3 ? t / 0.3 : 1;

    ctx.save();
    ctx.globalAlpha = p.alpha * 0.92;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);

    const color = `hsl(${p.hue},${p.sat}%,${p.lit}%)`;
    const glow  = `hsl(${p.hue},100%,80%)`;

    if (p.type === "star") {
      ctx.shadowColor = glow;
      ctx.shadowBlur  = 12;
      ctx.fillStyle   = color;
      drawStar(ctx, 0, 0, p.size);
      ctx.fill();
      // Shimmer
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      drawStar(ctx, 0, 0, p.size * 0.4);
      ctx.fill();

    } else if (p.type === "heart") {
      ctx.shadowColor = glow;
      ctx.shadowBlur  = 14;
      ctx.fillStyle   = color;
      const s = p.size * 0.55;
      drawHeart(ctx, 0, -s * 0.5, s);
      ctx.fill();

    } else if (p.type === "butterfly") {
      ctx.shadowColor = glow;
      ctx.shadowBlur  = 10;
      ctx.fillStyle   = color;
      drawButterfly(ctx, 0, 0, p.size * 0.5, elapsed + i * 0.3);

    } else if (p.type === "sparkle") {
      ctx.shadowColor = glow;
      ctx.shadowBlur  = 16;
      ctx.strokeStyle = color;
      ctx.lineWidth   = 2;
      const r = p.size;
      // Cross sparkle
      for (let a = 0; a < 4; a++) {
        const ang = (a * Math.PI) / 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
        ctx.stroke();
      }
      // Diagonal shorter
      for (let a = 0; a < 4; a++) {
        const ang = (a * Math.PI) / 2 + Math.PI / 4;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(ang) * r * 0.6, Math.sin(ang) * r * 0.6);
        ctx.stroke();
      }

    } else if (p.type === "smoke") {
      const prog = 1 - p.life;
      const radius = p.size * (1 + prog * 3);
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
      grad.addColorStop(0,   `hsla(${p.hue},30%,90%,${p.alpha * 0.25})`);
      grad.addColorStop(1,   `hsla(${p.hue},20%,80%,0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();

    } else if (p.type === "ring") {
      const prog = 1 - p.life;
      const radius = p.size + prog * 120;
      ctx.strokeStyle = `hsla(${p.hue},100%,80%,${p.alpha * 0.6})`;
      ctx.lineWidth   = 3 * p.life;
      ctx.shadowColor = glow;
      ctx.shadowBlur  = 20;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }
}

// ─── Shaders ──────────────────────────────────────────────────────────────────
const vertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
uniform sampler2D tDiffuse;
uniform vec2 resolution;
uniform float time;
uniform float uMode;
varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  vec2 uv = vUv;
  vec2 flippedUv = vec2(1.0 - uv.x, uv.y);
  vec4 texColor = texture2D(tDiffuse, flippedUv);
  float brightness = dot(texColor.rgb, vec3(0.299, 0.587, 0.114));

  // PARTICLE
  float bands = 12.0;
  float contour = fract(brightness * bands - time * 0.5);
  float cLine = smoothstep(0.0, 0.05, contour) * smoothstep(1.0, 0.95, contour);
  vec3 contourColor = vec3(0.05, 0.3, 0.9) * cLine * 1.5;

  vec2 gridSize = vec2(90.0);
  vec2 cellUv = floor(uv * gridSize) / gridSize;
  vec2 centerUv = cellUv + 0.5 / gridSize;
  float cellBright = dot(texture2D(tDiffuse, vec2(1.0-centerUv.x, centerUv.y)).rgb, vec3(0.299,0.587,0.114));
  float eps = 1.0 / 90.0;
  float bL = dot(texture2D(tDiffuse, vec2(1.0-(centerUv.x-eps), centerUv.y)).rgb, vec3(0.299,0.587,0.114));
  float bR = dot(texture2D(tDiffuse, vec2(1.0-(centerUv.x+eps), centerUv.y)).rgb, vec3(0.299,0.587,0.114));
  float bU = dot(texture2D(tDiffuse, vec2(1.0-centerUv.x, centerUv.y-eps)).rgb, vec3(0.299,0.587,0.114));
  float bD = dot(texture2D(tDiffuse, vec2(1.0-centerUv.x, centerUv.y+eps)).rgb, vec3(0.299,0.587,0.114));
  float edgeMag = sqrt(pow(bR-bL,2.0)+pow(bD-bU,2.0));
  float strobe = step(0.5, fract(time * 8.0 + hash(cellUv) * 3.0));
  float particleOn = step(0.15, cellBright + edgeMag) * strobe;
  float cycle = fract(time * 15.0 + hash(cellUv));
  vec3 cycleColor = cycle < 0.33 ? vec3(1.0,0.2,0.6) : (cycle < 0.66 ? vec3(1.0,0.9,0.2) : vec3(1.0,1.0,1.0));
  vec3 glow = vec3(0.1, 0.3, 0.9) * smoothstep(0.2, 0.8, brightness) * 0.6;
  vec3 particleFinal = contourColor + cycleColor * particleOn + glow;

  // XRAY
  vec3 baseBlue = mix(vec3(0.0,0.05,0.2), vec3(0.0,0.4,0.8), brightness);
  vec3 volumeColor = mix(baseBlue, vec3(0.0,0.02,0.08), smoothstep(0.3,0.7,brightness));
  float pxW = 1.0/resolution.x; float pxH = 1.0/resolution.y;
  float bTL=dot(texture2D(tDiffuse,flippedUv+vec2(-pxW,-pxH)).rgb,vec3(0.299,0.587,0.114));
  float bTR=dot(texture2D(tDiffuse,flippedUv+vec2(pxW,-pxH)).rgb,vec3(0.299,0.587,0.114));
  float bBL=dot(texture2D(tDiffuse,flippedUv+vec2(-pxW,pxH)).rgb,vec3(0.299,0.587,0.114));
  float bBR=dot(texture2D(tDiffuse,flippedUv+vec2(pxW,pxH)).rgb,vec3(0.299,0.587,0.114));
  float bMR=dot(texture2D(tDiffuse,flippedUv+vec2(pxW,0.0)).rgb,vec3(0.299,0.587,0.114));
  float bML=dot(texture2D(tDiffuse,flippedUv+vec2(-pxW,0.0)).rgb,vec3(0.299,0.587,0.114));
  float bMT=dot(texture2D(tDiffuse,flippedUv+vec2(0.0,-pxH)).rgb,vec3(0.299,0.587,0.114));
  float bMB=dot(texture2D(tDiffuse,flippedUv+vec2(0.0,pxH)).rgb,vec3(0.299,0.587,0.114));
  float eX=-bTL-2.0*bML-bBL+bTR+2.0*bMR+bBR;
  float eY=-bTL-2.0*bMT-bTR+bBL+2.0*bMB+bBR;
  vec3 cyanEdge = vec3(0.0,0.9,1.0)*sqrt(eX*eX+eY*eY)*2.0;
  float noise = hash(uv+vec2(time*100.0))*0.1-0.05;
  float scanline = sin(uv.y*resolution.y*2.0)*0.05;
  vec3 xrayFinal = volumeColor + cyanEdge + noise - scanline;

  vec3 finalColor = mix(particleFinal, xrayFinal, uMode);
  gl_FragColor = vec4(finalColor, 0.95);
}
`;

// ─── XRayWindow ───────────────────────────────────────────────────────────────
function XRayWindow({
  pointsRef,
  videoTexture,
  effectModeRef,
}: {
  pointsRef: React.MutableRefObject<Point[]>;
  videoTexture: THREE.VideoTexture;
  effectModeRef: React.MutableRefObject<"particle" | "xray">;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const uniforms = useMemo(() => ({
    tDiffuse:   { value: videoTexture },
    resolution: { value: new THREE.Vector2(1280, 720) },
    time:       { value: 0 },
    uMode:      { value: 0 },
  }), [videoTexture]);
  const geometry = useMemo(() => new THREE.PlaneGeometry(2, 2, 32, 32), []);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const mat = meshRef.current.material as THREE.ShaderMaterial;
    mat.uniforms.time.value  = clock.getElapsedTime();
    mat.uniforms.uMode.value = effectModeRef.current === "xray" ? 1.0 : 0.0;
    const pts = pointsRef.current;
    if (pts.length < 4) { meshRef.current.visible = false; return; }
    meshRef.current.visible = true;
    const pos = geometry.attributes.position;
    const uvA = geometry.attributes.uv;
    const seg = 32;
    for (let iy = 0; iy <= seg; iy++) {
      for (let ix = 0; ix <= seg; ix++) {
        const idx = iy*(seg+1)+ix, tx = ix/seg, ty = iy/seg;
        const w00=(1-tx)*(1-ty), w10=tx*(1-ty), w01=(1-tx)*ty, w11=tx*ty;
        pos.setXYZ(idx,
          w00*(pts[0].x*2-1)+w10*(pts[1].x*2-1)+w01*(pts[2].x*2-1)+w11*(pts[3].x*2-1),
          w00*(-(pts[0].y*2-1))+w10*(-(pts[1].y*2-1))+w01*(-(pts[2].y*2-1))+w11*(-(pts[3].y*2-1)),
          0);
        uvA.setXY(idx, tx, 1-ty);
      }
    }
    pos.needsUpdate = true;
    uvA.needsUpdate = true;
  });

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <shaderMaterial uniforms={uniforms} vertexShader={vertexShader} fragmentShader={fragmentShader} transparent side={THREE.DoubleSide} />
    </mesh>
  );
}

// ─── Hand Connections ─────────────────────────────────────────────────────────
const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],[0,17],
];

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const videoRef      = useRef<HTMLVideoElement>(null);
  const bgVideoRef    = useRef<HTMLVideoElement>(null);
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const pointsRef     = useRef<Point[]>([]);
  const effectModeRef = useRef<"particle" | "xray">("particle");
  const requestRef    = useRef<number>(0);
  const particlesRef  = useRef<Particle[]>([]);
  const wasPinching   = useRef<[boolean, boolean]>([false, false]);
  const elapsedRef    = useRef(0);
  const lastTimeRef   = useRef<number>(0);

  const [videoTexture, setVideoTexture] = useState<THREE.VideoTexture | null>(null);
  const [isReady, setIsReady]           = useState(false);
  const [effectMode, setEffectMode]     = useState<"particle" | "xray">("particle");
  const [containerStyle, setContainerStyle] = useState({ width: "100%", height: "100%" });

  useEffect(() => {
    const aspect = 16 / 9;
    const update = () => {
      const wa = window.innerWidth / window.innerHeight;
      setContainerStyle(wa > aspect
        ? { width: `${window.innerHeight * aspect}px`, height: "100%" }
        : { width: "100%", height: `${window.innerWidth / aspect}px` });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    let handLandmarker: HandLandmarker | null = null;
    let lastVideoTime = -1;
    let lastMode: "particle" | "xray" = "particle";

    const init = async () => {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
      );
      handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: 2,
      });

      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, facingMode: "user" } });
      } catch (e) { console.warn("Camera denied", e); return; }

      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      if (bgVideoRef.current) { bgVideoRef.current.srcObject = stream; bgVideoRef.current.play().catch(()=>{}); }

      const texture = new THREE.VideoTexture(video);
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      setVideoTexture(texture);
      setIsReady(true);

      const isPinching = (hand: {x:number;y:number}[]) => {
        const dx = hand[8].x - hand[4].x, dy = hand[8].y - hand[4].y;
        return Math.sqrt(dx*dx+dy*dy) < 0.2;
      };

      const detect = (timestamp: number) => {
        requestRef.current = requestAnimationFrame(detect);
        const canvas = canvasRef.current;
        if (!canvas || !video.videoWidth) return;

        const dt = lastTimeRef.current ? Math.min((timestamp - lastTimeRef.current) / 1000, 0.05) : 0.016;
        lastTimeRef.current = timestamp;
        elapsedRef.current += dt;

        canvas.width  = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d")!;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const W = canvas.width, H = canvas.height;

        if (video.currentTime !== lastVideoTime) {
          lastVideoTime = video.currentTime;
          const results = handLandmarker!.detectForVideo(video, performance.now());
          const hands = results.landmarks ?? [];

          if (hands.length > 0) {
            // Draw glowing skeleton
            for (const hand of hands) {
              ctx.shadowColor = "rgba(0,200,255,0.6)";
              ctx.shadowBlur  = 8;
              ctx.strokeStyle = "rgba(150,230,255,0.7)";
              ctx.lineWidth   = 1.5;
              for (const [a,b] of HAND_CONNECTIONS) {
                ctx.beginPath();
                ctx.moveTo((1-hand[a].x)*W, hand[a].y*H);
                ctx.lineTo((1-hand[b].x)*W, hand[b].y*H);
                ctx.stroke();
              }
              for (const lm of hand) {
                ctx.beginPath();
                ctx.arc((1-lm.x)*W, lm.y*H, 2.5, 0, Math.PI*2);
                ctx.fillStyle = "rgba(0,230,255,0.95)";
                ctx.fill();
              }
            }

            // Pinch detection & particle bursts
            for (let hi = 0; hi < Math.min(hands.length, 2); hi++) {
              const hand = hands[hi];
              const pinching = isPinching(hand);
              const px = (1 - (hand[8].x + hand[4].x) / 2) * W;
              const py = ((hand[8].y + hand[4].y) / 2) * H;

              if (pinching && !wasPinching.current[hi]) {
                // NEW PINCH — big burst!
                createBurst(px, py, particlesRef.current, 50);
              } else if (pinching) {
                // HOLDING — continuous sparkle
                emitContinuous(px, py, particlesRef.current);
              }
              wasPinching.current[hi] = pinching;

              // Gold glow circle on fingertip when pinching
              if (pinching) {
                const pulse = 0.7 + 0.3 * Math.sin(elapsedRef.current * 10);
                ctx.shadowColor = "gold";
                ctx.shadowBlur  = 20;
                ctx.strokeStyle = `rgba(255,220,0,${pulse})`;
                ctx.lineWidth   = 2;
                ctx.beginPath();
                ctx.arc(px, py, 14 * pulse, 0, Math.PI*2);
                ctx.stroke();
                ctx.shadowBlur = 0;
              }
            }

            // Reset for hands that disappeared
            for (let hi = hands.length; hi < 2; hi++) {
              wasPinching.current[hi] = false;
            }

            // Mode switching
            if (hands.length >= 2) {
              const p0 = isPinching(hands[0]), p1 = isPinching(hands[1]);
              const newMode = (p0 && p1) ? "xray" : "particle";
              if (newMode !== lastMode) { lastMode = newMode; effectModeRef.current = newMode; setEffectMode(newMode); }
              if (newMode === "xray") {
                const c0={x:(hands[0][8].x+hands[0][4].x)/2,y:(hands[0][8].y+hands[0][4].y)/2};
                const c1={x:(hands[1][8].x+hands[1][4].x)/2,y:(hands[1][8].y+hands[1][4].y)/2};
                const left=c0.x>c1.x?c0:c1, right=c0.x>c1.x?c1:c0, off=0.12;
                pointsRef.current=[
                  {x:1-left.x,y:left.y-off},{x:1-right.x,y:right.y-off},
                  {x:1-left.x,y:left.y+off},{x:1-right.x,y:right.y+off},
                ];
              } else {
                pointsRef.current=[
                  {x:1-hands[0][8].x,y:hands[0][8].y},{x:1-hands[1][8].x,y:hands[1][8].y},
                  {x:1-hands[0][4].x,y:hands[0][4].y},{x:1-hands[1][4].x,y:hands[1][4].y},
                ];
              }
            } else if (hands.length === 1) {
              if (lastMode !== "particle") { lastMode="particle"; effectModeRef.current="particle"; setEffectMode("particle"); }
              const h=hands[0];
              pointsRef.current=[
                {x:1-h[8].x-0.12,y:h[8].y-0.12},{x:1-h[8].x+0.12,y:h[8].y-0.12},
                {x:1-h[4].x-0.12,y:h[4].y+0.12},{x:1-h[4].x+0.12,y:h[4].y+0.12},
              ];
            }
          } else {
            if (lastMode!=="particle"){lastMode="particle";effectModeRef.current="particle";setEffectMode("particle");}
            pointsRef.current=[];
            wasPinching.current=[false,false];
          }
        }

        // Draw particles on top of everything
        ctx.shadowBlur = 0;
        updateAndDrawParticles(ctx, particlesRef.current, dt, elapsedRef.current, W, H);
      };

      detect(0);
    };

    init();
    return () => {
      cancelAnimationFrame(requestRef.current);
      handLandmarker?.close();
      const v = videoRef.current;
      if (v?.srcObject) { (v.srcObject as MediaStream).getTracks().forEach(t=>t.stop()); v.srcObject=null; }
    };
  }, []);

  return (
    <div style={{ width:"100vw", height:"100vh", background:"#000", display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden" }}>
      <video ref={videoRef} style={{ display:"none" }} playsInline muted />
      <div style={{ position:"relative", ...containerStyle }}>

        <video ref={bgVideoRef} autoPlay playsInline muted
          style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover", transform:"scaleX(-1)", opacity:0.45 }}
        />

        {isReady && videoTexture && (
          <div style={{ position:"absolute", inset:0, zIndex:10, pointerEvents:"none" }}>
            <Canvas orthographic camera={{ near:0.1, far:10, position:[0,0,1] }} gl={{ alpha:true }} style={{ background:"transparent" }}>
              <XRayWindow pointsRef={pointsRef} videoTexture={videoTexture} effectModeRef={effectModeRef} />
            </Canvas>
          </div>
        )}

        <canvas ref={canvasRef}
          style={{ position:"absolute", inset:0, width:"100%", height:"100%", zIndex:20, pointerEvents:"none" }}
        />

        {isReady && (
          <div style={{
            position:"absolute", top:12, right:12, zIndex:30,
            padding:"4px 14px", borderRadius:20, fontSize:12, fontFamily:"monospace",
            background: effectMode==="xray" ? "rgba(0,200,255,0.15)" : "rgba(255,50,150,0.15)",
            border:`1px solid ${effectMode==="xray" ? "cyan" : "#ff3296"}`,
            color: effectMode==="xray" ? "cyan" : "#ff3296",
            letterSpacing:"0.1em",
            boxShadow: effectMode==="xray" ? "0 0 12px rgba(0,255,255,0.3)" : "0 0 12px rgba(255,50,150,0.3)",
          }}>
            {effectMode==="xray" ? "⚡ X-RAY MODE" : "✦ PARTICLE MODE"}
          </div>
        )}

        {isReady && (
          <div style={{
            position:"absolute", bottom:12, left:"50%", transform:"translateX(-50%)",
            zIndex:30, fontSize:11, fontFamily:"monospace",
            color:"rgba(255,255,255,0.35)", whiteSpace:"nowrap",
          }}>
            Show hands • Pinch fingers for magic ✨ • Pinch both to X-Ray
          </div>
        )}

        {!isReady && (
          <div style={{ position:"absolute", inset:0, zIndex:40, background:"rgba(0,0,0,0.85)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16 }}>
            <div style={{ width:40, height:40, border:"3px solid rgba(0,255,255,0.2)", borderTop:"3px solid cyan", borderRadius:"50%", animation:"spin 1s linear infinite" }} />
            <p style={{ color:"rgba(255,255,255,0.7)", fontFamily:"monospace", fontSize:14 }}>Loading AI Models &amp; Camera...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}
      </div>
    </div>
  );
}
