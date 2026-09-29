"use client";

/**
 * fam-io Dublaj Makinesi — ana sayfadaki etkileşimli 3D sahne.
 *
 * Bir dublaj turunun beş adımı tek bir makinede: Lobi → Kayıt → Miks → Prömiyer → İndir.
 * Sürükle = döndür, istasyonun üstüne gel = açıklama, tıkla = yakınlaş, Esc / boşluğa tıkla = geri.
 * Tamamen prosedürel three.js: model ya da görsel dosyası yok.
 *
 * "Agentic Factory 3D" şablonundan uyarlanmıştır
 * (https://github.com/eugeneshilow/agentic-3d-templates — OpenAI Codex ile üretilmiş, React'e Claude ile aktarılmış).
 * fam-io için: istasyonlar ve sahne içi ekranlar dublaj akışına göre yeniden yazıldı, metinler Türkçeleştirildi,
 * mod/kamera panelleri çıkarıldı, sadece "hero" kullanımı bırakıldı.
 */

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export type StationId = "kayit" | "miks" | "premiyer" | "lobi" | "indir";

type Props = {
  className?: string;
  /** Geniş ekranda makineyi sağa yasla (sol taraf başlık için) */
  alignRight?: boolean;
  onStation?: (id: StationId | null) => void;
  onReady?: () => void;
};

