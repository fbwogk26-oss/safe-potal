import { useRef, useEffect, useState, useCallback } from "react";
import * as THREE from "three";
import { Layers, Maximize2, Minimize2, RotateCcw, Info } from "lucide-react";

/* ─── 기본 레이어 이미지 (KT MOS 현장사진) ─── */
const DEFAULT_LAYERS = [
  { src: "/parallax/layer1.jpg", z: -2.0, scale: 1.35, depth: 0.18, label: "배경" },
  { src: "/parallax/layer2.jpg", z:  0.0, scale: 1.15, depth: 0.50, label: "중경" },
  { src: "/parallax/layer3.jpg", z:  2.0, scale: 1.00, depth: 0.85, label: "전경" },
];

export default function ParallaxViewer() {
  const mountRef    = useRef<HTMLDivElement>(null);
  const viewerRef   = useRef<HTMLDivElement>(null);
  const stateRef    = useRef({
    renderer: null as THREE.WebGLRenderer | null,
    scene:    null as THREE.Scene | null,
    camera:   null as THREE.PerspectiveCamera | null,
    meshes:   [] as THREE.Mesh[],
    raf:      0,
    mx: 0, my: 0,   // smoothed mouse
    tx: 0, ty: 0,   // target mouse
    idle: 0,        // idle timer
  });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loaded, setLoaded]             = useState(false);
  const [showHint, setShowHint]         = useState(true);

  /* ── 씬 초기화 ── */
  const initScene = useCallback(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const s = stateRef.current;

    /* 기존 씬 정리 */
    if (s.renderer) {
      cancelAnimationFrame(s.raf);
      s.renderer.dispose();
      s.meshes.forEach(m => {
        (m.material as THREE.MeshBasicMaterial).map?.dispose();
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      });
      s.meshes = [];
      mount.innerHTML = "";
    }

    const W = mount.clientWidth;
    const H = mount.clientHeight;
    const aspect = W / H;

    const scene  = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0a);

    const camera = new THREE.PerspectiveCamera(55, aspect, 0.1, 100);
    camera.position.z = 6;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    s.scene    = scene;
    s.camera   = camera;
    s.renderer = renderer;

    /* 텍스처 & 메쉬 로드 */
    const loader = new THREE.TextureLoader();
    let loadedCount = 0;

    DEFAULT_LAYERS.forEach((cfg, i) => {
      loader.load(cfg.src, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;

        /* 이미지 비율에 맞춰 플레인 크기 계산 */
        const imgAspect = tex.image.width / tex.image.height;
        const planeW = cfg.scale * Math.max(aspect / imgAspect, 1) * imgAspect;
        const planeH = cfg.scale * Math.max(aspect / imgAspect, 1);

        const geo = new THREE.PlaneGeometry(planeW, planeH);
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: false });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.z = cfg.z;
        mesh.userData.baseX = 0;
        mesh.userData.baseY = 0;
        scene.add(mesh);

        /* z 순서에 따라 정렬 */
        s.meshes[i] = mesh;
        loadedCount++;
        if (loadedCount === DEFAULT_LAYERS.length) setLoaded(true);
      });
    });

    /* ── 애니메이션 루프 ── */
    const clock = new THREE.Clock();

    const animate = () => {
      s.raf = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      /* 부드러운 마우스 추적 */
      s.mx += (s.tx - s.mx) * 0.06;
      s.my += (s.ty - s.my) * 0.06;

      /* 마우스 idle 시 자동 유영 */
      s.idle += 0.005;
      const autoX = Math.sin(elapsed * 0.3) * 0.15;
      const autoY = Math.cos(elapsed * 0.2) * 0.10;

      const useX = Math.abs(s.tx) < 0.001 && Math.abs(s.ty) < 0.001
        ? autoX : s.mx;
      const useY = Math.abs(s.tx) < 0.001 && Math.abs(s.ty) < 0.001
        ? autoY : s.my;

      s.meshes.forEach((mesh, i) => {
        if (!mesh) return;
        const d = DEFAULT_LAYERS[i].depth;

        /* 위치 패럴랙스 */
        const targetX = useX * d * 1.2;
        const targetY = -useY * d * 1.2;
        mesh.position.x += (targetX - mesh.position.x) * 0.05;
        mesh.position.y += (targetY - mesh.position.y) * 0.05;

        /* 미세 회전으로 입체감 강조 */
        mesh.rotation.y += (useX * 0.08 * d - mesh.rotation.y) * 0.04;
        mesh.rotation.x += (-useY * 0.06 * d - mesh.rotation.x) * 0.04;
      });

      renderer.render(scene, camera);
    };
    animate();
  }, []);

  useEffect(() => {
    initScene();
    return () => {
      const s = stateRef.current;
      cancelAnimationFrame(s.raf);
      s.renderer?.dispose();
    };
  }, [initScene]);

  /* ── 마우스 / 터치 / 자이로 ── */
  useEffect(() => {
    const onMouse = (e: MouseEvent) => {
      stateRef.current.tx = (e.clientX / window.innerWidth  - 0.5) * 2;
      stateRef.current.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    const onTouch = (e: TouchEvent) => {
      const t = e.touches[0];
      stateRef.current.tx = (t.clientX / window.innerWidth  - 0.5) * 2;
      stateRef.current.ty = (t.clientY / window.innerHeight - 0.5) * 2;
    };
    const onLeave = () => {
      stateRef.current.tx = 0;
      stateRef.current.ty = 0;
    };
    const onGyro = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      stateRef.current.tx = Math.max(-1, Math.min(1, e.gamma / 20));
      stateRef.current.ty = Math.max(-1, Math.min(1, (e.beta - 40) / 20));
    };
    const onResize = () => {
      const s = stateRef.current;
      const mount = mountRef.current;
      if (!s.renderer || !s.camera || !mount) return;
      const W = mount.clientWidth, H = mount.clientHeight;
      s.camera.aspect = W / H;
      s.camera.updateProjectionMatrix();
      s.renderer.setSize(W, H);
    };

    window.addEventListener("mousemove",  onMouse);
    window.addEventListener("touchmove",  onTouch,  { passive: true });
    window.addEventListener("mouseleave", onLeave);
    window.addEventListener("deviceorientation", onGyro);
    window.addEventListener("resize",     onResize);

    /* 힌트 5초 후 숨기기 */
    const t = setTimeout(() => setShowHint(false), 5000);

    return () => {
      window.removeEventListener("mousemove",  onMouse);
      window.removeEventListener("touchmove",  onTouch);
      window.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("deviceorientation", onGyro);
      window.removeEventListener("resize",     onResize);
      clearTimeout(t);
    };
  }, []);

  /* ── 전체화면 ── */
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      viewerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };
  useEffect(() => {
    const fn = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", fn);
    return () => document.removeEventListener("fullscreenchange", fn);
  }, []);

  /* ── 리셋 ── */
  const handleReset = () => {
    stateRef.current.tx = 0;
    stateRef.current.ty = 0;
  };

  return (
    <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">

      {/* 헤더 */}
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="bg-purple-100 p-2 sm:p-3 rounded-xl text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
          <Layers className="w-6 h-6 sm:w-8 sm:h-8" />
        </div>
        <div>
          <h2 className="text-xl sm:text-3xl font-display font-bold">3D 패럴랙스 뷰어</h2>
          <p className="text-xs sm:text-sm text-muted-foreground">KT MOS 현장사진 · 3개 레이어 입체 효과</p>
        </div>
      </div>

      {/* 뷰어 */}
      <div
        ref={viewerRef}
        className={
          isFullscreen
            ? "fixed inset-0 z-50 bg-black"
            : "relative rounded-2xl overflow-hidden bg-black shadow-2xl"
        }
        style={isFullscreen ? {} : { aspectRatio: "16/9" }}
      >
        {/* Three.js 캔버스 마운트 */}
        <div ref={mountRef} className="w-full h-full cursor-crosshair" />

        {/* 로딩 오버레이 */}
        {!loaded && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 gap-3">
            <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-white/70 text-sm">이미지 로딩 중…</span>
          </div>
        )}

        {/* 힌트 배너 */}
        {loaded && showHint && (
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-sm text-white/90 text-sm px-5 py-2.5 rounded-full flex items-center gap-2 pointer-events-none animate-pulse">
            <Info className="w-4 h-4" />
            마우스를 움직이면 3D 입체 효과가 나타납니다
          </div>
        )}

        {/* 레이어 뱃지 */}
        {loaded && (
          <div className="absolute top-3 left-3 flex gap-1.5">
            {DEFAULT_LAYERS.map((l, i) => (
              <span
                key={i}
                className="bg-black/50 backdrop-blur-sm text-white/80 text-xs px-2.5 py-1 rounded-full"
              >
                {l.label}
              </span>
            ))}
          </div>
        )}

        {/* 컨트롤 버튼 */}
        <div className="absolute top-3 right-3 flex gap-2">
          <button
            onClick={handleReset}
            className="bg-black/50 backdrop-blur-sm text-white/80 hover:text-white hover:bg-black/70 p-2 rounded-full transition-colors"
            title="중앙 초기화"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={toggleFullscreen}
            className="bg-black/50 backdrop-blur-sm text-white/80 hover:text-white hover:bg-black/70 p-2 rounded-full transition-colors"
            title={isFullscreen ? "축소" : "전체화면"}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* 사용 안내 카드 */}
      <div className="grid grid-cols-3 gap-3 text-center text-sm">
        {[
          { icon: "🖱️", title: "PC", desc: "마우스를 이리저리 움직이세요" },
          { icon: "👆", title: "모바일", desc: "화면을 터치하며 드래그" },
          { icon: "📱", title: "자이로", desc: "스마트폰을 기울여보세요" },
        ].map((item) => (
          <div
            key={item.title}
            className="bg-card border border-border rounded-xl p-3 sm:p-4 space-y-1"
          >
            <div className="text-2xl">{item.icon}</div>
            <p className="font-semibold text-foreground">{item.title}</p>
            <p className="text-xs text-muted-foreground">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