export default function DubbingMachine3D({ className, alignRight = true, onStation, onReady }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const handlers = useRef({ onStation, onReady });
  useEffect(() => {
    handlers.current = { onStation, onReady };
  }, [onStation, onReady]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let dispose: (() => void) | undefined;
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (cancelled) return;
      dispose = initMachineScene(root, getComputedStyle(root).fontFamily, {
        alignRight,
        onStation: (id) => handlers.current.onStation?.(id),
        onReady: () => handlers.current.onReady?.(),
      });
    });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [alignRight]);

  return (
    <div ref={rootRef} className={["dub-machine", className].filter(Boolean).join(" ")}>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <div
        data-el="scene"
        className="dm-scene"
        role="img"
        aria-label="Etkileşimli 3D dublaj makinesi: Lobi, Kayıt, Miks, Prömiyer ve İndir istasyonları. Döndürmek için sürükle, bir istasyona tıklayarak yakınlaş."
      />
      <div className="dm-vignette" />
      <div data-el="tooltip" className="dm-tooltip" role="tooltip">
        <strong />
        <p />
      </div>
      <div data-el="loading" className="dm-loading">
        <i />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

type SceneOptions = {
  alignRight: boolean;
  onStation?: (id: StationId | null) => void;
  onReady?: () => void;
};

function initMachineScene(root: HTMLElement, fontFamily: string, options: SceneOptions): () => void {
  const cleanups: Array<() => void> = [];
  const frameWidth = () => root.clientWidth;
  const frameHeight = () => root.clientHeight;
  const listen = (target: EventTarget, type: string, handler: (event: never) => void) => {
    const fn = handler as unknown as EventListener;
    target.addEventListener(type, fn);
    cleanups.push(() => target.removeEventListener(type, fn));
  };
  const $ = <T extends HTMLElement = HTMLElement>(name: string): T => {
    const el = root.querySelector<T>(`[data-el="${name}"]`);
    if (!el) throw new Error(`missing ${name}`);
    return el;
  };
  const dispose = () => {
    for (const fn of cleanups.reverse()) fn();
    cleanups.length = 0;
  };

  try {
    const TAU = Math.PI * 2;
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(33, Math.max(1, frameWidth()) / Math.max(1, frameHeight()), 0.1, 150);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch (e) {
      $("loading").classList.add("done");
      root.classList.add("no-webgl");
      throw e;
    }
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(devicePixelRatio, frameWidth() < 900 ? 1.5 : 1.75));
    renderer.setSize(Math.max(1, frameWidth()), Math.max(1, frameHeight()));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    $("scene").appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.enablePan = false;
    controls.enableZoom = false; // sayfa kaydırması bozulmasın
    controls.minPolarAngle = 0.09;
    controls.maxPolarAngle = Math.PI * 0.475;
    controls.rotateSpeed = 0.48;
    if (matchMedia("(pointer:coarse)").matches) controls.enableRotate = false;

    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const env = pmrem.fromScene(room, 0.04);
    scene.environment = env.texture;
    scene.environmentIntensity = 0.62;
    room.dispose();
    pmrem.dispose();
    scene.add(new THREE.HemisphereLight(0xdbe5f4, 0x29211a, 2));
    const key = new THREE.DirectionalLight(0xfff1d8, 4.2);
    key.position.set(-4, 12, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -10, right: 10, top: 9, bottom: -9, near: 0.5, far: 35 });
    key.shadow.normalBias = 0.035;
    key.shadow.bias = -0.0002;
    key.shadow.radius = 4;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xc4d4ed, 3.1);
    rim.position.set(3, 7, -8);
    scene.add(rim);
    const warm = new THREE.PointLight(0xffbd42, 28, 20, 2);
    warm.position.set(-4, 5, 3);
    scene.add(warm);
    const front = new THREE.DirectionalLight(0xffffff, 1);
    front.position.set(5, 3, 10);
    scene.add(front);

    const mat = (color: number, metalness = 0.1, roughness = 0.4, extra: THREE.MeshStandardMaterialParameters = {}) =>
      new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });
    const M = {
      body: mat(0x30363f, 0.75, 0.29),
      base: mat(0x292f37, 0.85, 0.32),
      edge: mat(0x707986, 0.85, 0.24),
      chrome: mat(0xc3cad0, 0.92, 0.18),
      dark: mat(0x12171d, 0.45, 0.38),
      rubber: mat(0x0b1015, 0.1, 0.6),
      amber: mat(0xff7a1a, 0.52, 0.28),
      ivory: mat(0xe0ded4, 0.48, 0.26),
      copper: mat(0xc57e45, 0.85, 0.3),
      light: mat(0xff7a1a, 0.2, 0.25, { emissive: 0xff7a1a, emissiveIntensity: 1.5 }),
      green: mat(0xc6d9a1, 0.1, 0.3, { emissive: 0x91b364, emissiveIntensity: 0.7 }),
      red: mat(0xff4d4d, 0.1, 0.3, { emissive: 0xff2d2d, emissiveIntensity: 1.6 }),
    };
    type Vec3 = [number, number, number];
    type Material = THREE.Material;
    const geometries = new Map<string, THREE.BufferGeometry>();
    function boxGeo(w: number, h: number, d: number, r = 0.04) {
      const k = `b${w},${h},${d},${r}`;
      if (!geometries.has(k))
        geometries.set(k, r ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 3, h / 3, d / 3)) : new THREE.BoxGeometry(w, h, d));
      return geometries.get(k)!;
    }
    function box(parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, m: Material = M.body, r = 0.04) {
      const o = new THREE.Mesh(boxGeo(w, h, d, r), m);
      o.position.set(x, y, z);
      o.castShadow = true;
      o.receiveShadow = true;
      parent.add(o);
      return o;
    }
    function cyl(parent: THREE.Object3D, r: number, h: number, x: number, y: number, z: number, m: Material = M.chrome, r2: number = r, segments = 24) {
      const k = `c${r},${r2},${h},${segments}`;
      if (!geometries.has(k)) geometries.set(k, new THREE.CylinderGeometry(r, r2, h, segments));
      const o = new THREE.Mesh(geometries.get(k)!, m);
      o.position.set(x, y, z);
      o.castShadow = true;
      o.receiveShadow = true;
      parent.add(o);
      return o;
    }
    function ball(parent: THREE.Object3D, r: number, x: number, y: number, z: number, m: Material = M.chrome) {
      const k = `s${r}`;
      if (!geometries.has(k)) geometries.set(k, new THREE.SphereGeometry(r, 12, 8));
      const o = new THREE.Mesh(geometries.get(k)!, m);
      o.position.set(x, y, z);
      parent.add(o);
      return o;
    }
    function tube(parent: THREE.Object3D, pts: Vec3[], r: number, m: Material = M.chrome) {
      const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
      const o = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(12, pts.length * 7), r, 8, false), m);
      o.castShadow = true;
      parent.add(o);
      return o;
    }
    function screw(parent: THREE.Object3D, x: number, y: number, z: number) {
      cyl(parent, 0.055, 0.026, x, y, z, M.chrome, undefined, 12);
      box(parent, 0.068, 0.005, 0.009, x, y + 0.014, z, M.dark, 0);
    }
    type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
    function canvasTexture(w: number, h: number, draw: Draw) {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d")!;
      draw(ctx, w, h);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      return { texture: t, canvas: c, ctx };
    }
    function print(ctx: CanvasRenderingContext2D, txt: string, x: number, y: number, size = 20, color = "#f4f1ea", weight = 500) {
      ctx.fillStyle = color;
      ctx.font = `${weight} ${size}px ${fontFamily}`;
      ctx.fillText(txt, x, y);
    }
    type Painted = THREE.Texture | { texture: THREE.Texture };
    function screen(parent: THREE.Object3D, w: number, h: number, x: number, y: number, z: number, tex: Painted) {
      const map = "texture" in tex ? tex.texture : tex;
      const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map, toneMapped: false }));
      o.position.set(x, y, z);
      parent.add(o);
      return o;
    }

    const machine = new THREE.Group();
    scene.add(machine);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), new THREE.ShadowMaterial({ opacity: 0.23 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.43;
    floor.receiveShadow = true;
    scene.add(floor);
    const shadow = canvasTexture(128, 128, (c, w, h) => {
      const g = c.createRadialGradient(64, 64, 12, 64, 64, 64);
      g.addColorStop(0, "rgba(0,0,0,.8)");
      g.addColorStop(0.55, "rgba(0,0,0,.45)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    });
    const contact = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 13),
      new THREE.MeshBasicMaterial({ map: shadow.texture, transparent: true, depthWrite: false, opacity: 0.65 }),
    );
    contact.rotation.x = -Math.PI / 2;
    contact.position.y = -0.415;
    scene.add(contact);

    // Platform
    box(machine, 12.8, 0.38, 8.25, 0, -0.09, 0, M.base, 0.17);
    box(machine, 12.6, 0.055, 8.08, 0, 0.13, 0, M.edge, 0.11);
    box(machine, 12.49, 0.09, 7.96, 0, 0.19, 0, M.body, 0.1);
    box(machine, 12.55, 0.027, 8.02, 0, -0.19, 0, M.dark, 0.06);
    box(machine, 11.9, 0.026, 0.032, 0, -0.17, 4.115, M.light, 0.01);
    for (const x of [-5.6, 5.6])
      for (const z of [-3.35, 3.35]) {
        cyl(machine, 0.39, 0.25, x, -0.31, z, M.rubber);
        cyl(machine, 0.29, 0.09, x, -0.4, z, M.dark);
        screw(machine, x, 0.253, z);
      }
    for (const x of [-6.02, 6.02]) for (const z of [-3.73, 3.73]) screw(machine, x, 0.255, z);
    const engraving = canvasTexture(1536, 176, (c, w, h) => {
      c.fillStyle = "#252b32";
      c.fillRect(0, 0, w, h);
      c.strokeStyle = "#4d545c";
      c.lineWidth = 2;
      c.strokeRect(2, 2, w - 4, h - 4);
      print(c, "FAM-IO", 45, 79, 40, "#d9d8cd", 650);
      print(c, "·  sahne  ·  rol  ·  kayıt  ·  final", 245, 79, 34, "#b8bdc1", 450);
      print(c, "ARKADAŞLAR ARASI DUBLAJ    /    DEVELOPED BY REAWEN", 47, 133, 19, "#737e88", 500);
      print(c, "No. 001", 1360, 130, 23, "#c57e45");
    });
    const plate = screen(machine, 7.35, 0.84, -0.4, 0.25, 3.51, engraving);
    plate.rotation.x = -Math.PI / 2;
    for (let i = 0; i < 16; i++) box(machine, 0.015, 0.009, 0.11 + (i % 4) * 0.035, -5.6 + i * 0.09, 0.249, 3.5, M.edge, 0);

    // Zemin çizgileri
    const lineMat = new THREE.LineBasicMaterial({ color: 0x69717a, transparent: true, opacity: 0.12 });
    const draftingPoints: THREE.Vector3[] = [];
    for (const r of [7.5, 8.1])
      for (let i = 0; i < 120; i++)
        for (const j of [i, i + 1]) {
          const a = (j / 120) * TAU;
          draftingPoints.push(new THREE.Vector3(Math.cos(a) * r, -0.4, Math.sin(a) * r * 0.72));
        }
    for (let i = 0; i < 52; i++) {
      const a = (i / 52) * TAU;
      const r = 8.1;
      const r2 = r + (i % 4 === 0 ? 0.16 : 0.07);
      draftingPoints.push(
        new THREE.Vector3(Math.cos(a) * r, -0.395, Math.sin(a) * r * 0.72),
        new THREE.Vector3(Math.cos(a) * r2, -0.395, Math.sin(a) * r2 * 0.72),
      );
    }
    scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(draftingPoints), lineMat));

    // İstasyonlar (soldan sağa bant boyunca). step = dublaj akışındaki sırası.
    type StationDef = { id: StationId; name: string; step: number; pos: Vec3; desc: string };
    type Station = StationDef & { group: THREE.Group; glowMat: THREE.MeshStandardMaterial; index: number };
    const definitions: StationDef[] = [
      { id: "kayit", name: "Kayıt", step: 2, pos: [-4.15, 0.29, -0.65], desc: "Geri sayım, altyazı ve mikrofon. Beğenmezsen tekrar çek." },
      { id: "miks", name: "Miks", step: 3, pos: [-1.65, 0.29, -2.03], desc: "Kayıtlar replik aralığına kırpılır, sesler dengelenir." },
      { id: "premiyer", name: "Prömiyer", step: 4, pos: [1.5, 0.29, -2.08], desc: "Final herkesin ekranında aynı saniyede başlar." },
      { id: "lobi", name: "Lobi", step: 1, pos: [4.03, 0.29, 0.12], desc: "Oda kodunu paylaş, herkes kendi karakterini seçsin." },
      { id: "indir", name: "İndir", step: 5, pos: [0.93, 0.29, 1.85], desc: "Dublajlı videoyu tarayıcıda üret ve indir." },
    ];
    const stations: Station[] = [];
    const gears: THREE.Group[] = [];
    function gear(parent: THREE.Object3D, x: number, y: number, z: number, r = 0.3) {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      parent.add(g);
      cyl(g, r, 0.09, 0, 0, 0, M.copper);
      cyl(g, r * 0.66, 0.105, 0, 0, 0, M.dark);
      cyl(g, r * 0.22, 0.14, 0, 0, 0, M.chrome);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        const b = box(g, r * 0.26, 0.085, r * 0.2, Math.cos(a) * r, 0, Math.sin(a) * r, M.copper, 0.008);
        b.rotation.y = -a;
      }
      g.userData.moving = true;
      gears.push(g);
      return g;
    }
    definitions.forEach((d, i) => {
      const group = new THREE.Group();
      group.position.fromArray(d.pos);
      machine.add(group);
      const glowMat = M.light.clone();
      glowMat.emissiveIntensity = 0.5;
      box(group, 2.05, 0.12, 1.78, 0, 0.03, 0, M.dark, 0.1);
      box(group, 1.97, 0.03, 1.7, 0, 0.12, 0, glowMat, 0.09);
      box(group, 2.03, 0.17, 1.75, 0, 0.215, 0, M.body, 0.1);
      for (const x of [-0.85, 0.85]) for (const z of [-0.7, 0.7]) screw(group, x, 0.311, z);
      gear(group, -0.35, 0.45, 0, 0.27);
      gear(group, 0.22, 0.45, 0.12, 0.21);
      box(group, 0.6, 0.15, 0.36, 0.52, 0.47, -0.33, M.dark);
      for (let j = 0; j < 6; j++) box(group, 0.025, 0.16, 0.37, 0.3 + j * 0.08, 0.47, -0.33, M.edge, 0.004);
      tube(group, [[-0.7, 0.4, -0.4], [-0.55, 0.48, 0.4], [0.35, 0.45, 0.6], [0.7, 0.58, 0.23]], 0.023, M.light);
      const plaque = canvasTexture(512, 116, (c, w, h) => {
        c.fillStyle = "#151a20";
        c.fillRect(0, 0, w, h);
        print(c, String(d.step).padStart(2, "0"), 24, 76, 42, "#ff7a1a", 550);
        print(c, d.name.toLocaleUpperCase("tr"), 111, 73, 35, "#d7d9d7", 550);
      });
      screen(group, 1.54, 0.345, 0, 0.27, 0.891, plaque);
      stations.push({ ...d, group, glowMat, index: i });
    });

    // --- 02 KAYIT: stüdyo mikrofonu + dikey "kayıt" ekranı
    const rec = stations[0].group;
    box(rec, 1.74, 0.62, 1.33, 0, 0.65, -0.05, M.ivory, 0.13);
    box(rec, 1.5, 0.1, 1.16, 0, 0.99, -0.04, M.body, 0.025);
    for (const x of [-0.68, 0.68]) {
      cyl(rec, 0.065, 1.73, x, 1.35, -0.18, M.chrome);
      box(rec, 0.22, 1.8, 0.22, x, 1.37, -0.44, M.ivory, 0.035);
    }
    box(rec, 1.82, 0.27, 0.4, 0, 2.28, -0.35, M.amber, 0.045);
    box(rec, 1.55, 0.06, 0.06, 0, 2.13, -0.115, M.chrome, 0.01);
    // Kayan mikrofon kafası (eski "printhead")
    const micHead = new THREE.Group();
    rec.add(micHead);
    micHead.position.set(0, 1.9, -0.08);
    micHead.userData.moving = true;
    box(micHead, 0.45, 0.36, 0.44, 0, 0, 0, M.body, 0.05);
    const capsule = cyl(micHead, 0.13, 0.26, 0, -0.3, 0.03, M.chrome, 0.11);
    capsule.userData.moving = true;
    for (let k = 0; k < 4; k++) cyl(micHead, 0.135, 0.012, 0, -0.22 - k * 0.05, 0.03, M.dark);
    const recLamp = box(micHead, 0.24, 0.045, 0.022, 0, 0.09, 0.23, M.red, 0.01);
    tube(rec, [[-0.68, 2.1, -0.35], [-0.42, 2.52, -0.4], [0.25, 2.5, -0.4], [0.35, 2.01, -0.12]], 0.032, M.dark);
    // Film makaraları
    const reels: THREE.Group[] = [];
    for (const [x, y] of [[-1.03, 1.82], [-0.94, 2.78]]) {
      const reel = new THREE.Group();
      reel.position.set(x, y, -0.48);
      rec.add(reel);
      reel.userData.moving = true;
      const core = cyl(reel, 0.4, 0.22, 0, 0, 0, M.dark);
      core.rotation.x = Math.PI / 2;
      for (const z of [-0.14, 0.14]) {
        const disc = cyl(reel, 0.46, 0.045, 0, 0, z, M.chrome);
        disc.rotation.x = Math.PI / 2;
        for (let j = 0; j < 6; j++) {
          const a = (j / 6) * TAU;
          const hole = cyl(reel, 0.1, 0.006, Math.cos(a) * 0.29, Math.sin(a) * 0.29, z + (z > 0 ? 0.026 : -0.026), M.dark, undefined, 14);
          hole.rotation.x = Math.PI / 2;
        }
      }
      const axle = cyl(reel, 0.095, 0.37, 0, 0, 0, M.amber);
      axle.rotation.x = Math.PI / 2;
      reels.push(reel);
    }
    tube(rec, [[-1.36, 2.66, -0.48], [-1.5, 2.34, -0.48], [-1.34, 1.92, -0.48]], 0.045, M.dark);

    const recTexture = canvasTexture(384, 640, () => {});
    const SUBS = [
      ["KAPTAN", "Hazır mısın?"],
      ["ROBOT", "Her zaman hazırım."],
      ["KAPTAN", "O zaman başlıyoruz."],
      ["ANLATICI", "Ve kayıt başladı..."],
    ];
    function drawRec(t: number) {
      const c = recTexture.ctx;
      const w = 384;
      const h = 640;
      c.fillStyle = "#ff7a1a";
      c.fillRect(0, 0, w, h);
      c.fillStyle = "#c57e45";
      c.beginPath();
      c.arc(330, 205, 210, 0, TAU);
      c.fill();
      // Ses dalgası
      c.fillStyle = "#171b20";
      for (let i = 0; i < 22; i++) {
        const amp = 18 + Math.abs(Math.sin(t * 3 + i * 0.7) * Math.cos(t * 1.3 + i * 0.35)) * 110;
        c.beginPath();
        c.roundRect(34 + i * 14.5, 280 - amp / 2, 8, amp, 4);
        c.fill();
      }
      c.fillStyle = Math.sin(t * 5) > 0 ? "#b0140e" : "#5a0d0a";
      c.beginPath();
      c.arc(40, 50, 11, 0, TAU);
      c.fill();
      print(c, "REC", 60, 59, 24, "#242320", 700);
      print(c, "SESİNİ", 24, 125, 44, "#242320", 750);
      print(c, "VER.", 24, 172, 44, "#242320", 750);
      c.fillStyle = "#171b20";
      c.beginPath();
      c.roundRect(25, 465, 334, 123, 12);
      c.fill();
      const n = Math.floor(t * 0.6) % SUBS.length;
      print(c, SUBS[n][0], 45, 505, 18, "#ff7a1a", 650);
      print(c, SUBS[n][1], 45, 545, 26, "#f4f1ea", 550);
      c.fillStyle = "#fff7d4";
      c.fillRect(27, 615, Math.max(10, ((t * 0.6) % 1) * 330), 5);
      recTexture.texture.needsUpdate = true;
    }
    drawRec(0);
    const outputVideo = new THREE.Group();
    outputVideo.userData.moving = true;
    rec.add(outputVideo);
    box(outputVideo, 0.62, 1.08, 0.055, 0, 1.36, 0.61, M.dark, 0.035);
    screen(outputVideo, 0.56, 0.98, 0, 1.36, 0.641, recTexture);
    box(rec, 1.14, 0.12, 0.2, 0, 0.83, 0.66, M.dark, 0.025);
    for (const x of [-0.42, 0.42]) {
      const r = cyl(rec, 0.115, 0.18, x, 0.92, 0.6, M.chrome);
      r.rotation.z = Math.PI / 2;
    }
    for (let i = 0; i < 5; i++) box(rec, 0.08, 0.03, 0.22, -0.38 + i * 0.19, 1.011, -0.02, M.edge, 0.005);

    // --- 03 MİKS: konsol + kanal kuyruğu + faderlar
    const mix = stations[1].group;
    box(mix, 1.9, 0.66, 1.36, 0, 0.67, -0.04, M.body, 0.11);
    const consoleTop = new THREE.Group();
    consoleTop.position.set(0, 1.01, -0.08);
    consoleTop.rotation.x = -0.32;
    mix.add(consoleTop);
    box(consoleTop, 1.76, 0.12, 1.27, 0, 0, 0, M.ivory, 0.04);
    const queue = canvasTexture(640, 340, () => {});
    const QUEUE = ["Kaptan · replik 4", "Robot · replik 5", "Anlatıcı · replik 6"];
    function drawQueue(t: number) {
      const c = queue.ctx;
      c.fillStyle = "#111b20";
      c.fillRect(0, 0, 640, 340);
      print(c, "MİKS KANALLARI", 25, 45, 21, "#acb9b8", 550);
      print(c, "03 / 08", 497, 45, 20, "#ff7a1a", 500);
      for (let i = 0; i < 3; i++) {
        const y = 74 + i * 76;
        c.fillStyle = "#202c30";
        c.beginPath();
        c.roundRect(21, y, 598, 61, 6);
        c.fill();
        c.fillStyle = i === 0 ? "#c57e45" : "#626f69";
        c.fillRect(34, y + 10, 27, 41);
        print(c, QUEUE[i], 77, y + 29, 19, "#d4d8cc");
        print(c, i === 0 ? "MİKSLENİYOR" : "SIRADA", 77, y + 49, 11, i === 0 ? "#c57e45" : "#81948f");
        c.fillStyle = "#334348";
        c.fillRect(377, y + 26, 214, 7);
        c.fillStyle = i === 0 ? "#ff7a1a" : "#607475";
        c.fillRect(377, y + 26, i === 0 ? ((t * 0.15) % 1) * 214 : 41 + i * 27, 7);
      }
    }
    drawQueue(0);
    const qs = screen(consoleTop, 1.53, 0.79, 0, 0.067, -0.17, queue);
    qs.rotation.x = -Math.PI / 2;
    const faders: THREE.Mesh[] = [];
    for (let i = 0; i < 4; i++) {
      const x = -0.57 + i * 0.38;
      box(consoleTop, 0.05, 0.02, 0.34, x, 0.07, 0.42, M.dark, 0.008);
      const f = box(consoleTop, 0.14, 0.07, 0.07, x, 0.1, 0.42, M.ivory, 0.02);
      f.userData.moving = true;
      faders.push(f);
      ball(consoleTop, 0.035, x, 0.08, 0.61, i === 0 ? M.light : M.green);
    }
    cyl(mix, 0.075, 0.06, 0.77, 1.05, -0.62, M.green);
    for (let i = 0; i < 7; i++) box(mix, 0.55, 0.027, 0.02, 0, 0.46 + i * 0.05, 0.655, M.dark, 0.003);

    // --- 04 PRÖMİYER: büyük ekran
    const premiere = stations[2].group;
    box(premiere, 1.35, 0.18, 0.88, 0, 0.44, 0, M.ivory, 0.045);
    cyl(premiere, 0.095, 1.04, 0, 0.93, -0.31, M.chrome);
    box(premiere, 0.56, 0.91, 0.14, 0, 0.99, -0.34, M.body, 0.04);
    box(premiere, 2.42, 1.72, 0.2, 0, 1.94, -0.17, M.ivory, 0.08);
    box(premiere, 2.28, 1.59, 0.1, 0, 1.94, -0.044, M.dark, 0.045);
    const webTexture = canvasTexture(896, 592, (c, w, h) => {
      c.fillStyle = "#0e0e10";
      c.fillRect(0, 0, w, h);
      c.fillStyle = "#18181b";
      c.fillRect(0, 0, w, 56);
      c.fillStyle = "#3a3a40";
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.arc(26 + i * 19, 27, 4, 0, TAU);
        c.fill();
      }
      print(c, "fam-io", 33, 100, 24, "#ededee", 650);
      print(c, "Sahneler    Oda kur    Final", 530, 98, 15, "#7d7d86");
      c.fillStyle = "#ff7a1a";
      c.beginPath();
      c.roundRect(32, 131, 287, 401, 10);
      c.fill();
      c.fillStyle = "#1c0e02";
      c.beginPath();
      c.moveTo(145, 290);
      c.lineTo(215, 332);
      c.lineTo(145, 374);
      c.fill();
      print(c, "SAHNE 01", 52, 181, 29, "#1c0e02", 700);
      print(c, "PRÖMİYER", 52, 220, 29, "#1c0e02", 700);
      print(c, "Herkes aynı anda", 359, 197, 38, "#ededee", 600);
      print(c, "ilk kez izler.", 359, 250, 38, "#ededee", 600);
      print(c, "Final herkesin ekranında", 362, 300, 19, "#7d7d86");
      print(c, "aynı saniyede başlar.", 362, 329, 19, "#7d7d86");
      for (let i = 0; i < 3; i++) {
        c.fillStyle = "#2e2e33";
        c.fillRect(362, 363 + i * 16, 400 - i * 43, 5);
      }
      c.fillStyle = "#ff7a1a";
      c.beginPath();
      c.roundRect(359, 447, 279, 62, 7);
      c.fill();
      print(c, "Finali başlat  ▶", 392, 486, 22, "#1c0e02", 600);
      print(c, "DEVELOPED BY REAWEN", 33, 571, 12, "#7d7d86");
    });
    screen(premiere, 2.16, 1.43, 0, 1.95, 0.011, webTexture);
    ball(premiere, 0.024, 0, 2.747, -0.05, M.dark);
    box(premiere, 0.21, 0.019, 0.008, 0, 1.149, 0.013, M.light, 0.003);
    screen(premiere, 0.685, 0.96, -0.655, 1.86, 0.018, recTexture);
    const flyPost = new THREE.Group();
    flyPost.userData.moving = true;
    premiere.add(flyPost);
    box(flyPost, 0.59, 0.77, 0.045, 0.94, 0.81, 0.55, M.ivory, 0.025);
    const postTex = canvasTexture(220, 290, (c, w, h) => {
      c.fillStyle = "#f4f1ea";
      c.fillRect(0, 0, w, h);
      c.fillStyle = "#ff7a1a";
      c.fillRect(15, 16, 190, 168);
      c.fillStyle = "#272e30";
      c.beginPath();
      c.moveTo(94, 66);
      c.lineTo(140, 100);
      c.lineTo(94, 134);
      c.fill();
      print(c, "FİNAL", 17, 225, 23, "#283030", 650);
      c.fillStyle = "#b0b5b0";
      c.fillRect(17, 244, 153, 6);
      c.fillRect(17, 258, 104, 5);
    });
    screen(flyPost, 0.55, 0.72, 0.94, 0.81, 0.575, postTex);

    // --- 01 LOBİ: oyuncu panosu
    const lobby = stations[3].group;
    box(lobby, 1.75, 1.77, 1.02, 0, 1.24, -0.13, M.body, 0.12);
    box(lobby, 1.58, 0.13, 1.09, 0, 2.16, -0.13, M.amber, 0.04);
    box(lobby, 1.47, 1.38, 0.055, 0, 1.31, 0.405, M.dark, 0.025);
    const lobbyTex = canvasTexture(480, 460, (c, w, h) => {
      c.fillStyle = "#172224";
      c.fillRect(0, 0, w, h);
      print(c, "OYUNCULAR", 30, 51, 27, "#e8e8d8", 600);
      print(c, "Oda K7Q2M · 3 kişi", 30, 81, 16, "#869991");
      const rows: [string, string, string][] = [
        ["Ali", "Kaptan", "Hazır"],
        ["Zeynep", "Robot", "Kayıtta"],
        ["Mert", "Anlatıcı", "Seçiyor"],
      ];
      rows.forEach(([n, role, st], i) => {
        const y = 110 + i * 100;
        c.fillStyle = "#283839";
        c.beginPath();
        c.roundRect(22, y, 436, 83, 8);
        c.fill();
        c.fillStyle = ["#ff7a1a", "#bdbf9c", "#7d938e"][i];
        c.beginPath();
        c.arc(58, y + 40, 19, 0, TAU);
        c.fill();
        print(c, n[0], 50, y + 47, 20, "#1b2828", 650);
        print(c, n, 93, y + 33, 23, "#e6e8dc", 550);
        print(c, `${role} · ${st}`, 93, y + 58, 15, "#94a59b");
        print(c, i === 0 ? "✓" : "…", 410, y + 49, 25, "#c57e45");
      });
    });
    screen(lobby, 1.31, 1.255, 0, 1.37, 0.44, lobbyTex);
    box(lobby, 1.27, 0.075, 0.29, 0, 0.57, 0.55, M.chrome, 0.02);
    for (let i = 0; i < 3; i++) box(lobby, 1.15, 0.021, 0.12, 0, 0.58 + i * 0.15, -0.35, M.copper, 0.006);
    tube(lobby, [[0.69, 0.43, -0.2], [0.89, 0.65, -0.2], [0.89, 1.8, -0.2], [0.65, 1.99, -0.2]], 0.033, M.chrome);
    const incoming = new THREE.Group();
    incoming.userData.moving = true;
    lobby.add(incoming);
    box(incoming, 0.86, 0.42, 0.043, 0, 0, 0, M.light, 0.035);
    const joinTex = canvasTexture(432, 204, (c, w, h) => {
      c.fillStyle = "#ff7a1a";
      c.fillRect(0, 0, w, h);
      c.fillStyle = "#2a2e26";
      c.beginPath();
      c.arc(58, 98, 32, 0, TAU);
      c.fill();
      print(c, "Z", 45, 112, 34, "#ff7a1a", 600);
      print(c, "Zeynep", 108, 91, 38, "#222822", 650);
      print(c, "Odaya katıldı  +", 108, 138, 23, "#5b4c22", 500);
    });
    screen(incoming, 0.82, 0.39, 0, 0, 0.026, joinTex);

    // --- 05 İNDİR: jenerik yazıcı
    const exportDesk = stations[4].group;
    box(exportDesk, 1.91, 0.63, 1.32, 0, 0.65, -0.06, M.ivory, 0.12);
    box(exportDesk, 1.96, 0.19, 1.38, 0, 0.42, -0.04, M.body, 0.04);
    box(exportDesk, 1.37, 0.09, 0.038, 0, 0.44, 0.66, M.dark, 0.01);
    box(exportDesk, 0.37, 0.042, 0.03, 0, 0.45, 0.687, M.chrome, 0.009);
    box(exportDesk, 1.02, 0.25, 0.91, -0.33, 1.04, -0.03, M.body, 0.045);
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < 3; col++)
        box(exportDesk, 0.19, 0.085, 0.17, -0.62 + col * 0.27, 1.21, 0.27 - row * 0.24, col === 2 && row === 2 ? M.amber : M.ivory, 0.022);
    box(exportDesk, 0.64, 0.6, 0.52, 0.58, 1.04, -0.15, M.body, 0.045);
    box(exportDesk, 0.48, 0.07, 0.09, 0.59, 1.37, -0.1, M.dark, 0.01);
    cyl(exportDesk, 0.06, 0.65, -0.35, 1.6, -0.56, M.chrome);
    box(exportDesk, 1.13, 0.46, 0.19, -0.35, 1.98, -0.56, M.body, 0.045);
    const doneTex = canvasTexture(512, 176, (c) => {
      c.fillStyle = "#12231e";
      c.fillRect(0, 0, 512, 176);
      print(c, "FİNAL HAZIR", 22, 44, 23, "#9cae91", 550);
      print(c, "3 / 3 ses", 26, 131, 62, "#ecedc7", 550);
    });
    screen(exportDesk, 1.015, 0.349, -0.35, 1.98, -0.459, doneTex);
    const credits = new THREE.Group();
    credits.position.set(0.59, 1.37, -0.1);
    credits.userData.moving = true;
    exportDesk.add(credits);
    const creditsTex = canvasTexture(280, 540, (c, w, h) => {
      c.fillStyle = "#f4f1ea";
      c.fillRect(0, 0, w, h);
      print(c, "FAM-IO", 25, 52, 24, "#333d36", 700);
      print(c, "JENERİK", 25, 87, 19, "#566059", 600);
      c.strokeStyle = "#8a9189";
      c.setLineDash([5, 6]);
      c.beginPath();
      c.moveTo(22, 115);
      c.lineTo(258, 115);
      c.stroke();
      print(c, "Kaptan — Ali", 25, 154, 20, "#333d36");
      print(c, "Robot — Zeynep", 25, 188, 20, "#333d36");
      print(c, "Anlatıcı — Mert", 25, 222, 20, "#333d36");
      print(c, "İNDİRİLDİ", 25, 290, 29, "#333d36", 700);
      print(c, "sahne-01.mp4", 25, 327, 18, "#687067");
      for (let i = 0; i < 44; i++) {
        c.fillStyle = "#333d36";
        c.fillRect(25 + i * 5, 370, 1 + (i % 3), 83);
      }
      print(c, "No. 0001", 81, 496, 17, "#59635b");
    });
    const cr = screen(credits, 0.41, 0.83, 0, 0.415, 0.01, creditsTex);
    (cr.material as THREE.MeshBasicMaterial).side = THREE.DoubleSide;
    credits.rotation.x = -0.16;
    const token = new THREE.Group();
    token.userData.moving = true;
    exportDesk.add(token);
    const tokenDisc = cyl(token, 0.22, 0.065, 0, 0, 0, M.amber, undefined, 32);
    tokenDisc.rotation.x = Math.PI / 2;
    const tokenRing = new THREE.Mesh(new THREE.TorusGeometry(0.174, 0.014, 6, 32), M.light);
    tokenRing.position.z = 0.037;
    token.add(tokenRing);
    const playIconTex = canvasTexture(128, 128, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.fillStyle = "#80561c";
      c.beginPath();
      c.moveTo(48, 34);
      c.lineTo(94, 64);
      c.lineTo(48, 94);
      c.closePath();
      c.fill();
    });
    const playIcon = screen(token, 0.28, 0.28, 0, 0, 0.04, playIconTex);
    (playIcon.material as THREE.MeshBasicMaterial).transparent = true;
    cyl(exportDesk, 0.33, 0.09, 1.04, 0.39, 0.55, M.dark);
    cyl(exportDesk, 0.26, 0.025, 1.04, 0.445, 0.55, M.copper);

    // Konveyör bant
    const path = new THREE.CatmullRomCurve3(
      [
        [-3.95, 0.84, 0.65],
        [-3.1, 0.84, -0.12],
        [-1.45, 0.84, -0.79],
        [1.32, 0.84, -0.8],
        [3.3, 0.84, 0.19],
        [3.43, 0.84, 1.21],
        [1.35, 0.84, 2.7],
        [-1.4, 0.84, 2.52],
        [-3.54, 0.84, 1.65],
      ].map((p) => new THREE.Vector3(...(p as Vec3))),
      true,
      "catmullrom",
      0.25,
    );
    const belt = new THREE.Group();
    machine.add(belt);
    const frameMesh = new THREE.Mesh(new THREE.TubeGeometry(path, 150, 0.35, 8, true), M.dark);
    frameMesh.scale.y = 0.3;
    frameMesh.position.y = 0.51;
    belt.add(frameMesh);
    const beltCount = 148;
    const beltSlats = new THREE.InstancedMesh(boxGeo(0.135, 0.065, 0.63, 0.012), M.body, beltCount);
    beltSlats.receiveShadow = true;
    belt.add(beltSlats);
    beltSlats.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const dummy = new THREE.Object3D();
    const pVec = new THREE.Vector3();
    const tVec = new THREE.Vector3();
    function updateBelt(t: number) {
      for (let i = 0; i < beltCount; i++) {
        const u = (i / beltCount + t * 0.012) % 1;
        path.getPointAt(u, pVec);
        path.getTangentAt(u, tVec);
        dummy.position.copy(pVec);
        dummy.rotation.set(0, -Math.atan2(tVec.z, tVec.x), 0);
        dummy.updateMatrix();
        beltSlats.setMatrixAt(i, dummy.matrix);
      }
      beltSlats.instanceMatrix.needsUpdate = true;
    }
    updateBelt(0);
    for (const side of [-1, 1]) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 160; i++) {
        path.getPointAt(i / 160, pVec);
        path.getTangentAt(i / 160, tVec);
        pts.push(pVec.clone().add(new THREE.Vector3(-tVec.z * 0.36 * side, 0.09, tVec.x * 0.36 * side)));
      }
      belt.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.028, 6, false), M.chrome));
    }
    for (let i = 0; i < 16; i++) {
      const p = path.getPointAt(i / 16);
      cyl(belt, 0.045, 0.43, p.x, 0.53, p.z, M.chrome);
    }
    // Bakır borular
    for (let i = 0; i < 4; i++) {
      const a = new THREE.Vector3(...stations[i].pos);
      const b = new THREE.Vector3(...stations[i + 1].pos);
      const curve = new THREE.CatmullRomCurve3([
        a.clone().add(new THREE.Vector3(0.4, 0.12, 0)),
        a.clone().lerp(b, 0.35).add(new THREE.Vector3(0, 0.1, -0.6)),
        a.clone().lerp(b, 0.65).add(new THREE.Vector3(0, 0.1, -0.6)),
        b.clone().add(new THREE.Vector3(-0.4, 0.12, 0)),
      ]);
      machine.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 30, 0.054, 8, false), M.copper));
    }

    // Bant üzerinde taşınan kartlar: oda → senaryo → kayıt → final → jenerik
    const scriptTex = canvasTexture(256, 352, (c, w, h) => {
      c.fillStyle = "#eeeae0";
      c.fillRect(0, 0, w, h);
      print(c, "SENARYO", 24, 47, 22, "#3b403a", 700);
      print(c, "01 / Açılış", 24, 85, 15, "#8b8d80");
      for (let i = 0; i < 9; i++) {
        c.fillStyle = i === 4 ? "#c57e45" : "#aeb2a5";
        c.fillRect(24, 111 + i * 21, 190 - (i % 3) * 24, 6);
      }
      print(c, "HAZIR  ✓", 24, 327, 17, "#786124", 650);
    });
    const roomCardTex = canvasTexture(256, 352, (c) => {
      c.fillStyle = "#c57e45";
      c.fillRect(0, 0, 256, 352);
      print(c, "YENİ", 21, 48, 24, "#30362d", 700);
      print(c, "ODA", 21, 79, 24, "#30362d", 700);
      c.strokeStyle = "#716431";
      c.lineWidth = 2;
      c.strokeRect(23, 112, 210, 139);
      print(c, "K7Q2M", 40, 195, 40, "#30362d", 650);
      print(c, "SAHNE / 01", 23, 320, 17, "#635728");
    });
    const packetTextures = [roomCardTex, scriptTex, recTexture, postTex, creditsTex];
    const packets: Array<{ group: THREE.Group; faces: THREE.Mesh[]; stage: number }> = [];
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      g.userData.moving = true;
      machine.add(g);
      box(g, 0.47, 0.71, 0.04, 0, 0, 0, M.ivory, 0.022);
      const faces = packetTextures.map((tex) => {
        const s = screen(g, 0.43, 0.665, 0, 0, 0.024, tex);
        (s.material as THREE.MeshBasicMaterial).side = THREE.DoubleSide;
        s.visible = false;
        return s;
      });
      packets.push({ group: g, faces, stage: -1 });
    }
    function nearestPort(x: number, z: number) {
      let best = 0;
      let dist = Infinity;
      for (let i = 0; i < 300; i++) {
        const p = path.getPointAt(i / 300);
        const d = (p.x - x) ** 2 + (p.z - z) ** 2;
        if (d < dist) {
          dist = d;
          best = i / 300;
        }
      }
      return best;
    }
    const mixU = nearestPort(-1.65, -0.7);
    const premU = nearestPort(1.5, -0.7);
    const exportU = nearestPort(0.93, 2.65);

    // Statik geometrileri malzemeye göre birleştir (çizim çağrısını azaltır)
    [incoming, credits, token, outputVideo, flyPost, micHead, ...reels].forEach((g) => (g.userData.moving = true));
    function compact(group: THREE.Object3D) {
      for (const child of [...group.children]) if ((child as THREE.Group).isGroup) compact(child);
      const buckets = new Map<string, THREE.Mesh<THREE.BufferGeometry, THREE.Material>[]>();
      for (const object of group.children) {
        const child = object as THREE.Mesh<THREE.BufferGeometry, THREE.Material> & { isInstancedMesh?: boolean };
        if (!child.isMesh || child.isInstancedMesh || child.userData.moving || Array.isArray(child.material)) continue;
        const k = child.material.uuid;
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k)!.push(child);
      }
      for (const list of buckets.values()) {
        if (list.length < 2) continue;
        const geos = list.map((m) => {
          m.updateMatrix();
          const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
          return g.applyMatrix4(m.matrix);
        });
        const merged = mergeGeometries(geos, false);
        for (const geo of geos) geo.dispose();
        if (!merged) continue;
        const mesh = new THREE.Mesh(merged, list[0].material);
        mesh.castShadow = list.some((x) => x.castShadow);
        mesh.receiveShadow = list.some((x) => x.receiveShadow);
        for (const m of list) group.remove(m);
        group.add(mesh);
      }
    }
    compact(machine);
    stations.forEach((s) => s.group.traverse((o) => (o.userData.station = s.id)));
    const pickables = stations.map((s) => s.group);

    // --- Kamera
    let playing = !reduceMotion;
    let simTime = 0;
    let selected: StationId | null = null;
    let hovered: string | null = null;
    let width = frameWidth();
    let height = frameHeight();
    let mobile = width <= 900;
    let lastInteraction = performance.now();
    let dragging = false;
    let wasDragged = false;
    let downX = 0;
    let downY = 0;
    let cameraAnimating = true;
    let lastDraw = -1;
    let visible = true;
    let contextLost = false;
    const desiredPosition = new THREE.Vector3();
    const desiredTarget = new THREE.Vector3(0, 1, 0);
    const viewDirection = new THREE.Vector3(10.5, 10.8, 17).normalize();
    let baseDistance = 25;
    let sized = false;
    let readySent = false;

    function setCameraGoal() {
      if (selected) {
        const s = stations.find((x) => x.id === selected)!;
        desiredTarget.copy(s.group.position).add(new THREE.Vector3(0, 1.25, 0));
        desiredPosition.copy(desiredTarget).addScaledVector(viewDirection, mobile ? 9 : 11);
      } else {
        desiredTarget.set(0, 1, 0);
        desiredPosition.copy(viewDirection).multiplyScalar(baseDistance).add(desiredTarget);
      }
    }
    function layoutCamera() {
      if (!frameWidth() || !frameHeight()) return;
      const first = !sized;
      sized = true;
      width = frameWidth();
      height = frameHeight();
      mobile = width <= 900;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      const shift = options.alignRight && !mobile;
      camera.setViewOffset(width, height, shift ? -width * 0.21 : 0, 0, width, height);
      const aspect = width / height;
      const availableWidth = mobile ? 0.91 : shift ? 0.55 : 0.8;
      const fovTan = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const horizontalFit = 17.3 / (fovTan * aspect * availableWidth);
      const verticalFit = 11.5 / (fovTan * 0.85);
      baseDistance = (Math.max(horizontalFit, verticalFit) * (mobile ? 0.97 : 1)) / (mobile ? 1.15 : 1.12);
      camera.updateProjectionMatrix();
      setCameraGoal();
      cameraAnimating = true;
      if (first) {
        camera.position.copy(desiredPosition);
        controls.target.copy(desiredTarget);
        controls.update();
        cameraAnimating = false;
      }
    }
    function focus(id: StationId | null) {
      selected = id;
      lastInteraction = performance.now();
      setCameraGoal();
      cameraAnimating = true;
      options.onStation?.(id);
    }
    layoutCamera();
    listen(window, "resize", layoutCamera);
    const resizeObserver = new ResizeObserver(() => layoutCamera());
    resizeObserver.observe(root);
    cleanups.push(() => resizeObserver.disconnect());
    controls.addEventListener("start", () => {
      dragging = true;
      cameraAnimating = false;
      lastInteraction = performance.now();
    });
    controls.addEventListener("end", () => {
      dragging = false;
      lastInteraction = performance.now();
    });

    // --- Üstüne gelme / tıklama
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const tooltip = $("tooltip");
    const local = (e: PointerEvent) => {
      const r = root.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top] as const;
    };
    function hitStation(x: number, y: number) {
      pointer.set((x / width) * 2 - 1, (-y / height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(pickables, true);
      return hits.length ? stations.find((s) => s.id === hits[0].object.userData.station) ?? null : null;
    }
    listen(renderer.domElement, "pointermove", (e: PointerEvent) => {
      const [x, y] = local(e);
      if (Math.hypot(x - downX, y - downY) > 5) wasDragged = true;
      if (dragging) return;
      const s = hitStation(x, y);
      hovered = s ? s.id : null;
      renderer.domElement.style.cursor = s ? "pointer" : "grab";
      tooltip.classList.toggle("visible", !!s);
      if (s) {
        tooltip.querySelector("strong")!.innerHTML = `<span>${String(s.step).padStart(2, "0")}</span>${s.name}`;
        tooltip.querySelector("p")!.textContent = s.desc;
        tooltip.style.left = Math.min(width - 250, Math.max(10, x + 16)) + "px";
        tooltip.style.top = Math.max(10, Math.min(height - 95, y - 65)) + "px";
      }
    });
    listen(renderer.domElement, "pointerleave", () => {
      hovered = null;
      tooltip.classList.remove("visible");
    });
    listen(renderer.domElement, "pointerdown", (e: PointerEvent) => {
      [downX, downY] = local(e);
      wasDragged = false;
      tooltip.classList.remove("visible");
    });
    listen(renderer.domElement, "pointerup", (e: PointerEvent) => {
      if (wasDragged) return;
      const [x, y] = local(e);
      const s = hitStation(x, y);
      focus(s && s.id !== selected ? s.id : null);
    });
    listen(window, "keydown", (e: KeyboardEvent) => {
      if (e.key === "Escape" && selected) focus(null);
    });
    listen(document, "visibilitychange", () => {
      visible = !document.hidden;
      lastFrame = performance.now();
    });
    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries[0].isIntersecting && !document.hidden;
        lastFrame = performance.now();
      },
      { threshold: 0.01 },
    );
    observer.observe(renderer.domElement);
    cleanups.push(() => observer.disconnect());
    listen(renderer.domElement, "webglcontextlost", (e: Event) => {
      e.preventDefault();
      contextLost = true;
    });
    listen(renderer.domElement, "webglcontextrestored", () => {
      contextLost = false;
      lastFrame = performance.now();
    });

    // --- Animasyon
    const scratch = new THREE.Vector3();
    let lastFrame = performance.now();
    let frameCount = 0;
    let measureTime = 0;
    let pixelRatio = renderer.getPixelRatio();
    let rafId = 0;
    function animate(now: number) {
      rafId = requestAnimationFrame(animate);
      const dt = Math.max(0, Math.min((now - lastFrame) / 1000, 0.045));
      lastFrame = now;
      if (!visible || contextLost) return;
      if (playing) simTime += dt;
      const t = simTime;
      const beat = (t / 4) % 1;
      const tact = (t * TAU) / 4;
      const smooth = 1 - Math.exp(-dt * 5);
      stations.forEach((s, i) => {
        const pulse = Math.pow(Math.max(0, Math.sin(tact - i * 0.9)), 7);
        s.glowMat.emissiveIntensity = THREE.MathUtils.lerp(
          s.glowMat.emissiveIntensity,
          hovered === s.id || selected === s.id ? 3.5 : 0.55 + pulse * 0.65,
          smooth,
        );
      });
      gears.forEach((g, i) => (g.rotation.y = t * (i % 2 ? -1 : 1) * 1.1));
      reels.forEach((r, i) => (r.rotation.z = -t * (i ? 0.65 : 0.85)));
      micHead.position.x = Math.sin(tact) * 0.42;
      micHead.position.y = 1.91 + Math.sin(tact * 2) * 0.055;
      (recLamp.material as THREE.MeshStandardMaterial).emissiveIntensity = Math.sin(t * 5) > 0 ? 2.2 : 0.3;
      outputVideo.position.y = beat * 0.25;
      flyPost.position.y = Math.sin(tact) * 0.04;
      credits.scale.y = 0.2 + Math.min(1, beat * 1.5) * 0.8;
      token.position.set(1.04, 2.7 - Math.min(1, beat * 1.7) ** 2 * 2.17, 0.55);
      token.rotation.y = t * 3.5;
      token.scale.setScalar(beat > 0.9 ? 1 - (beat - 0.9) * 8 : 1);
      incoming.position.set(Math.sin(beat * Math.PI) * 0.24, 2.9 - beat * 1.9, 1.1 - beat * 0.55);
      incoming.rotation.z = Math.sin(beat * Math.PI) * -0.14;
      incoming.scale.setScalar(Math.min(1, beat * 8 + 0.15, (1 - beat) * 7 + 0.1));
      faders.forEach((f, i) => (f.position.z = 0.42 + Math.sin(tact * 1.3 + i * 1.7) * 0.12));
      if (t - lastDraw > 1 / 18 || lastDraw < 0) {
        drawRec(t);
        drawQueue(t);
        queue.texture.needsUpdate = true;
        updateBelt(t);
        lastDraw = t;
      }
      packets.forEach((packet, i) => {
        const phase = (t / 24 + i / 6) % 1;
        let stage: number;
        if (phase < 0.15) {
          stage = 0;
          const f = phase / 0.15;
          packet.group.position.copy(stations[3].group.position).add(new THREE.Vector3(0, 1.6, 0.6));
          scratch.copy(stations[0].group.position).add(new THREE.Vector3(0, 1.3, 0.65));
          packet.group.position.lerp(scratch, f);
          packet.group.position.y += Math.sin(f * Math.PI) * 2;
          packet.group.rotation.set(0, Math.sin(f * Math.PI) * 0.28, Math.sin(f * Math.PI) * -0.1);
        } else {
          const u = ((phase - 0.15) / 0.85) * exportU;
          path.getPointAt(u, packet.group.position);
          packet.group.position.y += 0.43;
          packet.group.rotation.set(0, 0.18, 0);
          stage = u < mixU * 0.7 ? 1 : u < premU * 0.96 ? 2 : u < exportU * 0.83 ? 3 : 4;
        }
        if (packet.stage !== stage) {
          packet.faces.forEach((f, j) => (f.visible = j === stage));
          packet.stage = stage;
        }
        packet.group.scale.setScalar(phase > 0.94 ? Math.max(0.05, (1 - phase) / 0.06) : 1);
      });
      if (selected && cameraAnimating) setCameraGoal();
      if (cameraAnimating && !dragging) {
        const speed = 1 - Math.exp(-dt * 3);
        camera.position.lerp(desiredPosition, speed);
        controls.target.lerp(desiredTarget, speed);
        if (camera.position.distanceTo(desiredPosition) < 0.015 && controls.target.distanceTo(desiredTarget) < 0.015)
          cameraAnimating = false;
      }
      controls.autoRotate = playing && !dragging && !cameraAnimating && !selected && now - lastInteraction > 6500;
      controls.autoRotateSpeed = 0.24;
      controls.update(dt);
      renderer.render(scene, camera);
      if (!readySent && sized) {
        readySent = true;
        $("loading").classList.add("done");
        root.classList.add("ready");
        options.onReady?.();
      }
      if (playing) {
        frameCount++;
        measureTime += dt;
        if (measureTime > 4) {
          if (frameCount / measureTime < 43 && pixelRatio > 1) {
            pixelRatio = Math.max(1, pixelRatio - 0.25);
            renderer.setPixelRatio(pixelRatio);
          }
          frameCount = 0;
          measureTime = 0;
        }
      }
    }
    rafId = requestAnimationFrame(animate);
    cleanups.push(() => {
      cancelAnimationFrame(rafId);
      controls.dispose();
      const textures = new Set<THREE.Texture>();
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const list = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
        for (const material of list) {
          for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
          material.dispose();
        }
      });
      geometries.forEach((g) => g.dispose());
      textures.forEach((t) => t.dispose());
      env.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    });
    renderer.compile(scene, camera);
  } catch (error) {
    console.error("fam-io 3D: başlatılamadı", error);
    root.classList.add("no-webgl");
    try {
      $("loading").classList.add("done");
    } catch {}
  }
  return dispose;
}

const STYLES = String.raw`
.dub-machine { position: relative; width: 100%; height: 100%; overflow: hidden; contain: layout; }
.dub-machine .dm-scene { position: absolute; inset: 0; touch-action: pan-y; outline: none; }
.dub-machine .dm-scene canvas { display: block; width: 100%; height: 100%; opacity: 0; transition: opacity .8s ease; }
.dub-machine.ready .dm-scene canvas { opacity: 1; }
.dub-machine .dm-vignette { position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(ellipse at 71% 48%, transparent 30%, rgba(10,10,11,.15) 65%, rgba(10,10,11,.85)); }
@media (max-width: 900px) {
  .dub-machine .dm-vignette { background: radial-gradient(ellipse at center, transparent 35%, rgba(10,10,11,.8) 100%); }
}
.dub-machine .dm-tooltip { position: absolute; pointer-events: none; z-index: 10; opacity: 0; transition: opacity .15s;
  padding: 10px 13px; border: 1px solid #2e2e33; background: #111113f2; border-radius: 8px; max-width: 240px;
  box-shadow: 0 8px 28px #0006; font-family: inherit; }
.dub-machine .dm-tooltip.visible { opacity: 1; }
.dub-machine .dm-tooltip strong { font-size: 12.5px; font-weight: 600; color: #ededee; }
.dub-machine .dm-tooltip strong span { font: 10px var(--font-geist-mono, ui-monospace), monospace; color: #ff7a1a; margin-right: 8px; }
.dub-machine .dm-tooltip p { font-size: 12px; color: #9a9aa3; margin: 5px 0 0; line-height: 1.45; }
.dub-machine .dm-loading { position: absolute; left: 71%; top: 50%; transform: translate(-50%,-50%); transition: opacity .4s; }
@media (max-width: 900px) { .dub-machine .dm-loading { left: 50%; } }
.dub-machine .dm-loading i { display: block; width: 18px; height: 18px; border-radius: 50%; border: 1.5px solid #ff7a1a22; border-top-color: #ff7a1a;
  animation: dm-spin 1s linear infinite; }
.dub-machine .dm-loading.done { opacity: 0; pointer-events: none; }
@keyframes dm-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .dub-machine .dm-loading i { animation: none; } .dub-machine .dm-scene canvas { transition: none; } }
`;
